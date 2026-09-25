import type { Queue } from "bullmq";
import { log } from "../log";
import { failProcessing, fetchSttResult, submitRecording } from "../recordings/processing";

// Очереди обработки (план среза 3, решение 8; план среза 3а, решение 8).
// VERBA_QUEUE:
//   bullmq (по умолчанию) — задачи в Redis, выполняет воркер (src/worker.ts);
//   inline — сразу, в этом же вызове: тесты и e2e-сервер (ADR 0003).
// Очереди по типам задач:
//   processing — отправка записи провайдеру, id задачи = id записи;
//   stt-result — забрать результат по уведомлению, id = result-<jobId>;
//   sweep      — повторяющаяся проверка незавершённых записей.

export const SUBMIT_QUEUE = "processing";
export const SUBMIT_ATTEMPTS = 3;
export type SubmitJob = { recordingId: string };

export const RESULT_QUEUE = "stt-result";
export const RESULT_ATTEMPTS = 3;
export type ResultJob = { jobId: string };

export const SWEEP_QUEUE = "sweep";

export function redisConnection() {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL не задан: см. .env.example");
  return { url, maxRetriesPerRequest: null };
}

const queues = new Map<string, Promise<Queue>>();

function queue<T>(name: string): Promise<Queue<T>> {
  // Лениво: доменные тесты и inline-режим bullmq не грузят.
  let q = queues.get(name);
  if (!q) {
    q = import("bullmq").then(
      ({ Queue }) =>
        // Без очереди команд офлайн: Redis недоступен — ошибка сразу, а не
        // зависший запрос.
        new Queue(name, { connection: { ...redisConnection(), enableOfflineQueue: false } }),
    );
    queues.set(name, q);
  }
  return q as Promise<Queue<T>>;
}

const inline = () => process.env.VERBA_QUEUE === "inline";

// Готовые и упавшие задачи удаляются: иначе задачу с тем же id (повтор
// BR-08, повторное уведомление) BullMQ молча отбросил бы как дубль.
const REMOVE = { removeOnComplete: true, removeOnFail: true } as const;

// Поставить запись в обработку. Никогда не бросает: не удалось — запись в
// failed, пользователь нажмёт «Повторить», а загрузка уже состоялась.
export async function enqueueProcessing(recordingId: string): Promise<void> {
  try {
    if (inline()) {
      await submitRecording(recordingId);
      return;
    }
    const q = await queue<SubmitJob>(SUBMIT_QUEUE);
    // id задачи = id записи: пока задача ждёт, вторую не поставить.
    await q.add(
      "submit",
      { recordingId },
      { jobId: recordingId, attempts: SUBMIT_ATTEMPTS, backoff: { type: "exponential", delay: 5_000 }, ...REMOVE },
    );
    log.info("recording.enqueued", { recordingId });
  } catch (e) {
    log.error("recording.enqueue_failed", { recordingId, error: String(e) });
    await failProcessing(recordingId, `submit: ${e instanceof Error ? e.message : String(e)}`).catch(
      (err: unknown) => log.error("recording.fail_failed", { recordingId, error: String(err) }),
    );
  }
}

// Поставить «забрать результат» по уведомлению. Бросает, если очередь
// недоступна (в inline — если результат не забрался): вебхук ответит 503,
// и провайдер повторит уведомление.
export async function enqueueSttResult(jobId: string): Promise<void> {
  if (inline()) {
    await fetchSttResult(jobId);
    return;
  }
  const q = await queue<ResultJob>(RESULT_QUEUE);
  // Повторное уведомление, пока задача ждёт, вторую не создаст.
  await q.add(
    "fetch",
    { jobId },
    { jobId: `result-${jobId}`, attempts: RESULT_ATTEMPTS, backoff: { type: "exponential", delay: 10_000 }, ...REMOVE },
  );
}

// Интервал проверки незавершённых записей: STT_SWEEP_INTERVAL, секунды.
export function sweepIntervalMs(): number {
  return secondsFromEnv("STT_SWEEP_INTERVAL", 5 * 60) * 1000;
}

// Повторяющаяся проверка (решение 7). Повторный вызов при перезапуске
// воркера обновляет расписание, а не добавляет второе.
export async function scheduleSweep(): Promise<void> {
  const q = await queue(SWEEP_QUEUE);
  const every = sweepIntervalMs();
  await q.upsertJobScheduler("sweep", { every }, { name: "sweep", opts: REMOVE });
  log.info("sweep.scheduled", { everyMs: every });
}

export function secondsFromEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error(`${name} = ${value}: нужно число секунд`);
  return seconds;
}
