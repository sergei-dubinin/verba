import { randomUUID } from "node:crypto";
import { parseAssemblyAi } from "./assemblyai/parse";
import type { SttProvider, SttSubmission } from "./provider";

// Фейковый провайдер (ADR 0003): тесты и разработка без сети. Отправку
// запоминает в памяти процесса, результат сам не присылает — его доставляют
// шаги сценариев или `pnpm stt:deliver`. Ответы — в формате AssemblyAI,
// разбирает их настоящий разбор (план среза 3, решения 1 и 7).

type FakeProvider = SttProvider & {
  submissions: (SttSubmission & { jobId: string })[];
  reset(): void;
};

export const fakeStt: FakeProvider = {
  name: "fake",
  submissions: [],
  async submit(submission) {
    const jobId = `fake-${randomUUID()}`;
    this.submissions.push({ ...submission, jobId });
    return { jobId };
  },
  parse: parseAssemblyAi,
  reset() {
    this.submissions = [];
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
