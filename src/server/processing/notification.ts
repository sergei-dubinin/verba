import { createHash, timingSafeEqual } from "node:crypto";
import { db } from "../db";
import { log } from "../log";
import { sttProvider } from "../stt";
import type { SttWebhook } from "../stt/provider";
import { enqueueSttResult } from "./queue";

// Уведомление провайдера о готовности (план среза 3а, решение 6). Вебхук —
// единственная точка входа без сессии, секрет в заголовке заменяет ему вход
// (NFR-04). Провайдер ждёт 2xx не дольше 10 с, на 5xx повторяет, на 4xx —
// нет (docs/research/2026-09-assemblyai.md).

export const WEBHOOK_PATH = "/api/stt/webhook";
// Заголовок с секретом: его имя и значение провайдер получает при отправке
// и присылает обратно с уведомлением.
export const WEBHOOK_SECRET_HEADER = "X-Verba-Webhook-Secret";

// Куда провайдеру слать уведомления. Нет PUBLIC_URL (разработка на
// localhost) или секрета — не слать: результат заберёт проверка.
export function sttWebhook(): SttWebhook | undefined {
  const base = process.env.PUBLIC_URL;
  const secret = process.env.STT_WEBHOOK_SECRET;
  if (!base || !secret) return undefined;
  return { url: new URL(WEBHOOK_PATH, base).toString(), header: WEBHOOK_SECRET_HEADER, secret };
}

//   accepted     — задача «забрать результат» поставлена;
//   rejected     — нет секрета или он неверный: запись не трогается;
//   invalid      — тело не уведомление провайдера;
//   retry-later  — записи с этим id нет (уведомление обогнало запись id
//                  задачи) или очередь недоступна: пусть провайдер повторит.
export type NotificationResult = "accepted" | "rejected" | "invalid" | "retry-later";

// Тело читается только после проверки секрета: без него не за что
// принимать байты.
export async function acceptSttNotification(input: {
  secret: string | null;
  body: () => Promise<unknown>;
}): Promise<NotificationResult> {
  const expected = process.env.STT_WEBHOOK_SECRET;
  // Секрет не задан в окружении — отказ всем, а не приём без проверки.
  if (!expected || !input.secret || !sameSecret(input.secret, expected)) {
    log.warn("stt.notification_rejected", { secret: input.secret ? "wrong" : "missing" });
    return "rejected";
  }

  let jobId: string | null;
  try {
    jobId = sttProvider().parseNotification(await input.body());
  } catch {
    jobId = null;
  }
  if (!jobId) {
    log.warn("stt.notification_invalid");
    return "invalid";
  }

  const recording = await db.recording.findUnique({
    where: { providerJobId: jobId },
    select: { id: true, status: true },
  });
  if (!recording) {
    log.warn("stt.notification_unknown_job", { jobId });
    return "retry-later";
  }
  // Запись не processing — всё равно забрать: задача увидит, что запись не
  // ждёт, и удалит данные у провайдера (поздний результат после тайм-аута).
  try {
    await enqueueSttResult(jobId);
  } catch (e) {
    log.error("stt.notification_enqueue_failed", { recordingId: recording.id, jobId, error: String(e) });
    return "retry-later";
  }
  log.info("stt.notification_accepted", { recordingId: recording.id, jobId, status: recording.status });
  return "accepted";
}

// Сравнение за постоянное время: хеши одинаковой длины при любой длине
// входа.
function sameSecret(given: string, expected: string): boolean {
  const hash = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(hash(given), hash(expected));
}
