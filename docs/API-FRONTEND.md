# API «Приёмки» для frontend

Backend доступен по относительным адресам `/api/*`. В production запросы идут на тот же домен, что и мини-приложение; локально Vite направляет `/api/*` на Fastify. Исходная строка `window.WebApp.initData` передаётся helper'ом `apiFetch` в заголовке `X-Max-Init-Data`. Backend проверяет подпись и срок действия. Frontend не отправляет `userId` или права доступа за текущего пользователя; желаемую роль он передаёт только в специальном запросе смены собственной роли.

Источники контракта: во время выполнения — схемы Fastify; опубликованная спецификация — [`openapi.json`](openapi.json). Типы DTO, параметры и маршруты для TypeScript находятся в [`packages/shared/src/api.ts`](../packages/shared/src/api.ts) и экспортируются из `@priemka/shared`. Этот файл описывает API, но не проверяет ответы во время выполнения. Используйте полученные от backend `actions` для кнопок и переходов; не повторяйте правила ролей и статусов в UI.

## Как пользоваться из frontend

`apiRoutes` в shared-пакете хранит полные пути `/api/*`. Текущий `apps/web` ещё не подключён к этому пакету. Его `apiFetch` принимает и полный путь, и прежний короткий путь: `apiFetch("/api/houses")` и `apiFetch("/houses")` оба обращаются к `/api/houses`. Заголовок MAX добавляется самим helper'ом. Точный относительный импорт `apiFetch` зависит от расположения файла в `apps/web/src`.

```ts
import { apiFetch } from "./api"; // поправьте относительный путь для своего файла

const response = await apiFetch("/api/houses");
if (!response.ok) throw new Error("Не удалось получить список домов");
const data = await response.json();

const listResponse = await apiFetch(`/api/houses/${houseId}/observations?tab=active`);
const detailResponse = await apiFetch(`/api/observations/${observationId}`);

const requestResponse = await apiFetch(`/api/houses/${houseId}/join-requests`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({}),
});
```

Если позднее подключите shared-пакет, builder `apiRoutes` вернёт `{ method, path }`; в `apiFetch` передавайте `.path`. Для query используйте `URLSearchParams`. `apiFetch` возвращает обычный `Response`: проверяйте `response.ok`, а для `204` не вызывайте `response.json()`.

## Личность и доступ к дому

`GET /api/me` возвращает `user` и `houses[]`. В каждом элементе `houses[]` frontend использует `id`, `address`, `role`, `status`, `joinedVia`, `executorCompanyName`, `permissions`, `chat`. Поле `chat` содержит `{title,joinUrl}` только при `permissions.viewHouseChat=true` и существующем чате, иначе `null`; отдельный запрос списка Work для ссылки на чат не нужен. Компания может быть сохранена и при другой текущей роли. `user.id` — внутренний числовой ID, `user.maxUserId` — строка: большой MAX ID нельзя переводить в JavaScript `Number`.

MAX User сам по себе не является участником дома. Рабочие права от членства появляются только при `status=ACTIVE`; `PENDING` и `REJECTED` членства их не дают. `user.isAdmin` обозначает отдельного системного администратора, а не домовую роль; его административные полномочия могут действовать без членства. Frontend не передаёт `lastHouseId` как условие доступа и не использует его как механизм безопасности. Backend возвращает `lastHouseId` в `/api/me`; frontend сохраняет выбор явным `PUT /api/me/last-house` с `{ "houseId": 6 }`. Нужен ACTIVE membership, включая администратора с членством.

## Найти дом и запросить доступ

`GET /api/houses?q=...&page=1&limit=20` ищет по адресу существующих домов. `q` обрезается по краям, максимум 200 символов; пустой поиск показывает все дома. `page` начинается с 1, `limit` — от 1 до 100. В ответе `items`, `page`, `limit`, `total`; каждый дом содержит только `id`, `address`, `access` и `actions` текущего пользователя.

`access.status` принимает `NONE`, `PENDING`, `ACTIVE`, `REJECTED`; `access.role` и `access.joinedVia` равны `null` при `NONE`. Действия означают:

