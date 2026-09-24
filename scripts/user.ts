// Команды администратора (BR-17): тонкая точка входа — разбирает аргументы,
// читает пароль и вызывает сервисы. Логики здесь нет.
//
//   pnpm user:create <login> [--name "Имя"]
//   pnpm user:passwd <login>
//
// Пароль — из stdin: на терминале скрытый ввод, иначе первая строка потока.
// Аргументом не принимается, чтобы не остаться в истории шелла и в ps.
import "./load-env";
import { parseArgs } from "node:util";
import { db } from "../src/server/db";
import {
  EmptyPasswordError,
  UserExistsError,
  UserNotFoundError,
} from "../src/server/auth/errors";
import { createUser, setPassword } from "../src/server/auth/users";

const USAGE = `Использование:
  pnpm user:create <login> [--name "Имя"]
  pnpm user:passwd <login>`;

async function readPiped(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8").split(/\r?\n/)[0];
}

function readHidden(prompt: string): Promise<string> {
  const stdin = process.stdin;
  process.stdout.write(prompt);
  return new Promise((resolve) => {
    let value = "";
    const onData = (input: string) => {
      for (const ch of input) {
        if (ch === "\r" || ch === "\n" || ch === "\u0004") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          process.stdout.write("\n");
          resolve(value);
          return;
        }
        if (ch === "\u0003") {
          process.stdout.write("\n");
          process.exit(130);
        }
        if (ch === "\u007f") value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.setRawMode(true);
    stdin.setEncoding("utf8");
    stdin.resume();
    stdin.on("data", onData);
  });
}

async function readPassword(): Promise<string> {
  if (!process.stdin.isTTY) return readPiped();
  const password = await readHidden("Пароль: ");
  const again = await readHidden("Ещё раз: ");
  if (password !== again) throw new Error("Пароли не совпадают");
  return password;
}

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { name: { type: "string" } },
  });
  const [command, login] = positionals;
  if (!login || (command !== "create" && command !== "passwd")) {
    console.error(USAGE);
    return 2;
  }

  const password = await readPassword();
  if (command === "create") {
    await createUser(login, password, values.name);
    console.log(`Пользователь «${login}» создан`);
  } else {
    await setPassword(login, password);
    console.log(`Пароль «${login}» изменён, сессии пользователя удалены`);
  }
  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((e) => {
    const known =
      e instanceof UserExistsError ||
      e instanceof UserNotFoundError ||
      e instanceof EmptyPasswordError ||
      (e instanceof Error && e.message === "Пароли не совпадают");
    console.error(known ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
