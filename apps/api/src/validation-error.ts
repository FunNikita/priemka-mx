import type { FastifySchemaValidationError } from "fastify";

const fieldTitles: Record<string, string> = {
  houseId: "дом", workId: "работа", observationId: "обращение", membershipId: "заявка",
  userId: "пользователь", documentId: "документ", inspectionId: "проверка", issueId: "замечание",
  reinspectionId: "повторная проверка", checklistTemplateId: "чек-лист", assigneeUserId: "проверяющий",
  executorUserId: "исполнитель", sourceObservationId: "исходное обращение", title: "название",
  description: "описание", category: "категория", status: "статус", role: "роль",
  decision: "решение", type: "тип", result: "результат", comment: "комментарий",
  mediaIds: "фотографии", page: "страница", limit: "количество записей", search: "поиск",
  q: "поиск", origin: "источник", key: "код документа", address: "адрес",
  executorCompanyName: "компания исполнителя", text: "текст", date: "дата",
  name: "название", joinUrl: "ссылка на чат", enabled: "доступ", maxUserId: "MAX ID",
  answerId: "ответ", photoId: "фотография", code: "код", sourceLabel: "источник",
};

const fallback = "Проверьте введённые данные и повторите попытку.";

export function validationMessage(error: FastifySchemaValidationError): string {
  if (error.keyword === "additionalProperties") return "В запросе передано неизвестное поле.";
  const field = error.keyword === "required" ? error.params.missingProperty : error.instancePath.split("/").filter(Boolean).at(-1);
  const title = typeof field === "string" ? fieldTitles[field] : undefined;
  if (!title) return fallback;
  const label = `«${title}»`;
  switch (error.keyword) {
    case "required": case "minLength": return `Заполните поле ${label}.`;
    case "type":
      if (error.params.type === "integer" || error.params.type === "number") return `Укажите корректное числовое значение в поле ${label}.`;
      if (error.params.type === "string") return `Проверьте значение поля ${label}.`;
      if (error.params.type === "array") return `Проверьте выбранные значения в поле ${label}.`;
      return fallback;
    case "enum": return `Выберите допустимое значение для поля ${label}.`;
    case "maxLength": return `Поле ${label} слишком длинное.`;
    case "minimum": case "exclusiveMinimum": return `Значение поля ${label} меньше допустимого.`;
    case "maximum": case "exclusiveMaximum": return `Значение поля ${label} больше допустимого.`;
    case "minItems": return `Выберите хотя бы один вариант в поле ${label}.`;
    case "maxItems": return `В поле ${label} выбрано слишком много значений.`;
    case "pattern": case "format": return `Проверьте формат поля ${label}.`;
    default: return fallback;
  }
}
