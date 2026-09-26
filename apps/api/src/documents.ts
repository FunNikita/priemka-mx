import { createHash, randomBytes, randomInt } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { createQR } from "@vkontakte/vk-qr";
import PDFDocument from "pdfkit";
import sharp from "sharp";

import { isValidMaxBotName } from "./max/bot-name.js";
import type { DocumentType, DocumentVersion, PrismaClient } from "../generated/prisma/client.js";

export type PdfRow = { label: string; value: string };
export type DocumentPayload = {
  house: string;
  work: string;
  description: string;
  executor: string;
  createdAt: string;
  rows: PdfRow[];
  summary: string;
  actor?: { name: string; role: string; at: string };
  checklist?: { order: number; title: string; method: string; result: string; comment: string | null }[];
  issues?: { title: string; comment: string; checkedAt: string }[];
  photoGroups?: { title: string; photos: string[] }[];
  act?: Record<string, string>;
  photos?: string[];
  confirmations?: { name: string; role: string; at: string }[];
};

export const documentRoot = () => resolve(process.env.DOCUMENTS_DIR ?? "/app/data/documents");
const fontDirectory = () => {
  const candidates = [process.env.DOCUMENT_FONT_DIR, resolve(import.meta.dirname, "../assets/fonts"), resolve(import.meta.dirname, "../../assets/fonts")];
  return candidates.find((path) => path && existsSync(join(path, "PT_Serif-Regular.ttf"))) ?? "";
};

export const documentTitle: Record<DocumentType, string> = {
  INSPECTION_REPORT: "Отчёт о проверке",
  REINSPECTION_REPORT: "Отчёт о повторной проверке",
  REASONED_REFUSAL: "Мотивированный отказ в приёмке",
  ACCEPTANCE_ACT: "Акт приёмки оказанных услуг и выполненных работ",
};

const publicKeyPattern = /^(?:[a-z0-9]{20}|[a-f0-9]{40})$/;
export function newPublicDocumentKey() {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 20 }, () => alphabet[randomInt(alphabet.length)]).join("");
}
export function botDocumentLink(botName: string, publicKey: string) {
  if (!isValidMaxBotName(botName) || !publicKeyPattern.test(publicKey)) throw new Error("Invalid bot document link");
  return `https://max.ru/${botName}?start=doc_${publicKey}`;
}
export function parseDocumentPayload(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^doc_(.+)$/.exec(value);
  return match && publicKeyPattern.test(match[1]) ? match[1] : null;
}