| Состояние | `open` | `requestAccess` | `cancelRequest` |
| --- | --- | --- | --- |
| `NONE` | `false` | `true` | `false` |
| собственная `PENDING RESIDENT REQUEST` | `false` | `false` | `true` |
| `ACTIVE` | `true` | `false` | `false` |
| `REJECTED RESIDENT` | `false` | значение от backend | `false` |

Для других `PENDING` членств `cancelRequest` может быть `false`. Frontend **не вычисляет самостоятельно**, можно ли запросить доступ: используйте `actions.requestAccess`. Даже системный администратор без членства видит `access.status=NONE`, а не искусственный `ACTIVE`.

Самостоятельная заявка: `POST /api/houses/:houseId/join-requests` с JSON body `{}`. Ответ содержит `id`, `houseId`, `role`, `status`, `joinedVia`, `executorCompanyName`, `createdAt`, `updatedAt`. Первый запрос создаёт `PENDING RESIDENT REQUEST` (`201`), повторный возвращает существующую заявку (`200`). При `REJECTED RESIDENT` повторная подача переводит то же членство обратно в `PENDING REQUEST`. `DELETE /api/houses/:houseId/join-requests/me` отменяет только свою ожидающую `RESIDENT REQUEST` заявку и возвращает `204`; повторная отмена безопасна. Другие членства этот endpoint не удаляет.

Жизненный цикл: `NONE → PENDING RESIDENT → ACTIVE RESIDENT` при одобрении или `REJECTED RESIDENT` при отклонении. Frontend **никогда** не передаёт `role`, `status` или `userId` в самостоятельной заявке.

### Рассмотрение председателем

`GET /api/houses/:houseId/join-requests` по умолчанию показывает всех ожидающих `RESIDENT` дома независимо от `joinedVia` (`REQUEST`, `ADMIN` и др.); ожидающие повышенные роли не попадают в список. Доступны фильтр `status=PENDING|ACTIVE|REJECTED` и `page`/`limit`. Ответ — страница членств с краткими `user.id`, `firstName`, `lastName`, `photoUrl` и `requestedAt`. Доступен только активному председателю этого дома; системный администратор управляет членством через отдельный API.

`PATCH /api/houses/:houseId/join-requests/:membershipId` принимает только одно решение:

```json
{ "decision": "APPROVE" }
```

```json
{ "decision": "REJECT" }
```

Председатель здесь только одобряет или отклоняет базовый доступ `PENDING RESIDENT` независимо от `joinedVia`; источник членства сохраняется. Назначить повышенную роль этим endpoint нельзя. После активации участник MVP может переключить домовую роль отдельным endpoint; решение по заявке всегда выдаёт только `RESIDENT`. Противоположное решение после завершения заявки возвращает `409`.

## Роли и администратор

По умолчанию `ALLOW_SELF_ROLE_SWITCH=false`; для demo его включают явно. При `ALLOW_SELF_ROLE_SWITCH=true` активный участник меняет **только свою** роль через `PATCH /api/me/houses/:houseId/membership` с `{ "role": "EXECUTOR", "executorCompanyName": "Демо УК" }`. Доступные роли: `RESIDENT`, `COUNCIL_MEMBER`, `CHAIRMAN`, `EXECUTOR`. Для роли исполнителя нужно непустое название компании до 255 символов. Оно сохраняется при уходе из роли и доступно при возвращении. `PENDING` и `REJECTED` менять роль не могут. В доме одновременно может быть максимум один активный председатель; попытка занять уже занятую роль даёт `409`. Один человек может последовательно переключать роли и проходить весь демо-сценарий.

Системный `isAdmin` управляет пользователями через `GET /api/admin/users?q=&page=&limit=` и `PUT`/`DELETE /api/admin/houses/:houseId/members/:userId`, создаёт дом через `POST /api/admin/houses` с `{ "address": "..." }`. Активного исполнителя с незавершёнными работами и члена совета с незавершёнными проверками удалить нельзя (`409`); председателя удалить можно. Второй метод создаёт или изменяет роль, статус и компанию членства существующего пользователя. В списке есть только публичные данные профиля и членств. Администратор без соответствующей активной домовой роли не создаёт работы, не проверяет и не подтверждает акт.

## Основной сценарий: обращение

