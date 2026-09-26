# API «Приёмки» для frontend

Backend доступен по относительным адресам `/api/*`. В production запросы идут на тот же домен, что и мини-приложение; локально Vite направляет `/api/*` на Fastify. Исходная строка `window.WebApp.initData` передаётся helper'ом `apiFetch` в заголовке `X-Max-Init-Data`. Backend проверяет подпись и срок действия. Frontend не отправляет от себя `userId`, роль или права доступа.

Источники контракта: во время выполнения — схемы Fastify; опубликованная спецификация — [`openapi.json`](openapi.json). Типы DTO, параметры и маршруты для TypeScript находятся в [`packages/shared/src/api.ts`](../packages/shared/src/api.ts) и экспортируются из `@priemka/shared`. Этот файл описывает API, но не проверяет ответы во время выполнения. Используйте полученные от backend `actions` для кнопок и переходов; не повторяйте правила ролей и статусов в UI.

## Как пользоваться из frontend

`apiRoutes` хранит полные пути `/api/*`. `apiFetch` принимает и полный путь, и прежний короткий путь: `apiFetch("/api/houses")` и `apiFetch("/houses")` оба обращаются к `/api/houses`. Header MAX добавляется самим helper'ом. Точный относительный импорт `apiFetch` зависит от расположения файла в `apps/web/src`.

```ts
import { apiRoutes, type ListHousesResponse } from "@priemka/shared";
import { apiFetch } from "./api"; // поправьте относительный путь для своего файла

const response = await apiFetch(apiRoutes.houses.path);
if (!response.ok) throw new Error("Не удалось получить список домов");
const data: ListHousesResponse = await response.json();

const workPath = apiRoutes.work(workId).path;
const workResponse = await apiFetch(workPath);

const requestResponse = await apiFetch(apiRoutes.createJoinRequest(houseId).path, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({}),
});
```

Builder возвращает `{ method, path }`; в `apiFetch` передавайте `.path`. Для query используйте `URLSearchParams`. `apiFetch` возвращает обычный `Response`: проверяйте `response.ok`, а для `204` не вызывайте `response.json()`.

## Личность и доступ к дому

`GET /api/me` возвращает `user` и `houses[]`. В каждом элементе `houses[]` frontend использует `id`, `address`, `role`, `status`, `joinedVia`, `permissions`. `user.id` — внутренний числовой ID, `user.maxUserId` — строка: большой MAX ID нельзя переводить в JavaScript `Number`.

MAX User сам по себе не является участником дома. Рабочие права от членства появляются только при `status=ACTIVE`; `PENDING` и `REJECTED` членства их не дают. `user.isAdmin` обозначает отдельного системного администратора, а не домовую роль; его административные полномочия могут действовать без членства. Frontend не передаёт `lastHouseId` как условие доступа и не использует его как механизм безопасности. Backend обновляет его для обычного пользователя при успешном открытии списка работ активного дома.

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

Самостоятельная заявка: `POST /api/houses/:houseId/join-requests` с JSON body `{}`. Ответ содержит `id`, `houseId`, `role`, `status`, `joinedVia`, `createdAt`, `updatedAt`. Первый запрос создаёт `PENDING RESIDENT REQUEST` (`201`), повторный возвращает существующую заявку (`200`). При `REJECTED RESIDENT` повторная подача переводит то же членство обратно в `PENDING REQUEST`. `DELETE /api/houses/:houseId/join-requests/me` отменяет только свою ожидающую `RESIDENT REQUEST` заявку и возвращает `204`; повторная отмена безопасна. Другие членства этот endpoint не удаляет.

Жизненный цикл: `NONE → PENDING RESIDENT → ACTIVE RESIDENT` при одобрении или `REJECTED RESIDENT` при отклонении. Frontend **никогда** не передаёт `role`, `status` или `userId` в самостоятельной заявке.

### Рассмотрение председателем

`GET /api/houses/:houseId/join-requests` по умолчанию показывает ожидающие `RESIDENT REQUEST` заявки; доступны фильтр `status=PENDING|ACTIVE|REJECTED` и `page`/`limit`. Ответ — страница заявок с краткими `user.id`, `firstName`, `lastName`, `photoUrl`. Доступен активному председателю этого дома и системному администратору по действующим permissions.

`PATCH /api/houses/:houseId/join-requests/:membershipId` принимает только одно решение:

```json
{ "decision": "APPROVE" }
```

```json
{ "decision": "REJECT" }
```

Председатель здесь только одобряет или отклоняет базовый доступ `RESIDENT`. Назначить повышенную роль этим endpoint нельзя. `COUNCIL_MEMBER`, `CHAIRMAN`, `EXECUTOR` выдаются отдельным административным процессом; произвольный выбор роли в этой форме не нужен. Противоположное решение после завершения заявки возвращает `409`.

## Работы, наблюдения и комментарии

`GET /api/houses/:houseId/works` возвращает страницу работ дома и действия для дома; `GET /api/works/:workId` — подробности работы, историю, медиа, документы и `actions`. `POST /api/works/:workId/watch` подписывает на работу, `DELETE` по тому же пути снимает подписку; успешный ответ — `204`.

В подробной карточке используйте следующие флаги для доступности кнопок:

| Флаг | Действие UI |
| --- | --- |
| `watch`, `unwatch` | подписка или отписка |
| `comment` | отправка комментария |
| `reportRemediation` | исполнитель может отправить устранение открытого замечания; запрос идёт через `/api/issues/:issueId/remediations` |
| `assignInspectors` | назначить проверяющего |
| `performInspection` | перейти к своей проверке |
| `generateReasonedRefusal` | оформить мотивированный отказ |
| `generateAcceptanceAct` | оформить акт приёмки |
| `confirmAcceptance` | подтвердить акт |
| `manageDocuments` | управление документами, разрешённое backend |

