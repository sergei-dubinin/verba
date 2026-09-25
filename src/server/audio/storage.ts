import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readdir, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { log } from "../log";

// Раскладка аудио на диске (NFR-03). Кроме этого модуля, никто не знает,
// где лежат файлы:
//   AUDIO_DIR/{ownerId}/{recordingId}.m4a — аудио записи;
//   AUDIO_DIR/tmp/{uuid}.part             — загрузка, которая ещё идёт.
// Временные файлы на том же томе, что и итоговые: перенос — rename.

export function audioDir(): string {
  const dir = process.env.AUDIO_DIR;
  if (!dir) throw new Error("AUDIO_DIR не задан: см. .env.example");
  return path.resolve(dir);
}

export function recordingAudioPath(ownerId: string, recordingId: string): string {
  return path.join(audioDir(), ownerId, `${recordingId}.m4a`);
}

// Поток — во временный файл, не собирая тело в памяти. Поток оборвался
// (клиент отменил загрузку, упала сеть) — файл удаляется, ошибка летит дальше.
export async function writeTempFile(body: Readable): Promise<string> {
  const dir = path.join(audioDir(), "tmp");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${randomUUID()}.part`);
  try {
    await pipeline(body, createWriteStream(file));
  } catch (e) {
    await removeFile(file);
    throw e;
  }
  return file;
}

export async function moveFile(from: string, to: string): Promise<void> {
  await mkdir(path.dirname(to), { recursive: true });
  await rename(from, to);
}

// Брошенные загрузки: .part, который не менялся с olderThan. Файл, в который
// ещё пишут, свежий — его не трогаем. Возвращает, сколько удалено.
export async function removeStaleTempFiles(olderThan: Date): Promise<number> {
  const dir = path.join(audioDir(), "tmp");
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw e;
  }
  let removed = 0;
  for (const name of names) {
    if (!name.endsWith(".part")) continue;
    const file = path.join(dir, name);
    const info = await stat(file).catch(() => null);
    if (!info || info.mtime >= olderThan) continue;
    await removeFile(file);
    log.warn("audio.temp_removed", { file });
    removed++;
  }
  return removed;
}

// Неудалённый файл — не ошибка для пользователя, а мусор на диске: в лог.
export async function removeFile(file: string, fields: Record<string, unknown> = {}): Promise<void> {
  try {
    await unlink(file);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return;
    log.warn("audio.remove_failed", { ...fields, file, error: String(e) });
  }
}
