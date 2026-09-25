import { randomUUID } from "node:crypto";
import { Prisma } from "../../generated/prisma/client";
import { db } from "../db";
import { isUuid } from "../ids";
import { log } from "../log";
import { sttWebhook } from "../processing/notification";
import { enqueueProcessing } from "../processing/queue";
import { sttProvider } from "../stt";
import { SttParseError, type SttOutcome } from "../stt/provider";
import type { SttTranscript } from "../stt/types";
import { InvalidStatusTransitionError, RecordingNotFoundError } from "./errors";

// Конвейер обработки (docs/architecture.md, «Конвейер»). Переходы статуса —
// только по таблице оттуда, каждый — условным UPDATE … WHERE status = … и
// с отметкой status_changed_at:
//   uploaded   → processing  submitRecording: файл отправлен провайдеру
//   processing → done        completeProcessing: результат записан
//   uploaded   → failed      failProcessing: отправить не удалось
//   processing → failed      провайдер вернул сбой, ответ не разобрался
//                            или запись зависла (failProcessing)
//   failed     → uploaded    retryProcessing: повтор (BR-08)

// Отправка провайдеру. Сначала отправка, потом переход с id задачи: если
// отправка упала, запись остаётся uploaded и очередь повторит попытку.
// Записи нет или она уже не uploaded (повторная задача) — ничего не делаем.
export async function submitRecording(recordingId: string): Promise<void> {
  const recording = await db.recording.findUnique({
    where: { id: recordingId },
    select: { status: true, audioPath: true },
  });
  // Запись удалили, пока задача ждала, — отправлять нечего, повторять тоже.
  if (!recording) {
    log.warn("recording.submit_skipped", { recordingId, status: null });
    return;
  }
  if (recording.status !== "uploaded") {
    log.warn("recording.submit_skipped", { recordingId, status: recording.status });
    return;
  }

  const { jobId } = await sttProvider().submit({
    recordingId,
    audioPath: recording.audioPath,
    webhook: sttWebhook(),
  });
  // До записи в базу: если между ними упадёт процесс, задача у провайдера
  // останется сиротой — она находима по этой строке без
  // recording.processing с тем же jobId (план среза 3а, решение 16).
  // Удалить её сразу нельзя: AssemblyAI не удаляет задачу, которая идёт.
  log.info("stt.submitted", { recordingId, jobId });
  let count: number;
  try {
    ({ count } = await db.recording.updateMany({
      where: { id: recordingId, status: "uploaded" },
      data: { status: "processing", providerJobId: jobId, statusChangedAt: new Date() },
    }));
  } catch (e) {
    log.warn("stt.job_orphaned", { recordingId, jobId, error: String(e) });
    throw e;
  }
  if (count === 0) {
    log.warn("recording.transition_rejected", { recordingId, to: "processing", jobId });
    log.warn("stt.job_orphaned", { recordingId, jobId });
    return;
  }
  log.info("recording.processing", { recordingId, jobId });
}

// Сбой: отправить не удалось или запись зависла у провайдера. Данные
// задачи у провайдера удаляются (план среза 3а, решение 9).
export async function failProcessing(recordingId: string, reason: string): Promise<void> {
  const { count } = await db.recording.updateMany({
    where: { id: recordingId, status: { in: ["uploaded", "processing"] } },
    data: { status: "failed", error: reason, statusChangedAt: new Date() },
  });
  if (count === 0) {
    const current = await db.recording.findUnique({ where: { id: recordingId }, select: { status: true } });
    if (!current) throw new RecordingNotFoundError();
    log.warn("recording.transition_rejected", { recordingId, from: current.status, to: "failed" });
    throw new InvalidStatusTransitionError(recordingId, current.status, "failed");
  }
  log.error("recording.failed", { recordingId, reason });
  const { providerJobId } = await db.recording.findUniqueOrThrow({
    where: { id: recordingId },
    select: { providerJobId: true },
  });
  if (providerJobId) await forgetJob(providerJobId);
}

