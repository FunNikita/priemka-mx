import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { newPublicDocumentKey, renderDocumentPdf, type DocumentPayload } from "../documents.js";

const destination = resolve(process.cwd(), "../../examples");
const fixture = (name: string) => resolve(process.cwd(), "src/test/fixtures/review-pdfs", name);
const beforeWide = fixture("door-before-landscape.png");
const beforeTall = fixture("closer-before-portrait.png");
const square = fixture("door-square.png");
const panoramic = fixture("door-panoramic.png");
const botName = process.env.MAX_BOT_NAME ?? "PriemkaDemoBot";
await mkdir(destination, { recursive: true });
const common: DocumentPayload = {
  house: "Демо: ул. Примерная, д. 12",
  work: "Замена входной двери",
  description: "Ремонт входной группы многоквартирного дома",
  executor: "Демо УК",
  createdAt: "2026-09-25T12:00:00.000Z",
  rows: [], summary: "",
};
const actor = { name: "Арина Демо", role: "COUNCIL_MEMBER", at: "2026-09-25T12:00:00.000Z" };
const examples = [
  { name: "01-inspection-report.pdf", type: "INSPECTION_REPORT" as const, payload: {
    ...common, actor,
    checklist: [
      { order: 1, title: "Дверь закрывается полностью", method: "VISUAL", result: "FAIL", comment: "Доводчик не закрывает дверь до конца" },
      { order: 2, title: "Крепления без повреждений", method: "VISUAL", result: "PASS", comment: null },
      { order: 3, title: "Проверена комплектация двери", method: "DOCUMENTARY", result: "PASS", comment: null },
    ],
    issues: [{ title: "Дверь закрывается полностью", comment: "Доводчик не закрывает дверь до конца", checkedAt: actor.at }],
    summary: "Выявлено замечаний: 1. Требуется устранение замечаний.",
    photoGroups: [{ title: "Пункт 1. Дверь закрывается полностью — Доводчик не закрывает дверь до конца", photos: [beforeTall, beforeWide, panoramic] }],
  } },
  { name: "02-reasoned-refusal.pdf", type: "REASONED_REFUSAL" as const, payload: {
    ...common, actor: { name: "Никита Демо", role: "CHAIRMAN", at: "2026-09-25T12:30:00.000Z" },
    summary: "Отказ от приёмки основан на перечисленных неустранённых замечаниях.",
    issues: [
      { title: "Дверь закрывается полностью", comment: "Доводчик не закрывает дверь до конца", checkedAt: actor.at },
      { title: "Крепления двери", comment: "Повреждён крепёж", checkedAt: actor.at },
    ],
    photoGroups: [
      { title: "Замечание 1. Дверь закрывается полностью", photos: [beforeTall, beforeWide] },
      { title: "Замечание 2. Крепления двери", photos: [square, panoramic] },
    ],
  } },
  { name: "03-acceptance-act.pdf", type: "ACCEPTANCE_ACT" as const, payload: {
    ...common,
    rows: [{ label: "Категория", value: "Входная группа" }, { label: "Представитель исполнителя", value: "Сергей Демо" }, { label: "Проверено пунктов", value: "3" }, { label: "Замечаний устранено", value: "1" }],
    summary: "1 замечание устранено.",
    confirmations: [{ name: "Сергей Демо", role: "EXECUTOR", at: "2026-09-25T12:00:00.000Z" }, { name: "Никита Демо", role: "CHAIRMAN", at: "2026-09-25T12:30:00.000Z" }],
  } },
];
for (const [index, example] of examples.entries()) {
  const pdf = await renderDocumentPdf(example.type, index + 1, 1, newPublicDocumentKey(), example.payload, botName);
  await writeFile(join(destination, example.name), pdf);
}
process.stdout.write(`Generated ${examples.length} review PDFs in ${destination}\n`);
