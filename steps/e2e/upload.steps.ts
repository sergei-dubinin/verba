import { expect, type Page } from "@playwright/test";
import { db } from "@/server/db";
import { listRecordings } from "@/server/recordings/list";
import { buildM4a, fileSize, fixtureFile } from "../support/audio";
import { currentUser } from "../support/data";
import type { ScenarioContext } from "../support/fixtures";
import { Given, Then, When } from "../support/fixtures";
import { stateFor } from "../support/state";

// Устройство — это ширина окна: экран загрузки различается вёрсткой, а не
// user agent (план среза 3, решение 15).
const VIEWPORTS: Record<string, { width: number; height: number }> = {
  телефон: { width: 390, height: 844 },
  компьютер: { width: 1280, height: 800 },
};

const MB = 1024 * 1024;

Given("я на списке записей", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Записи" })).toBeVisible();
});

Given("я открыл verba на устройстве {string}", async ({ page }, device: string) => {
  const viewport = VIEWPORTS[device];
  expect(viewport, `неизвестное устройство «${device}»`).toBeDefined();
  await page.setViewportSize(viewport);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Записи" })).toBeVisible();
});

// Как пользователь: «Загрузить» → выбор файла → «Загрузить» в шторке. Шаг
// ждёт, пока шторка закроется: это значит, сервер ответил 201.
async function uploadThroughScreen(page: Page, ctx: ScenarioContext, file: string, timeout = 30_000) {
  ctx.upload = { file, size: await fileSize(file) };
  // «Загрузить» есть на списке; сценарий мог не открыть его сам (BR-21).
  if (new URL(page.url(), "http://x").pathname !== "/" || page.url() === "about:blank") await page.goto("/");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Загрузить", exact: true }).click();
  await (await chooser).setFiles(file);
  const sheet = page.getByRole("dialog", { name: "Загрузка" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Загрузить", exact: true }).click();
  await expect(sheet).toBeHidden({ timeout });
}

When("я загружаю файл {string}", async ({ page, ctx }, name: string) => {
  await uploadThroughScreen(page, ctx, fixtureFile(name));
});

When(
  "я загружаю файл {string} длительностью {int} ч и размером {int} МБ",
  async ({ page, ctx }, name: string, hours: number, megabytes: number) => {
    const file = await buildM4a(name, hours * 60 * 60_000, megabytes * MB);
    // Локально сотни мегабайт идут секунды; запас — на медленную машину.
    await uploadThroughScreen(page, ctx, file, 30_000 + megabytes * 200);
  },
);

// Запись создана целиком (размер на диске как у отправленного файла — так
// обрезанное тело не пройдёт), обработка поставлена, и строка на экране
// показывает статус.
Then("создаётся запись со статусом {string}", async ({ page, ctx }, status: string) => {
  const expected = stateFor(status);
  const rows = await db.recording.findMany({ where: { ownerId: currentUser(ctx).id } });
  expect(rows).toHaveLength(1);
  const [row] = rows;
  expect(await fileSize(row.audioPath)).toBe(ctx.upload!.size);
  expect(row.status).toBe("processing");
  expect(row.providerJobId).toBeTruthy();
  const item = page.locator(`[data-recording="${row.id}"]`);
  await expect(item).toBeVisible();
  if (expected.text) await expect(item).toContainText(expected.text);
});

Then("я вижу её в списке", async ({ page, ctx }) => {
  const [row] = await db.recording.findMany({ where: { ownerId: currentUser(ctx).id } });
  const list = await listRecordings(currentUser(ctx), new Date());
  const title = list.flatMap((g) => g.recordings).find((r) => r.id === row.id)!.title;
  expect(title, "в названии есть длительность из файла").toMatch(/, \d+ мин$/);
  await expect(page.getByRole("main").getByText(title, { exact: true })).toBeVisible();
});

// В шторке, кроме самого файла, выбирать нечего: ни одного поля, ни слова
// о языке или спикерах.
Then("форма загрузки не спрашивает ни язык, ни число спикеров, ни другие параметры", async ({ page }) => {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Загрузить", exact: true }).click();
  await (await chooser).setFiles(fixtureFile("meeting.m4a"));
  const sheet = page.getByRole("dialog", { name: "Загрузка" });
  await expect(sheet.getByText("meeting.m4a")).toBeVisible();
  await expect(sheet.locator("input, select, textarea")).toHaveCount(0);
  await expect(sheet.getByRole("combobox")).toHaveCount(0);
  await expect(sheet.getByRole("checkbox")).toHaveCount(0);
  await expect(sheet.getByRole("radio")).toHaveCount(0);
  await expect(sheet).not.toContainText(/язык|спикер|language|speaker/i);
  await sheet.getByRole("button", { name: "Отмена" }).click();
  await expect(sheet).toBeHidden();
});
