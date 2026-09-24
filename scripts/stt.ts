// Команды разработчика для провайдера STT. Не команды администратора.
//
//   pnpm stt:deliver <recordingId> | --all  [--fail]
//     Разработка без провайдера (план среза 3, решение 12): доставить
//     фейковый ответ записям в processing — так вручную проверяются
//     «готово», «ошибка» и «Повторить». Фейк живёт в памяти воркера, а
//     команда — отдельный процесс, поэтому результат идёт прямо в
//     receiveSttResult, а не через уведомление.
//
//   pnpm stt:smoke [файл.m4a]
//     Настоящий AssemblyAI (план среза 3а, решение 14): отправить файл,
//     дождаться результата, разобрать, удалить у провайдера и убедиться,
//     что текст там больше не отдаётся. Платно (секунды аудио), ходит
//     наружу — поэтому не в pnpm test.
import "./load-env";
import { db } from "../src/server/db";
import { receiveSttResult } from "../src/server/recordings/processing";
import { assemblyAi } from "../src/server/stt/assemblyai/client";
import { fakeError, fakeTranscript } from "../src/server/stt/fake";

const SAMPLE = [
  { speaker: "A", text: "Давайте начнём с интеграции: Jira синкается раз в час." },
  { speaker: "B", text: "Можно перейти на webhooks, тогда задержки почти не будет." },
  { speaker: "A", text: "А Kubernetes-кластер под staging кто поднимает?" },
  { speaker: "C", text: "Это к DevOps-команде, я уточню у них до четверга." },
];

async function deliver(args: string[]) {
  const fail = args.includes("--fail");
  const target = args.find((a) => !a.startsWith("--"));
  if (!target && !args.includes("--all")) throw new Error("Использование: pnpm stt:deliver <recordingId> | --all [--fail]");
  if (process.env.STT_PROVIDER !== "fake") throw new Error("Только для STT_PROVIDER=fake");

  const recordings = await db.recording.findMany({
    where: { status: "processing", providerJobId: { not: null }, ...(target ? { id: target } : {}) },
    select: { id: true, providerJobId: true },
  });
  if (!recordings.length) throw new Error("Нет записей в processing с id задачи");

  for (const r of recordings) {
    const raw = fail
      ? fakeError()
      : fakeTranscript(SAMPLE.map((u, i) => ({ ...u, startMs: 2000 + i * 6000, endMs: 7000 + i * 6000 })));
    await receiveSttResult(r.providerJobId!, fail ? { ok: false, reason: raw.status, raw } : { ok: true, raw });
    console.log(`${r.id}: ${fail ? "ошибка" : "готово"}`);
  }
}

const POLL_MS = 3000;
const POLL_LIMIT_MS = 10 * 60_000;

async function smoke(args: string[]) {
  const file = args[0] ?? "steps/support/audio/meeting.m4a";
  const started = Date.now();
  const { jobId } = await assemblyAi.submit({ recordingId: "smoke", audioPath: file });
  console.log(`отправлено: ${file} → задача ${jobId}`);

  let status = await assemblyAi.status(jobId);
  while ("pending" in status) {
    if (Date.now() - started > POLL_LIMIT_MS) throw new Error(`задача ${jobId} не готова за 10 мин — удалите её руками`);
    await new Promise((r) => setTimeout(r, POLL_MS));
    status = await assemblyAi.status(jobId);
  }
  if (!status.ok) throw new Error(`сбой провайдера: ${status.reason}`);
  const raw = status.raw as { language_code?: string; speech_model_used?: string };
  const transcript = assemblyAi.parse(status.raw);
  console.log(
    `готово за ${Math.round((Date.now() - started) / 1000)} с: язык ${raw.language_code}, модель ${raw.speech_model_used}, ` +
      `${(transcript.durationMs / 1000).toFixed(0)} с`,
  );
  for (const u of transcript.utterances) {
    console.log(`  ${u.speakerLabel} ${(u.startMs / 1000).toFixed(1)}–${(u.endMs / 1000).toFixed(1)} с: ${u.text}`);
  }

  await assemblyAi.forget(jobId);
  const after = await assemblyAi.status(jobId);
  const leftovers = "pending" in after ? null : (after.raw as { utterances?: unknown } | undefined)?.utterances;
  if (leftovers) throw new Error(`после удаления провайдер всё ещё отдаёт реплики задачи ${jobId}`);
  console.log(`удалено у провайдера: ${jobId}`);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "deliver") return deliver(args);
  if (command === "smoke") return smoke(args);
  throw new Error("Использование: tsx scripts/stt.ts deliver|smoke …");
}

main()
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
