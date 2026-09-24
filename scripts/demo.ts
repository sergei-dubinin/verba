// Демо-данные для разработки: записи как в docs/design/screens/list.html и
// транскрипт из transcript.html — для сверки экранов с макетами и ручной
// проверки (план среза 2, решение 13). Не команда администратора.
//
//   pnpm demo:seed <login>
//
// Повторный запуск заменяет демо-записи пользователя (provider = "demo").
// Готовые записи проходят тот же путь, что в продукте: строка в статусе
// processing, затем completeProcessing. Строку создаёт сама команда, а не
// сервис загрузки: демо-записям нужны дата в прошлом и длительность, которой
// у тестового файла нет (план среза 3). Файл у каждой — настоящий,
// steps/support/audio/meeting.m4a, чтобы «Повторить» было что отправлять.
import "./load-env";
import { randomUUID } from "node:crypto";
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { recordingAudioPath, removeFile } from "../src/server/audio/storage";
import { db } from "../src/server/db";
import { completeProcessing } from "../src/server/recordings/processing";
import type { SttUtterance } from "../src/server/stt/types";
import { fromZoned, zoned } from "../src/server/time";

const MINUTE = 60_000;

// Метки провайдера нарочно не по порядку: «B» появляется первой и должна
// стать «Спикер 1».
const LABEL = { 1: "B", 2: "A", 3: "C" } as const;

const CALL: [1 | 2 | 3, string, string][] = [
  [1, "00:00:04", "Давайте начнём с интеграции. Мы в прошлый раз остановились на том, что Jira синкается раз в час."],
  [1, "00:00:11", "И это, честно говоря, узкое место."],
  [2, "00:00:15", "Да, я посмотрел. Там можно перейти на webhooks, тогда задержки почти не будет."],
  [3, "00:00:24", "А по бюджету это во что выливается? Нам же ещё Kubernetes-кластер под staging поднимать."],
  [2, "00:00:31", "По деньгам почти ничего, это в основном работа на нашей стороне. Дня три, может четыре."],
  [2, "00:00:38", "Кластер отдельно, это к DevOps-команде."],
  [1, "00:00:42", "Окей. Тогда фиксируем webhooks как первый шаг."],
  [1, "00:00:47", "Второй вопрос — доступы. У вас сейчас у всех один сервисный аккаунт, и по логам непонятно, кто что менял."],
  [3, "00:01:02", "Это правда. Мы просили SSO ещё весной, но тогда решили отложить."],
  [3, "00:01:09", "Если сейчас делаем webhooks, может, заодно и доступы разложить?"],
  [2, "00:01:16", "Можно, но это уже другой объём. SSO через Keycloak — это минимум две недели с тестированием."],
  [2, "00:01:25", "Я бы не смешивал в один релиз. Сначала интеграция, потом доступы."],
  [1, "00:01:33", "Согласен. Давайте так: в этот спринт webhooks, в следующий — SSO."],
  [3, "00:01:40", "Тогда мне нужно будет согласовать со своей стороны. Кто у вас подписывает такие вещи?"],
  [2, "00:01:48", "Обычно я готовлю оценку, а подписывает руководитель направления."],
  [2, "00:01:55", "Пришлю в понедельник, если ничего не поменяется."],
  [1, "00:02:03", "Хорошо. Ещё по мониторингу: сейчас алерты приходят в общий канал, и их никто не читает."],
  [1, "00:02:12", "Предлагаю развести по командам и оставить в общем только критичные."],
  [3, "00:02:21", "Поддерживаю. У нас та же история: Grafana шлёт всё подряд, люди просто мьютят канал."],
  [2, "00:02:30", "Тогда я заведу отдельные routing-правила в Alertmanager. Это быстро, день работы."],
  [1, "00:02:37", "Отлично. Давайте резюмирую: webhooks — этот спринт, SSO — следующий, алерты разводим параллельно."],
  [1, "00:02:48", "Оценку ждём в понедельник. Следующий созвон — в четверг в это же время."],
  [3, "00:02:56", "Договорились. Тогда с меня согласование по доступам до среды."],
];

