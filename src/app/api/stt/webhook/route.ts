import { WEBHOOK_SECRET_HEADER, acceptSttNotification, type NotificationResult } from "@/server/processing/notification";

// Уведомление провайдера STT о готовности (план среза 3а, решение 6). Путь
// исключён из proxy: у провайдера нет cookie сессии, вход ему заменяет
// секрет в заголовке — его проверяет сервис. На 4xx провайдер уведомление
// не повторяет, на 5xx — повторяет.
const STATUS: Record<NotificationResult, number> = {
  accepted: 200,
  rejected: 401,
  invalid: 400,
  "retry-later": 503,
};

export async function POST(request: Request) {
  const result = await acceptSttNotification({
    secret: request.headers.get(WEBHOOK_SECRET_HEADER),
    body: () => request.json(),
  });
  return new Response(null, { status: STATUS[result] });
}
