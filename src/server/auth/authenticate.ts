import { db } from "../db";
import { log } from "../log";
import { InvalidCredentialsError } from "./errors";
import { hashPassword, verifyPassword } from "./password";
import type { SessionUser } from "./sessions";

// Хеш, с которым сверяется пароль несуществующего пользователя: проверка
// занимает столько же времени, и по времени ответа не понять, есть ли логин.
let dummyHash: Promise<string> | undefined;

export async function authenticate(login: string, password: string): Promise<SessionUser> {
  const user = await db.user.findUnique({ where: { login } });
  if (!user) {
    dummyHash ??= hashPassword("verba-no-such-user");
    await verifyPassword(await dummyHash, password);
    log.info("auth.login_failed", { login, reason: "no_user" });
    throw new InvalidCredentialsError();
  }
  if (!(await verifyPassword(user.passwordHash, password))) {
    log.info("auth.login_failed", { userId: user.id, login, reason: "wrong_password" });
    throw new InvalidCredentialsError();
  }
  return { id: user.id, login: user.login, name: user.name };
}
