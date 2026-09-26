import type { PrismaClient } from "../../generated/prisma/client.js";
import { createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import sharp from "sharp";

import { createDocumentVersion } from "../documents.js";

const demoUsers = [
  { maxUserId: "7000000000000000101", firstName: "Даша", lastName: "Демо", role: "RESIDENT" },
  { maxUserId: "7000000000000000102", firstName: "Арина", lastName: "Демо", role: "COUNCIL_MEMBER" },
  { maxUserId: "7000000000000000103", firstName: "Никита", lastName: "Демо", role: "CHAIRMAN" },
  { maxUserId: "7000000000000000104", firstName: "Сергей", lastName: "Демо", role: "EXECUTOR" },
] as const;

const demoWorks = [
  { title: "Демо: замена двери", status: "NEW", object: 0 },
  { title: "Демо: ремонт лифта", status: "IN_REVIEW", object: 0 },
  { title: "Демо: покраска подъезда", status: "IN_PROGRESS", object: 0 },
  { title: "Демо: ремонт кровли", status: "WAITING", object: 1 },
  { title: "Демо: освещение двора", status: "ACCEPTED", object: 1 },
] as const;

const demoTemplates = [
  { code: "GENERAL_REPAIR", title: "Общий ремонт", category: "COMMON_AREAS", checks: ["Работа выполнена в полном объёме", "Результат соответствует описанию работы", "Работа выполнена в установленный срок", "Видимых дефектов и повреждений нет", "Место проведения работ убрано и безопасно"] },
  { code: "LIGHTING", title: "Освещение", category: "LIGHTING", checks: ["Светильники включаются", "Освещены согласованные зоны", "Проводка и крепления без видимых повреждений", "Место работ убрано"] },
  { code: "ENTRANCE_DOOR", title: "Входная дверь / доводчик", category: "COMMON_AREAS", checks: ["Дверь закрывается полностью", "Самозакрывающее устройство работает", "Движение без заклинивания", "Крепления без видимых дефектов", "Дверное заполнение целое", "Фурнитура работоспособна"] },
  { code: "ROOF_LEAK", title: "Кровля / протечка", category: "ROOF", checks: ["Следы протечки устранены", "Покрытие без видимых повреждений", "Место работ убрано и безопасно"] },
  { code: "YARD", title: "Двор / придомовая территория", category: "OUTDOOR", checks: ["Работа выполнена в согласованной зоне", "Покрытие и оборудование без видимых дефектов", "Территория очищена после работ"] },
] as const;

export async function seedDemo(db: PrismaClient) {
  const now = new Date();
  const users = await Promise.all(demoUsers.map((item) => db.user.upsert({
    where: { maxUserId: item.maxUserId },
    create: { maxUserId: item.maxUserId, firstName: item.firstName, lastName: item.lastName, languageCode: "ru", lastAuthDate: now, lastSeenAt: now },
    update: {},
  })));
  await db.user.upsert({
    where: { maxUserId: "7000000000000000105" },
    create: { maxUserId: "7000000000000000105", firstName: "Администратор", lastName: "Демо", languageCode: "ru", isAdmin: true, lastAuthDate: now, lastSeenAt: now },
    update: { isAdmin: true },
  });

  const address = "Демо: ул. Примерная, д. 12";
  const house = await db.house.findFirst({ where: { address } }) ?? await db.house.create({ data: { address } });
  for (const [index, item] of demoUsers.entries()) {
    await db.houseMembership.upsert({
      where: { houseId_userId: { houseId: house.id, userId: users[index].id } },
      create: { houseId: house.id, userId: users[index].id, role: item.role, status: "ACTIVE", joinedVia: "ADMIN", canSignAcceptanceAct: item.role === "CHAIRMAN", authorityBasis: item.role === "CHAIRMAN" ? "Демо: решение общего собрания собственников №1" : null },
      update: item.role === "CHAIRMAN" ? { canSignAcceptanceAct: true, authorityBasis: "Демо: решение общего собрания собственников №1" } : {},
    });
  }

  for (const template of demoTemplates) {
    const existing = await db.checklistTemplate.findUnique({ where: { code: template.code } });
    if (existing) continue;
    await db.checklistTemplate.create({ data: { code: template.code, title: template.title, category: template.category, version: 1, active: true, items: { create: template.checks.map((title, order) => ({ order: order + 1, title, method: title.includes("срок") ? "DOCUMENTARY" : "VISUAL", sourceType: title.includes("описанию") || title.includes("срок") ? "CONTRACT" : "INTERNAL", commentRequiredOnFail: true, photoRequiredOnFail: true })) } } });
  }

  const objectNames = ["Демо: подъезд №1", "Демо: двор"];
  const objects = [];
  for (const title of objectNames) {
    objects.push(await db.houseObject.findFirst({ where: { houseId: house.id, title } }) ?? await db.houseObject.create({ data: { houseId: house.id, title } }));
  }

  for (const item of demoWorks) {
    if (await db.work.findFirst({ where: { houseId: house.id, title: item.title } })) continue;
    await db.work.create({ data: {
      houseId: house.id,
      houseObjectId: objects[item.object].id,
      executorUserId: users[3].id,
      executorName: "Демо УК",
      representativeName: `${users[3].firstName} ${users[3].lastName}`,
      title: item.title,
      description: `Тестовая работа: ${item.title.toLowerCase()}`,
      category: item.object === 0 ? "COMMON_AREAS" : "OUTDOOR",
      status: item.status,
      date: now,
    } });
  }

  for (const title of ["Демо: скрипит дверь", "Демо: не горит лампа"]) {
    if (await db.observation.findFirst({ where: { houseId: house.id, title } })) continue;
    await db.observation.create({ data: {
      houseId: house.id,
      houseObjectId: objects[0].id,
      authorId: users[0].id,
      title,
      description: "Тестовое наблюдение жителя",
      category: "OTHER",
      status: title.includes("дверь") ? "NEW" : "IN_REVIEW",
    } });
  }

  return { houseId: house.id, users: users.length + 1, objects: objects.length, works: demoWorks.length, observations: 2, templates: demoTemplates.length };
}

export async function seedDemoWorkflow(db: PrismaClient) {
  const house = await db.house.findFirst({ where: { address: "Демо: ул. Примерная, д. 12" } });
  if (!house) throw new Error("Demo house missing");
  const council = await db.user.findUniqueOrThrow({ where: { maxUserId: demoUsers[1].maxUserId } });
  const chairman = await db.user.findUniqueOrThrow({ where: { maxUserId: demoUsers[2].maxUserId } });
  const executor = await db.user.findUniqueOrThrow({ where: { maxUserId: demoUsers[3].maxUserId } });
  const template = await db.checklistTemplate.findUniqueOrThrow({ where: { code: "GENERAL_REPAIR" }, include: { items: { orderBy: { order: "asc" } } } });
  const botName = process.env.MAX_BOT_NAME || "PriemkaDemoBot";

  async function photo(ownerUserId: number, target: { inspectionAnswerId?: number; remediationId?: number }) {
    const bytes = await sharp({ create: { width: 320, height: 220, channels: 3, background: { r: 222, g: 230, b: 237 } } }).png().toBuffer();
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const storagePath = join(sha256.slice(0, 2), sha256.slice(2, 4), `${sha256}.png`);
    const file = join(resolve(process.env.MEDIA_DIR ?? "/app/data/media"), storagePath);
    await mkdir(resolve(file, ".."), { recursive: true });
    if (!existsSync(file)) await writeFile(file, bytes, { flag: "wx" }).catch((error: NodeJS.ErrnoException) => { if (error.code !== "EEXIST") throw error; });
    const blob = await db.mediaBlob.upsert({ where: { sha256 }, create: { sha256, mimeType: "image/png", size: bytes.length, width: 320, height: 220, storagePath }, update: {} });
    return db.media.create({ data: { blobId: blob.id, ownerUserId, publicKey: randomBytes(8).toString("hex"), temporary: false, ...target } });
  }

  for (const [index, scenario] of demoWorks.entries()) {
    if (index === 0) continue;
    const work = await db.work.findFirst({ where: { houseId: house.id, title: scenario.title } });
    if (!work) continue;
    let inspection = await db.inspection.findFirst({ where: { workId: work.id }, include: { items: { orderBy: { order: "asc" } }, assignments: true } });
    if (!inspection) {
      inspection = await db.inspection.create({ data: { workId: work.id, checklistTemplateId: template.id, templateVersion: template.version, createdByUserId: chairman.id, items: { create: template.items.map((item) => ({ order: item.order, title: item.title, description: item.description, method: item.method, sourceType: item.sourceType, sourceLabel: item.sourceLabel, commentRequiredOnFail: item.commentRequiredOnFail, photoRequiredOnFail: item.photoRequiredOnFail })) }, assignments: { create: [{ assigneeUserId: council.id, status: index === 1 ? "ASSIGNED" : "COMPLETED", ...(index === 1 ? {} : { startedAt: new Date(), completedAt: new Date() }) }] } }, include: { items: { orderBy: { order: "asc" } }, assignments: true } });
    }
    if (index === 1) continue;
    const assignment = inspection.assignments[0];
    for (const [position, item] of inspection.items.entries()) {
      const answer = await db.inspectionAnswer.upsert({ where: { assignmentId_checklistItemId: { assignmentId: assignment.id, checklistItemId: item.id } }, create: { assignmentId: assignment.id, checklistItemId: item.id, result: position === 0 && index !== 4 ? "FAIL" : "PASS", comment: position === 0 && index !== 4 ? "Демо: обнаружен видимый дефект" : null }, update: {} });
      if (position !== 0 || index === 4) continue;
      if (!await db.media.count({ where: { inspectionAnswerId: answer.id } })) await photo(council.id, { inspectionAnswerId: answer.id });
      const issue = await db.issue.upsert({ where: { inspectionAnswerId: answer.id }, create: { workId: work.id, inspectionAnswerId: answer.id, title: item.title, description: answer.comment ?? "Демо: замечание", status: index === 3 ? "RESOLVED" : "OPEN", resolvedAt: index === 3 ? new Date() : null }, update: {} });
      if (index === 3) {
        let remediation = await db.remediation.findFirst({ where: { issueId: issue.id } });
        if (!remediation) remediation = await db.remediation.create({ data: { issueId: issue.id, executorUserId: executor.id, comment: "Демо: дефект устранён" } });
        if (!await db.media.count({ where: { remediationId: remediation.id } })) await photo(executor.id, { remediationId: remediation.id });
        await db.reinspection.upsert({ where: { remediationId: remediation.id }, create: { issueId: issue.id, remediationId: remediation.id, assigneeUserId: council.id, status: "COMPLETED", result: "RESOLVED", completedAt: new Date() }, update: {} });
        if (issue.status === "REMEDIATION_SUBMITTED") await db.issue.update({ where: { id: issue.id }, data: { status: "RESOLVED", resolvedAt: new Date() } });
        await db.reinspection.updateMany({ where: { remediationId: remediation.id, status: "ASSIGNED" }, data: { status: "COMPLETED", result: "RESOLVED", completedAt: new Date() } });
      }
    }
    const report = await db.document.findFirst({ where: { workId: work.id, type: "INSPECTION_REPORT" } });
    if (report && !report.inspectionId) await db.document.update({ where: { id: report.id }, data: { inspectionId: inspection.id } });
    if (!report) await createDocumentVersion(db, work.id, "INSPECTION_REPORT", council.id, { house: house.address, work: work.title, description: work.description, executor: work.executorName ?? "Демо УК", createdAt: new Date().toISOString(), rows: [], checklist: inspection.items.map((item, position) => ({ order: item.order, title: item.title, method: item.method, result: position === 0 && index !== 4 ? "FAIL" : "PASS", comment: position === 0 && index !== 4 ? "Демо: обнаружен видимый дефект" : null })), actor: { name: `${council.firstName} ${council.lastName}`, role: "COUNCIL_MEMBER", at: new Date().toISOString() }, issues: index === 4 ? [] : [{ title: inspection.items[0].title, comment: "Демо: обнаружен видимый дефект", checkedAt: new Date().toISOString() }], summary: index === 4 ? "Замечаний не выявлено. Проверка успешно завершена." : "Выявлено замечаний: 1. Требуется устранение замечаний." }, botName, { inspectionId: inspection.id });
    if (index === 3) {
      const reinspection = await db.reinspection.findFirst({ where: { issue: { workId: work.id } }, include: { issue: { include: { answer: { include: { media: { include: { blob: true } } } } } }, remediation: { include: { media: { include: { blob: true } } } } } });
      if (reinspection && !await db.document.findFirst({ where: { reinspectionId: reinspection.id } })) {
        const mediaPath = (media: { blob: { storagePath: string } }) => join(resolve(process.env.MEDIA_DIR ?? "/app/data/media"), media.blob.storagePath);
        await createDocumentVersion(db, work.id, "REINSPECTION_REPORT", council.id, { house: house.address, work: work.title, description: work.description, executor: work.executorName ?? "Демо УК", createdAt: new Date().toISOString(), rows: [{ label: "Исходное замечание", value: `${reinspection.issue.title}: ${reinspection.issue.description}` }, { label: "Устранение", value: reinspection.remediation.comment }], summary: "Замечание устранено.", actor: { name: `${council.firstName} ${council.lastName}`, role: "COUNCIL_MEMBER", at: new Date().toISOString() }, photoGroups: [{ title: "ИСХОДНОЕ ЗАМЕЧАНИЕ", photos: reinspection.issue.answer.media.map(mediaPath) }, { title: "ПОСЛЕ УСТРАНЕНИЯ ИСПОЛНИТЕЛЕМ", photos: reinspection.remediation.media.map(mediaPath) }] }, botName, { reinspectionId: reinspection.id });
      }
    }
    if (index === 4 && !await db.document.findFirst({ where: { workId: work.id, type: "ACCEPTANCE_ACT" } })) {
      const time = new Date();
      const version = await createDocumentVersion(db, work.id, "ACCEPTANCE_ACT", executor.id, { house: house.address, work: work.title, description: work.description, executor: work.executorName ?? "Демо УК", createdAt: time.toISOString(), rows: [], summary: "", act: { actNumber: "Демо-1", city: "Москва", contractNumber: "Демо: договор №1", contractDate: "01.09.2026", customerName: `${chairman.firstName} ${chairman.lastName}`, customerApartment: "1", customerAuthorityBasis: "Демо: решение собственников №1", executorOrganization: "Демо УК", executorRepresentative: `${executor.firstName} ${executor.lastName}`, executorAuthorityBasis: "Демо: доверенность №1", periodFrom: "20.09.2026", periodTo: "25.09.2026", frequencyOrQuantity: "1", unit: "работа", unitPrice: "1000", totalPrice: "1000", totalPriceWords: "одна тысяча" }, confirmations: [{ name: `${executor.firstName} ${executor.lastName}`, role: "EXECUTOR", at: time.toISOString() }, { name: `${chairman.firstName} ${chairman.lastName}`, role: "CHAIRMAN", at: time.toISOString() }] }, botName);
      await db.documentVersion.update({ where: { id: version.id }, data: { status: "CONFIRMED", confirmedAt: time } });
      for (const [user, roleSnapshot] of [[executor, "EXECUTOR"], [chairman, "CHAIRMAN"]] as const) await db.documentConfirmation.create({ data: { documentVersionId: version.id, userId: user.id, roleSnapshot, confirmedAt: time } });
    }
  }
}
