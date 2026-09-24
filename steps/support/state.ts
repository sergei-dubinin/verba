import { expect } from "@playwright/test";
import { listRecordings } from "@/server/recordings/list";
import { FAILED_TEXT, PROCESSING_TEXT, type RecordingState } from "@/server/recordings/state";
import { getTranscript } from "@/server/transcript/get";
import { currentUser } from "./data";
import type { ScenarioContext } from "./fixtures";

// Слова сценариев → состояние, которое видит пользователь (BR-07).
export const STATES: Record<string, { state: RecordingState; text: string | null }> = {
  обрабатывается: { state: "processing", text: PROCESSING_TEXT },
  готово: { state: "done", text: null },
  ошибка: { state: "failed", text: FAILED_TEXT },
};

export function stateFor(word: string) {
  const expected = STATES[word];
  expect(expected, `неизвестный статус «${word}»`).toBeDefined();
  return expected;
}

// Статус так, как его видит пользователь: в строке списка и на экране
// транскрипта — перечитано из базы, одинаково в обоих местах.
export async function expectState(ctx: ScenarioContext, recordingId: string, word: string) {
  const expected = stateFor(word);
  const user = currentUser(ctx);
  const list = await listRecordings(user, ctx.now ?? new Date());
  const item = list.flatMap((g) => g.recordings).find((r) => r.id === recordingId);
  expect(item, "запись в списке").toBeDefined();
  const transcript = await getTranscript(user, recordingId);
  for (const view of [item!, transcript]) {
    expect(view.state).toBe(expected.state);
    expect(view.statusText).toBe(expected.text);
    expect(view.canRetry).toBe(expected.state === "failed");
  }
}