Не заменяйте эти флаги проверкой вроде `role === "CHAIRMAN" && status === ...`. Backend остаётся владельцем бизнес-переходов и повторно проверяет права при каждом запросе.

`GET /api/houses/:houseId/observations` возвращает страницу наблюдений; `POST` по тому же пути принимает `category`, `title`, `description`, необязательные `houseObjectId` и `mediaIds`. `GET /api/works/:workId/comments` возвращает комментарии; `POST` принимает `text` и/или `mediaIds` (пустой комментарий без файлов запрещён). `PUT /api/houses/:houseId/chat` сохраняет `{ "joinUrl": "https://max.ru/..." }`, `DELETE` удаляет ссылку; разрешённость операции определяет backend.

## Загрузка изображений

`POST /api/media` принимает `multipart/form-data` с полем **`file`**: JPEG, PNG или WebP до 10 MiB. Успешный ответ `201`: `{ "id": 123 }`. Загрузка требует активного членства. Для `FormData` не задавайте `Content-Type` вручную: браузер добавит boundary.

Загрузка двухэтапная: сначала отправьте файл и получите `mediaId`, затем передайте его в массиве `mediaIds` нужного бизнес-запроса — наблюдения, комментария, ответа `FAIL` в проверке, устранения или повторной проверки. `URL.createObjectURL(file)` служит только локальному preview; он не заменяет загрузку на backend. Загруженные медиа временные до привязки к бизнес-объекту.

## Проверка работ

Председатель: `GET /api/checklist-templates` получает шаблоны, `GET /api/houses/:houseId/members?role=COUNCIL_MEMBER` — активных членов совета, `POST /api/works/:workId/inspections` назначает проверку с `checklistTemplateId` и `assigneeUserId`.

Проверяющий член совета: `GET /api/me/inspection-assignments` получает свои назначения, `GET /api/inspection-assignments/:assignmentId` — снимок чек-листа и ответы, `PUT /api/inspection-assignments/:assignmentId/answers/:itemId` сохраняет `{ result, comment?, mediaIds? }`, `POST /api/inspection-assignments/:assignmentId/complete` завершает проверку с body `{}`.

Значения ответа: `PENDING` — ещё не проверено; `PASS` — принято; `FAIL` — дефект, обязательны комментарий и фото; `UNABLE_TO_CHECK` — проверить невозможно, обязателен комментарий. Завершить проверку можно лишь после `PASS` или `FAIL` для каждого пункта: `PENDING` и `UNABLE_TO_CHECK` блокируют завершение. Завершённая проверка не редактируется; повторный вызов завершения безопасен. Отчёт и замечания создаёт backend.

## Замечания, устранение и повторная проверка

`GET /api/works/:workId/issues` и `GET /api/me/issues` показывают замечания в пределах разрешённого доступа. Исполнитель отправляет устранение через `POST /api/issues/:issueId/remediations` с обязательными `comment` и непустым `mediaIds`. Каждая допустимая отправка — отдельная `Remediation`; после неё backend сам создаёт `Reinspection` тому же проверяющему.

Проверяющий получает очередь через `GET /api/me/reinspections`, детали через `GET /api/reinspections/:reinspectionId` и завершает `POST /api/reinspections/:reinspectionId/complete` с `result=RESOLVED|NOT_RESOLVED`, необязательными `comment`, `mediaIds`. Для `NOT_RESOLVED` комментарий обязателен. `RESOLVED` переводит замечание в `RESOLVED`, `NOT_RESOLVED` возвращает его в `OPEN`. Завершённая повторная проверка не редактируется; повторный вызов возвращает сохранённый результат. Статус работы пересчитывает backend.

## Документы и акт приёмки

Существующие типы документов: `INSPECTION_REPORT`, `REINSPECTION_REPORT`, `REASONED_REFUSAL`, `ACCEPTANCE_ACT`. Отчёты о проверке и повторной проверке backend генерирует автоматически. `POST /api/works/:workId/documents` вручную создаёт мотивированный отказ (`{ "type": "REASONED_REFUSAL" }`) или акт приёмки (`{ "type": "ACCEPTANCE_ACT", "data": { ... } }`). Поля формы акта перечислены в `AcceptanceActData` shared-контракта и OpenAPI. `REASONED_REFUSAL` оформляет только активный председатель при незакрытых замечаниях. `ACCEPTANCE_ACT` оформляет назначенный исполнитель после завершённой проверки и устранения всех замечаний.

Только акт подтверждается через `POST /api/documents/:documentId/confirm` с body `{}`: сначала исполнитель, затем активный `CHAIRMAN` или `COUNCIL_MEMBER` с `canSignAcceptanceAct=true`. Основание полномочий хранится в `authorityBasis` членства; текущий confirm endpoint непосредственно проверяет активную роль и `canSignAcceptanceAct`, а не текст `authorityBasis`. После двух корректных подтверждений backend переводит работу в `ACCEPTED`; frontend не меняет её статус самостоятельно. `fileUrl` ведёт к PDF `/doc/:key.pdf`. PDF и QR помогают просмотреть и проверить документ, но не являются электронной подписью.

## Ошибки HTTP

| Код | Значение |
| --- | --- |
| `400` | некорректный запрос или ошибка валидации |
| `401` | нет MAX авторизации или подпись/срок неверны |
| `403` | пользователь известен, но действие запрещено |
| `404` | сущность не найдена или недоступна |
| `409` | текущее бизнес-состояние не позволяет операцию |

Поле `message` из ответа backend можно показать как основу пользовательской ошибки. Не стройте бизнес-логику на точном тексте сообщения: ориентируйтесь на HTTP статус, DTO и `actions`.
