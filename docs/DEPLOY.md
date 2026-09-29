# Развёртывание

`push backend` запускает проверки и автоматическое развёртывание DEV. `push main` так же обновляет PROD. EVAL запускается вручную через workflow **Deploy EVAL** с обязательным полным commit SHA. Push никогда не обновляет EVAL. Ветка `frontend` не обновляет DEV автоматически.

Каждое окружение имеет собственные `.env`, `COMPOSE_PROJECT_NAME`, свободный `APP_PORT`, MySQL и volumes для базы, media, документов и логов. MySQL доступен только сети Compose; API публикуется лишь на `127.0.0.1:${APP_PORT}`. HTTPS reverse proxy направляется на этот loopback адрес. Точные адреса, SSH-параметры, серверные пути и порты находятся только в локальном `docs/DEPLOY.local.md`.

Workflow EVAL проверяет указанный commit (Node 24, `npm ci`, Prisma generate, lint, typecheck, tests, build), синхронизирует файлы и запускает `scripts/deploy-compose.sh`, seed и readiness checks. Для SSH transport он использует существующий GitHub Environment `dev`; каталог назначения жёстко задан отдельно от DEV. GitHub Environment `prod` и его secrets не меняются.

На EVAL нужны синтетические пользователи и `MAX_INIT_DATA_MAX_AGE_SECONDS=4320000` (50 суток). `MAX_OUTBOUND_ENABLED=false` отключает регистрацию webhook при deploy и polling BotOutbox. Проверка подписанного initData локально по настоящему MAX bot token остаётся включённой. DEV/PROD без переменной сохраняют `MAX_OUTBOUND_ENABLED=true` и прежнее поведение. Не копируйте реальные данные PROD в EVAL.

Скрипт запускается в подготовленном каталоге с `.env`: проверяет Compose, собирает контейнеры, ждёт `/api/ready`, затем на окружениях с разрешённым outbound настраивает webhook. Runtime API работает от пользователя `node`. Скрипт не меняет Git и не удаляет volumes.

Перед миграцией `20260926000000_mvp_role_workflow` в существующей БД запустите `scripts/preflight-document-confirmations.sh` при работающем MySQL. Read-only запрос должен вернуть **0 строк**. На новой пустой БД preflight не требуется. Не применяйте `prisma migrate reset` к развёрнутому окружению.

`MAX_BOT_NAME` обязателен: 5–64 латинских букв, цифр и `_`. `PREVIEW_ACCESS_REQUIRED=true` включает отдельный gate после проверки подписи MAX; даже администратору нужна запись PreviewAccess. `TRUSTED_PROXY_IP` задавайте только после проверки фактического IP reverse proxy. `BOT_TIME_ZONE` по умолчанию `Europe/Moscow`; JSONL логи и ротация описаны в [LOGGING.md](LOGGING.md).
