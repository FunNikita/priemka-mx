import { describe, expect, it } from "vitest";
import { createdWorkTexts, documentStatusTitle, issueWord, observationContext, workLabel } from "./bot-copy.js";

describe("MAX bot copy", () => {
  it("labels a work and shows its source only when normalized titles differ", () => {
    expect(workLabel({ id: 8, title: "Ремонт крыши" })).toBe("«Ремонт крыши» (№8)");
    expect(observationContext("Ремонт крыши", "Течёт крыша")).toBe("Обращение: «Течёт крыша»\n");
    expect(observationContext(" Ремонт   крыши ", "ремонт крыши")).toBe("");
    expect(observationContext("Ремонт крыши", null)).toBe("");
    const different = createdWorkTexts({ id: 8, title: "Ремонт крыши" }, "УК", "Течёт крыша");
    expect(different.general).toBe("🆕 Обращение «Течёт крыша» (№8) передано исполнителю.\n\nИсполнитель: УК\nТекущий этап: в работе");
    expect(different.executor).toBe("💼 Вам назначено обращение «Течёт крыша» (№8).\n\nОткройте обращение, выполните работы и передайте результат на проверку.");
    for (const source of [" ремонт   КРЫШИ ", null]) {
      const texts = createdWorkTexts({ id: 8, title: "Ремонт крыши" }, "УК", source);
      expect(texts.general).toContain("🆕 Обращение ");
      expect(texts.executor).toContain("Откройте обращение");
      expect(texts.general).not.toContain("Создана работа");
    }
  });

  it.each([[1, "замечание"], [2, "замечания"], [5, "замечаний"], [11, "замечаний"], [21, "замечание"], [22, "замечания"], [25, "замечаний"]])("declines %i issues", (count, word) => {
    expect(issueWord(count)).toBe(word);
  });

  it("renders every document status in Russian", () => {
    expect(["DRAFT", "FINAL", "CONFIRMED", "SUPERSEDED"].map((status) => documentStatusTitle(status as Parameters<typeof documentStatusTitle>[0]))).toEqual(["Черновик", "Сформирован", "Подтверждён", "Заменён новой версией"]);
  });
});
