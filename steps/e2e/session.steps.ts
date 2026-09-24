import { SESSION_COOKIE } from "@/server/auth/cookie";
import { createSession } from "@/server/auth/sessions";
import { ensureUser } from "../support/data";
import { Given } from "../support/fixtures";

// Подготовка, а не проверка входа: сессия создаётся сервисом, cookie
// кладётся в браузер. Форму входа проверяют сценарии BR-23 (план среза 2,
// решение 12).
Given("я вошёл как {string}", async ({ ctx, context, baseURL }, login: string) => {
  const user = await ensureUser(login);
  const { token, expiresAt } = await createSession(user.id);
  await context.addCookies([
    {
      name: SESSION_COOKIE,
      value: token,
      url: baseURL!,
      httpOnly: true,
      sameSite: "Lax",
      expires: Math.floor(expiresAt.getTime() / 1000),
    },
  ]);
  ctx.user = user;
});
