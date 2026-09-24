import type { SttTranscript } from "./types";

// Порт провайдера STT (NFR-02). Языка, числа спикеров и других параметров
// в нём нет (BR-03, BR-05, BR-06): их задаёт адаптер один раз для всех
// записей.

export type SttSubmission = { recordingId: string; audioPath: string };

export type SttProvider = {
  // Пишется в recording.provider.
  name: string;
  // Отправить файл на обработку. Результат придёт позже: вебхуком или
  // опросом (вертикальный срез 3а) — в receiveSttResult.
  submit(submission: SttSubmission): Promise<{ jobId: string }>;
  // Сырой ответ провайдера → наш формат. Не разобрался — SttParseError.
  parse(raw: unknown): SttTranscript;
};

// Результат обработки у провайдера.
export type SttOutcome = { ok: true; raw: unknown } | { ok: false; reason: string; raw?: unknown };

export class SttParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SttParseError";
  }
}