// Забрать результат у провайдера по уведомлению (задача stt-result).
// Запись уже не ждёт — результат забрали раньше или она упала по
// тайм-ауту: только удалить данные у провайдера, теперь задача готова.
export async function fetchSttResult(jobId: string): Promise<void> {
  const recording = await db.recording.findUnique({
    where: { providerJobId: jobId },
    select: { id: true, status: true },
  });
  // Повтор сбросил id задачи, пока уведомление ждало в очереди.
  if (!recording) {
    log.warn("stt.result_unknown_job", { jobId });
    return;
  }
  if (recording.status !== "processing") {
    log.warn("stt.result_ignored", { recordingId: recording.id, jobId, status: recording.status });
    await forgetJob(jobId);
    return;
  }
  const status = await sttProvider().status(jobId);
  // Уведомление есть, а результата нет — пусть очередь повторит; после
  // последней попытки его заберёт проверка незавершённых записей.
  if ("pending" in status) throw new Error(`задача ${jobId} у провайдера ещё идёт`);
  await receiveSttResult(jobId, status);
}

// Результат от провайдера — по id его задачи (план среза 3а, решение 5).
// Пишется только в запись, которая его ждёт: если она уже не processing
// (результат принесли и вебхук, и проверка; провайдер повторил
// уведомление; тайм-аут наступил раньше), ничего не пишется и не
// бросается. Статус проверяется до разбора: после удаления у провайдера
// его ответ пуст («Deleted by user.»). Сырой ответ сохраняется вместе с
// результатом или сбоем, чтобы можно было перепарсить (ADR 0001).
export async function receiveSttResult(jobId: string, outcome: SttOutcome): Promise<void> {
  const recording = await db.recording.findUnique({
    where: { providerJobId: jobId },
    select: { id: true, status: true },
  });
  if (!recording) {
    log.warn("stt.result_unknown_job", { jobId });
    throw new RecordingNotFoundError();
  }
  const recordingId = recording.id;
  if (recording.status !== "processing") {
    log.warn("stt.result_ignored", { recordingId, jobId, status: recording.status });
    await forgetJob(jobId);
    return;
  }

  if (!outcome.ok) {
    await failWithResult(recordingId, `provider: ${outcome.reason}`, outcome.raw);
  } else {
    try {
      await completeProcessing(recordingId, sttProvider().parse(outcome.raw), { raw: outcome.raw });
    } catch (e) {
      if (e instanceof SttParseError) {
        await failWithResult(recordingId, `parse: ${e.message}`, outcome.raw);
      } else if (e instanceof InvalidStatusTransitionError) {
        // Другая сторона гонки записала результат первой.
        log.warn("stt.result_ignored", { recordingId, jobId });
      } else {
        throw e;
      }
    }
  }
  await forgetJob(jobId);
}

// processing → failed с ответом провайдера. Запись уже не ждёт — не ошибка.
async function failWithResult(recordingId: string, reason: string, raw: unknown): Promise<void> {
  const { count } = await db.recording.updateMany({
    where: { id: recordingId, status: "processing" },
    data: { status: "failed", error: reason, providerRaw: jsonOrNull(raw), statusChangedAt: new Date() },
  });
  if (count === 0) {
    log.warn("recording.transition_rejected", { recordingId, to: "failed" });
    return;
  }
  log.error("recording.failed", { recordingId, reason });
}

// Удалить данные задачи у провайдера (план среза 3а, решение 9). Задачу,
// которая ещё идёт, AssemblyAI не удаляет; не удалилось — в лог с id,
// удалить руками. Обработку записи это не останавливает.
async function forgetJob(jobId: string): Promise<void> {
  try {
    await sttProvider().forget(jobId);
    log.info("stt.forgotten", { jobId });
  } catch (e) {
    log.warn("stt.forget_failed", { jobId, error: e instanceof Error ? e.message : String(e) });
  }
}

