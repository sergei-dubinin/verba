import { randomUUID } from "node:crypto";
import { expect } from "@playwright/test";
import { recordingAudioPath } from "@/server/audio/storage";
import { db } from "@/server/db";
import { completeProcessing } from "@/server/recordings/processing";
import { placeAudio } from "../support/audio";
import { createRecording, currentUser } from "../support/data";
import { Given } from "../support/fixtures";

// Записи в нужном состоянии обработки — прямо в базе.

Given("у меня есть запись в состоянии {string}", async ({ ctx }, state: string) => {
  const ownerId = currentUser(ctx).id;
  switch (state) {
    case "отправлена провайдеру": {
      const ref = await createRecording(ctx, ownerId, { status: "processing" });
      await db.recording.update({ where: { id: ref.id }, data: { providerJobId: `fake-${randomUUID()}` } });
      return;
    }
    case "транскрипт получен": {
      const ref = await createRecording(ctx, ownerId, { status: "processing" });
      await completeProcessing(ref.id, {
        durationMs: 60_000,
        utterances: [{ speakerLabel: "A", startMs: 0, endMs: 3000, text: "Реплика" }],
      });
      return;
    }
    case "провайдер вернул сбой": {
      const ref = await createRecording(ctx, ownerId, { status: "failed" });
      await db.recording.update({ where: { id: ref.id }, data: { error: "provider: error" } });
      return;
    }
    default:
      throw new Error(`неизвестное состояние «${state}»`);
  }
});

// Запись после сбоя с настоящим файлом: повтору нужно, что отправлять, а
// шагу «файл на месте» — что проверять.
Given("у меня есть запись со статусом {string}", async ({ ctx }, status: string) => {
  expect(status, "поддерживается только «ошибка»").toBe("ошибка");
  const ref = await createRecording(ctx, currentUser(ctx).id, { status: "failed" });
  const audioPath = recordingAudioPath(ref.ownerId, ref.id);
  ref.audioSize = await placeAudio(audioPath);
  await db.recording.update({
    where: { id: ref.id },
    data: { audioPath, error: "provider: error", provider: "fake", providerJobId: `fake-${randomUUID()}` },
  });
});
