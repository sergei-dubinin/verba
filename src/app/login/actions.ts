"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authenticate } from "@/server/auth/authenticate";
import { SESSION_COOKIE } from "@/server/auth/cookie";
import { InvalidCredentialsError } from "@/server/auth/errors";
import { createSession } from "@/server/auth/sessions";

export type LoginState = { error?: string; login?: string };

// Вход: проверка пароля и сессия — в сервисах, здесь только cookie и
// переход. Введённый логин возвращается, чтобы остаться в поле; пароль — нет.
export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const login = String(formData.get("login") ?? "");
  const password = String(formData.get("password") ?? "");

  let userId: string;
  try {
    userId = (await authenticate(login, password)).id;
  } catch (e) {
    if (e instanceof InvalidCredentialsError) return { error: e.message, login };
    throw e;
  }

  const { token, expiresAt } = await createSession(userId);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
  redirect("/");
}