function jsonOrNull(raw: unknown) {
  return raw === undefined ? Prisma.DbNull : (raw as Prisma.InputJsonValue);
}

// Повтор после сбоя (BR-08): запись снова ждёт отправки, дальше — тот же
// путь, что после загрузки. Старая задача у провайдера забывается (план
// среза 3а, решение 10). Чужая и несуществующая неотличимы (BR-22).
export async function retryProcessing(user: { id: string }, recordingId: string): Promise<void> {
  if (!isUuid(recordingId)) throw new RecordingNotFoundError();
  const current = await db.recording.findFirst({
    where: { id: recordingId, ownerId: user.id },
    select: { status: true, providerJobId: true },
  });
  if (!current) throw new RecordingNotFoundError();
  const { count } = await db.recording.updateMany({
    where: { id: recordingId, ownerId: user.id, status: "failed" },
    data: {
      status: "uploaded",
      error: null,
      providerJobId: null,
      providerRaw: Prisma.DbNull,
      statusChangedAt: new Date(),
    },
  });
  if (count === 0) throw new InvalidStatusTransitionError(recordingId, current.status, "uploaded");
  log.info("recording.retry", { recordingId, previousJobId: current.providerJobId });
  if (current.providerJobId) await forgetJob(current.providerJobId);
  await enqueueProcessing(recordingId);
}

// Результат обработки (docs/architecture.md, «Конвейер», шаг 3): в одной
// транзакции спикеры, реплики, длительность, сырой ответ и переход
// processing → done. Спикеры нумеруются в порядке первого появления
// (BR-11), реплики — по времени начала. Длительность провайдера пишется,
// только если своей, из файла, нет: у AssemblyAI она до секунды (план
// среза 3, решение 6).
export async function completeProcessing(
  recordingId: string,
  transcript: SttTranscript,
  { now = new Date(), raw }: { now?: Date; raw?: unknown } = {},
): Promise<void> {
  const utterances = transcript.utterances
    .map((u, index) => ({ ...u, index }))
    .sort((a, b) => a.startMs - b.startMs || a.index - b.index);

  const speakerIds = new Map<string, string>();
  const speakers: { id: string; recordingId: string; label: string; ord: number }[] = [];
  for (const u of utterances) {
    if (speakerIds.has(u.speakerLabel)) continue;
    const id = randomUUID();
    speakerIds.set(u.speakerLabel, id);
    speakers.push({ id, recordingId, label: u.speakerLabel, ord: speakers.length + 1 });
  }

  await db.$transaction(async (tx) => {
    const current = await tx.recording.findUnique({
      where: { id: recordingId },
      select: { status: true, durationMs: true },
    });
    if (!current) throw new RecordingNotFoundError();
    // Условный UPDATE: две обработки одной записи не запишут результат дважды.
    const { count } = await tx.recording.updateMany({
      where: { id: recordingId, status: "processing" },
      data: {
        status: "done",
        durationMs: current.durationMs ?? transcript.durationMs,
        completedAt: now,
        statusChangedAt: now,
        error: null,
        ...(raw === undefined ? {} : { providerRaw: jsonOrNull(raw) }),
      },
    });
    if (count === 0) {
      log.warn("recording.transition_rejected", { recordingId, from: current.status, to: "done" });
      throw new InvalidStatusTransitionError(recordingId, current.status, "done");
    }
    await tx.speaker.createMany({ data: speakers });
    await tx.utterance.createMany({
      data: utterances.map((u, seq) => ({
        recordingId,
        speakerId: speakerIds.get(u.speakerLabel)!,
        seq,
        startMs: u.startMs,
        endMs: u.endMs,
        text: u.text,
      })),
    });
  });

  log.info("recording.done", {
    recordingId,
    speakers: speakers.length,
    utterances: utterances.length,
  });
}