Список: `GET /api/houses/:houseId/observations?tab=active&page=1&limit=20`, `?tab=history&page=1&limit=20` или `?tab=active&watching=true&page=1&limit=20`; доступны прежние `search` и пагинация. Для жителя, члена совета и председателя `active` означает статус не `ACCEPTED`, `history` — принятые. `watching=true` выбирает подписки `AUTHOR`/`MANUAL` и собственные обращения даже без старой строки подписки; каждый item содержит `isWatching`. Для исполнителя `active` — текущее назначение до `ACCEPTED`, `history` — принятая работа с прежним назначением или работа, переданная другому исполнителю. Текущее незавершённое назначение не входит в историю, повторные назначения не создают дублей, чужое обращение скрыто как `404`. Бывший исполнитель видит своё обращение только для чтения.

Создание для жителя и председателя: `POST /api/houses/:houseId/observations` с `category`, `title`, `description`, необязательными `houseObjectId` и `mediaIds`. Председатель назначает исполнителя через `PUT /api/observations/:observationId/executor` с `{ "executorUserId": 123, "category": "..." }`. `category` можно опустить, если категория обращения соответствует активному шаблону чек-листа. Backend создаёт связанную внутреннюю Work или меняет её исполнителя до передачи на проверку. Поздняя смена даёт `409`. Назначение, snapshot компании и представителя, статус, событие, подписки и уведомление сохраняются атомарно. Таблица `WorkExecutorAssignment` хранит периоды назначений; миграция добавляет текущего исполнителя существующих Work без реконструкции прошлой истории.

`GET /api/observations/:observationId` возвращает основную информацию и сразу `workflow`, `history`, `comments`, `myTasks`, `actions`. `workflow` включает проверку, замечания, устранения и документы; `workflow.executor` и `linkedWork.executor` содержат только `{userId,companyName}`. Технический `workId` служит для команд Work. Доступность кнопок определяют только backend `actions`. Отдельные GET history/comments и Work detail сохранены для совместимости, основному экрану они не нужны. Новые комментарии создаются через `POST /api/observations/:observationId/comments`; старые Work comments входят в агрегированный detail.

Автор комментария в этом detail имеет вид `{ "type": "USER", "displayName": "Иван Иванов", "photoUrl": "https://..." }` или `{ "type": "EXECUTOR", "displayName": "ООО «Исполнитель»", "photoUrl": null }`. Для `EXECUTOR` показывайте компанию без ФИО представителя и аватара. Тип уже определён backend, вычислять роль на frontend не нужно. Для новых комментариев тип и имя сохраняются snapshot'ом при создании; старые записи без snapshot безопасно возвращаются как `USER`. Legacy comment endpoints сохраняют прежний DTO.

Команды проверки, устранения и подтверждения используют существующие Work/Inspection/Issue/Reinspection/Document endpoints. После завершённой проверки без замечаний либо последнего устранённого Issue backend идемпотентно создаёт Acceptance Act; исполнитель подтверждает первым, текущий активный председатель — вторым. `work_<id>` deep link разрешается через `GET /api/works/:workId/observation`: связанная Work открывает обращение, legacy MANUAL Work возвращает `observationId:null` и сохраняет старую карточку. `observation_<id>` открывает обращение напрямую.

## Совместимость Work API

Legacy-клиент создаёт самостоятельную работу через `POST /api/houses/:houseId/works`: `{ "executorUserId": 123, "title": "...", "description": "...", "category": "..." }`. Назначенный пользователь должен быть активным исполнителем дома с компанией. Только при `ALLOW_SELF_ROLE_SWITCH=true` активный председатель может назначить самого себя, если у него сохранена компания исполнителя. Backend сохраняет название компании и имя представителя как snapshot работы: будущие изменения профиля их не меняют. Новая работа имеет `status=NEW` и `dates.submittedForInspectionAt=null`.

`GET /api/houses/:houseId/works` возвращает работы дома; исполнитель видит только назначенные ему. `origin=MANUAL` выбирает работы без обращения, `origin=OBSERVATION` — связанные с обращением; без фильтра возвращаются все. Основной frontend использует только список обращений; этот фильтр сохранён для legacy-клиентов. `GET /api/works/:workId` содержит подробности, историю, документы и флаги `actions`. Исполнитель после фактического завершения вызывает `POST /api/works/:workId/submit-for-inspection` с `{}`. Повторный вызов безопасен. До этого работа остаётся `NEW`, а назначить проверяющего нельзя.

