import { expect } from "@playwright/test";
import { db } from "@/server/db";
import { hashPassword } from "@/server/auth/password";
import { Given } from "../support/fixtures";

// Подготовка — прямо в базе, минуя команды администратора.
Given("пользователь {string} с паролем {string}", async ({}, login: string, password: string) => {
  await db.user.create({ data: { login, name: login, passwordHash: await hashPassword(password) } });
});

Given("пользователя {string} в системе нет", async ({}, login: string) => {
  expect(await db.user.findUnique({ where: { login } })).toBeNull();
});
