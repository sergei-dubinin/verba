import { expect } from "@playwright/test";
import type { DataTable } from "playwright-bdd";
import { db } from "@/server/db";
import { listRecordings } from "@/server/recordings/list";
import { completeProcessing } from "@/server/recordings/processing";
import { currentUser, recordingByTitle } from "../support/data";
import { Then, When } from "../support/fixtures";

When("я открываю список записей", async ({ ctx }) => {
  ctx.list = await listRecordings(currentUser(ctx), ctx.now ?? new Date());
});

// Список целиком равен таблице: те же группы в том же порядке и ровно эти
// записи в каждой. Лишняя группа или запись — падение.
Then("записи сгруппированы так:", async ({ ctx }, table: DataTable) => {
  const expected = table.hashes().map((row) => ({
    label: row["группа"],
    titles: row["записи"].split(",").map((t) => t.trim()),
  }));
  const actual = ctx.list!.map((g) => ({ label: g.label, titles: g.recordings.map((r) => r.title) }));
  expect(actual).toEqual(expected);
});

Then("внутри группы новые записи выше старых", async ({ ctx }) => {
  const groups = ctx.list!;
  expect(
    groups.some((g) => g.recordings.length > 1),
    "нет группы из нескольких записей — порядок не проверить",
  ).toBe(true);
  for (const group of groups) {
    const rows = await db.recording.findMany({
      where: { id: { in: group.recordings.map((r) => r.id) } },
      select: { id: true, createdAt: true },
    });
    const times = group.recordings.map((r) => rows.find((row) => row.id === r.id)!.createdAt.getTime());
    for (let i = 1; i < times.length; i++) {
      expect(times[i - 1], `группа «${group.label}», позиция ${i + 1}`).toBeGreaterThan(times[i]);
    }
  }
});

// Провайдер вернул транскрипт: N минут, M спикеров с метками A, B, C…,
// по реплике на спикера.
When(
  /^обработка завершилась: длительность (\d+) минут[аы]?, спикеров (\d+)$/,
  async ({ ctx }, minutes: string, speakers: string) => {
    const ref = ctx.currentRecording!;
    const labels = Array.from({ length: Number(speakers) }, (_, i) => String.fromCharCode(65 + i));
    await completeProcessing(ref.id, {
      durationMs: Number(minutes) * 60_000,
      utterances: labels.map((label, i) => ({
        speakerLabel: label,
        startMs: i * 5000,
        endMs: i * 5000 + 4000,
        text: `Реплика ${label}`,
      })),
    });
    ref.labels = Object.fromEntries(labels.map((l, i) => [l, i + 1]));
  },
);

// Название в списке. И сама обработка записалась: иначе автоназвание могло
// бы собраться не из результата обработки.
Then("запись называется {string}", async ({ ctx }, title: string) => {
  const ref = ctx.currentRecording!;
  const list = await listRecordings(currentUser(ctx), ctx.now ?? new Date());
  const item = list.flatMap((g) => g.recordings).find((r) => r.id === ref.id);
  expect(item, "запись в списке").toBeDefined();
  expect(item!.title).toBe(title);

  const row = await db.recording.findUniqueOrThrow({
    where: { id: ref.id },
    select: { status: true, completedAt: true, _count: { select: { speakers: true } } },
  });
  expect(row.status).toBe("done");
  expect(row.completedAt).not.toBeNull();
  expect(row._count.speakers).toBe(Object.keys(ref.labels).length);
});

Then("я вижу запись {string}", async ({ ctx }, title: string) => {
  const ref = recordingByTitle(ctx, title);
  const items = ctx.list!.flatMap((g) => g.recordings);
  expect(items.find((r) => r.id === ref.id)?.title).toBe(title);
});

Then("я не вижу запись {string}", async ({ ctx }, title: string) => {
  const ref = recordingByTitle(ctx, title);
  const items = ctx.list!.flatMap((g) => g.recordings);
  expect(items.map((r) => r.id)).not.toContain(ref.id);
  expect(items.map((r) => r.title)).not.toContain(title);
});
