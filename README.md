# Приёмка

Мини-приложение MAX для кейса «Умный город»: проверка выполненных работ в многоквартирном доме, замечания, устранение, повторная проверка и документы с проверкой через MAX-бота.

## Архитектура

- Один внешний домен `priemka.ithube.ru` будет проксироваться FastPanel на единственный loopback-порт приложения.
- Fastify обслуживает `/api/*`, `/max/webhook`, `/doc/:key.pdf` и production-сборку React SPA.
- React/Vite использует относительный `/api/*`; локальный Vite proxy направляет эти запросы на Fastify.
- MySQL 8.4 доступен только во внутренней Docker-сети как `mysql`. Prisma 7 применяет миграции и работает от непривилегированного пользователя БД.
- Оригиналы изображений хранятся в Docker volume `media-data`; временные загрузки очищаются backend ежечасно после 12 часов.
- PDF хранятся в отдельном Docker volume `documents-data`; в MySQL находятся только метаданные, snapshot, путь и SHA-256. Версии документов не перезаписываются.

## Структура

```text
apps/web        React + TypeScript + Vite
apps/api        Fastify + Prisma + Vitest
packages/shared Общие типы
docs            Сгенерированный OpenAPI и DATA-API.yaml
```

## Docker

```bash
cp .env.example .env
# Задайте локальные пароли, MAX_BOT_TOKEN, MAX_BOT_NAME и MAX_WEBHOOK_SECRET.
docker compose up -d --build
```

После запуска приложение доступно на `http://127.0.0.1:${APP_PORT}`. MySQL не публикует порт на хост. Для production FastPanel должен проксировать `priemka.ithube.ru` на этот loopback-порт.

## Переменные окружения

Шаблон находится в `.env.example`; настоящий `.env` игнорируется Git. Нужны `MAX_BOT_TOKEN`, публичный ник `MAX_BOT_NAME`, секрет `MAX_WEBHOOK_SECRET`, параметры MySQL и `APP_PORT`. В Docker `DATABASE_URL` собирается из `MYSQL_*`, а root-пароль backend не использует. `MAX_INIT_DATA_MAX_AGE_SECONDS` — положительное конечное целое в секундах, по умолчанию — 3600.

## MAX

MAX Bridge подключается только официальным CDN-скриптом `https://st.max.ru/js/max-web-app.js`. Frontend передаёт исходную строку `window.WebApp.initData` в `X-Max-Init-Data`; backend проверяет её подпись и срок действия. `initDataUnsafe` не служит доверенным источником.

## Business API

`GET /api/me` сохраняет поля MAX launch context и добавляет `houses` с ролью, статусом и вычисленными правами каждого членства. `user.isAdmin` обозначает системного администратора отдельно от домового членства. Системный администратор не получает искусственных домов. Домовые роли: `RESIDENT`, `COUNCIL_MEMBER`, `CHAIRMAN`, `EXECUTOR`. Все business-маршруты `/api/*` проверяют MAX init data и доступ на backend. Без активного членства обычному пользователю доступ к дому закрыт; системному администратору членство для разрешённых административных действий не требуется.

У работы и наблюдения один статус: `NEW`, `IN_REVIEW`, `IN_PROGRESS`, `WAITING` или `ACCEPTED`. `isWatching` показывает отдельную подписку на работу. В `/api/me` `user.id` — внутреннее число, `user.maxUserId` — строковый MAX ID.

- `GET /api/houses/:houseId/works`, `GET /api/works/:workId` — список и полная карточка работы.
- `POST` и `DELETE /api/works/:workId/watch` — идемпотентная подписка на личные уведомления; вызов MAX Bot API пока не выполняется.
- `GET` и `POST /api/houses/:houseId/observations` — события дома, создаваемые жителями.
- `GET` и `POST /api/works/:workId/comments` — комментарии и вложения работы.
- `PUT` и `DELETE /api/houses/:houseId/chat` — ссылка на MAX-чат дома для председателя, члена совета и системного администратора. Исполнитель видит только назначенные ему работы, без общего списка наблюдений и ссылки на чат жителей.
- `POST /api/media` — JPEG/PNG/WebP до 10 MiB, ответ только `{ "id": number }`; `GET /photo/:key` — оригинал или preview по `w`, `h`, `fit`.

