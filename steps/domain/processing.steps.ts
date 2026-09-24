import { stat } from "node:fs/promises";
import { expect } from "@playwright/test";
import { db } from "@/server/db";
import { receiveSttResult, retryProcessing } from "@/server/recordings/processing";
import { FAILED_TEXT } from "@/server/recordings/state";
import { fakeError, fakeStt, fakeTranscript, type FakeUtterance } from "@/server/stt/fake";
import { getTranscript } from "@/server/transcript/get";
import { currentUser, numeral } from "../support/data";
import { Then, When } from "../support/fixtures";
import type { ScenarioContext } from "../support/fixtures";
import { expectState, stateFor } from "../support/state";

// Ответ провайдера приходит так же, как придёт от вебхука (вертикальный
// срез 3а): по id задачи, который читается из базы — после повтора он новый.
async function deliver(ctx: ScenarioContext, utterances: FakeUtterance[] | "error") {
  const { providerJobId } = await db.recording.findUniqueOrThrow({
    where: { id: ctx.currentRecording!.id },
    select: { providerJobId: true },
  });
  expect(providerJobId, "запись не отправлена провайдеру").toBeTruthy();
  if (utterances === "error") {
    const raw = fakeError();
    await receiveSttResult(providerJobId!, { ok: false, reason: raw.error, raw });
    return;
  }
  ctx.sttUtterances = utterances;
  await receiveSttResult(providerJobId!, { ok: true, raw: fakeTranscript(utterances) });
}

When("провайдер возвращает готовый транскрипт", async ({ ctx }) => {
  await deliver(ctx, [
    { speaker: "A", startMs: 1000, endMs: 4000, text: "Добрый день, начинаем." },
    { speaker: "B", startMs: 4500, endMs: 8000, text: "Да, я готов." },
    { speaker: "A", startMs: 8500, endMs: 12000, text: "Тогда первый вопрос." },
  ]);
});

When("провайдер возвращает ошибку", async ({ ctx }) => {
  await deliver(ctx, "error");
});

// По времени метки появляются в порядке шага (A, B, A, C), а в ответе идут в
// обратном: нумерация по порядку массива дала бы C «Спикер 1».
When(
  "провайдер возвращает транскрипт с метками спикеров {string}, {string}, {string}",
  async ({ ctx }, a: string, b: string, c: string) => {
    const byTime: FakeUtterance[] = [
      { speaker: a, startMs: 0, endMs: 4000, text: `Реплика ${a} 1` },
      { speaker: b, startMs: 5000, endMs: 9000, text: `Реплика ${b}` },
      { speaker: a, startMs: 10_000, endMs: 14_000, text: `Реплика ${a} 2` },
      { speaker: c, startMs: 15_000, endMs: 19_000, text: `Реплика ${c}` },
    ];
    await deliver(ctx, byTime.toReversed());
    ctx.currentRecording!.labels = { [a]: 1, [b]: 2, [c]: 3 };
  },
);

When("провайдер возвращает реплику {string}", async ({ ctx }, text: string) => {
  await deliver(ctx, [{ speaker: "A", startMs: 1200, endMs: 4800, text }]);
});

When("я запускаю обработку повторно", async ({ ctx }) => {
  await retryProcessing(currentUser(ctx), ctx.currentRecording!.id);
});

Then("запись имеет статус {string}", async ({ ctx }, status: string) => {
  await expectState(ctx, ctx.currentRecording!.id, status);
});

Then("у записи показан статус {string}", async ({ ctx }, status: string) => {
  const expected = stateFor(status);
  const item = ctx.list!.flatMap((g) => g.recordings).find((r) => r.id === ctx.currentRecording!.id);
  expect(item, "запись в списке").toBeDefined();
  expect(item!.state).toBe(expected.state);
  expect(item!.statusText).toBe(expected.text);
});

// Обработку запустила загрузка, а не шаг: провайдер получил ровно одну
// отправку — этой записи и её файла, и запись ждёт его ответа.
Then("я не совершал для этого никаких действий, кроме загрузки", async ({ ctx }) => {
  const row = await db.recording.findUniqueOrThrow({ where: { id: ctx.currentRecording!.id } });
  expect(fakeStt.submissions).toEqual([
    { recordingId: row.id, audioPath: row.audioPath, jobId: row.providerJobId },
  ]);
  expect(row.status).toBe("processing");
});

Then("транскрипт доступен для чтения", async ({ ctx }) => {
  const view = await getTranscript(currentUser(ctx), ctx.currentRecording!.id);
  const texts = view.groups.flatMap((g) => g.utterances.map((u) => u.text));
  expect(texts).toEqual(ctx.sttUtterances!.map((u) => u.text));
});

Then("в записи {word} спикера", async ({ ctx }, count: string) => {
  const n = numeral(count);
  const id = ctx.currentRecording!.id;
  expect(await db.speaker.count({ where: { recordingId: id } })).toBe(n);
  const view = await getTranscript(currentUser(ctx), id);
  expect(new Set(view.groups.map((g) => g.speaker.name)).size).toBe(n);
});

Then("они пронумерованы в порядке первого появления в записи", async ({ ctx }) => {
  const ref = ctx.currentRecording!;
  const speakers = await db.speaker.findMany({ where: { recordingId: ref.id }, select: { label: true, ord: true } });
  expect(Object.fromEntries(speakers.map((s) => [s.label, s.ord]))).toEqual(ref.labels);
  const view = await getTranscript(currentUser(ctx), ref.id);
  expect(view.groups[0].utterances[0].startMs).toBe(0);
  expect(view.groups.map((g) => g.speaker.name)).toEqual(["Спикер 1", "Спикер 2", "Спикер 1", "Спикер 3"]);
});

Then("реплика в транскрипте — {string}", async ({ ctx }, text: string) => {
  const view = await getTranscript(currentUser(ctx), ctx.currentRecording!.id);
  const texts = view.groups.flatMap((g) => g.utterances.map((u) => u.text));
  expect(texts).toEqual([text]);
});

Then("я вижу, что обработка не удалась", async ({ ctx }) => {
  const user = currentUser(ctx);
  const view = await getTranscript(user, ctx.currentRecording!.id);
  expect(view.statusText).toBe(FAILED_TEXT);
  await expectState(ctx, view.id, "ошибка");
});

Then("мне доступен повторный запуск обработки", async ({ ctx }) => {
  const view = await getTranscript(currentUser(ctx), ctx.currentRecording!.id);
  expect(view.canRetry).toBe(true);
});

Then("признак ошибки с записи снят", async ({ ctx }) => {
  const row = await db.recording.findUniqueOrThrow({ where: { id: ctx.currentRecording!.id } });
  expect(row.error).toBeNull();
  const view = await getTranscript(currentUser(ctx), row.id);
  expect(view.statusText).toBeNull();
  expect(view.canRetry).toBe(false);
});

Then("исходный аудиофайл записи на месте", async ({ ctx }) => {
  const ref = ctx.currentRecording!;
  expect(ref.audioSize, "запись создана без файла").toBeDefined();
  const row = await db.recording.findUniqueOrThrow({ where: { id: ref.id }, select: { audioPath: true } });
  expect((await stat(row.audioPath)).size).toBe(ref.audioSize);
});
