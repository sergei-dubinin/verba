import { db } from "../db";
import { isUuid } from "../ids";
import { RecordingNotFoundError } from "../recordings/errors";
import { displayTitle, formatOffset, transcriptMeta } from "../recordings/format";
import { recordingState, type RecordingStateView } from "../recordings/state";

export type TranscriptUtterance = {
  startMs: number;
  // «00:00:09»
  start: string;
  text: string;
};

// Подряд идущие реплики одного спикера (BR-10). Имя — один раз на группу.
export type TranscriptGroup = {
  speaker: { name: string; ord: number };
  utterances: TranscriptUtterance[];
};

export type TranscriptView = RecordingStateView & {
  id: string;
  title: string;
  meta: string;
  groups: TranscriptGroup[];
};

// В MVP спикер всегда «Спикер {ord}», метка провайдера не показывается (BR-11).
const speakerName = (ord: number) => `Спикер ${ord}`;

// Транскрипт своей записи. Чужая, несуществующая и id не в формате uuid —
// одна и та же RecordingNotFoundError (BR-22).
export async function getTranscript(
  user: { id: string },
  id: string,
  now: Date = new Date(),
): Promise<TranscriptView> {
  if (!isUuid(id)) throw new RecordingNotFoundError();
  const recording = await db.recording.findFirst({
    where: { id, ownerId: user.id },
    select: {
      id: true,
      title: true,
      status: true,
      durationMs: true,
      createdAt: true,
      _count: { select: { speakers: true } },
      utterances: {
        orderBy: { seq: "asc" },
        select: { startMs: true, text: true, speaker: { select: { id: true, ord: true } } },
      },
    },
  });
  if (!recording) throw new RecordingNotFoundError();

  const groups: TranscriptGroup[] = [];
  let lastSpeakerId: string | null = null;
  for (const u of recording.utterances) {
    if (u.speaker.id !== lastSpeakerId) {
      groups.push({ speaker: { name: speakerName(u.speaker.ord), ord: u.speaker.ord }, utterances: [] });
      lastSpeakerId = u.speaker.id;
    }
    groups.at(-1)!.utterances.push({ startMs: u.startMs, start: formatOffset(u.startMs), text: u.text });
  }

  const facts = {
    createdAt: recording.createdAt,
    durationMs: recording.durationMs,
    speakerCount: recording.status === "done" ? recording._count.speakers : null,
  };
  return {
    id: recording.id,
    title: displayTitle(recording.title, facts),
    meta: transcriptMeta(facts, now),
    ...recordingState(recording.status),
    groups,
  };
}