function callUtterances(): SttUtterance[] {
  const starts = CALL.map(([, clock]) => {
    const [h, m, s] = clock.split(":").map(Number);
    return ((h * 60 + m) * 60 + s) * 1000;
  });
  return CALL.map(([speaker, , text], i) => ({
    speakerLabel: LABEL[speaker],
    startMs: starts[i],
    endMs: starts[i + 1] ?? starts[i] + 5000,
    text,
  }));
}

// Короткий транскрипт на нужное число спикеров.
function sampleUtterances(speakers: number): SttUtterance[] {
  return Array.from({ length: speakers * 2 }, (_, i) => ({
    speakerLabel: `S${(i % speakers) + 1}`,
    startMs: 3000 + i * 7000,
    endMs: 9000 + i * 7000,
    text: `Реплика ${i + 1}: обсуждаем детали проекта и следующие шаги.`,
  }));
}

type Demo = {
  title: string | null;
  // По умолчанию — готова; в обработке и после сбоя — как в list.html.
  status?: "processing" | "failed";
  // Сколько дней назад и во сколько — на часах приложения (APP_TIME_ZONE).
  daysAgo: number;
  at: [number, number];
  minutes: number;
  utterances: SttUtterance[];
};

const DEMOS: Demo[] = [
  { title: null, daysAgo: 0, at: [14, 5], minutes: 42, utterances: sampleUtterances(3) },
  { title: "Созвон с Ивановым", daysAgo: 0, at: [11, 20], minutes: 28, utterances: callUtterances() },
  { title: null, status: "processing", daysAgo: 0, at: [9, 48], minutes: 64, utterances: [] },
  { title: null, daysAgo: 1, at: [16, 40], minutes: 72, utterances: sampleUtterances(2) },
  { title: null, status: "failed", daysAgo: 1, at: [12, 3], minutes: 12, utterances: [] },
  { title: null, daysAgo: 2, at: [10, 15], minutes: 35, utterances: sampleUtterances(2) },
  { title: null, daysAgo: 3, at: [15, 30], minutes: 51, utterances: sampleUtterances(4) },
  { title: "Интервью с кандидатом", daysAgo: 4, at: [11, 0], minutes: 47, utterances: sampleUtterances(2) },
  { title: null, daysAgo: 4, at: [9, 5], minutes: 23, utterances: sampleUtterances(2) },
  { title: null, daysAgo: 35, at: [12, 30], minutes: 18, utterances: sampleUtterances(1) },
];

async function main() {
  const login = process.argv[2];
  if (!login) throw new Error("Использование: pnpm demo:seed <login>");
  if (process.env.NODE_ENV === "production") throw new Error("Демо-данные не для production");

  const user = await db.user.findUnique({ where: { login }, select: { id: true } });
  if (!user) throw new Error(`Пользователя «${login}» нет: pnpm user:create ${login}`);

  const old = await db.recording.findMany({ where: { ownerId: user.id, provider: "demo" }, select: { audioPath: true } });
  const { count } = await db.recording.deleteMany({ where: { ownerId: user.id, provider: "demo" } });
  for (const r of old) await removeFile(r.audioPath);
  const sample = path.resolve("steps/support/audio/meeting.m4a");

  for (const demo of DEMOS) {
    const today = zoned(new Date());
    const createdAt = fromZoned({ ...today, day: today.day - demo.daysAgo, hour: demo.at[0], minute: demo.at[1] });
    const id = randomUUID();
    const audioPath = recordingAudioPath(user.id, id);
    await mkdir(path.dirname(audioPath), { recursive: true });
    await copyFile(sample, audioPath);
    const failed = demo.status === "failed";
    await db.recording.create({
      data: {
        id,
        ownerId: user.id,
        title: demo.title,
        audioPath,
        status: failed ? "failed" : "processing",
        error: failed ? "demo: provider error" : null,
        durationMs: demo.status ? demo.minutes * MINUTE : null,
        provider: "demo",
        providerJobId: `demo-${id}`,
        createdAt,
      },
    });
    if (!demo.status) {
      await completeProcessing(id, { durationMs: demo.minutes * MINUTE, utterances: demo.utterances });
    }
  }
  console.log(`Удалено старых демо-записей: ${count}, создано: ${DEMOS.length}`);
}

main()
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
