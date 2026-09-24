"use server";

import { revalidatePath } from "next/cache";
import { InvalidStatusTransitionError, RecordingNotFoundError } from "@/server/recordings/errors";
import { retryProcessing } from "@/server/recordings/processing";
import { requireUser } from "../_lib/session";

// «Повторить» (BR-08) в списке и на экране транскрипта. Запись уже не в
// ошибке (двойное нажатие) или не найдена — просто перечитать экран.
export async function retryRecording(id: string): Promise<void> {
  const user = await requireUser();
  try {
    await retryProcessing(user, id);
  } catch (e) {
    if (!(e instanceof RecordingNotFoundError || e instanceof InvalidStatusTransitionError)) throw e;
  }
  revalidatePath("/");
  revalidatePath(`/recordings/${id}`);
}
