// Тесты работают только с тестовой базой (план среза 1, решение 11).
// Модуль импортируется первым в playwright.config.ts: до него никто не
// должен успеть прочитать DATABASE_URL.
import path from "node:path";
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

// Аудио — в test-results, провайдер — фейк, обработка — сразу, без Redis
// (ADR 0003, «Тестовая обвязка»; план среза 3, решения 8 и 17). Секрет
// вебхука — чтобы уведомления в сценариях шли с проверкой (план среза 3а,
// решение 12). Те же значения получает e2e-сервер.
export const TEST_ENV = {
  AUDIO_DIR: path.resolve("test-results/audio"),
  STT_PROVIDER: "fake",
  VERBA_QUEUE: "inline",
  STT_WEBHOOK_SECRET: "test-webhook-secret",
};
Object.assign(process.env, TEST_ENV);

export const TEST_DATABASE_URL = testUrl;
