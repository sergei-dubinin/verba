import { expect } from "@playwright/test";
import { db } from "@/server/db";
import { Then, When } from "../support/fixtures";

// Уведомление провайдера — с его стороны: без cookie сессии и без секрета.
// Редиректы не отслеживаются: 307 на /login (путь не исключён из proxy)
// должен остаться видимым, а не превратиться в 200 страницы входа.
When("приходит уведомление о готовности этой записи без секрета", async ({ ctx, request }) => {
  const { providerJobId } = await db.recording.findUniqueOrThrow({
    where: { id: ctx.currentRecording!.id },
    select: { providerJobId: true },
  });
  const res = await request.post("/api/stt/webhook", {
    data: { transcript_id: providerJobId, status: "completed" },
    maxRedirects: 0,
  });
  ctx.webhookStatus = res.status();
});

Then("уведомление отклонено", async ({ ctx }) => {
  expect(ctx.webhookStatus).toBe(401);
});

// Уведомление ничего не изменило: запись ждёт, результата нет.
Then("запись по-прежнему обрабатывается", async ({ ctx }) => {
  const row = await db.recording.findUniqueOrThrow({ where: { id: ctx.currentRecording!.id } });
  expect(row.status).toBe("processing");
  expect(row.providerRaw).toBeNull();
  expect(row.completedAt).toBeNull();
});
