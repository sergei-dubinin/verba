import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "@/server/auth/cookie";
import { getSessionUser, type SessionUser } from "@/server/auth/sessions";

// Тонкая точка входа, как route handler: достаёт токен из cookie и
// спрашивает сервис. Живёт в src/app, потому что читает cookies().

export async function getCurrentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return getSessionUser(token);
}

// Настоящая проверка входа: вызывается на каждой защищённой странице и в
// каждом действии. proxy только отсекает запросы без cookie (ADR 0004).
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
