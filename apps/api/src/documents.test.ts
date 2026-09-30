import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import sharp from "sharp";
import { expect, it } from "vitest";

import { botDocumentLink, newPublicDocumentKey, parseDocumentPayload, preparePdfPhoto, renderDocumentPdf, type DocumentPayload } from "./documents.js";

const sample: DocumentPayload = {
  house: "ул. Примерная, 12", work: "Входная дверь", description: "Проверка доводчика", executor: "Демо УК",
  createdAt: "2026-09-25T12:00:00.000Z", rows: [], summary: "Замечаний не выявлено. Проверка успешно завершена.",
  actor: { name: "Арина Иванова", role: "COUNCIL_MEMBER", at: "2026-09-25T12:00:00.000Z" },
  checklist: [{ order: 1, title: "Дверь закрывается", method: "VISUAL", result: "PASS", comment: null }],
};
const pageCount = (pdf: Buffer) => [...pdf.toString("latin1").matchAll(/\/Type \/Page\b/g)].length;
const imageCount = (pdf: Buffer) => [...pdf.toString("latin1").matchAll(/\/Subtype \/Image\b/g)].length;

it("creates unbiased-length public keys and accepts the legacy key format", () => {
  const keys = Array.from({ length: 100 }, newPublicDocumentKey);
  expect(keys.every((key) => /^[a-z0-9]{20}$/.test(key))).toBe(true);
  expect(new Set(keys).size).toBe(keys.length);
  const legacy = "a".repeat(40);
  expect(parseDocumentPayload(`doc_${legacy}`)).toBe(legacy);
  expect(parseDocumentPayload(`doc_${keys[0]}`)).toBe(keys[0]);
  expect(botDocumentLink("PriemkaDemoBot", keys[0])).toContain(`start=doc_${keys[0]}`);
  expect(parseDocumentPayload("doc_" + "z".repeat(40))).toBeNull();
});

it("orients, contains and limits photos, with at most two per PDF page", async () => {
  const dir = await mkdtemp(join(tmpdir(), "priemka-pdf-test-"));
  try {
    const portrait = join(dir, "portrait.jpg"), landscape = join(dir, "landscape.jpg"), exif = join(dir, "exif.jpg");
    await writeFile(portrait, await sharp({ create: { width: 90, height: 160, channels: 3, background: "#aa3333" } }).jpeg().toBuffer());
    await writeFile(landscape, await sharp({ create: { width: 160, height: 90, channels: 3, background: "#33aa33" } }).jpeg().toBuffer());
    await writeFile(exif, await sharp({ create: { width: 90, height: 40, channels: 3, background: "#3333aa" } }).jpeg().withMetadata({ orientation: 6 }).toBuffer());
    const oriented = await preparePdfPhoto(exif, 100, 100);
    expect(oriented.info.width).toBeLessThan(oriented.info.height);
    const contained = await preparePdfPhoto(landscape, 80, 80);
    expect(contained.info.width).toBe(80);
    expect(contained.info.height).toBe(45);
    const small = await preparePdfPhoto(portrait, 1400, 1700);
    expect(small.info.width).toBe(90);
    expect(small.info.height).toBe(160);
    for (const [paths, pages] of [[[], 1], [[portrait], 2], [[portrait, portrait], 2], [[landscape, landscape], 2], [[portrait, landscape, portrait], 3]] as const) {
      const pdf = await renderDocumentPdf("INSPECTION_REPORT", 1, 1, newPublicDocumentKey(), { ...sample, photoGroups: paths.length ? [{ title: "ФОТОМАТЕРИАЛЫ", photos: [...paths] }] : [] }, "PriemkaDemoBot");
      expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
      expect(pageCount(pdf)).toBe(pages);
      expect(imageCount(pdf)).toBe(paths.length + 2); // QR has a color image and alpha mask.
    }
    expect(await readFile(portrait)).toBeTruthy();
  } finally { await rm(dir, { recursive: true, force: true }); }
});

it("keeps before and after photos with the reinspection result and QR on two pages", async () => {
  const dir = await mkdtemp(join(tmpdir(), "priemka-reinspection-pdf-"));
  try {
    const before = join(dir, "before.jpg"), after = join(dir, "after.jpg");
    await writeFile(before, await sharp({ create: { width: 900, height: 600, channels: 3, background: "#aa3333" } }).jpeg().toBuffer());
    await writeFile(after, await sharp({ create: { width: 900, height: 600, channels: 3, background: "#33aa33" } }).jpeg().toBuffer());
    const pdf = await renderDocumentPdf("REINSPECTION_REPORT", 2, 1, newPublicDocumentKey(), { ...sample,
      rows: [{ label: "Исходное замечание", value: "Дверь не закрывалась" }, { label: "Устранение", value: "Доводчик исправлен" }],
      summary: "Замечание устранено.",
      photoGroups: [{ title: "ИСХОДНОЕ ЗАМЕЧАНИЕ", photos: [before] }, { title: "ПОСЛЕ УСТРАНЕНИЯ ИСПОЛНИТЕЛЕМ", photos: [after] }],
    }, "PriemkaDemoBot");
    expect(pageCount(pdf)).toBe(2);
    expect(imageCount(pdf)).toBe(4);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

it("renders mixed photo shapes beneath their checklist items and beside refusal issues", async () => {
  const dir = await mkdtemp(join(tmpdir(), "priemka-inline-pdf-"));
  try {
    const shapes = [[800, 1200], [1200, 800], [900, 900], [1600, 400], [400, 1600], [1100, 700], [700, 1100]] as const;
    const paths = await Promise.all(shapes.map(async ([width, height], index) => {
      const path = join(dir, `shape-${index}.jpg`);
      await writeFile(path, await sharp({ create: { width, height, channels: 3, background: { r: 50 + index * 20, g: 90, b: 140 } } }).jpeg().toBuffer());
      return path;
    }));
    const checklist = [
      { order: 1, title: "Дверь закрывается", method: "VISUAL", result: "FAIL", comment: "Доводчик неисправен" },
      { order: 2, title: "Крепления", method: "VISUAL", result: "PASS", comment: null },
      { order: 3, title: "Комплектация", method: "DOCUMENTARY", result: "PASS", comment: null },
    ];
    const inspection = await renderDocumentPdf("INSPECTION_REPORT", 3, 1, newPublicDocumentKey(), { ...sample, checklist, photoGroups: [
      { title: "Пункт 1. Дверь закрывается — Доводчик неисправен", photos: paths.slice(0, 5) },
      { title: "Пункт 2. Крепления", photos: [paths[5]] },
      { title: "Пункт 3. Комплектация", photos: [paths[6]] },
    ] }, "PriemkaDemoBot");
    expect(imageCount(inspection)).toBe(9);
    expect(pageCount(inspection)).toBeGreaterThanOrEqual(2);
    expect(pageCount(inspection)).toBeLessThanOrEqual(8);
    const refusal = await renderDocumentPdf("REASONED_REFUSAL", 4, 1, newPublicDocumentKey(), { ...sample, issues: [
      { title: "Дверь", comment: "Дефект доводчика", checkedAt: sample.createdAt },
      { title: "Крепления", comment: "Повреждения", checkedAt: sample.createdAt },
    ], photoGroups: [
      { title: "Замечание 1. Дверь", photos: paths.slice(0, 2) },
      { title: "Замечание 2. Крепления", photos: [paths[2]] },
    ] }, "PriemkaDemoBot");
    expect(imageCount(refusal)).toBe(5);
    expect(pageCount(refusal)).toBeGreaterThanOrEqual(1);
    expect(pageCount(refusal)).toBeLessThanOrEqual(5);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
