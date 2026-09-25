import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { IncomingMessage } from "node:http";
import { request } from "node:https";
import { pipeline } from "node:stream/promises";
import { NOT_FOUND, type SttProvider } from "../provider";
import { parseAssemblyAi } from "./parse";
import { parseNotification, statusOf } from "./status";

// Клиент AssemblyAI (ADR 0005, план среза 3а, решение 3): четыре запроса,
// без SDK. Что отвечает API и почему загрузка не через fetch —
// docs/research/2026-09-assemblyai.md.

// EU: записи разговоров держим в EU (решение 15).
const DEFAULT_BASE_URL = "https://api.eu.assemblyai.com";

// Параметры распознавания — одни для всех записей (BR-03, BR-05, BR-06):
// язык определяется сам, с переключением внутри записи; число спикеров
// не задаётся. Русского в Universal-3.5 Pro нет — AssemblyAI сам берёт
// Universal-2.
const PARAMS = {
  speaker_labels: true,
  language_detection: true,
  language_detection_options: { code_switching: true },
  speech_models: ["universal-3-5-pro", "universal-2"],
};

const REQUEST_TIMEOUT_MS = 30_000;
// Загрузка: обрыв, если соединение молчит столько времени.
const UPLOAD_IDLE_MS = 120_000;

export class AssemblyAiError extends Error {
  constructor(what: string, status: number, body: unknown) {
    const detail = typeof body === "object" && body && "error" in body ? String(body.error) : String(body);
    super(`AssemblyAI ${what}: ${status} ${detail}`.slice(0, 500));
    this.name = "AssemblyAiError";
  }
}

function settings() {
  const key = process.env.ASSEMBLYAI_API_KEY;
  if (!key) throw new Error("ASSEMBLYAI_API_KEY не задан: см. .env.example");
  return { key, baseUrl: process.env.ASSEMBLYAI_BASE_URL || DEFAULT_BASE_URL };
}

async function api(method: string, path: string, body?: unknown): Promise<{ status: number; json: unknown }> {
  const { key, baseUrl } = settings();
  const res = await fetch(new URL(path, baseUrl), {
    method,
    headers: { authorization: key, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await res.text();
  let json: unknown = text;
  try {
    json = JSON.parse(text);
  } catch {
    // не JSON — отдаём текстом, в сообщение об ошибке
  }
  return { status: res.status, json };
}

// Неизвестный id AssemblyAI отдаёт не 404, а 400 с этим текстом — и на
// DELETE задачи, которая ещё идёт.
function isNotFound({ status, json }: { status: number; json: unknown }): boolean {
  return status === 400 && JSON.stringify(json).includes("transcript id not found");
}

// Файл — потоком через node:https: fetch в Node 22 держит тело целиком в
// памяти, а файл бывает около 750 МБ.
async function upload(audioPath: string): Promise<string> {
  const { key, baseUrl } = settings();
  const { size } = await stat(audioPath);
  const req = request(new URL("/v2/upload", baseUrl), {
    method: "POST",
    headers: { authorization: key, "content-type": "application/octet-stream", "content-length": size },
  });
  req.setTimeout(UPLOAD_IDLE_MS, () => req.destroy(new Error("AssemblyAI upload: нет ответа")));
  const response = new Promise<IncomingMessage>((resolve, reject) => {
    req.on("response", resolve);
    req.on("error", reject);
  });
  const [res] = await Promise.all([response, pipeline(createReadStream(audioPath), req)]);
  const chunks: Buffer[] = [];
  for await (const chunk of res) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString("utf8");
  let json: unknown = text;
  try {
    json = JSON.parse(text);
  } catch {
    // не JSON — в сообщение об ошибке
  }
  const url = typeof json === "object" && json && "upload_url" in json ? json.upload_url : undefined;
  if (res.statusCode !== 200 || typeof url !== "string") throw new AssemblyAiError("upload", res.statusCode ?? 0, json);
  return url;
}

export const assemblyAi: SttProvider = {
  name: "assemblyai",

  async submit({ audioPath, webhook }) {
    const audioUrl = await upload(audioPath);
    const res = await api("POST", "/v2/transcript", {
      audio_url: audioUrl,
      ...PARAMS,
      ...(webhook && {
        webhook_url: webhook.url,
        webhook_auth_header_name: webhook.header,
        webhook_auth_header_value: webhook.secret,
      }),
    });
    const id = typeof res.json === "object" && res.json && "id" in res.json ? res.json.id : undefined;
    if (res.status !== 200 || typeof id !== "string") throw new AssemblyAiError("submit", res.status, res.json);
    return { jobId: id };
  },

  async status(jobId) {
    const res = await api("GET", `/v2/transcript/${encodeURIComponent(jobId)}`);
    if (isNotFound(res)) return { ok: false, reason: NOT_FOUND };
    if (res.status !== 200) throw new AssemblyAiError("status", res.status, res.json);
    return statusOf(res.json);
  },

  async forget(jobId) {
    const res = await api("DELETE", `/v2/transcript/${encodeURIComponent(jobId)}`);
    if (res.status !== 200) throw new AssemblyAiError("delete", res.status, res.json);
  },

  parseNotification,
  parse: parseAssemblyAi,
};