| Флаг `actions` | Действие |
| --- | --- |
| `submitForInspection` | исполнитель передаёт назначенную работу на проверку |
| `assignInspector` | председатель назначает одного проверяющего после передачи |
| `performInspection` | перейти к своей проверке |
| `reportRemediation` | устранить открытое замечание |
| `generateReasonedRefusal` | текущий активный председатель может оформить отказ при наличии `OPEN` замечания, если отказ ещё не создан |
| `generateAcceptanceAct` | исполнитель формирует акт после устранения всех замечаний |
| `confirmAcceptance` | текущая сторона подтверждает акт |
| `watch`, `unwatch`, `comment`, `edit`, `manageDocuments` | подписка, комментарий, редактирование Work и документы |

Frontend использует эти флаги и всё равно обрабатывает ответ endpoint: состояние может измениться после загрузки карточки. `POST /api/works/:workId/watch` и `DELETE` переключают подписку и возвращают `204`; для автора исходного обращения `DELETE` возвращает `409 AUTHOR_WATCH_REQUIRED`. `PATCH /api/works/:workId` разрешён активному председателю только до передачи на проверку и принимает `title`, `description`, `category`, `executorUserId`, `addMediaIds`, `removeMediaIds`. `actions.edit` задаётся backend. Категория Work должна быть категорией активного шаблона из `GET /api/checklist-templates`; новый command endpoint подставляет категорию обращения, если она подходит. После передачи PATCH возвращает `409`.

`executor` в Work detail и Work-контексте Issue/Inspection — snapshot `{userId,companyName,representativeName}` или `null`, а не текущий профиль. При создании работы председатель может передать необязательный `sourceObservationId` наблюдения того же дома. Связь хранится в `Work.sourceObservationId` (уникальная); транзакция блокирует наблюдение, проверяет отсутствие связанной работы и возвращает `404` для несуществующего наблюдения, `400` для другого дома, `409` для уже связанного. Ручное создание без этого поля сохраняется. `GET /api/works/:workId` возвращает `sourceObservation` с `id`, `title`, `description`, `category`, `createdAt`, `author`, `media` или `null`. Наблюдение в списке содержит `linkedWork: {id,status} | null` и `actions.createWork` от backend. Связанный статус: создание работы → `IN_PROGRESS`, передача на проверку → `IN_REVIEW`, замечания и устранение → фактический `IN_PROGRESS`/`WAITING`, приёмка → `ACCEPTED`. Фото наблюдения остаются у наблюдения; Issue возникает только после `FAIL` проверки.

`GET /api/houses/:houseId/observations` возвращает основной список обращений; `POST` принимает `category`, `title`, `description`, необязательные `houseObjectId` и `mediaIds`. Автор автоматически подписан. `GET /api/observations/:observationId` возвращает detail, `isWatching`, `watchReason` (`AUTHOR`/`MANUAL`/`null`) и `actions.comment/watch/unwatch/createWork`. `linkedWork` здесь содержит компактный snapshot работы, исполнителя, media и счётчики Issues, поэтому второй обязательный GET Work не нужен. `POST`/`DELETE /api/observations/:observationId/watch` управляют ручной подпиской; автор не может отписаться (`409`, `code=AUTHOR_WATCH_REQUIRED`). `GET`/`POST /api/observations/:observationId/comments` работают как комментарии Work. Подписки продолжаются после создания связанной Work; автор не может отписаться и от неё. Бот подтверждает первое наблюдение и сообщает о важных этапах. `GET /api/works/:workId/comments` возвращает `{items,page,limit,total}`; `page` по умолчанию 1, `limit` по умолчанию 20 и не более 100. `POST` по тому же пути добавляет комментарии. `PUT /api/houses/:houseId/chat` с `{ "joinUrl": "https://max.ru/..." }` и `DELETE` управляют ссылкой чата по правам backend.

## Загрузка изображений

`POST /api/media` принимает `multipart/form-data` с полем `file`: JPEG, PNG или WebP до 10 MiB. Ответ `201` содержит `id`. Передайте этот `id` в `mediaIds` бизнес-запроса. Загруженные файлы временные до привязки. Для `FormData` не задавайте `Content-Type` вручную.

