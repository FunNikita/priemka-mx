ALTER TABLE `HouseMembership` ADD COLUMN `executorCompanyName` VARCHAR(255) NULL;
ALTER TABLE `Work` ADD COLUMN `submittedForInspectionAt` DATETIME(3) NULL;
CREATE INDEX `DocumentConfirmation_documentVersionId_idx` ON `DocumentConfirmation`(`documentVersionId`);
ALTER TABLE `DocumentConfirmation` DROP INDEX `DocumentConfirmation_documentVersionId_userId_key`;
CREATE UNIQUE INDEX `DocumentConfirmation_documentVersionId_roleSnapshot_key` ON `DocumentConfirmation`(`documentVersionId`, `roleSnapshot`);
