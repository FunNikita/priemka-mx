# Приёмка

Мини-приложение MAX для кейса «Умный город»: базовый каркас решения для приёмки работ и управления домом. На текущем этапе реализованы инфраструктурная основа, безопасная идентификация пользователя MAX и минимальный API; продуктовые сценарии ещё не разрабатывались.

## Архитектура

- Один внешний домен `priemka.ithube.ru` будет проксироваться FastPanel на единственный loopback-порт приложения.
- Fastify обслуживает `/api/*`, в будущем — `/max/*`, а также production-сборку React SPA для остальных маршрутов.
- React/Vite использует относительный `/api/*`; локальный Vite proxy направляет эти запросы на Fastify.
- MySQL 8.4 доступен только во внутренней Docker-сети как `mysql`. Prisma 7 применяет миграции и работает от непривилегированного пользователя БД.

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
# Замените MAX_BOT_TOKEN и пароли в .env.
docker compose up -d --build
```

После запуска приложение доступно на `http://127.0.0.1:${APP_PORT}`. MySQL не публикует порт на хост. Для production FastPanel должен проксировать `priemka.ithube.ru` на этот loopback-порт.

## Переменные окружения

Шаблон находится в `.env.example`; настоящий `.env` игнорируется Git. Нужны `MAX_BOT_TOKEN`, параметры MySQL и `APP_PORT`. В Docker `DATABASE_URL` собирается из `MYSQL_*`, а root-пароль backend не использует. `MAX_INIT_DATA_MAX_AGE_SECONDS` — положительное конечное целое в секундах, по умолчанию — 3600.

## MAX

MAX Bridge подключается только официальным CDN-скриптом `https://st.max.ru/js/max-web-app.js`. Frontend передаёт исходную строку `window.WebApp.initData` в `X-Max-Init-Data`; backend проверяет её подпись и срок действия. `initDataUnsafe` не служит доверенным источником.

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

- TODO: бизнес-модели, роли, дома и сценарии приёмки.
- TODO: обязательные business-checks в `DATA-API.yaml` после утверждения методов.
- TODO: MAX Bot API webhook и бизнес-аудит; пока определён только контракт `ActivityEvent`.
- TODO: production TLS и проксирование настраиваются в FastPanel, не внутри этого репозитория.
