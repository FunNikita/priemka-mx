# Операционный журнал API

Backend пишет JSON события Pino в stdout. При `NODE_ENV=production` и заданном `APP_LOG_DIR` он также пишет те же строки в persistent JSONL. Каждый объект занимает одну строку. Другой проект может читать текущий файл в реальном времени и архивы `.gz`; этот репозиторий не отправляет внешние аварийные сообщения.

Имя текущего файла: `priemka-YYYY-MM-DD.jsonl` по UTC. После смены суток старый файл сжимается в `priemka-YYYY-MM-DD.jsonl.gz` асинхронно. При запуске незакрытые файлы прошлых дней также сжимаются. `LOG_RETENTION_DAYS` (по умолчанию 14) удаляет старые файлы. В Compose каталог `/app/data/logs` находится в отдельном `logs-data` volume. Для существующего volume проверьте доступ на запись пользователю `node` перед включением журнала.

Основные события:

```json
{"event":"http_request","requestId":"...","method":"GET","route":"/api/works/:workId","path":"/api/works/42","statusCode":200,"durationMs":8,"remoteIp":"172.19.0.1","userAgent":"...","actorUserId":7,"maxUserId":"9007199254740993"}
{"event":"domain_action","action":"PATCH /api/works/:workId","actorUserId":7,"houseId":6,"subjectId":42,"remoteIp":"172.19.0.1"}
{"event":"max_bot_update","updateType":"message_created","command":"start","allowed":true,"outboxId":15}
{"event":"outbox_retry","outboxId":15,"attempts":2,"dead":false}
{"event":"security_event","requestId":"...","statusCode":403,"path":"/api/works/42","remoteIp":"172.19.0.1"}
```

`http_request` создаётся для всех HTTP методов и ответов, включая 404 и 5xx. `path` не содержит query string. Для успешных mutating API добавляется `domain_action`. Параметр `remoteIp` берётся из Fastify `request.ip`: по умолчанию это фактический socket IP. `X-Forwarded-For` учитывается только если `TRUSTED_PROXY_IP` равен точному адресу соединяющегося reverse proxy. FastPanel проксирует на порт host loopback, но внутри Docker адрес proxy может быть адресом gateway; его нужно определить для конкретного окружения и задать локально. Произвольный клиентский `X-Forwarded-For` без доверенного proxy игнорируется. IP хранится только в технических логах, не как поле `User`, `Work`, `Observation` или продуктовой истории.

Логгер не пишет body запросов или полный webhook. Заголовки `X-Max-Init-Data`, `Authorization`, `Cookie`, `X-Max-Bot-Api-Secret`, токены MAX, пароли базы и URL подключения редактируются Pino. Не добавляйте эти значения в метаданные `domain_action` или `ActivityEvent`. Ротация и retention применяются к IP вместе с остальным техническим журналом.
