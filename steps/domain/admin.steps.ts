import { spawnSync } from "node:child_process";
import { expect } from "@playwright/test";
import { db } from "@/server/db";
import { authenticate } from "@/server/auth/authenticate";
import { InvalidCredentialsError } from "@/server/auth/errors";
import { Then, When } from "../support/fixtures";

// Команда запускается так же, как её запускает администратор: pnpm-скрипт,
// пароль в stdin. DATABASE_URL уже указывает на тестовую базу.
When(
  "администратор выполняет {string} с паролем {string}",
  async ({ ctx }, command: string, password: string) => {
    const [script, ...args] = command.split(" ");
    const result = spawnSync("pnpm", ["--silent", "run", script, ...args], {
      input: `${password}\n`,
      encoding: "utf8",
      env: process.env,
    });
    expect(result.status, `${command}:\n${result.stdout}\n${result.stderr}`).toBe(0);
    ctx.adminCommand = { login: args[0], password };
  },
);

Then("{string} может войти с паролем {string}", async ({}, login: string, password: string) => {
  const user = await authenticate(login, password);
  expect(user.login).toBe(login);
});

Then("{string} не может войти с паролем {string}", async ({}, login: string, password: string) => {
  await expect(authenticate(login, password)).rejects.toBeInstanceOf(InvalidCredentialsError);
});

Then("в базе хранится хеш пароля, а не сам пароль", async ({ ctx }) => {
  const { login, password } = ctx.adminCommand!;
  const user = await db.user.findUniqueOrThrow({ where: { login } });
  expect(user.passwordHash).not.toBe(password);
  expect(user.passwordHash).not.toContain(password);
  expect(user.passwordHash.startsWith("$argon2id$")).toBe(true);
});
