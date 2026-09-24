import { readdir } from "node:fs/promises";
import path from "node:path";
import { expect } from "@playwright/test";
import { audioDir } from "@/server/audio/storage";
import { db } from "@/server/db";
import { listRecordings } from "@/server/recordings/list";
import { RecordingTooLongError, UnsupportedFormatError } from "@/server/uploads/errors";
import { MEETING, buildM4a, fileSize, fixtureFile } from "../support/audio";
import { currentUser, uploadFile } from "../support/data";
import { Given, Then, When } from "../support/fixtures";
import { expectState } from "../support/state";

// Загрузка через сервис, как с экрана. Отказ запоминается, а не роняет шаг:
// его проверяют «запись не создаётся» и «я вижу сообщение…».
When("я загружаю файл {string}", async ({ ctx }, name: string) => {
  try {
    await uploadFile(ctx, fixtureFile(name), name);
  } catch (e) {
    ctx.uploadError = e;
  }
});

When(
  "я загружаю файл {string} длительностью {int} ч {int} мин",
  async ({ ctx }, name: string, hours: number, minutes: number) => {
    const file = await buildM4a(name, (hours * 60 + minutes) * 60_000);
    try {
      await uploadFile(ctx, file, name);
    } catch (e) {
      ctx.uploadError = e;
    }
  },
);

// Подготовка: загрузка обязана удаться.
Given("я загрузил файл {string}", async ({ ctx }, name: string) => {
  await uploadFile(ctx, fixtureFile(name), name);
});

Given("я загрузил файл {string}, не указывая число спикеров", async ({ ctx }, name: string) => {
  await uploadFile(ctx, fixtureFile(name), name);
});

Given("я загрузил русскоязычную запись с английскими терминами", async ({ ctx }) => {
  await uploadFile(ctx, MEETING(), "meeting.m4a");
});

// Запись создана целиком: одна у пользователя, файл на диске байт в байт как
// отправленный, обработка поставлена — в базе processing с id задачи, а не
// uploaded (при синхронной очереди иначе шаг прошёл бы и без обработки).
Then("создаётся запись со статусом {string}", async ({ ctx }, status: string) => {
  expect(ctx.uploadError, "загрузка отклонена").toBeUndefined();
  const user = currentUser(ctx);
  const rows = await db.recording.findMany({ where: { ownerId: user.id } });
  expect(rows).toHaveLength(1);
  const [row] = rows;
  expect(row.id).toBe(ctx.currentRecording!.id);
  expect(await fileSize(row.audioPath)).toBe(ctx.upload!.size);
  expect(row.status).toBe("processing");
  expect(row.providerJobId).toBeTruthy();
  await expectState(ctx, row.id, status);
});

Then("запись сразу видна в списке со статусом {string}", async ({ ctx }, status: string) => {
  expect(ctx.uploadError, "загрузка отклонена").toBeUndefined();
  const list = await listRecordings(currentUser(ctx), ctx.now ?? new Date());
  const item = list.flatMap((g) => g.recordings).find((r) => r.id === ctx.currentRecording!.id);
  expect(item, "запись в списке").toBeDefined();
  await expectState(ctx, item!.id, status);
});

// Отказ был, и там, где запись появилась бы, её нет: ни строки в базе, ни
// файла на диске — ни итогового, ни временного.
Then("запись не создаётся", async ({ ctx }) => {
  expect(ctx.uploadError, "загрузка прошла, а должна была быть отклонена").toBeDefined();
  const user = currentUser(ctx);
  expect(await db.recording.count({ where: { ownerId: user.id } })).toBe(0);
  const files = await readdir(audioDir(), { recursive: true }).catch(() => []);
  const leftovers = files.filter((f) => /\.(m4a|part)$/.test(String(f)));
  expect(leftovers.map((f) => path.join(audioDir(), String(f)))).toEqual([]);
});

Then(/^я вижу сообщение, что принимаются только записи «Диктофона» \(\.m4a\)$/, async ({ ctx }) => {
  expect(ctx.uploadError).toBeInstanceOf(UnsupportedFormatError);
  expect((ctx.uploadError as Error).message).toBe("Поддерживаются только записи Диктофона iPhone (.m4a)");
});

Then("я вижу сообщение, что записи длиннее 3 часов не принимаются", async ({ ctx }) => {
  expect(ctx.uploadError).toBeInstanceOf(RecordingTooLongError);
  expect((ctx.uploadError as Error).message).toBe("Записи длиннее 3 часов не принимаются");
});
