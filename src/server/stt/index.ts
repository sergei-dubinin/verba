import { fakeStt } from "./fake";
import type { SttProvider } from "./provider";

// Провайдер по STT_PROVIDER. Значения по умолчанию нет: продукт не должен
// заработать с фейком случайно (план среза 3, решение 7). Клиент AssemblyAI —
// вертикальный срез 3а.
export function sttProvider(): SttProvider {
  const name = process.env.STT_PROVIDER;
  switch (name) {
    case "fake":
      return fakeStt;
    default:
      throw new Error(`STT_PROVIDER = ${name ?? "(не задан)"}: поддерживается только "fake", см. .env.example`);
  }
}
