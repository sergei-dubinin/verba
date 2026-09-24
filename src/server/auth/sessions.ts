import { createHash, randomBytes } from "node:crypto";
import { db } from "../db";

// Сессии — ADR 0004: в cookie случайный токен, в базе его SHA-256.
// Срок — 30 дней с момента входа, без продления.
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type SessionUser = { id: string; login: string; name: string };

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.session.create({ data: { userId, tokenHash: hashToken(token), expiresAt } });
  return { token, expiresAt };
}

// Пользователь по токену из cookie; истёкшая или неизвестная сессия — null.
export async function getSessionUser(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { expiresAt: true, user: { select: { id: true, login: true, name: true } } },
  });
  if (!session || session.expiresAt <= new Date()) return null;
  return session.user;
}

export async function deleteSessions(userId: string): Promise<void> {
  await db.session.deleteMany({ where: { userId } });
}
