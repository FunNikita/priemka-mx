import { expect, it } from "vitest";
import { validationMessage } from "./validation-error.js";

const error = (keyword: string, instancePath: string, params: Record<string, unknown> = {}) => ({ keyword, instancePath, schemaPath: "", params });

it("uses safe Russian field names and a neutral fallback", () => {
  expect(validationMessage(error("required", "", { missingProperty: "title" }))).toBe("Заполните поле «название».");
  expect(validationMessage(error("type", "/houseId", { type: "integer" }))).toBe("Укажите корректное числовое значение в поле «дом».");
  expect(validationMessage(error("enum", "/role"))).toBe("Выберите допустимое значение для поля «роль».");
  expect(validationMessage(error("additionalProperties", "", { additionalProperty: "secret" }))).toBe("В запросе передано неизвестное поле.");
  expect(validationMessage(error("unknown", "/title"))).toBe("Проверьте введённые данные и повторите попытку.");
  expect(validationMessage(error("type", "/internalSecret", { type: "string" }))).toBe("Проверьте введённые данные и повторите попытку.");
});