export async function preparePdfPhoto(path: string, width = 1400, height = 1700) {
  const input = await readFile(path);
  return sharp(input).autoOrient().resize({ width, height, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer({ resolveWithObject: true });
}

function displayResult(result: string) {
  return ({ PASS: "Соответствует", FAIL: "Не соответствует", UNABLE_TO_CHECK: "Не удалось проверить", RESOLVED: "Устранено", NOT_RESOLVED: "Не устранено" } as Record<string, string>)[result] ?? result;
}
function displayMethod(method: string) {
  return ({ VISUAL: "Визуальный осмотр", DOCUMENTARY: "Документарная проверка", COMPARATIVE: "Сравнительная проверка", INSTRUMENTAL: "Инструментальный контроль" } as Record<string, string>)[method] ?? method;
}
function displayRole(role: string) {
  return ({ EXECUTOR: "Исполнитель", CHAIRMAN: "Председатель совета МКД", COUNCIL_MEMBER: "Член совета МКД" } as Record<string, string>)[role] ?? role;
}
function date(value: string) { return new Date(value).toLocaleString("ru-RU"); }

export async function renderDocumentPdf(type: DocumentType, id: number, version: number, publicKey: string, payload: DocumentPayload, botName: string): Promise<Buffer> {
  const fonts = fontDirectory();
  if (!fonts) throw new Error("Document fonts are missing");
  const qrSvg = createQR(botDocumentLink(botName, publicKey), { qrSize: 512, isShowLogo: false, isShowBackground: true, foregroundColor: "#000000", backgroundColor: "#ffffff" });
  const qr = await sharp(Buffer.from(qrSvg)).png().toBuffer();
  const doc = new PDFDocument({ size: "A4", margins: { top: 52, bottom: 54, left: 54, right: 54 }, bufferPages: true, info: { Title: `${documentTitle[type]} №${id}`, Author: "Приёмка" } });
  doc.registerFont("Regular", join(fonts, "PT_Serif-Regular.ttf"));
  doc.registerFont("Bold", join(fonts, "PT_Serif-Bold.ttf"));
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolveBuffer, reject) => { doc.on("end", () => resolveBuffer(Buffer.concat(chunks))); doc.on("error", reject); });
  const left = 54, width = doc.page.width - 108, bottom = doc.page.height - 55;
  const ensure = (needed: number) => { if (doc.y + needed > bottom) doc.addPage(); };
  const line = (text: string, bold = false, size = 11, gap = 7) => {
    doc.font(bold ? "Bold" : "Regular").fontSize(size).fillColor("#202124");
    const h = doc.heightOfString(text, { width, lineGap: 2 });
    ensure(h + gap);
    doc.text(text, left, doc.y, { width, lineGap: 2 });
    doc.y += gap;
  };
  const heading = (text: string) => { ensure(32); doc.y += 9; line(text, true, 12.5, 7); };
  const title = (text: string) => { doc.font("Bold").fontSize(16).fillColor("#111827").text(text, left, doc.y, { width, align: "center" }); doc.y += 13; };
  const actor = () => { if (payload.actor) { heading(type === "REASONED_REFUSAL" ? "СФОРМИРОВАЛ" : "ПРОВЕРКУ ЗАВЕРШИЛ"); line(`${payload.actor.name} · ${displayRole(payload.actor.role)} · ${date(payload.actor.at)}`); } };
  const qrBlock = () => {
    const height = 116;
    ensure(height + 8);
    const y = doc.y + 3;
    doc.roundedRect(left, y, width, height, 5).lineWidth(0.7).strokeColor("#b7c0ca").stroke();
    doc.image(qr, left + 9, y + 8, { width: 100, height: 100 });
    const textX = left + 121, textW = width - 135;
    doc.font("Bold").fontSize(10.5).fillColor("#111827").text("ПРОВЕРИТЬ ДОКУМЕНТ В MAX", textX, y + 15, { width: textW });
    doc.font("Regular").fontSize(9.6).text("Отсканируйте QR-код. Бот проверит сохранённую версию документа и пришлёт PDF.", textX, y + 38, { width: textW, lineGap: 2 });
    doc.fontSize(8.8).fillColor("#475569").text(`Документ № ${id} · версия ${version}`, textX, y + 86, { width: textW });
    doc.y = y + height + 8;
  };
  const photoGroups = payload.photoGroups ?? (payload.photos?.length ? [{ title: "ФОТОМАТЕРИАЛЫ", photos: payload.photos }] : []);
  const photos = async (groups: typeof photoGroups) => {
    for (const group of groups) {
      for (let offset = 0; offset < group.photos.length; offset += 2) {
        const paths = group.photos.slice(offset, offset + 2);
        const prepared = await Promise.all(paths.map((path) => preparePdfPhoto(path)));
        doc.addPage();
        line(group.title, true, 12.5, 3);
        const usableTop = doc.y + 13, usableBottom = doc.page.height - 230;
        const vertical = prepared.length === 2 && prepared.every(({ info }) => info.height > info.width);
        const boxes = prepared.length === 1 ? [{ x: left + 40, y: usableTop + 28, w: width - 80, h: usableBottom - usableTop - 55 }]
          : vertical ? [{ x: left, y: usableTop + 12, w: (width - 16) / 2, h: usableBottom - usableTop - 25 }, { x: left + (width + 16) / 2, y: usableTop + 12, w: (width - 16) / 2, h: usableBottom - usableTop - 25 }]
            : [{ x: left + 10, y: usableTop + 7, w: width - 20, h: (usableBottom - usableTop - 22) / 2 }, { x: left + 10, y: usableTop + (usableBottom - usableTop) / 2 + 10, w: width - 20, h: (usableBottom - usableTop - 22) / 2 }];
        prepared.forEach(({ data, info }, index) => {
          const box = boxes[index];
          const scale = Math.min(1, box.w / info.width, box.h / info.height);
          const w = info.width * scale, h = info.height * scale;
          doc.image(data, box.x + (box.w - w) / 2, box.y + (box.h - h) / 2, { width: w, height: h });
        });
        doc.y = usableBottom;
      }
    }
  };

  if (type === "ACCEPTANCE_ACT") {
    title(`АКТ ПРИЁМКИ № ${id}`);
    line(`Дата формирования: ${date(payload.createdAt)}`);
    line(`Дом: ${payload.house}`);
    line(`Работа: ${payload.work}`);
    line(`Описание: ${payload.description}`);
    line(`Исполнитель: ${payload.executor}`);
    heading("РЕЗУЛЬТАТЫ ПРИЁМКИ");
    for (const row of payload.rows) line(`${row.label}: ${row.value}`);
    line(payload.summary);
    heading("ПОДТВЕРЖДЕНИЯ СТОРОН В СИСТЕМЕ «ПРИЁМКА»");
    if (!payload.confirmations?.length) line("Ожидаются подтверждения исполнителя и председателя дома.");
    for (const item of payload.confirmations ?? []) line(`${displayRole(item.role)}: ${item.name}. Подтверждено: ${date(item.at)}`);
    qrBlock();
    line("Подтверждения в системе не являются усиленной квалифицированной электронной подписью.", false, 8.5, 2);
  } else if (type === "INSPECTION_REPORT") {
    title(`ОТЧЁТ О ПРОВЕРКЕ № ${id}`);
    line(`Дом: ${payload.house}`); line(`Работа: ${payload.work}`); line(`Описание: ${payload.description}`); line(`Исполнитель: ${payload.executor}`);
    line(`Дата проверки: ${date(payload.actor?.at ?? payload.createdAt)}`);
    if (payload.actor) line(`Проверяющий: ${payload.actor.name} · ${displayRole(payload.actor.role)}`);
    heading("РЕЗУЛЬТАТЫ ПРОВЕРКИ");
    const table = payload.checklist ?? payload.rows.map((row, index) => ({ order: index + 1, title: row.label, method: "VISUAL", result: row.value, comment: null }));
    const widths = [23, 175, 104, 94, width - 396];
    const cells = (values: string[], bold = false) => {
      const heights = values.map((value, index) => { doc.font(bold ? "Bold" : "Regular").fontSize(bold ? 8.5 : 9); return doc.heightOfString(value || "—", { width: widths[index] - 8, lineGap: 1 }); });
      const h = Math.max(...heights) + 11; ensure(h);
      const y = doc.y; let x = left;
      values.forEach((value, index) => { doc.rect(x, y, widths[index], h).lineWidth(0.5).strokeColor("#cbd5e1").stroke(); doc.font(bold ? "Bold" : "Regular").fontSize(bold ? 8.5 : 9).fillColor("#202124").text(value || "—", x + 4, y + 5, { width: widths[index] - 8, lineGap: 1 }); x += widths[index]; });
      doc.y = y + h;
    };
    cells(["№", "Критерий", "Метод проверки", "Результат", "Комментарий"], true);
    for (const row of table) cells([String(row.order), row.title, displayMethod(row.method), displayResult(row.result), row.comment ?? "—"]);
    heading("ИТОГ ПРОВЕРКИ");
    line(payload.summary);
    if (payload.issues?.length) { heading("ЗАМЕЧАНИЯ"); for (const item of payload.issues) line(`${item.title}: ${item.comment}`); }
    actor();
    await photos(photoGroups);
    qrBlock();
  } else if (type === "REINSPECTION_REPORT") {
    title(`ОТЧЁТ О ПОВТОРНОЙ ПРОВЕРКЕ № ${id}`);
    line(`Дом: ${payload.house}`); line(`Работа: ${payload.work}`); line(`Исполнитель: ${payload.executor}`);
    const sectionPhotos = async (section: string, description: string, paths: string[], startNewPage: boolean) => {
      if (!paths.length) { heading(section); if (description) line(description); return; }
      for (let offset = 0; offset < paths.length; offset += 2) {
        if (startNewPage || offset) doc.addPage();
        const chunk = paths.slice(offset, offset + 2);
        const images = await Promise.all(chunk.map((path) => preparePdfPhoto(path)));
        const vertical = images.length === 2 && images.every(({ info }) => info.height > info.width);
        const boxes = images.length === 1 ? [{ w: width - 40, h: 300 }] : vertical ? [{ w: (width - 18) / 2, h: 320 }, { w: (width - 18) / 2, h: 320 }] : [{ w: width - 28, h: 188 }, { w: width - 28, h: 188 }];
        const sizes = images.map(({ info }, index) => { const scale = Math.min(1, boxes[index].w / info.width, boxes[index].h / info.height); return { w: info.width * scale, h: info.height * scale }; });
        const photoHeight = images.length === 2 && !vertical ? sizes[0].h + sizes[1].h + 12 : Math.max(...sizes.map((item) => item.h));
        const introHeight = offset === 0 && description ? doc.font("Regular").fontSize(11).heightOfString(description, { width }) + 18 : 0;
        ensure(37 + introHeight + photoHeight + 20);
        heading(section);
        if (offset === 0 && description) line(description);
        const top = doc.y + 6;
        images.forEach(({ data }, index) => {
          const size = sizes[index];
          const x = images.length === 2 && vertical ? left + index * ((width + 18) / 2) + (boxes[index].w - size.w) / 2 : left + (width - size.w) / 2;
          const y = images.length === 2 && !vertical ? top + (index ? sizes[0].h + 12 : 0) : top;
          doc.image(data, x, y, { width: size.w, height: size.h });
        });
        doc.y = top + photoHeight + 13;
      }
    };
    const before = photoGroups.find((group) => group.title === "ИСХОДНОЕ ЗАМЕЧАНИЕ")?.photos ?? [];
    const after = photoGroups.find((group) => group.title === "ПОСЛЕ УСТРАНЕНИЯ ИСПОЛНИТЕЛЕМ")?.photos ?? [];
    const control = photoGroups.find((group) => group.title === "КОНТРОЛЬНЫЕ ФОТОГРАФИИ")?.photos ?? [];
    await sectionPhotos("ИСХОДНОЕ ЗАМЕЧАНИЕ", payload.rows.find((item) => item.label === "Исходное замечание")?.value ?? "", before, false);
    await sectionPhotos("ПОСЛЕ УСТРАНЕНИЯ ИСПОЛНИТЕЛЕМ", payload.rows.find((item) => item.label === "Устранение")?.value ?? "", after, before.length > 0);
    if (control.length) await sectionPhotos("КОНТРОЛЬНЫЕ ФОТОГРАФИИ", "", control, before.length + after.length > 0);
    ensure(220);
    heading("РЕЗУЛЬТАТ ПОВТОРНОЙ ПРОВЕРКИ");
    line(payload.summary);
    actor(); qrBlock();
  } else {
    title(`МОТИВИРОВАННЫЙ ОТКАЗ № ${id}`);
    line(`Дом: ${payload.house}`); line(`Работа: ${payload.work}`); line(`Исполнитель: ${payload.executor}`); line(`Дата: ${date(payload.createdAt)}`);
    heading("ОСНОВАНИЕ ОТКАЗА"); line(payload.summary);
    if (payload.issues?.length) { heading("ЗАМЕЧАНИЯ"); for (const issue of payload.issues) line(`${issue.title}. ${issue.comment}. Проверка: ${date(issue.checkedAt)}`); }
    actor(); await photos(photoGroups); qrBlock();
  }

  const pages = doc.bufferedPageRange().count;
  for (let page = 0; page < pages; page++) {
    doc.switchToPage(page);
    doc.page.margins.bottom = 0;
    doc.font("Regular").fontSize(8).fillColor("#64748b").text(`Приёмка · ${page + 1} / ${pages}`, left, doc.page.height - 33, { width, align: "right" });
  }
  doc.end();
  return finished;
}