## Проверка работ

Председатель получает шаблоны через `GET /api/checklist-templates`, кандидатов через `GET /api/houses/:houseId/members?role=COUNCIL_MEMBER` или `role=EXECUTOR`. Для EXECUTOR кандидат содержит `executorCompanyName` (nullable). После передачи работы он вызывает `POST /api/works/:workId/inspections` с `checklistTemplateId` той же категории, что и Work, и **одним** `assigneeUserId`. Только при `ALLOW_SELF_ROLE_SWITCH=true` активный председатель может назначить самого себя проверяющим и затем переключиться в `COUNCIL_MEMBER`. Backend создаёт snapshot пунктов и переводит работу в `IN_REVIEW`.

Назначенный член совета видит список `GET /api/me/inspection-assignments` и детали `GET /api/inspection-assignments/:assignmentId`. Detail сам содержит основной контекст проверки: описание и категорию работы, дом с адресом, объект дома (или `null`), компанию исполнителя, фотографии работы, исходное обращение с его описанием и фотографиями (или `null`), snapshot checklist, сохранённые ответы и `actions`. Для основной информации экрана проверки frontend не нужен отдельный `GET /api/works/:workId`. Шаблон и snapshot пункта содержат `rules`: `allowedResults`, `commentAllowed`, `maxCommentLength=512`, `photosAllowed`, `maxPhotos=5`, `evidenceRequiredOnFail`. Пользователь выбирает `PASS` («Соответствует») или `FAIL` («Есть замечание»). До ответа пункт внутренне имеет `PENDING`.

`PUT /api/inspection-assignments/:assignmentId/answers/:itemId` принимает `{ "result": "FAIL", "comment": "Дефект", "mediaIds": [] }`. Комментарий ограничен 512 символами. Для `FAIL` нужен **комментарий или от 1 до 5 фото**; можно передать оба вида доказательства. `PASS` не требует доказательств. После ответа на каждый пункт `POST /api/inspection-assignments/:assignmentId/complete` с `{}` завершает проверку. После завершения ответы неизменяемы, повторное завершение безопасно. Каждый `FAIL` даёт отдельное замечание.

## Замечания и повторная проверка

`GET /api/me/issues` и `GET /api/works/:workId/issues` возвращают `work` с `category`, `checklistItem` с названием, описанием и порядком, `evidence` с исходным комментарием и фото, статус, историю `remediations` и `reinspections`. `actions.submitRemediation` показывает возможность отправить устранение. Исполнитель должен устранить **все** замечания. `POST /api/issues/:issueId/remediations` требует комментарий и фото; каждая отправка остаётся отдельной неизменяемой попыткой. Backend создаёт повторную проверку исходному проверяющему.

Все `MediaRef` в frontend-facing API имеют единый вид `{ id, url, width, height, mimeType, size }`. Это относится к фотографиям работы и исходного обращения в detail проверки, ответам checklist, `before` и `evidence.photos` замечания, `remediations[].after`, а также `media`, `issue.before` и `remediation.after` повторной проверки.

Проверяющий после переключения обратно в `COUNCIL_MEMBER` получает `GET /api/me/reinspections`, детали `GET /api/reinspections/:reinspectionId` и завершает `POST /api/reinspections/:reinspectionId/complete` с `RESOLVED` или `NOT_RESOLVED`. Detail повторной проверки всегда содержит её собственные `comment` и `media`: до завершения `comment: null` и `media: []`, после завершения — сохранённый комментарий проверяющего и контрольные фотографии. Для восстановления этих данных frontend может использовать detail повторной проверки без отдельного запроса `GET /api/works/:workId/issues`. Для `NOT_RESOLVED` обязателен комментарий. Завершённая повторная проверка неизменяема. Пока хоть одно замечание `OPEN` или `REMEDIATION_SUBMITTED`, акт недоступен.

## Документы и акт приёмки