Миграция сохраняет существующих пользователей и переносит `systemRole=ADMIN` в `isAdmin=true`. `lastHouseId` имеет внешний ключ с `ON DELETE SET NULL`; успешный список работ дома сохраняет его для обычного пользователя с активным членством. `/api/me` ставит этот активный дом первым. Доступ к подтверждению акта требует `canSignAcceptanceAct` и `authorityBasis`. Общедоступного API для вступления в дом пока нет.

Для воспроизводимых тестовых данных на свежей БД после `docker compose up -d --build` выполните `docker compose exec api npm run demo:seed`. Скрипт можно запускать повторно: он добавляет один демо-дом, четыре членства, пять шаблонов, два объекта, пять работ с разными состояниями, замечания, устранение, документы и два наблюдения без сброса существующих данных. Синтетические MAX ID: `7000000000000000101` (житель), `7000000000000000102` (член совета), `7000000000000000103` (председатель), `7000000000000000104` (исполнитель), `7000000000000000105` (системный администратор без членства). Для локальной проверки с Postman signer задайте нужный `maxUserId`; секреты в seed не используются.

## Основной сценарий проверки

1. Председатель получает активных членов совета (`GET /api/houses/:houseId/members?role=COUNCIL_MEMBER`) и ручные шаблоны (`GET /api/checklist-templates`), затем назначает ровно одного активного члена совета того же дома через `POST /api/works/:workId/inspections` (`assigneeUserId`). Пункты копируются в snapshot. Работа переходит из `NEW` в `IN_REVIEW`.
2. Каждый проверяющий видит собственное назначение в `GET /api/me/inspection-assignments`, сохраняет пункты через `PUT /api/inspection-assignments/:assignmentId/answers/:itemId` и завершает через `POST /api/inspection-assignments/:assignmentId/complete`. `FAIL` требует комментарий и фото; `UNABLE_TO_CHECK` — комментарий. После завершения единственного назначения создаётся отчёт. Каждый `FAIL` создаёт отдельное замечание. При `FAIL` создаются замечания и работа переходит в `IN_PROGRESS`, иначе — в `WAITING`.
3. Исполнитель видит только замечания своих работ (`GET /api/me/issues`, `GET /api/works/:workId/issues`), отправляет комментарий и фото устранения в `POST /api/issues/:issueId/remediations`. Исходному проверяющему создаётся повторная проверка (`GET /api/me/reinspections`, `POST /api/reinspections/:reinspectionId/complete`). Её отчёт формируется автоматически; `NOT_RESOLVED` возвращает работу в `IN_PROGRESS`, все закрытые замечания — в `WAITING`.
4. Председатель может создать мотивированный отказ через `POST /api/works/:workId/documents` при активных замечаниях. Акт приёмки создаёт исполнитель после успешной проверки. Только для акта `POST /api/documents/:documentId/confirm`: сначала подтверждает исполнитель, затем активный председатель или член совета с `canSignAcceptanceAct=true`. Отчёты фиксируют завершение проверки, отказ — действие председателя по формированию; отдельного подтверждения для них нет. После этого работа становится `ACCEPTED`. Идентичность берётся только из MAX auth; поля `userId` и роли в body запрещены.

Шаблоны seed: общий ремонт, освещение, входная дверь/доводчик, кровля/протечка, двор/придомовая территория. Они демонстрационные, без выдуманных ссылок на обязательный универсальный чек-лист.

