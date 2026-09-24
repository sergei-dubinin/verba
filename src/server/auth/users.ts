import { Prisma } from "../../generated/prisma/client";
import { db } from "../db";
import { log } from "../log";
import { EmptyPasswordError, UserExistsError, UserNotFoundError } from "./errors";
import { hashPassword } from "./password";
import { deleteSessions } from "./sessions";

// Пользователей заводит администратор командами user:create и user:passwd
// (BR-17). Регистрации и смены пароля в продукте нет.

export async function createUser(login: string, password: string, name?: string) {
  if (!password) throw new EmptyPasswordError();
  try {
    const user = await db.user.create({
      data: { login, name: name || login, passwordHash: await hashPassword(password) },
      select: { id: true, login: true, name: true },
    });
    log.info("user.created", { userId: user.id, login });
    return user;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new UserExistsError(login);
    }
    throw e;
  }
}

// Смена пароля администратором — обычно реакция на утечку, поэтому все
// сессии пользователя удаляются (ADR 0004).
export async function setPassword(login: string, password: string) {
  if (!password) throw new EmptyPasswordError();
  const user = await db.user.findUnique({ where: { login }, select: { id: true } });
  if (!user) throw new UserNotFoundError(login);
  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(password) },
  });
  await deleteSessions(user.id);
  log.info("user.password_changed", { userId: user.id, login });
}
