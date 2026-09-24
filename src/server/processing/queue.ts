import type { Queue } from "bullmq";
import { log } from "../log";
import { failProcessing, submitRecording } from "../recordings/processing";

// Постановка записи в обработку (план среза 3, решение 8). VERBA_QUEUE:
//   bullmq (по умолчанию) — задача в Redis, отправляет воркер (src/worker.ts);
//   inline — отправка сразу, в этом же вызове: тесты и e2e-сервер (ADR 0003).
// Никогда не бросает: не удалось — запись в failed, пользователь нажмёт
// «Повторить», а загрузка уже состоялась.

export const QUEUE_NAME = "processing";
export const SUBMIT_ATTEMPTS = 3;

export type SubmitJob = { recordingId: string };

export function redisConnection() {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL не задан: см. .env.example");
  return { url, maxRetriesPerRequest: null };
}

let queue: Promise<Queue<SubmitJob>> | undefined;

function processingQueue(): Promise<Queue<SubmitJob>> {
  // Лениво: доменные тесты и inline-режим bullmq не грузят.
  queue ??= import("bullmq").then(
    ({ Queue }) =>
      // Без очереди команд офлайн: Redis недоступен — ошибка сразу, а не
      // зависшая загрузка.
      new Queue<SubmitJob>(QUEUE_NAME, { connection: { ...redisConnection(), enableOfflineQueue: false } }),
  );
  return queue;
}

export async function enqueueProcessing(recordingId: string): Promise<void> {
  try {
    if (process.env.VERBA_QUEUE === "inline") {
      await submitRecording(recordingId);
      return;
    }
    const q = await processingQueue();
    // id задачи = id записи: пока задача ждёт, вторую не поставить. Готовые и
    // упавшие удаляются, иначе повтор (BR-08) BullMQ отбросил бы как дубль.
    await q.add(
      "submit",
      { recordingId },
      {
        jobId: recordingId,
        attempts: SUBMIT_ATTEMPTS,
        backoff: { type: "exponential", delay: 5_000 },
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
    log.info("recording.enqueued", { recordingId });
  } catch (e) {
    log.error("recording.enqueue_failed", { recordingId, error: String(e) });
    await failProcessing(recordingId, `submit: ${e instanceof Error ? e.message : String(e)}`).catch(
      (err: unknown) => log.error("recording.fail_failed", { recordingId, error: String(err) }),
    );
  }
}
