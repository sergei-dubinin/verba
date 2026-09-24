import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { RecordingTooLongError, UnsupportedFormatError } from "@/server/uploads/errors";
import { checkUploadName, uploadRecording } from "@/server/uploads/upload";
import { getCurrentUser } from "../../_lib/session";

// Загрузка записи (план среза 3, решение 3): POST /api/recordings?filename=…,
// в теле — сам файл, потоком. Путь исключён из proxy: иначе тело копится в
// памяти и обрезается на 10 МБ. Поэтому вход проверяется здесь, и без него —
// 401, а не редирект.
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ message: "Войдите заново" }, { status: 401 });

  const filename = new URL(request.url).searchParams.get("filename") ?? "";
  try {
    // До чтения тела: неверный формат не гонит байты на диск.
    checkUploadName(filename);
    if (!request.body) return Response.json({ message: "Нет файла" }, { status: 400 });
    const body = Readable.fromWeb(request.body as NodeReadableStream<Uint8Array>);
    const { recordingId } = await uploadRecording(user, { filename, body });
    return Response.json({ id: recordingId }, { status: 201 });
  } catch (e) {
    if (e instanceof UnsupportedFormatError) return Response.json({ message: e.message }, { status: 415 });
    if (e instanceof RecordingTooLongError) return Response.json({ message: e.message }, { status: 422 });
    throw e;
  }
}
