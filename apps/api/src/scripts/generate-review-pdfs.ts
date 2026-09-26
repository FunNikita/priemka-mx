import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { newPublicDocumentKey, renderDocumentPdf, type DocumentPayload } from "../documents.js";

const review = resolve(process.cwd(), "../../review");
const destination = join(review, "examples");
const fixture = (name: string) => resolve(process.cwd(), "src/test/fixtures/review-pdfs", name);
const beforeWide = fixture("door-before-landscape.png");
const beforeTall = fixture("closer-before-portrait.png");
const afterWide = fixture("door-after-landscape.png");
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
      { order: 3, title: "Проверена комплектация по договору", method: "DOCUMENTARY", result: "PASS", comment: null },
    ],
    issues: [{ title: "Дверь закрывается полностью", comment: "Доводчик не закрывает дверь до конца", checkedAt: actor.at }],
    summary: "Выявлено замечаний: 1. Требуется устранение замечаний.",
    photoGroups: [{ title: "ФОТОМАТЕРИАЛЫ", photos: [beforeTall, beforeWide, afterWide] }],
  } },
  { name: "02-reasoned-refusal.pdf", type: "REASONED_REFUSAL" as const, payload: {
    ...common, actor: { name: "Никита Демо", role: "CHAIRMAN", at: "2026-09-25T12:30:00.000Z" },
    summary: "Отказ от приёмки основан на неустранённом замечании.",
    issues: [{ title: "Дверь закрывается полностью", comment: "Доводчик не закрывает дверь до конца", checkedAt: actor.at }],
    photoGroups: [{ title: "ФОТОМАТЕРИАЛЫ", photos: [beforeWide] }],
  } },
  { name: "03-acceptance-act.pdf", type: "ACCEPTANCE_ACT" as const, payload: {
    ...common,
    act: { actNumber: "Демо-1", city: "Москва", contractNumber: "Демо-1", contractDate: "01.09.2026", customerName: "Никита Демо", customerApartment: "1", customerAuthorityBasis: "решения собрания собственников №1", executorOrganization: "Демо УК", executorRepresentative: "Сергей Демо", executorAuthorityBasis: "доверенности №1", periodFrom: "20.09.2026", periodTo: "25.09.2026", frequencyOrQuantity: "1", unit: "работа", unitPrice: "10 000", totalPrice: "10 000", totalPriceWords: "десять тысяч" },
    confirmations: [{ name: "Сергей Демо", role: "EXECUTOR", at: "2026-09-25T12:00:00.000Z" }, { name: "Никита Демо", role: "CHAIRMAN", at: "2026-09-25T12:30:00.000Z" }],
  } },
];
for (const [index, example] of examples.entries()) {
  const pdf = await renderDocumentPdf(example.type, index + 1, 1, newPublicDocumentKey(), example.payload, botName);
  await writeFile(join(destination, example.name), pdf);
}
process.stdout.write(`Generated ${examples.length} review PDFs in ${destination}\n`);
