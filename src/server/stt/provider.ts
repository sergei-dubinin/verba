import type { SttTranscript } from "./types";

// Порт провайдера STT (NFR-02). Языка, числа спикеров и других параметров
// в нём нет (BR-03, BR-05, BR-06): их задаёт адаптер один раз для всех
// записей.

// Куда провайдеру прислать уведомление о готовности и с каким заголовком.
export type SttWebhook = { url: string; header: string; secret: string };

export type SttSubmission = { recordingId: string; audioPath: string; webhook?: SttWebhook };

// Результат обработки у провайдера.
export type SttOutcome = { ok: true; raw: unknown } | { ok: false; reason: string; raw?: unknown };

// Состояние задачи у провайдера: ещё идёт или уже есть результат.
export type SttStatus = { pending: true } | SttOutcome;

export type SttProvider = {
  // Пишется в recording.provider.
  name: string;
  // Отправить файл на обработку. Результат придёт позже: уведомлением на
  // вебхук или его заберёт проверка незавершённых записей.
  submit(submission: SttSubmission): Promise<{ jobId: string }>;
  // Состояние задачи. Задачи у провайдера нет — { ok: false, reason: "not found" };
  // сбой запроса — исключение.
  status(jobId: string): Promise<SttStatus>;
  // Удалить данные задачи у провайдера. Не удалилось — исключение.
  forget(jobId: string): Promise<void>;
  // Тело уведомления провайдера → id задачи; не уведомление — null.
  parseNotification(body: unknown): string | null;
  // Сырой ответ провайдера → наш формат. Не разобрался — SttParseError.
  parse(raw: unknown): SttTranscript;
};

export const NOT_FOUND = "not found";

export class SttParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SttParseError";
  }
}
