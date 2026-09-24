import { expect, type Locator, type Page } from "@playwright/test";
import { formatOffset } from "@/server/recordings/format";
import { recordingByTitle } from "../support/data";
import { Then, When } from "../support/fixtures";

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Строка реплики: абзац с текстом и её время.
const utteranceRow = (page: Page, text: string): Locator =>
  page
    .getByRole("main")
    .locator("[data-utterance]")
    .filter({ has: page.getByText(text, { exact: true }) });

// Как пользователь: со списка, кликом по записи. Заодно проверяется, что
// запись видна в списке (решение 2).
When("я открываю запись {string}", async ({ page, ctx }, title: string) => {
  const ref = recordingByTitle(ctx, title);
  await page.goto("/");
  await page.getByRole("link", { name: new RegExp(`^${escape(title)}(\\s|$)`) }).click();
  await expect(page).toHaveURL((url) => url.pathname === `/recordings/${ref.id}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
});

Then("переименование спикера недоступно", async ({ page }) => {
  const main = page.getByRole("main");
  const names = main.getByText(/^Спикер \d+$/);
  await expect(names.first()).toBeVisible();
  const editable = "a, button, input, textarea, select, [contenteditable]:not([contenteditable=false]), [role=button], [role=textbox]";
  for (const name of await names.all()) {
    await expect(name.locator(editable)).toHaveCount(0);
    expect(await name.evaluate((el, sel) => !!el.closest(sel), editable)).toBe(false);
  }
  const first = names.first();
  await first.click();
  await first.dblclick();
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await expect(first).toHaveText("Спикер 1");
  await expect(page.getByRole("button", { name: /переименовать спикера|rename/i })).toHaveCount(0);
});

Then("у реплики {string} показано время {string}", async ({ page }, text: string, time: string) => {
  await expect(utteranceRow(page, text).locator("time")).toHaveText(time);
});

// Первая реплика записи начинается не с нуля (00:00:04): если бы время
// считалось от первой реплики, здесь было бы 00:00:00.
Then("время отсчитывается от начала записи", async ({ page, ctx }) => {
  const first = ctx.currentRecording!.utterances[0];
  expect(first.startMs).toBeGreaterThan(0);
  await expect(utteranceRow(page, first.text).locator("time")).toHaveText(formatOffset(first.startMs));
});

Then("текст реплик нельзя изменить", async ({ page, ctx }) => {
  const main = page.getByRole("main");
  await expect(main.locator("input, textarea, [contenteditable]:not([contenteditable=false])")).toHaveCount(0);
  await expect(main.getByRole("textbox")).toHaveCount(0);
  const text = ctx.currentRecording!.utterances[0].text;
  const paragraph = main.getByText(text, { exact: true });
  await paragraph.click();
  await page.keyboard.type("X");
  await expect(paragraph).toHaveText(text);
});

// Ни на транскрипте, ни на списке — ни ссылок, ни кнопок экспорта.
Then("скачивания или копирования транскрипта в продукте нет", async ({ page }) => {
  const forbidden = /скача|экспорт|копир|поделит|download|export|copy|share/i;
  for (const check of [page.url(), "/"]) {
    await page.goto(check);
    await expect(page.getByRole("link", { name: forbidden })).toHaveCount(0);
    await expect(page.getByRole("button", { name: forbidden })).toHaveCount(0);
    await expect(page.locator("a[download]")).toHaveCount(0);
  }
});
