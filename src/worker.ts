// Воркер обработки: отдельный процесс из той же кодовой базы (ADR 0002).
// Тонкая точка входа: берёт задачу из очереди и вызывает сервис.
//
//   pnpm worker
import { Worker } from "bullmq";
import { log } from "./server/log";
import { QUEUE_NAME, SUBMIT_ATTEMPTS, redisConnection, type SubmitJob } from "./server/processing/queue";
import { failProcessing, submitRecording } from "./server/recordings/processing";

const worker = new Worker<SubmitJob>(
  QUEUE_NAME,
  async (job) => submitRecording(job.data.recordingId),
  { connection: redisConnection(), concurrency: 2 },
);

// Последняя попытка упала — запись в failed, дальше «Повторить» (BR-08).
worker.on("failed", (job, error) => {
  if (!job) return;
  const { recordingId } = job.data;
  log.error("worker.submit_failed", { recordingId, attempt: job.attemptsMade, error: error.message });
  if (job.attemptsMade < SUBMIT_ATTEMPTS) return;
  failProcessing(recordingId, `submit: ${error.message}`).catch((e: unknown) =>
    log.error("recording.fail_failed", { recordingId, error: String(e) }),
  );
});

worker.on("ready", () => log.info("worker.ready", { queue: QUEUE_NAME }));

async function shutdown() {
  await worker.close();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