Backend автоматически формирует отчёты о проверках. Текущий активный председатель может создать максимум один мотивированный отказ на Work через `POST /api/works/:workId/documents` с `{ "type": "REASONED_REFUSAL" }`, только если есть хотя бы одно замечание со статусом `OPEN`. После отправки Remediation, если открытых замечаний не осталось, новый отказ недоступен. Отказ — дополнительный документ, а не обязательный переход workflow: замечания после `FAIL` сразу доступны исполнителю для устранения. Акт формируется backend автоматически после проверки без замечаний либо после закрытия всех замечаний. Старый `POST /api/works/:workId/documents` с `{ "type": "ACCEPTANCE_ACT" }` остаётся совместимым и возвращает `409`, если акт уже создан. Большую форму и вымышленные реквизиты frontend не передаёт: PDF строится из snapshot работы и результатов проверки.

`POST /api/documents/:documentId/confirm` принимает `{}`. Сначала акт подтверждает назначенный активный `EXECUTOR`, затем единственный текущий активный `CHAIRMAN` дома. Член совета акт не подтверждает. Один и тот же `userId` может подтвердить обе стороны, переключившись из исполнителя в председателя. После двух подтверждений backend формирует финальную версию PDF и переводит работу в `ACCEPTED`. `fileUrl` указывает на PDF `/doc/:key.pdf`; подтверждение в приложении не является УКЭП.

## Ошибки HTTP

| Код | Значение |
| --- | --- |
| `400` | некорректный запрос или ошибка валидации |
| `401` | нет MAX авторизации или подпись/срок неверны |
| `403` | пользователь известен, но действие запрещено |
| `404` | сущность не найдена или недоступна |
| `409` | текущее бизнес-состояние не позволяет операцию |

Поле `message` из ответа backend можно показать как основу пользовательской ошибки. Не стройте бизнес-логику на точном тексте сообщения: ориентируйтесь на HTTP статус, DTO и `actions`.

Пять больших списков (`/api/works/:workId/comments`, `/api/me/inspection-assignments`, `/api/works/:workId/issues`, `/api/me/issues`, `/api/me/reinspections`) принимают `page` и `limit` и возвращают `{items,page,limit,total}`. Фильтры `houseId`/`status` сохраняются при пагинации. Загрузка `POST /api/media` ограничена 10 попытками за 60 секунд на внутренний userId после проверки ACTIVE membership; 11-я возвращает `429` и `Retry-After`. Фото выдаются с `Cache-Control: private, no-store` и `X-Robots-Tag: noindex, nofollow, noarchive`.

## Закрытый тест, deep links и история

При `PREVIEW_ACCESS_REQUIRED=true` любой защищённый API сначала проверяет подписанные данные MAX, затем `PreviewAccess` по строковому MAX ID. Неверная подпись даёт `401`, отсутствие допуска — `403` с `code=PREVIEW_ACCESS_DENIED` и `maxUserId`. System admin тоже проходит gate. Администратор управляет конкретными ID через `GET /api/admin/preview-access?q=&page=&limit=` и `PUT /api/admin/preview-access/:maxUserId` с `{ "enabled": true|false }`; глобальный режим задаётся только deployment env.

Ссылки из бота открывают мини-приложение с `start_param=observation_<id>`, `start_param=work_<id>` или `start_param=join_request_<membershipId>`. Frontend берёт этот параметр из проверенного `/api/me`, а не из неподписанного `initDataUnsafe` для решений о доступе. Авторизация каждого detail endpoint остаётся обязательной. Уведомления об этапах и действиях бот отправляет только в личный диалог. Когда у события есть PDF, файл и кнопка приходят одним сообщением; совпавшие watcher и action recipient получают одно сообщение с действием.

`WorkDetail.history` сохраняет прежнюю форму. `GET /api/works/:workId/activity` и `GET /api/observations/:observationId/history` возвращают страницы persistent `ActivityEvent` (`items,page,limit,total`) со snapshot имени и роли автора действия. Технические IP находятся только в JSONL логах, не в сущностях пользователя/работы/обращения.

Все ответы содержат `X-Robots-Tag: noindex, nofollow, noarchive, nosnippet`; `/robots.txt` запрещает обход. Это не заменяет авторизацию или PreviewAccess.

`GET /api/me` возвращает `canSelfRoleSwitch: boolean` — backend capability для показа «Роль для демо». Правила ACTIVE membership и единственного ACTIVE CHAIRMAN сохраняются.
