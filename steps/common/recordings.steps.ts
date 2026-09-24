import { randomUUID } from "node:crypto";
import type { DataTable } from "playwright-bdd";
import { db } from "@/server/db";
import { createRecording, currentUser, ensureUser, parseClock, parseRuDateTime } from "../support/data";
import { Given } from "../support/fixtures";

// Подготовка записей — прямо в базе, минуя загрузку и обработку.

Given(
  "у меня есть готовая запись {string} со спикерами:",
  async ({ ctx }, title: string, table: DataTable) => {
    const ref = await createRecording(ctx, currentUser(ctx).id, { title });
    for (const row of table.hashes()) {
      const label = row["метка провайдера"];
      const ord = Number(row["порядок первого появления"]);
      await db.speaker.create({ data: { recordingId: ref.id, label, ord } });
      ref.labels[label] = ord;
    }
  },
);

// Реплики текущей записи в порядке строк. Конец — начало следующей реплики,
// у последней — плюс 3 секунды.
Given("в ней реплики:", async ({ ctx }, table: DataTable) => {
  const ref = ctx.currentRecording!;
  const speakers = await db.speaker.findMany({ where: { recordingId: ref.id } });
  const rows = table.hashes().map((row) => ({
    label: row["спикер"],
    startMs: parseClock(row["начало"]),
    text: row["текст"],
  }));
  await db.utterance.createMany({
    data: rows.map((row, seq) => ({
      id: randomUUID(),
      recordingId: ref.id,
      speakerId: speakers.find((s) => s.label === row.label)!.id,
      seq,
      startMs: row.startMs,
      endMs: rows[seq + 1]?.startMs ?? row.startMs + 3000,
      text: row.text,
    })),
  });
  ref.utterances = rows;
});

Given("у {string} есть готовая запись {string}", async ({ ctx }, login: string, title: string) => {
  const owner = await ensureUser(login);
  await createRecording(ctx, owner.id, { title });
});

// Готовые записи текущего пользователя в порядке строк таблицы.
Given("у меня есть записи:", async ({ ctx }, table: DataTable) => {
  const ownerId = currentUser(ctx).id;
  for (const row of table.hashes()) {
    await createRecording(ctx, ownerId, {
      title: row["название"],
      createdAt: parseRuDateTime(row["загружена"]),
    });
  }
});

// Запись отправлена провайдеру и ждёт результата: длительности ещё нет.
Given(/^я загрузил запись (\d{1,2} \S+ \d{4})$/, async ({ ctx }, date: string) => {
  await createRecording(ctx, currentUser(ctx).id, {
    createdAt: parseRuDateTime(date),
    durationMs: null,
    status: "processing",
  });
});
