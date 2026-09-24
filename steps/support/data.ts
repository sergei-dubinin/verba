import { randomUUID } from "node:crypto";
import { expect } from "@playwright/test";
import { db } from "@/server/db";
import { MONTHS_SHORT, fromZoned } from "@/server/time";
import type { RecordingStatus } from "@/generated/prisma/client";
import type { RecordingRef, ScenarioContext } from "./fixtures";

// Помощники шагов подготовки: данные — прямо в базу.

// Пользователь для подготовки. Пароль не нужен: в e2e сессия создаётся
// сервисом, а не через форму (план среза 2, решение 12).
export async function ensureUser(login: string) {
  const existing = await db.user.findUnique({ where: { login }, select: { id: true, login: true } });
  if (existing) return existing;
  return db.user.create({
    data: { login, name: login, passwordHash: "!no-password" },
    select: { id: true, login: true },
  });
}

export function currentUser(ctx: ScenarioContext) {
  expect(ctx.user, "сначала «я вошёл как …»").toBeDefined();
  return ctx.user!;
}

type NewRecording = {
  title?: string | null;
  createdAt?: Date;
  durationMs?: number | null;
  status?: RecordingStatus;
};

// Запись без аудио: файла нет, путь и провайдер — заглушки (решение 5).
export async function createRecording(
  ctx: ScenarioContext,
  ownerId: string,
  { title = null, createdAt = new Date(), durationMs = 42 * 60_000, status = "done" }: NewRecording,
): Promise<RecordingRef> {
  const id = randomUUID();
  await db.recording.create({
    data: {
      id,
      ownerId,
      title,
      createdAt,
      durationMs,
      status,
      audioPath: `/nonexistent/${id}.m4a`,
      provider: "test",
      completedAt: status === "done" ? createdAt : null,
    },
  });
  const ref: RecordingRef = { id, ownerId, title: title ?? "", labels: {}, utterances: [] };
  if (title) ctx.recordings[title] = ref;
  ctx.currentRecording = ref;
  return ref;
}

export function recordingByTitle(ctx: ScenarioContext, title: string): RecordingRef {
  const ref = ctx.recordings[title];
  expect(ref, `запись «${title}» не создана шагами подготовки`).toBeDefined();
  return ref;
}

// «19 сен 2026 14:05» в поясе приложения → момент времени. Без времени —
// полдень: так дата не уезжает на соседний день ни в каком поясе.
export function parseRuDateTime(text: string): Date {
  const m = /^(\d{1,2}) (\S+) (\d{4})(?: (\d{2}):(\d{2}))?$/.exec(text.trim());
  expect(m, `дата «${text}» не в формате «19 сен 2026 14:05»`).toBeTruthy();
  const month = MONTHS_SHORT.indexOf(m![2]);
  expect(month, `месяц «${m![2]}»`).toBeGreaterThanOrEqual(0);
  const [hour, minute] = m![4] ? [Number(m![4]), Number(m![5])] : [12, 0];
  return fromZoned({ year: Number(m![3]), month: month + 1, day: Number(m![1]), hour, minute });
}

// «00:00:09» → 9000.
export function parseClock(text: string): number {
  const m = /^(\d{2}):(\d{2}):(\d{2})$/.exec(text.trim());
  expect(m, `время «${text}» не в формате чч:мм:сс`).toBeTruthy();
  return ((Number(m![1]) * 60 + Number(m![2])) * 60 + Number(m![3])) * 1000;
}

const NUMERALS: Record<string, number> = {
  один: 1, одна: 1, два: 2, две: 2, три: 3, четыре: 4, пять: 5,
  шесть: 6, семь: 7, восемь: 8, девять: 9, десять: 10,
};

export function numeral(word: string): number {
  const n = NUMERALS[word];
  expect(n, `число прописью «${word}»`).toBeDefined();
  return n;
}
