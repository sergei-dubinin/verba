import type { SttStatus } from "../provider";
import { isRecord } from "./parse";

// Ответ AssemblyAI GET /v2/transcript/{id} → состояние задачи. Им же
// пользуется фейк: его ответы — в формате AssemblyAI.
//   status  "queued" | "processing" | "completed" | "error"
//   error   текст сбоя при "error"
export function statusOf(raw: unknown): SttStatus {
  if (!isRecord(raw)) throw new Error("ответ AssemblyAI не объект");
  switch (raw.status) {
    case "queued":
    case "processing":
      return { pending: true };
    case "completed":
      return { ok: true, raw };
    case "error":
      return { ok: false, reason: typeof raw.error === "string" ? raw.error : "error", raw };
    default:
      throw new Error(`AssemblyAI: status = ${String(raw.status)}`);
  }
}

// Тело уведомления на вебхук — только { transcript_id, status }
// (docs/research/2026-09-assemblyai.md).
export function parseNotification(body: unknown): string | null {
  if (!isRecord(body) || typeof body.transcript_id !== "string" || !body.transcript_id) return null;
  return body.transcript_id;
}
