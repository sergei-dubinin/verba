import type { RecordingStatus } from "../../generated/prisma/client";
import { db } from "../db";
import { dateGroupLabel, displayTitle, listMeta } from "./format";

export type RecordingListItem = {
  id: string;
  title: string;
  meta: string;
  status: RecordingStatus;
};

export type RecordingGroup = { label: string; recordings: RecordingListItem[] };

// Список записей пользователя (BR-13, BR-22): новые сверху, по группам дат.
// «Сейчас» — аргументом: от него зависят группы и формат даты.
export async function listRecordings(user: { id: string }, now: Date): Promise<RecordingGroup[]> {
  const rows = await db.recording.findMany({
    where: { ownerId: user.id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      title: true,
      status: true,
      durationMs: true,
      createdAt: true,
      _count: { select: { speakers: true } },
    },
  });

  const groups: RecordingGroup[] = [];
  for (const row of rows) {
    const label = dateGroupLabel(row.createdAt, now);
    let group = groups.at(-1);
    if (group?.label !== label) {
      group = { label, recordings: [] };
      groups.push(group);
    }
    group.recordings.push({
      id: row.id,
      title: displayTitle(row.title, {
        createdAt: row.createdAt,
        durationMs: row.durationMs,
        speakerCount: row.status === "done" ? row._count.speakers : null,
      }),
      meta: listMeta(row.createdAt, row.durationMs, now),
      status: row.status,
    });
  }
  return groups;
}
