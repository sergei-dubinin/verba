import { TEST_DATABASE_URL, TEST_ENV } from "./steps/support/env";
import { defineConfig, devices } from "@playwright/test";
import { defineBddConfig } from "playwright-bdd";

// Сценарии из docs/features — это тесты (ADR 0003). Два проекта:
// spec — доменные сценарии без браузера и без Next.js, e2e — с тегом @e2e
// против собранного приложения.

const features = "docs/features/*.feature";
const fixtures = "steps/support/fixtures.ts";
const e2e = process.env.VERBA_E2E === "1";
const port = 3100;
// Сценарии без реализованных шагов пропускаются; pnpm test:missing
// вместо этого перечисляет недостающие шаги.
const missingSteps = process.env.BDD_MISSING === "fail" ? "fail-on-gen" : "skip-scenario";

const specDir = defineBddConfig({
  outputDir: ".features-gen/spec",
  features,
  steps: [fixtures, "steps/common/**/*.ts", "steps/domain/**/*.ts"],
  tags: "not @e2e",
  missingSteps,
});

const e2eDir = defineBddConfig({
  outputDir: ".features-gen/e2e",
  features,
  steps: [fixtures, "steps/common/**/*.ts", "steps/e2e/**/*.ts"],
  tags: "@e2e",
  missingSteps,
});

export default defineConfig({
  // База общая на все сценарии.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  globalSetup: "./steps/support/global-setup.ts",
  reporter: [["list"], ["html", { open: "never" }]],
  projects: [
    { name: "spec", testDir: specDir },
    {
      name: "e2e",
      testDir: e2eDir,
      use: { ...devices["Desktop Chrome"], baseURL: `http://localhost:${port}` },
    },
  ],
  // next build + next start в отдельный distDir: второй next dev рядом с
  // pnpm dev не стартует (план среза 1, решение 12). Только для e2e.
  webServer: e2e
    ? {
        command: `pnpm exec next build && pnpm exec next start -p ${port}`,
        port,
        timeout: 240_000,
        reuseExistingServer: false,
        env: { ...TEST_ENV, DATABASE_URL: TEST_DATABASE_URL, NEXT_DIST_DIR: ".next-e2e" },
      }
    : undefined,
});
