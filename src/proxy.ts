import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/server/auth/cookie";

// Быстрая проверка без базы: нет cookie сессии — на страницу входа.
// Настоящая проверка — requireUser() на каждой странице (ADR 0004).
export function proxy(request: NextRequest) {
  if (!request.cookies.has(SESSION_COOKIE)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Всё, кроме страницы входа, ресурсов Next.js и иконки. Когда появится
  // public/, его файлы добавить сюда. Загрузка (api/recordings) тоже мимо:
  // proxy держит тело запроса в памяти и обрезает на 10 МБ, вход проверяет
  // сам обработчик (план среза 3, решение 3). Вебхук провайдера
  // (api/stt/webhook) — без cookie, его вход — секрет в заголовке (план
  // среза 3а, решение 6).
  matcher: ["/((?!login$|_next/|favicon\\.ico$|api/recordings$|api/stt/webhook$).*)"],
};
