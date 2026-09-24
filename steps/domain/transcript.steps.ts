import { randomUUID } from "node:crypto";
import { expect } from "@playwright/test";
import type { DataTable } from "playwright-bdd";
import { RecordingNotFoundError } from "@/server/recordings/errors";
import { getTranscript, type TranscriptView } from "@/server/transcript/get";
import { currentUser, numeral, recordingByTitle } from "../support/data";
import { Then, When } from "../support/fixtures";

const shown = (ctx: { transcript?: TranscriptView }) => {
  expect(ctx.transcript, "транскрипт не открыт").toBeDefined();
  return ctx.transcript!;
};

const allUtterances = (view: TranscriptView) =>
  view.groups.flatMap((g) => g.utterances.map((u) => ({ ...u, speaker: g.speaker.name })));

When("я открываю запись {string}", async ({ ctx }, title: string) => {
  ctx.transcript = await getTranscript(currentUser(ctx), recordingByTitle(ctx, title).id);
});

// Ошибка — часть результата: её проверяет «Тогда».
When("я открываю запись {string} по прямой ссылке", async ({ ctx }, title: string) => {
  try {
    ctx.transcript = await getTranscript(currentUser(ctx), recordingByTitle(ctx, title).id);
  } catch (e) {
    ctx.openError = e;
  }
});

// Чужая запись неотличима от несуществующей: тот же класс и тот же текст,
// что для случайного uuid и для строки, которая не uuid (решение 9).
Then("запись мне недоступна", async ({ ctx }) => {
  expect(ctx.transcript, "транскрипт чужой записи получен").toBeUndefined();
  expect(ctx.openError).toBeInstanceOf(RecordingNotFoundError);
  const message = (ctx.openError as Error).message;
  const user = currentUser(ctx);
  for (const id of [randomUUID(), "not-a-uuid"]) {
    const other = await getTranscript(user, id).catch((e: unknown) => e);
    expect(other).toBeInstanceOf(RecordingNotFoundError);
    expect((other as Error).message).toBe(message);
  }
});

Then("я вижу {word} реплики", async ({ ctx }, count: string) => {
  expect(allUtterances(shown(ctx))).toHaveLength(numeral(count));
});

// Каждая реплика из подготовки показана ровно один раз, и её спикер —
// «Спикер {порядок её метки}».
Then("у каждой реплики указан её спикер", async ({ ctx }) => {
  const ref = ctx.currentRecording!;
  const utterances = allUtterances(shown(ctx));
  expect(ref.utterances.length).toBeGreaterThan(0);
  for (const source of ref.utterances) {
    const found = utterances.filter((u) => u.text === source.text);
    expect(found, source.text).toHaveLength(1);
    expect(found[0].speaker).toBe(`Спикер ${ref.labels[source.label]}`);
  }
});

Then("спикер с меткой {string} показан как {string}", async ({ ctx }, label: string, name: string) => {
  const ref = ctx.currentRecording!;
  const texts = ref.utterances.filter((u) => u.label === label).map((u) => u.text);
  expect(texts.length, `реплик с меткой ${label}`).toBeGreaterThan(0);
  const utterances = allUtterances(shown(ctx));
  for (const text of texts) {
    expect(utterances.find((u) => u.text === text)?.speaker, text).toBe(name);
  }
});

// Обход всего ответа: ни одно значение не равно метке провайдера, нет ключа label.
Then("метки провайдера пользователю не показываются", async ({ ctx }) => {
  const labels = new Set(Object.keys(ctx.currentRecording!.labels));
  const found: string[] = [];
  const walk = (value: unknown, path: string) => {
    if (typeof value === "string" && labels.has(value)) found.push(`${path} = ${value}`);
    if (value && typeof value === "object") {
      for (const [key, v] of Object.entries(value)) {
        if (key === "label") found.push(`${path}.label`);
        walk(v, `${path}.${key}`);
      }
    }
  };
  walk(shown(ctx), "transcript");
  expect(found).toEqual([]);
});

Then("транскрипт показан группами:", async ({ ctx }, table: DataTable) => {
  const expected = table.hashes().map((row) => ({
    speaker: row["спикер"],
    count: Number(row["реплик в группе"]),
  }));
  const actual = shown(ctx).groups.map((g) => ({ speaker: g.speaker.name, count: g.utterances.length }));
  expect(actual).toEqual(expected);
});

// Реплики имени не повторяют: в группе оно встречается один раз.
Then("имя спикера в группе указано один раз", async ({ ctx }) => {
  for (const group of shown(ctx).groups) {
    const serialized = JSON.stringify(group);
    expect(serialized.split(group.speaker.name).length - 1, serialized).toBe(1);
  }
});

// Реплики групп подряд — ровно реплики подготовки в том же порядке, по
// одной на реплику: ни склеек, ни разбиений.
Then("каждая реплика внутри группы — отдельный абзац", async ({ ctx }) => {
  const texts = shown(ctx).groups.flatMap((g) => g.utterances.map((u) => u.text));
  expect(texts).toEqual(ctx.currentRecording!.utterances.map((u) => u.text));
});
