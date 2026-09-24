import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";
import { readDurationMs } from "../audio/m4a";
import { moveFile, recordingAudioPath, removeFile, writeTempFile } from "../audio/storage";
import { db } from "../db";
import { log } from "../log";
import { enqueueProcessing } from "../processing/queue";
import { sttProvider } from "../stt";
import { RecordingTooLongError, UnsupportedFormatError } from "./errors";

// Загрузка записи (BR-01, BR-03, BR-20, BR-21): одним потоком, без
// параметров — ни языка, ни числа спикеров (план среза 3, решения 3–6).

// BR-21: ровно 3 часа ещё принимаются.
export const MAX_DURATION_MS = 3 * 60 * 60 * 1000;

// Формат — только по расширению (решение 5). Вызывается до чтения тела.
export function checkUploadName(filename: string): void {
  if (!/\.m4a$/i.test(filename.trim())) throw new UnsupportedFormatError();
}

export type UploadInput = { filename: string; body: Readable };

// Запись создаётся только после того, как файл принят целиком (решение 4):
// оборванная загрузка не оставляет строки в базе и файла на диске.
export async function uploadRecording(
  user: { id: string },
  { filename, body }: UploadInput,
): Promise<{ recordingId: string }> {
  checkUploadName(filename);
  const temp = await writeTempFile(body);

  const recordingId = randomUUID();
  let audioPath: string;
  try {
    const durationMs = await readDurationMs(temp).catch(() => null);
    if (durationMs == null) log.warn("upload.duration_unknown", { recordingId, filename });
    if (durationMs != null && durationMs > MAX_DURATION_MS) throw new RecordingTooLongError();

    audioPath = recordingAudioPath(user.id, recordingId);
    await moveFile(temp, audioPath);
    try {
      await db.recording.create({
        data: {
          id: recordingId,
          ownerId: user.id,
          audioPath,
          durationMs,
          status: "uploaded",
          provider: sttProvider().name,
        },
      });
    } catch (e) {
      await removeFile(audioPath, { recordingId });
      throw e;
    }
  } catch (e) {
    await removeFile(temp, { recordingId });
    throw e;
  }

  log.info("recording.uploaded", { recordingId, ownerId: user.id });
  await enqueueProcessing(recordingId);
  return { recordingId };
}
