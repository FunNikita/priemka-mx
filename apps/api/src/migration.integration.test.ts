import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { expect, it } from "vitest";

const url = process.env.MIGRATION_TEST_DATABASE_URL;

it.skipIf(!url)("preserves confirmations while changing uniqueness from user to role", async () => {
  const target = new URL(url!);
  if (!target.pathname.slice(1).includes("migration_test")) throw new Error("MIGRATION_TEST_DATABASE_URL must name a dedicated migration_test database");
  const args = ["--host", target.hostname, "--port", target.port || "3306", "--user", decodeURIComponent(target.username), "--batch", "--skip-column-names", target.pathname.slice(1)];
  const runSql = (sql: string) => execFileSync("mysql", args, { input: sql, encoding: "utf8", env: { ...process.env, MYSQL_PWD: decodeURIComponent(target.password) }, stdio: ["pipe", "pipe", "pipe"] });
  if (runSql("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE();").trim() !== "0") throw new Error("Migration test database must be empty");
    const migrations = ["20260922000000_init", "20260924000000_business_api", "20260925000000_inspection_workflow", "20260925010000_document_events"];
    for (const name of migrations) {
      const sql = await readFile(resolve(import.meta.dirname, `../prisma/migrations/${name}/migration.sql`), "utf8");
      runSql(sql);
    }
    runSql("INSERT INTO User (maxUserId, firstName, lastName, languageCode, lastAuthDate, lastSeenAt, updatedAt) VALUES ('migration_user_1', 'Test', 'One', 'ru', NOW(), NOW(), NOW()), ('migration_user_2', 'Test', 'Two', 'ru', NOW(), NOW(), NOW());");
    runSql("INSERT INTO House (address, updatedAt) VALUES ('Migration test house', NOW());");
    runSql("INSERT INTO Work (houseId, title, description, category, updatedAt) VALUES (1, 'Migration test work', 'Test', 'COMMON_AREAS', NOW());");
    runSql("INSERT INTO Document (workId, type, title) VALUES (1, 'ACCEPTANCE_ACT', 'Migration test act');");
    runSql("INSERT INTO DocumentVersion (documentId, version, payloadJson, sha256, storagePath, publicKey, createdByUserId) VALUES (1, 1, '{}', REPEAT('a', 64), 'test.pdf', 'migration_test_public_key', 1);");
    runSql("INSERT INTO DocumentConfirmation (documentVersionId, userId, roleSnapshot) VALUES (1, 1, 'EXECUTOR');");
    expect(runSql("SELECT documentVersionId, roleSnapshot, COUNT(*) AS cnt FROM DocumentConfirmation GROUP BY documentVersionId, roleSnapshot HAVING COUNT(*) > 1;").trim()).toBe("");
    const upgrade = await readFile(resolve(import.meta.dirname, "../prisma/migrations/20260926000000_mvp_role_workflow/migration.sql"), "utf8");
    runSql(upgrade);
    expect(runSql("SELECT COUNT(*) FROM DocumentConfirmation WHERE documentVersionId = 1 AND userId = 1 AND roleSnapshot = 'EXECUTOR';").trim()).toBe("1");
    runSql("INSERT INTO DocumentConfirmation (documentVersionId, userId, roleSnapshot) VALUES (1, 1, 'CHAIRMAN');");
    expect(() => runSql("INSERT INTO DocumentConfirmation (documentVersionId, userId, roleSnapshot) VALUES (1, 2, 'CHAIRMAN');")).toThrow();
    expect(Number(runSql("SELECT COUNT(*) FROM information_schema.statistics WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DocumentConfirmation' AND INDEX_NAME = 'DocumentConfirmation_documentVersionId_roleSnapshot_key' AND NON_UNIQUE = 0;").trim())).toBeGreaterThan(0);
}, 30_000);
