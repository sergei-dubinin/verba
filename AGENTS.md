# verba

Сервис транскрибации и диаризации аудио. Стадия: исследование и проектирование.

## Где что лежит

- `docs/requirements.md` — бизнес-требования (BR/NFR), что продукт должен делать.
- `docs/features/` — сценарии поведения в Given-When-Then по каждому
  требованию. Станут исполняемыми тестами; требование без сценария не
  считается реализованным.
- `docs/design-prompt.md` — промпт для генерации дизайна экранов. Обновлять вместе с требованиями к интерфейсу.
- `docs/design-vercel/DESIGN.md` — альтернативная версия дизайна в эстетике Vercel / Geist, на обсуждении. Действующая версия — `design-prompt.md` и `docs/design/`.
- `docs/design/` — макеты экранов (`screens/*.html`) и токены (`tokens.css`, `tokens.json`). Читать перед любой работой над интерфейсом.
- `docs/architecture.md` — текущая архитектура и модель данных. Держать актуальной.
- `docs/research/` — исследования (дата в имени файла). Читать перед архитектурными решениями.
- `docs/decisions/` — ADR: принятые решения, `NNNN-название.md` (контекст → решение → последствия).
- `docs/plan/` — план реализации: порядок вертикальных срезов (`README.md`) и план каждого среза (`NN-название.md`). План среза пишется до кода.
- `src/app/` — экраны и route handlers (Next.js 16, App Router);
  `_lib/session.ts` — `requireUser()`, `src/proxy.ts` — быстрая проверка входа.
- `src/server/` — сервисы поверх Prisma; `db.ts` — клиент базы, `auth/` — пользователи, пароли, сессии; `recordings/` — список, автоназвание, статусы, конвейер обработки и повтор; `transcript/` — транскрипт записи; `uploads/` — загрузка файла; `audio/` — файлы на диске и длительность из m4a; `processing/` — очереди (BullMQ или `inline`), уведомления провайдера, проверка незавершённых записей; `stt/` — порт провайдера, клиент AssemblyAI, фейк; `time.ts` — часовой пояс приложения. `src/worker.ts` — воркер обработки.
- `steps/` — реализации шагов сценариев: `common/` (подготовка данных),
  `domain/`, `e2e/`; `support/` — фикстуры, тестовая база. Конфиг — `playwright.config.ts`.
- `scripts/` — команды администратора (`user.ts`) и демо-данные для разработки (`demo.ts`).
- `prisma/schema.prisma` — схема БД; клиент генерируется в `src/generated/` (не в git).
- `docs/agent-skills.html` — реестр скиллов и плагинов агента: что подключено, что рекомендовано и почему, опыт прошлого проекта. Данные — JSON-блок `registry-data` в начале файла.

## Запуск

```bash
pnpm install        # заодно генерирует Prisma-клиент
cp .env.example .env
pnpm db:up          # Postgres :5433 и Redis :6380 в docker compose
pnpm dev            # http://localhost:3000
```

Проверки: `pnpm typecheck`, `pnpm lint`, `pnpm build`. Миграции: `pnpm db:migrate`
(Prisma 7 сама клиент не перегенерирует — команда делает `prisma generate`).

Сценарии как тесты ([ADR 0003](docs/decisions/0003-executable-scenarios.md)):

```bash
pnpm exec playwright install chromium   # один раз, для e2e
pnpm test:spec      # доменные сценарии, секунды, без Next.js
pnpm test:e2e       # сценарии @e2e: next build + next start на :3100 в .next-e2e
pnpm test           # оба
pnpm test:missing   # какие фразы сценариев ещё без шагов
```

Тесты работают с базой `verba_test` в том же контейнере (`TEST_DATABASE_URL`
в `.env`); она создаётся и мигрируется сама, таблицы чистятся перед каждым
сценарием. Сценарии без реализованных шагов пропускаются.

Пользователи (пароль спрашивается скрыто или читается из stdin):

```bash
pnpm user:create anna --name "Анна"
pnpm user:passwd anna      # заодно удаляет все сессии anna
```

Демо-данные для разработки — записи и транскрипт как в макетах; повторный
запуск заменяет их, в production не работает:

```bash
pnpm demo:seed anna
```

Обработка: `pnpm worker` берёт задачи из Redis, отправляет файлы
провайдеру и раз в `STT_SWEEP_INTERVAL` проверяет незавершённые записи
(без воркера записи висят в «обрабатывается»). `STT_PROVIDER`:

- `assemblyai` — настоящий, ключ `ASSEMBLYAI_API_KEY`, регион EU. На
  `localhost` уведомлений нет (нужны `PUBLIC_URL` и `STT_WEBHOOK_SECRET`),
  результат забирает проверка — до `STT_SWEEP_INTERVAL` секунд;
- `fake` — без сети; ответ доставляется вручную, так проверяются
  «готово», «ошибка» и «Повторить».

```bash
pnpm worker
pnpm stt:deliver --all          # fake: или <recordingId>; --fail — сбой
pnpm stt:smoke                  # живой AssemblyAI: meeting.m4a туда и обратно, платно
```

Аудио лежит в `AUDIO_DIR` (`data/audio`, не в git).

## Термины

- **Вертикальный срез** (vertical slice) — этап реализации, который проходит
  все слои от экрана до базы и после которого набор требований BR-XX
  работает целиком: их сценарии зелёные. Один срез может закрыть несколько
  требований или часть одного; это единица реализации, а не требований.
- **Тестовая обвязка** (test harness) — инфраструктура, без которой
  сценарии из `docs/features/` не запускаются как тесты: раннер
  `playwright-bdd` и команды `test:spec`/`test:e2e`, словарь шагов в
  `steps/`, тестовая база, заглушка провайдера STT, синхронная очередь.
  Поведения продукта не добавляет. Состав — ADR 0003.

Слово «обвязка» без «тестовая» и слово «срез» без «вертикальный» в
документах не использовать.

## Правила

- Новое исследование → файл в `docs/research/`, ссылка на него в этом файле.
- Принятое решение → ADR в `docs/decisions/` со ссылкой на исследование.
- Правка BR в `docs/requirements.md` → в той же правке пересмотреть все
  сценарии с тегом `@BR-XX` в `docs/features/`: обновить, удалить или
  оставить как есть осознанно ([ADR 0003](docs/decisions/0003-executable-scenarios.md)).
- Серверный код → только в `src/server/` (сервисы поверх Prisma). Route
  handlers, серверные компоненты, воркер, `requireUser()` и команды
  администратора в `scripts/` — тонкие вызовы этих сервисов, без
  бизнес-логики ([ADR 0002](docs/decisions/0002-stack-and-hosting.md)).
- Каждая защищённая страница и каждое действие вызывают `requireUser()`:
  proxy проверяет только наличие cookie ([ADR 0004](docs/decisions/0004-sessions.md)).
- Вёрстка UI → макет из `docs/design/screens/`, значения только через переменные и классы `docs/design/tokens.css`; хексы и размеры из макетов не копировать Порядок работы — скилл `verba-ui`.
- Дизайн правится в холсте «verba — экраны» и перевыгружается в `docs/design/`; файлы там руками не редактировать.
- Подключил, убрал или создал скилл, плагин, MCP → обновить позицию и журнал в `docs/agent-skills.html`.

## Индекс исследований

- [STT + диаризация: провайдеры](docs/research/2026-09-stt-diarization-providers.md)
- [Голосовые профили: узнавание спикеров между записями](docs/research/2026-09-voice-profiles.md)
- [AssemblyAI: запросы, вебхук, удаление, загрузка из Node](docs/research/2026-09-assemblyai.md)

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
