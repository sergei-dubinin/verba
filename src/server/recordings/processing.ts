import { randomUUID } from "node:crypto";
import { db } from "../db";
import { log } from "../log";
import type { SttTranscript } from "../stt/types";
import { InvalidStatusTransitionError, RecordingNotFoundError } from "./errors";

// Результат обработки (docs/architecture.md, «Конвейер», шаг 3): в одной
// транзакции спикеры, реплики, длительность и переход processing → done.
// Спикеры нумеруются в порядке первого появления (BR-11), реплики — по
// времени начала. Вызывается воркером (вертикальный срез 3).
export async function completeProcessing(
  recordingId: string,
  transcript: SttTranscript,
  now: Date = new Date(),
): Promise<void> {
  const utterances = transcript.utterances
    .map((u, index) => ({ ...u, index }))
    .sort((a, b) => a.startMs - b.startMs || a.index - b.index);

  const speakerIds = new Map<string, string>();
  const speakers: { id: string; recordingId: string; label: string; ord: number }[] = [];
  for (const u of utterances) {
    if (speakerIds.has(u.speakerLabel)) continue;
    const id = randomUUID();
    speakerIds.set(u.speakerLabel, id);
    speakers.push({ id, recordingId, label: u.speakerLabel, ord: speakers.length + 1 });
  }

  await db.$transaction(async (tx) => {
    // Условный UPDATE: две обработки одной записи не запишут результат дважды.
    const { count } = await tx.recording.updateMany({
      where: { id: recordingId, status: "processing" },
      data: { status: "done", durationMs: transcript.durationMs, completedAt: now, error: null },
    });
    if (count === 0) {
      const current = await tx.recording.findUnique({
        where: { id: recordingId },
        select: { status: true },
      });
      if (!current) throw new RecordingNotFoundError();
      log.warn("recording.transition_rejected", { recordingId, from: current.status, to: "done" });
      throw new InvalidStatusTransitionError(recordingId, current.status, "done");
    }
    await tx.speaker.createMany({ data: speakers });
    await tx.utterance.createMany({
      data: utterances.map((u, seq) => ({
        recordingId,
        speakerId: speakerIds.get(u.speakerLabel)!,
        seq,
        startMs: u.startMs,
        endMs: u.endMs,
        text: u.text,
      })),
    });
  });

  log.info("recording.done", {
    recordingId,
    speakers: speakers.length,
    utterances: utterances.length,
  });
}
