import { assemblyAi } from "./assemblyai/client";
import { fakeStt } from "./fake";
import type { SttProvider } from "./provider";

// Провайдер по STT_PROVIDER. Значения по умолчанию нет: продукт не должен
// заработать с фейком случайно (план среза 3, решение 7).
export function sttProvider(): SttProvider {
  const name = process.env.STT_PROVIDER;
  switch (name) {
    case "assemblyai":
      return assemblyAi;
    case "fake":
      return fakeStt;
    default:
      throw new Error(`STT_PROVIDER = ${name ?? "(не задан)"}: нужно "assemblyai" или "fake", см. .env.example`);
  }
}
