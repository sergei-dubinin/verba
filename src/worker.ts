// Воркер обработки: отдельный процесс из той же кодовой базы (ADR 0002).
// Тонкая точка входа: берёт задачу из очереди и вызывает сервис. Очереди —
// по типам задач (план среза 3а, решение 8), у каждой свой обработчик.
//
//   pnpm worker
import { Worker } from "bullmq";
import { log } from "./server/log";
import {
  RESULT_ATTEMPTS,
  RESULT_QUEUE,
  SUBMIT_ATTEMPTS,
  SUBMIT_QUEUE,
  SWEEP_QUEUE,
  redisConnection,
  scheduleSweep,
  type ResultJob,
  type SubmitJob,
} from "./server/processing/queue";
import { sweepProcessing } from "./server/processing/sweep";
import { failProcessing, fetchSttResult, submitRecording } from "./server/recordings/processing";

const connection = redisConnection();

const submitWorker = new Worker<SubmitJob>(SUBMIT_QUEUE, async (job) => submitRecording(job.data.recordingId), {
  connection,
  concurrency: 2,
});

// Последняя попытка упала — запись в failed, дальше «Повторить» (BR-08).
submitWorker.on("failed", (job, error) => {
  if (!job) return;
  const { recordingId } = job.data;
  log.error("worker.submit_failed", { recordingId, attempt: job.attemptsMade, error: error.message });
  if (job.attemptsMade < SUBMIT_ATTEMPTS) return;
  failProcessing(recordingId, `submit: ${error.message}`).catch((e: unknown) =>
    log.error("recording.fail_failed", { recordingId, error: String(e) }),
  );
});

const resultWorker = new Worker<ResultJob>(RESULT_QUEUE, async (job) => fetchSttResult(job.data.jobId), {
  connection,
  concurrency: 2,
});

// Запись не трогаем: результат заберёт проверка незавершённых записей.
resultWorker.on("failed", (job, error) => {
  if (!job) return;
  const { jobId } = job.data;
  const event = job.attemptsMade < RESULT_ATTEMPTS ? "worker.result_failed" : "worker.result_gave_up";
  log.error(event, { jobId, attempt: job.attemptsMade, error: error.message });
});

// Одна проверка за раз: следующая не начнётся, пока идёт предыдущая.
const sweepWorker = new Worker(SWEEP_QUEUE, async () => sweepProcessing(new Date()), {
  connection,
  concurrency: 1,
});
sweepWorker.on("failed", (_job, error) => log.error("worker.sweep_failed", { error: error.message }));

const workers = [submitWorker, resultWorker, sweepWorker];
for (const w of workers) w.on("ready", () => log.info("worker.ready", { queue: w.name }));

scheduleSweep().catch((e: unknown) => {
  log.error("worker.schedule_failed", { error: String(e) });
  process.exit(1);
});

async function shutdown() {
  await Promise.all(workers.map((w) => w.close()));
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
