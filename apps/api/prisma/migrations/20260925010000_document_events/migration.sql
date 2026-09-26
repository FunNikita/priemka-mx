-- Each report belongs to its own inspection event. Existing documents and versions remain intact.
CREATE INDEX `Document_workId_type_idx` ON `Document`(`workId`, `type`);
ALTER TABLE `Document` DROP INDEX `Document_workId_type_key`;
ALTER TABLE `Document`
  ADD COLUMN `inspectionId` INTEGER NULL,
  ADD COLUMN `reinspectionId` INTEGER NULL;
CREATE UNIQUE INDEX `Document_inspectionId_key` ON `Document`(`inspectionId`);
CREATE UNIQUE INDEX `Document_reinspectionId_key` ON `Document`(`reinspectionId`);
ALTER TABLE `Document` ADD CONSTRAINT `Document_inspectionId_fkey` FOREIGN KEY (`inspectionId`) REFERENCES `Inspection`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Document` ADD CONSTRAINT `Document_reinspectionId_fkey` FOREIGN KEY (`reinspectionId`) REFERENCES `Reinspection`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Reinspection` ADD CONSTRAINT `Reinspection_assigneeUserId_fkey` FOREIGN KEY (`assigneeUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
