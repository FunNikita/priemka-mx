export function workLabel(work: { id: number; title: string }) {
  return `«${work.title}» (№${work.id})`;
}

export function observationContext(workTitle: string, observationTitle?: string | null) {
  if (!observationTitle) return "";
  const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
  return normalize(workTitle) === normalize(observationTitle) ? "" : `Обращение: «${observationTitle}»\n`;
}

export function createdWorkTexts(work: { id: number; title: string }, executorCompanyName: string, observationTitle?: string | null) {
  const context = observationContext(work.title, observationTitle);
  return {
    general: `🆕 Создана работа ${workLabel(work)}.\n${context}\nИсполнитель: ${executorCompanyName}\nТекущий этап: в работе`,
    executor: `💼 Вам назначена работа ${workLabel(work)}.\n${context}\nОткройте работу, чтобы выполнить её и передать на проверку.`,
  };
}

export function issueWord(count: number) {
  const lastTwo = Math.abs(count) % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return "замечаний";
  const last = lastTwo % 10;
  return last === 1 ? "замечание" : last >= 2 && last <= 4 ? "замечания" : "замечаний";
}

export function documentStatusTitle(status: "DRAFT" | "FINAL" | "CONFIRMED" | "SUPERSEDED") {
  return { DRAFT: "Черновик", FINAL: "Сформирован", CONFIRMED: "Подтверждён", SUPERSEDED: "Заменён новой версией" }[status];
}