Акт содержит данные сторон, основания полномочий, договора, периода, объёма, единицы измерения и стоимости по [форме приказа № 761/пр](https://admkrasn.ru/images/FILES/Mun-Gil-Kontr/2015-10-26-761.pdf). По [порядку № 318/пр](https://www.consultant.ru/document/cons_doc_LAW_535600/d1be25d7666063b49d52a928f7f36330c4b4af7f/) его оформляет исполнитель. Подтверждение в «Приёмке» фиксирует действия пользователей и не является УКЭП.

## Документы и MAX-бот

Отчёты о первичной и каждой повторной проверке создаются автоматически как отдельные `Document`, привязанные к событию; `DocumentVersion` хранит версии только одного документа. Мотивированный отказ и акт — по действию пользователя с соответствующими правами. `GET /api/works/:workId` возвращает `documents[]` с версиями и `fileUrl`; приватные `storagePath` и `sha256` не выдаются. `GET /doc/:key.pdf` отдаёт сохранённый PDF. `@vkontakte/vk-qr` создаёт QR для подтверждённого [формата диплинка](https://dev.max.ru/docs/chatbots/bots-coding/prepare): `https://max.ru/<MAX_BOT_NAME>?start=doc_<publicKey>`. Новые ключи имеют 20 символов `[a-z0-9]`; прежние 40-символьные hex-ключи продолжают открываться. QR только проверяет существование и целостность файла и не подтверждает его.

Подпишите бот на `bot_started` через официальный [`POST /subscriptions`](https://dev.max.ru/docs-api/methods/POST/subscriptions) с HTTPS-адресом `https://<домен>/max/webhook` и секретом из `MAX_WEBHOOK_SECRET`. Backend проверяет `X-Max-Bot-Api-Secret`, быстро сохраняет событие в MySQL outbox и отвечает `200`. Фоновая обработка заново считает SHA-256 PDF, отправляет статус и сам файл через официальные [`POST /uploads`](https://dev.max.ru/docs-api/methods/POST/uploads) и [`POST /messages`](https://dev.max.ru/docs-api/methods/POST/messages). Неудачные отправки повторяются; рабочий токен остаётся только на backend.

## Команды

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run openapi:export
```

API-схема генерируется из Fastify-маршрутов в `docs/openapi.json`. `docs/DATA-API.yaml` — отдельная конфигурация проверок, требуемая кейсом, а не второй OpenAPI-документ.

## Ручная проверка API

Импортируйте [`docs/postman/Priemka.postman_collection.json`](docs/postman/Priemka.postman_collection.json) в Postman. Укажите `baseUrl` как `http://127.0.0.1:<APP_PORT>` из локального `.env`; `/api/health` и `/api/ready` доступны сразу после запуска Docker.

Для синтетической локальной проверки `/api/me` запустите в отдельном терминале из корня проекта:

```bash
npm run postman:signer -w @priemka/api
```

Signer читает `MAX_BOT_TOKEN` только из локального `.env` и слушает `127.0.0.1:36901`; в production API он не добавляется. В Postman режим `maxInitDataMode=synthetic` включён по умолчанию: перед каждым `GET /api/me` коллекция автоматически получает свежую подписанную строку и временно подставляет её в запрос. Можно менять `maxUserId`, `maxFirstName`, `maxLastName`, `maxUsername`, `maxLanguageCode`, `maxPhotoUrl`, `maxChatId`, `maxChatType`, `maxQueryId`, `maxStartParam` и `maxIp` в переменных коллекции. ID задавайте десятичными строками, чтобы сохранить большие числа без потери точности. Пустые `maxUsername` и `maxPhotoUrl` означают `null`.

Для проверки времени оставьте `maxAuthDate` пустым. `maxAuthDateOffsetSeconds=0` даст текущий `auth_date` и `200`; `-3601` даст просроченные данные, `+61` — слишком далёкое будущее, оба случая вернут `401` при стандартном лимите 3600 секунд. Для этих двух случаев измените `maxExpectedStatus` на `401`, чтобы тест Postman считался успешным. Можно указать точный Unix timestamp в секундах через `maxAuthDate`: он имеет приоритет над offset. После проверки верните `maxExpectedStatus=200` и offset `0`.

Это только синтетические данные для локальных проверок. Для проверки реальной интеграции откройте мини-приложение в MAX, переключите `maxInitDataMode=real` и временно вставьте свежую исходную строку `window.WebApp.initData` в переменную `maxInitData`. Не сохраняйте её в Git или документации; после истечения `auth_date` получите новую. `MAX_BOT_TOKEN` в Postman не нужен и не должен туда попадать.

```bash
curl -i http://127.0.0.1:3000/api/health
curl -i http://127.0.0.1:3000/api/ready
curl -i -H 'X-Max-Init-Data: <свежая строка window.WebApp.initData>' http://127.0.0.1:3000/api/me
```

В примерах замените `3000` на `APP_PORT`, если он отличается; в третьем запросе замените весь текст в угловых скобках на актуальную строку, не добавляя `MAX_BOT_TOKEN`.

## Ограничения и TODO

- TODO: публичный процесс выдачи членств в доме; сейчас их создаёт администратор или demo seed.
- TODO: обязательные business-checks в `DATA-API.yaml` после утверждения методов.
- TODO: расширенный бизнес-аудит и операторский экран управления шаблонами. Сейчас шаблоны создаёт seed, а назначенные проверки используют snapshot.
- TODO: production TLS и проксирование настраиваются в FastPanel, не внутри этого репозитория.
