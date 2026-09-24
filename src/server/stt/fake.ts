import { randomUUID } from "node:crypto";
import { parseAssemblyAi } from "./assemblyai/parse";
import { parseNotification, statusOf } from "./assemblyai/status";
import type { SttProvider, SttSubmission } from "./provider";

// Фейковый провайдер (ADR 0003): тесты и разработка без сети. Всё — в памяти
// процесса. Результат сам не появляется: шаг сценария «кладёт» его
// провайдеру (finish), а дальше его забирают так же, как у настоящего, —
// по уведомлению или проверкой незавершённых записей (план среза 3а,
// решения 4 и 12). Ответы — в формате AssemblyAI, разбирает их настоящий
// разбор.

type FakeProvider = SttProvider & {
  submissions: (SttSubmission & { jobId: string })[];
  // Ответы провайдера по id задачи; нет ответа — задача ещё идёт.
  results: Map<string, unknown>;
  // Задачи, данные которых удалены (forget).
  forgotten: string[];
  finish(jobId: string, raw: unknown): void;
  reset(): void;
};

export const fakeStt: FakeProvider = {
  name: "fake",
  submissions: [],
  results: new Map(),
  forgotten: [],
  async submit(submission) {
    const jobId = `fake-${randomUUID()}`;
    this.submissions.push({ ...submission, jobId });
    return { jobId };
  },
  async status(jobId) {
    const raw = this.results.get(jobId);
    return raw === undefined ? { pending: true } : statusOf(raw);
  },
  async forget(jobId) {
    this.forgotten.push(jobId);
  },
  parseNotification,
  parse: parseAssemblyAi,
  finish(jobId, raw) {
    this.results.set(jobId, raw);
  },
  reset() {
    this.submissions = [];
    this.results = new Map();
    this.forgotten = [];
  },
};

export type FakeUtterance = { speaker: string; startMs: number; endMs: number; text: string };

// Ответ AssemblyAI с этими репликами. audio_duration — целые секунды, как у
// настоящего.
export function fakeTranscript(utterances: FakeUtterance[], durationMs?: number) {
  const end = durationMs ?? Math.max(0, ...utterances.map((u) => u.endMs));
  return {
    id: `fake-${randomUUID()}`,
    status: "completed",
    language_code: "ru",
    audio_duration: Math.ceil(end / 1000),
    text: utterances.map((u) => u.text).join(" "),
    utterances: utterances.map((u) => ({
      speaker: u.speaker,
      start: u.startMs,
      end: u.endMs,
      text: u.text,
      confidence: 0.9,
      words: [],
    })),
  };
}

// Ответ AssemblyAI о сбое.
export function fakeError(error = "Transcoding failed") {
  return { id: `fake-${randomUUID()}`, status: "error", error, utterances: null, audio_duration: null };
}
