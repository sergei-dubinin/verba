import { SttParseError } from "../provider";
import type { SttTranscript } from "../types";

// Ответ AssemblyAI GET /v2/transcript/{id} → наш формат. Используются только
// поля ниже; образец настоящего ответа — steps/support/stt/assemblyai-demo.json.
//   status          "completed" | "error" | …
//   audio_duration  секунды, целые
//   utterances[]    { speaker: "A", start: мс, end: мс, text }
// Длительность провайдера грубая (до секунды), своя — из файла
// (план среза 3, решение 6).

type Utterance = { speaker: unknown; start: unknown; end: unknown; text: unknown };

export const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

export function parseAssemblyAi(raw: unknown): SttTranscript {
  if (!isRecord(raw)) throw new SttParseError("ответ не объект");
  if (raw.status !== "completed") throw new SttParseError(`status = ${String(raw.status)}`);
  if (typeof raw.audio_duration !== "number") throw new SttParseError("нет audio_duration");
  if (!Array.isArray(raw.utterances)) throw new SttParseError("нет utterances: speaker_labels выключен?");

  const utterances = (raw.utterances as Utterance[]).map((u, i) => {
    if (
      !isRecord(u) ||
      typeof u.speaker !== "string" ||
      typeof u.start !== "number" ||
      typeof u.end !== "number" ||
      typeof u.text !== "string"
    ) {
      throw new SttParseError(`utterances[${i}] не в формате { speaker, start, end, text }`);
    }
    return { speakerLabel: u.speaker, startMs: u.start, endMs: u.end, text: u.text };
  });

  return { durationMs: Math.round(raw.audio_duration * 1000), utterances };
}
