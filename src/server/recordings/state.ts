import type { RecordingStatus } from "../../generated/prisma/client";

// Статус записи для пользователя (BR-07, BR-08): uploaded и processing для
// него одно и то же — «обрабатывается». Причина сбоя не показывается, она в
// логе и в recording.error (план среза 3, решение 9).

export type RecordingState = "processing" | "done" | "failed";

export type RecordingStateView = {
  state: RecordingState;
  // Текст под названием; у готовой записи — нет.
  statusText: string | null;
  canRetry: boolean;
};

export const PROCESSING_TEXT = "Обрабатывается, обычно это занимает несколько минут";
export const FAILED_TEXT = "Не удалось распознать запись";

export function recordingState(status: RecordingStatus): RecordingStateView {
  switch (status) {
    case "uploaded":
    case "processing":
      return { state: "processing", statusText: PROCESSING_TEXT, canRetry: false };
    case "done":
      return { state: "done", statusText: null, canRetry: false };
    case "failed":
      return { state: "failed", statusText: FAILED_TEXT, canRetry: true };
  }
}