async function storePdf(bytes: Buffer) {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const storagePath = join(sha256.slice(0, 2), sha256.slice(2, 4), `${sha256}.pdf`);
  const path = join(documentRoot(), storagePath);
  await mkdir(resolve(path, ".."), { recursive: true });
  const temporary = `${path}.${randomBytes(8).toString("hex")}.tmp`;
  try {
    await writeFile(temporary, bytes, { flag: "wx" });
    await rename(temporary, path);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
  return { sha256, storagePath };
}

export async function ensureDocumentVersionFile(db: PrismaClient, documentId: number, type: DocumentType, version: DocumentVersion, botName: string) {
  if ((await verifyDocumentFile(version)).ok) return version;
  const payload = version.payloadJson as unknown as DocumentPayload;
  const bytes = await renderDocumentPdf(type, documentId, version.version, version.publicKey, payload, botName);
  const stored = await storePdf(bytes);
  return db.documentVersion.update({ where: { id: version.id }, data: stored });
}

export async function createDocumentVersion(db: PrismaClient, workId: number, type: DocumentType, userId: number, payload: DocumentPayload, botName: string, options: { documentId?: number; inspectionId?: number; reinspectionId?: number } = {}) {
  const document = options.documentId
    ? await db.document.findUniqueOrThrow({ where: { id: options.documentId } })
    : options.inspectionId
      ? await db.document.upsert({ where: { inspectionId: options.inspectionId }, create: { workId, type, title: documentTitle[type], inspectionId: options.inspectionId }, update: {} })
      : options.reinspectionId
        ? await db.document.upsert({ where: { reinspectionId: options.reinspectionId }, create: { workId, type, title: documentTitle[type], reinspectionId: options.reinspectionId }, update: {} })
        : await db.document.create({ data: { workId, type, title: documentTitle[type] } });
  if (document.workId !== workId || document.type !== type) throw new Error("Document mismatch");
  const previous = await db.documentVersion.findFirst({ where: { documentId: document.id }, orderBy: { version: "desc" } });
  if (previous && (options.inspectionId || options.reinspectionId)) return ensureDocumentVersionFile(db, document.id, type, previous, botName);
  const version = (previous?.version ?? 0) + 1;
  const publicKey = newPublicDocumentKey();
  const bytes = await renderDocumentPdf(type, document.id, version, publicKey, payload, botName);
  const { sha256, storagePath } = await storePdf(bytes);
  let created;
  try {
    created = await db.documentVersion.create({ data: { documentId: document.id, version, status: "FINAL", payloadJson: JSON.parse(JSON.stringify(payload)), sha256, storagePath, publicKey, createdByUserId: userId } });
  } catch (error) {
    if ((error as { code?: string }).code !== "P2002") throw error;
    created = await db.documentVersion.findUniqueOrThrow({ where: { documentId_version: { documentId: document.id, version } } });
  }
  if (previous && previous.status !== "CONFIRMED") await db.documentVersion.update({ where: { id: previous.id }, data: { status: "SUPERSEDED" } });
  return created;
}

export async function verifyDocumentFile(version: { storagePath: string; sha256: string }) {
  try {
    const bytes = await readFile(join(documentRoot(), version.storagePath));
    return { ok: createHash("sha256").update(bytes).digest("hex") === version.sha256, bytes };
  } catch { return { ok: false, bytes: null }; }
}
