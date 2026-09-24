import { expect, type Page } from "@playwright/test";
import { db } from "@/server/db";
import { SESSION_COOKIE } from "@/server/auth/cookie";
import { getSessionUser } from "@/server/auth/sessions";
import { createRecording, ensureUser } from "../support/data";
import { Given, Then, When } from "../support/fixtures";

const pathnameIs = (path: string) => (url: URL) => url.pathname === path;

// Сообщение формы. Ищется внутри main: у Next.js есть свой role="alert" —
// невидимый анонсер переходов.
const shownMessage = (page: Page) => page.getByRole("main").getByRole("alert");

async function expectLoginForm(page: Page) {
  await expect(page).toHaveURL(pathnameIs("/login"));
  await expect(page.getByLabel("Логин")).toBeVisible();
  await expect(page.getByLabel("Пароль")).toBeVisible();
  await expect(page.getByRole("button", { name: "Войти" })).toBeVisible();
}

Given("я на странице входа", async ({ page }) => {
  await page.goto("/login");
  await expectLoginForm(page);
});

When("я открываю страницу входа", async ({ page }) => {
  await page.goto("/login");
});

When("я открываю список записей", async ({ page }) => {
  await page.goto("/");
});

// Настоящая готовая запись другого пользователя («boris» из предыстории).
When("я открываю транскрипт чужой записи", async ({ page, ctx }) => {
  const owner = await ensureUser("boris");
  const recording = await createRecording(ctx, owner.id, { title: "Чужая запись" });
  await page.goto(`/recordings/${recording.id}`);
});

// Ждёт конца отправки: ответ сервера на POST /login получен, и кнопка
// снова «Войти» — либо ушли со страницы входа.
When(
  "я вхожу как {string} с паролем {string}",
  async ({ page }, login: string, password: string) => {
    await page.getByLabel("Логин").fill(login);
    await page.getByLabel("Пароль").fill(password);
    const response = page.waitForResponse(
      (r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/login",
    );
    await page.getByRole("button", { name: "Войти" }).click();
    await response;
    await expect(page.getByRole("button", { name: "Вход…" })).toHaveCount(0);
  },
);

Then("я попадаю на список записей", async ({ page }) => {
  await expect(page).toHaveURL(pathnameIs("/"));
  await expect(page.getByRole("heading", { name: "Записи" })).toBeVisible();
});

// Имени пользователя нет на экранах: проверяем, что cookie сессии в браузере
// принадлежит сессии этого пользователя в базе (план среза 1, решение 6).
Then("я в системе как {string}", async ({ page }, login: string) => {
  const cookie = (await page.context().cookies()).find((c) => c.name === SESSION_COOKIE);
  expect(cookie, "cookie сессии в браузере").toBeDefined();
  expect(cookie!.httpOnly).toBe(true);
  const user = await getSessionUser(cookie!.value);
  expect(user?.login).toBe(login);
});

Then("я остаюсь на странице входа", async ({ page }) => {
  await expectLoginForm(page);
});

Then("меня отправляет на страницу входа", async ({ page }) => {
  await expectLoginForm(page);
});

Then("вижу сообщение {string}", async ({ page }, message: string) => {
  await expect(shownMessage(page)).toHaveText(message);
});

// И предусловие, и проверка: в браузере нет cookie сессии, в базе нет сессий.
Given("я не вошёл в систему", async ({ page }) => {
  const cookies = await page.context().cookies();
  expect(cookies.map((c) => c.name)).not.toContain(SESSION_COOKIE);
  expect(await db.session.count()).toBe(0);
});

When("запоминаю показанное сообщение", async ({ page, ctx }) => {
  const alert = shownMessage(page);
  await expect(alert).toBeVisible();
  const text = (await alert.textContent())?.trim();
  expect(text).toBeTruthy();
  ctx.rememberedMessage = text;
});

Then("показанное сообщение совпадает с запомненным", async ({ page, ctx }) => {
  expect(ctx.rememberedMessage).toBeTruthy();
  const alert = shownMessage(page);
  await expect(alert).toBeVisible();
  await expect(alert).toHaveText(ctx.rememberedMessage!);
});

Then("на ней нет ни регистрации, ни восстановления, ни смены пароля", async ({ page }) => {
  await expectLoginForm(page);
  const forbidden = /регистр|восстанов|забыл|смен|сброс|sign ?up|register|forgot|reset/i;
  await expect(page.getByRole("link", { name: forbidden })).toHaveCount(0);
  await expect(page.getByRole("button", { name: forbidden })).toHaveCount(0);
  await expect(page.getByText(forbidden)).toHaveCount(0);
  await expect(page.locator("input:not([type=hidden])")).toHaveCount(2);
});
