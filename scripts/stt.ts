// Разработка без провайдера (план среза 3, решение 12): доставить фейковый
// ответ записям в processing — так вручную проверяются «готово», «ошибка» и
// «Повторить». Не команда администратора.
//
//   pnpm stt:deliver <recordingId> | --all  [--fail]
import "./load-env";
import { db } from "../src/server/db";
import { receiveSttResult } from "../src/server/recordings/processing";
import { fakeError, fakeTranscript } from "../src/server/stt/fake";

const SAMPLE = [
  { speaker: "A", text: "Давайте начнём с интеграции: Jira синкается раз в час." },
  { speaker: "B", text: "Можно перейти на webhooks, тогда задержки почти не будет." },
  { speaker: "A", text: "А Kubernetes-кластер под staging кто поднимает?" },
  { speaker: "C", text: "Это к DevOps-команде, я уточню у них до четверга." },
];

async function main() {
  const args = process.argv.slice(2);
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

main()
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
