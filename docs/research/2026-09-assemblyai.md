# AssemblyAI: что нужно знать адаптеру

- **Дата:** 2026-09-24
- **Статус:** актуально. Часть фактов проверена живыми вызовами к
  `api.eu.assemblyai.com` (помечены «проверено»), остальное — по
  документации.
- **Вопрос:** как устроены отправка, результат, уведомления и удаление у
  AssemblyAI — для клиента, вебхука и проверки незавершённых записей
  ([план среза 3а](../plan/03a-stt-provider.md)).
- **Решение по итогам:** [ADR 0005](../decisions/0005-assemblyai.md).

## Запросы

| что | запрос | ответ |
|---|---|---|
| загрузить файл | `POST /v2/upload`, тело — байты файла | `upload_url` |
| создать задачу | `POST /v2/transcript`, JSON с `audio_url` и параметрами | транскрипт со `status: queued`, `id` |
| узнать результат | `GET /v2/transcript/{id}` | `status`: `queued` / `processing` / `completed` / `error` |
| удалить | `DELETE /v2/transcript/{id}` | транскрипт с `text: "Deleted by user."` |

- Ключ — в заголовке `authorization`, без префикса. Неверный ключ — `401`
  (проверено).
- Регион EU — тот же API на `api.eu.assemblyai.com`. Ключ аккаунта
  работает и там (проверено).
- **Неизвестный id** — `400 {"error": "Transcript lookup error, transcript id
  not found"}`, а не `404`; так же и для id не в формате uuid (проверено).
- Лимиты: `/v2/upload` — до 2,2 ГБ, длительность — до 10 ч. У verba
  лимит — 3 ч (BR-21), около 750 МБ в «без потерь».

## Модели и языки

- `speech_models: ["universal-3-5-pro", "universal-2"]` — список по
  приоритету. Universal-3.5 Pro знает 18 языков, **русского среди них
  нет**; для остальных AssemblyAI сам переходит на Universal-2 (99+
  языков).
- Проверено на `meeting.m4a` (8 с, русский, один голос): `language_code:
  ru`, `speech_model_used: universal-2`, одна реплика спикера `A`, текст
  совпал с записанным ответом из США.
- `language_detection: true` и `language_detection_options:
  { code_switching: true }` — запрос принимается. Как держатся английские
  термины внутри русской речи — проверяется на настоящих записях (ADR 0005).
- `speaker_labels: true` — реплики (`utterances`) с метками `A`, `B`, …;
  число спикеров не задаём (BR-05).

## Уведомления (вебхук)

По документации, живым вызовом не проверено: у разработки нет публичного
адреса.

- `webhook_url` и свой заголовок `webhook_auth_header_name` /
  `webhook_auth_header_value` задаются при создании задачи.
- `POST` на `webhook_url`, тело — только `transcript_id` и `status`
  (`completed` или `error`); результат забирается отдельным `GET`.
- Ответ 2xx нужен за 10 с. Нет 2xx — до 10 повторов раз в 10 с. **На 4xx
  не повторяет**, на 5xx — повторяет.
- Уведомления из EU приходят с адреса `54.220.25.36` (из США —
  `44.238.19.20`): можно ограничить на Caddy, если понадобится.

## Удаление

- `DELETE` готовой задачи — `200`; удаляются текст и загруженный через
  `/v2/upload` файл. Повторный `DELETE` — тоже `200` (проверено).
- `GET` после удаления — `200`, `status: completed`, `text: "Deleted by
  user."`, `utterances: null` (проверено). Разбирать такой ответ нельзя:
  его надо отличать по статусу записи у нас, а не по ответу.
- **`DELETE` задачи, которая ещё идёт, — `400 transcript id not found`, и
  задача доходит до конца** с текстом (проверено). Удалить её можно только
  после завершения.

## Загрузка файла из Node

- `fetch` в Node 22 (`body: createReadStream(…)`, `duplex: "half"`)
  держит в памяти весь файл: на 750 МБ пик RSS — 830 МБ, `arrayBuffers`
  растут до размера файла и при медленном получателе, и со сборкой мусора
  (проверено на локальном сервере).
- `https.request` + `stream.pipeline` с `content-length` — около 90 МБ
  RSS на файле 300 МБ при любой скорости получателя (проверено).

## Источники

- https://www.assemblyai.com/docs/getting-started/models
- https://www.assemblyai.com/docs/deployment/webhooks
- https://www.assemblyai.com/docs/api-reference/transcripts/delete
- https://www.assemblyai.com/pricing
- [Исследование провайдеров](2026-09-stt-diarization-providers.md)
