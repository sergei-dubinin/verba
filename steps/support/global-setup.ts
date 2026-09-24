import { execFileSync } from "node:child_process";
import { Client } from "pg";
import { TEST_DATABASE_URL } from "./env";

// Создаёт verba_test в том же Postgres, если её нет, и применяет миграции.
export default async function globalSetup() {
  const admin = new URL(TEST_DATABASE_URL);
  admin.pathname = "/postgres";
  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const { rowCount } = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = 'verba_test'",
    );
    if (!rowCount) await client.query("CREATE DATABASE verba_test");
  } finally {
    await client.end();
  }

  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: "pipe",
  });
}
