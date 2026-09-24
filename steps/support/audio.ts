import { createWriteStream, existsSync } from "node:fs";
import { copyFile, mkdir, readFile, rename, stat } from "node:fs/promises";
import path from "node:path";
import { once } from "node:events";
import { expect } from "@playwright/test";

// Аудиофайлы сценариев (план среза 3, решение 16). Маленькие лежат в
// steps/support/audio; файлы для BR-21 собираются из meeting.m4a:
// переписанная длительность в mvhd плюс бокс free до нужного размера.

export const AUDIO_FIXTURES = path.resolve("steps/support/audio");
const CACHE = path.resolve(".cache/test-audio");

export function fixtureFile(name: string): string {
  const file = path.join(AUDIO_FIXTURES, name);
  expect(existsSync(file), `нет тестового файла ${name} в steps/support/audio`).toBe(true);
  return file;
}

export const MEETING = () => fixtureFile("meeting.m4a");

// Копия meeting.m4a, у которой mvhd говорит, что она длится durationMs.
function withDuration(source: Buffer, durationMs: number): Buffer {
  const buf = Buffer.from(source);
  let pos = 0;
  while (pos + 8 <= buf.length) {
    // size = 1 — 64-битный размер после типа (так записан mdat «Диктофона»).
    const short = buf.readUInt32BE(pos);
    const size = short === 1 ? Number(buf.readBigUInt64BE(pos + 8)) : short;
    const type = buf.toString("latin1", pos + 4, pos + 8);
    if (type === "moov") {
      let inner = pos + 8;
      while (inner + 8 <= pos + size) {
        const innerSize = buf.readUInt32BE(inner);
        if (buf.toString("latin1", inner + 4, inner + 8) === "mvhd") {
          expect(buf[inner + 8], "mvhd версии 0").toBe(0);
          const timescale = buf.readUInt32BE(inner + 8 + 12);
          buf.writeUInt32BE(Math.round((durationMs / 1000) * timescale), inner + 8 + 16);
          return buf;
        }
        inner += innerSize;
      }
    }
    pos += size;
  }
  throw new Error("в meeting.m4a не найден moov/mvhd");
}

// Файл «Диктофона» заданной длительности и (не меньше) заданного размера.
// Большие собираются один раз в .cache/test-audio — Playwright чистит
// test-results перед каждым прогоном.
export async function buildM4a(name: string, durationMs: number, sizeBytes = 0): Promise<string> {
  const file = path.join(CACHE, `${durationMs}-${sizeBytes}`, name);
  if (existsSync(file)) return file;
  await mkdir(path.dirname(file), { recursive: true });
  const head = withDuration(await readFile(MEETING()), durationMs);
  const temp = `${file}.tmp`;
  const out = createWriteStream(temp);
  out.write(head);
  const padding = sizeBytes - head.length;
  if (padding >= 8) {
    const header = Buffer.alloc(8);
    header.writeUInt32BE(padding, 0);
    header.write("free", 4, "latin1");
    out.write(header);
    const chunk = Buffer.alloc(8 * 1024 * 1024);
    for (let left = padding - 8; left > 0; left -= chunk.length) {
      if (!out.write(left >= chunk.length ? chunk : chunk.subarray(0, left))) await once(out, "drain");
    }
  }
  out.end();
  await once(out, "finish");
  await rename(temp, file);
  return file;
}

export async function fileSize(file: string): Promise<number> {
  return (await stat(file)).size;
}

// Настоящий файл по пути записи: повтору и «файл на месте» он нужен.
export async function placeAudio(target: string): Promise<number> {
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(MEETING(), target);
  return fileSize(target);
}
