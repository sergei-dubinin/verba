// Тесты работают только с тестовой базой (план среза 1, решение 11).
// Модуль импортируется первым в playwright.config.ts: до него никто не
// должен успеть прочитать DATABASE_URL.
import { config } from "dotenv";

config({ quiet: true });

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) {
  throw new Error("TEST_DATABASE_URL не задан: см. .env.example");
}
if (new URL(testUrl).pathname !== "/verba_test") {
  throw new Error(`TEST_DATABASE_URL должен указывать на базу verba_test: ${testUrl}`);
}

process.env.DATABASE_URL = testUrl;

export const TEST_DATABASE_URL = testUrl;
