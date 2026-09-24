import { removeStaleTempFiles } from "../audio/storage";
import { db } from "../db";
import { log } from "../log";
import { failProcessing, receiveSttResult } from "../recordings/processing";
import { sttProvider } from "../stt";
import { enqueueProcessing, secondsFromEnv } from "./queue";

// Проверка незавершённых записей (план среза 3а, решение 7). В воркере —
// повторяющаяся задача; тесты вызывают её напрямую со «сейчас» сценария.
//   processing — сначала спросить провайдера: результат есть → записать
//                (потерянное уведомление); ещё идёт дольше STT_TIMEOUT →
//                failed. Порядок важен: иначе тайм-аут провалил бы готовую;
//   uploaded дольше 10 мин — поставить в очередь заново (очередь
//                потерялась или воркер лежал);
//   AUDIO_DIR/tmp/*.part старше суток — удалить (план среза 3, решение 4).
// Ошибки ловятся по записи: одна сбойная не останавливает проход.

const UPLOADED_STALE_MS = 10 * 60_000;
const TEMP_STALE_MS = 24 * 60 * 60_000;

// Сколько ждать провайдера: STT_TIMEOUT, секунды; по умолчанию 3 ч
// (решение пользователя 2026-09-24).
export function sttTimeoutMs(): number {
  return secondsFromEnv("STT_TIMEOUT", 3 * 60 * 60) * 1000;
}

export async function sweepProcessing(now: Date = new Date()): Promise<void> {
  const timeoutMs = sttTimeoutMs();
  const summary = { results: 0, timeouts: 0, requeued: 0, errors: 0, tempRemoved: 0 };

  const processing = await db.recording.findMany({
    where: { status: "processing" },
    select: { id: true, providerJobId: true, statusChangedAt: true },
  });
  for (const r of processing) {
    try {
      if (r.providerJobId) {
        const status = await sttProvider().status(r.providerJobId);
        if (!("pending" in status)) {
          log.info("sweep.result_found", { recordingId: r.id, jobId: r.providerJobId, ok: status.ok });
          await receiveSttResult(r.providerJobId, status);
          summary.results++;
          continue;
        }
      }
      if (now.getTime() - r.statusChangedAt.getTime() > timeoutMs) {
        log.warn("sweep.timeout", { recordingId: r.id, jobId: r.providerJobId, since: r.statusChangedAt });
        await failProcessing(r.id, "timeout");
        summary.timeouts++;
      }
    } catch (e) {
      summary.errors++;
      log.error("sweep.recording_failed", { recordingId: r.id, jobId: r.providerJobId, error: String(e) });
    }
  }

  const stale = await db.recording.findMany({
    where: { status: "uploaded", statusChangedAt: { lt: new Date(now.getTime() - UPLOADED_STALE_MS) } },
    select: { id: true },
  });
  for (const r of stale) {
    log.warn("sweep.requeued", { recordingId: r.id });
    // Не бросает; задача с тем же id, если ещё ждёт, второй не станет.
    await enqueueProcessing(r.id);
    summary.requeued++;
  }

  try {
    summary.tempRemoved = await removeStaleTempFiles(new Date(now.getTime() - TEMP_STALE_MS));
  } catch (e) {
    summary.errors++;
    log.error("sweep.temp_failed", { error: String(e) });
  }

  log.info("sweep.done", { processing: processing.length, ...summary });
}
