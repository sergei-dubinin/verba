import { test as base, createBdd } from "playwright-bdd";
import { db } from "@/server/db";

// Состояние одного сценария: то, что шаги передают друг другу.
export type ScenarioContext = {
  rememberedMessage?: string;
  adminCommand?: { login: string; password: string };
};

export const test = base.extend<{ ctx: ScenarioContext; cleanDb: void }>({
  ctx: async ({}, use) => {
    await use({});
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
      await use();
    },
    { auto: true },
  ],
});

export const { Given, When, Then } = createBdd(test);
