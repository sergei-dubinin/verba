import { randomUUID } from "node:crypto";
import { Prisma } from "../../generated/prisma/client";
import { db } from "../db";
import { isUuid } from "../ids";
import { log } from "../log";
import { enqueueProcessing } from "../processing/queue";
import { sttProvider } from "../stt";
import { SttParseError, type SttOutcome } from "../stt/provider";
import type { SttTranscript } from "../stt/types";
import { InvalidStatusTransitionError, RecordingNotFoundError } from "./errors";

// Конвейер обработки (docs/architecture.md, «Конвейер»). Переходы статуса —
// только по таблице оттуда, каждый — условным UPDATE … WHERE status = …:
//   uploaded   → processing  submitRecording: файл отправлен провайдеру
//   processing → done        completeProcessing: результат записан
//   uploaded   → failed      failProcessing: отправить не удалось
//   processing → failed      failProcessing: провайдер вернул сбой
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

  const { jobId } = await sttProvider().submit({ recordingId, audioPath: recording.audioPath });
  const { count } = await db.recording.updateMany({
    where: { id: recordingId, status: "uploaded" },
    data: { status: "processing", providerJobId: jobId },
  });
  if (count === 0) {
    log.warn("recording.transition_rejected", { recordingId, to: "processing", jobId });
    return;
  }
  log.info("recording.processing", { recordingId, jobId });
}

// Сбой: отправить не удалось, провайдер вернул ошибку или ответ не разобрался.
export async function failProcessing(recordingId: string, reason: string): Promise<void> {
  const { count } = await db.recording.updateMany({
    where: { id: recordingId, status: { in: ["uploaded", "processing"] } },
    data: { status: "failed", error: reason },
  });
  if (count === 0) {
    const current = await db.recording.findUnique({ where: { id: recordingId }, select: { status: true } });
    if (!current) throw new RecordingNotFoundError();
    log.warn("recording.transition_rejected", { recordingId, from: current.status, to: "failed" });
    throw new InvalidStatusTransitionError(recordingId, current.status, "failed");
  }
  log.error("recording.failed", { recordingId, reason });
}

// Результат от провайдера — по id его задачи. Сырой ответ сохраняется
// всегда, чтобы можно было перепарсить (ADR 0001).
export async function receiveSttResult(jobId: string, outcome: SttOutcome): Promise<void> {
  const recording = await db.recording.findFirst({
    where: { providerJobId: jobId },
    select: { id: true },
  });
  if (!recording) {
    log.warn("stt.result_unknown_job", { jobId });
    throw new RecordingNotFoundError();
  }
  const recordingId = recording.id;
  const raw = outcome.raw === undefined ? Prisma.DbNull : (outcome.raw as Prisma.InputJsonValue);
  await db.recording.update({ where: { id: recordingId }, data: { providerRaw: raw } });

  if (!outcome.ok) return failProcessing(recordingId, `provider: ${outcome.reason}`);

  let transcript: SttTranscript;
  try {
    transcript = sttProvider().parse(outcome.raw);
  } catch (e) {
    if (!(e instanceof SttParseError)) throw e;
    return failProcessing(recordingId, `parse: ${e.message}`);
  }
  await completeProcessing(recordingId, transcript);
}

// Повтор после сбоя (BR-08): запись снова ждёт отправки, дальше — тот же
// путь, что после загрузки. Чужая и несуществующая неотличимы (BR-22).
export async function retryProcessing(user: { id: string }, recordingId: string): Promise<void> {
  if (!isUuid(recordingId)) throw new RecordingNotFoundError();
  const { count } = await db.recording.updateMany({
    where: { id: recordingId, ownerId: user.id, status: "failed" },
    data: { status: "uploaded", error: null, providerJobId: null, providerRaw: Prisma.DbNull },
  });
  if (count === 0) {
    const current = await db.recording.findFirst({
      where: { id: recordingId, ownerId: user.id },
      select: { status: true },
    });
    if (!current) throw new RecordingNotFoundError();
    throw new InvalidStatusTransitionError(recordingId, current.status, "uploaded");
  }
  log.info("recording.retry", { recordingId });
  await enqueueProcessing(recordingId);
}

// Результат обработки (docs/architecture.md, «Конвейер», шаг 3): в одной
// транзакции спикеры, реплики, длительность и переход processing → done.
// Спикеры нумеруются в порядке первого появления (BR-11), реплики — по
// времени начала. Длительность провайдера пишется, только если своей, из
// файла, нет: у AssemblyAI она до секунды (план среза 3, решение 6).
export async function completeProcessing(
  recordingId: string,
  transcript: SttTranscript,
  now: Date = new Date(),
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
        error: null,
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
