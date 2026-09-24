import { open, type FileHandle } from "node:fs/promises";

// Длительность из заголовка m4a (план среза 3, решение 6). Это не проверка
// формата: не нашлось — null, запись всё равно принимается.
//
// Файл MP4 — последовательность боксов «размер, тип, содержимое». Нужен
// бокс mvhd внутри moov. У «Диктофона» moov стоит в конце, после mdat с
// аудио, поэтому верхние боксы проходятся по заголовкам, без чтения mdat.

// moov — метаданные, в нём килобайты; больше — не m4a «Диктофона».
const MAX_MOOV_BYTES = 64 * 1024 * 1024;

type Box = { type: string; start: number; headerSize: number; size: number };

async function readBoxHeader(file: FileHandle, start: number, end: number): Promise<Box | null> {
  if (end - start < 8) return null;
  const header = Buffer.alloc(16);
  const { bytesRead } = await file.read(header, 0, 16, start);
  if (bytesRead < 8) return null;
  let size = header.readUInt32BE(0);
  const type = header.toString("latin1", 4, 8);
  let headerSize = 8;
  if (size === 1) {
    if (bytesRead < 16) return null;
    size = Number(header.readBigUInt64BE(8));
    headerSize = 16;
  } else if (size === 0) {
    size = end - start;
  }
  if (size < headerSize || start + size > end) return null;
  return { type, start, headerSize, size };
}

// Длительность из mvhd: версия 0 — 32-битные поля, версия 1 — 64-битные.
function mvhdDurationMs(moov: Buffer): number | null {
  let pos = 0;
  while (pos + 8 <= moov.length) {
    const size = moov.readUInt32BE(pos);
    const type = moov.toString("latin1", pos + 4, pos + 8);
    if (size < 8 || pos + size > moov.length) return null;
    if (type === "mvhd") {
      const body = moov.subarray(pos + 8, pos + size);
      const version = body[0];
      const [timescale, duration] =
        version === 1 && body.length >= 32
          ? [body.readUInt32BE(20), Number(body.readBigUInt64BE(24))]
          : version === 0 && body.length >= 20
            ? [body.readUInt32BE(12), body.readUInt32BE(16)]
            : [0, 0];
      if (!timescale) return null;
      return Math.round((duration / timescale) * 1000);
    }
    pos += size;
  }
  return null;
}

export async function readDurationMs(path: string): Promise<number | null> {
  const file = await open(path, "r");
  try {
    const { size: end } = await file.stat();
    let pos = 0;
    while (pos < end) {
      const box = await readBoxHeader(file, pos, end);
      if (!box) return null;
      if (box.type === "moov") {
        const length = box.size - box.headerSize;
        if (length > MAX_MOOV_BYTES) return null;
        const moov = Buffer.alloc(length);
        await file.read(moov, 0, length, box.start + box.headerSize);
        return mvhdDurationMs(moov);
      }
      pos += box.size;
    }
    return null;
  } finally {
    await file.close();
  }
}
