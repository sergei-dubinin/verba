import { rm } from "node:fs/promises";
import { test as base, createBdd } from "playwright-bdd";
import { audioDir } from "@/server/audio/storage";
import { db } from "@/server/db";
import { fakeStt } from "@/server/stt/fake";
import type { RecordingGroup } from "@/server/recordings/list";
import type { TranscriptView } from "@/server/transcript/get";

// Запись, созданная шагами подготовки: то, что о ней знает сценарий.
export type RecordingRef = {
  id: string;
  ownerId: string;
  title: string;
  // Метка провайдера → порядок первого появления.
  labels: Record<string, number>;
  utterances: { label: string; startMs: number; text: string }[];
  // Размер аудиофайла, с которым запись создана; у записей без файла — нет.
  audioSize?: number;
};

// Состояние одного сценария: то, что шаги передают друг другу.
export type ScenarioContext = {
  rememberedMessage?: string;
  adminCommand?: { login: string; password: string };
  // Кто вошёл («я вошёл как …»).
  user?: { id: string; login: string };
  // «Сегодня» сценария; без него — настоящее время.
  now?: Date;
  // Записи по названию.
  recordings: Record<string, RecordingRef>;
  // Последняя созданная запись: «в ней реплики», «обработка завершилась».
  currentRecording?: RecordingRef;
  list?: RecordingGroup[];
  transcript?: TranscriptView;
  openError?: unknown;
  // Последний загружаемый файл и отказ загрузки («запись не создаётся»).
  upload?: { file: string; size: number };
  uploadError?: unknown;
  // Реплики последнего ответа провайдера — для «транскрипт доступен».
  sttUtterances?: { speaker: string; startMs: number; text: string }[];
  // Сырой ответ, который последним вернул провайдер.
  sttRaw?: unknown;
  // Ответ на последнее уведомление: HTTP-статус вебхука (e2e) или итог
  // сервиса (домен).
  webhookStatus?: number;
  notificationResult?: string;
};

export const test = base.extend<{ ctx: ScenarioContext; cleanDb: void }>({
  ctx: async ({}, use) => {
    await use({ recordings: {} });
  },
  // Перед каждым сценарием — пустая база. Имя базы проверяется до TRUNCATE,
  // чтобы ошибка в окружении не стёрла базу разработки.
  cleanDb: [
    async ({}, use) => {
      const [{ name }] = await db.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
      if (name !== "verba_test") {
        throw new Error(`Тесты подключены не к verba_test, а к ${name}: очистка отменена`);
      }
      const tables = await db.$queryRaw<{ tablename: string }[]>`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
      if (tables.length) {
        const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
        await db.$executeRawUnsafe(`TRUNCATE ${list} CASCADE`);
      }
      await rm(audioDir(), { recursive: true, force: true });
      fakeStt.reset();
      await use();
    },
    { auto: true },
  ],
});

export const { Given, When, Then } = createBdd(test);
