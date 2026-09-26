-- AlterTable
ALTER TABLE `User` ADD COLUMN `isAdmin` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `lastHouseId` INTEGER NULL;

-- Preserve existing administrators before removing the former enum column.
UPDATE `User` SET `isAdmin` = true WHERE `systemRole` = 'ADMIN';
ALTER TABLE `User` DROP COLUMN `systemRole`;

-- AlterTable
ALTER TABLE `HouseMembership` ADD COLUMN `authorityBasis` VARCHAR(512) NULL,
    ADD COLUMN `canSignAcceptanceAct` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `Media` ADD COLUMN `inspectionAnswerId` INTEGER NULL,
    ADD COLUMN `reinspectionId` INTEGER NULL,
    ADD COLUMN `remediationId` INTEGER NULL;

-- CreateTable
CREATE TABLE `ChecklistTemplate` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(100) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `category` VARCHAR(100) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ChecklistTemplate_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChecklistTemplateItem` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `templateId` INTEGER NOT NULL,
    `order` INTEGER NOT NULL,
    `title` VARCHAR(512) NOT NULL,
    `description` TEXT NULL,
    `method` ENUM('VISUAL', 'DOCUMENTARY', 'COMPARATIVE', 'INSTRUMENTAL') NOT NULL,
    `sourceType` ENUM('CONTRACT', 'REGULATION', 'RECOMMENDATION', 'INTERNAL') NOT NULL,
    `sourceLabel` VARCHAR(512) NULL,
    `commentRequiredOnFail` BOOLEAN NOT NULL DEFAULT true,
    `photoRequiredOnFail` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `ChecklistTemplateItem_templateId_order_key`(`templateId`, `order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Inspection` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `workId` INTEGER NOT NULL,
    `checklistTemplateId` INTEGER NOT NULL,
    `templateVersion` INTEGER NOT NULL,
    `createdByUserId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Inspection_workId_createdAt_idx`(`workId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InspectionChecklistItem` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `inspectionId` INTEGER NOT NULL,
    `order` INTEGER NOT NULL,
    `title` VARCHAR(512) NOT NULL,
    `description` TEXT NULL,
    `method` ENUM('VISUAL', 'DOCUMENTARY', 'COMPARATIVE', 'INSTRUMENTAL') NOT NULL,
    `sourceType` ENUM('CONTRACT', 'REGULATION', 'RECOMMENDATION', 'INTERNAL') NOT NULL,
    `sourceLabel` VARCHAR(512) NULL,
    `commentRequiredOnFail` BOOLEAN NOT NULL,
    `photoRequiredOnFail` BOOLEAN NOT NULL,

    UNIQUE INDEX `InspectionChecklistItem_inspectionId_order_key`(`inspectionId`, `order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InspectionAssignment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `inspectionId` INTEGER NOT NULL,
    `assigneeUserId` INTEGER NOT NULL,
    `status` ENUM('ASSIGNED', 'IN_PROGRESS', 'COMPLETED') NOT NULL DEFAULT 'ASSIGNED',
    `startedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,

    INDEX `InspectionAssignment_assigneeUserId_status_idx`(`assigneeUserId`, `status`),
    UNIQUE INDEX `InspectionAssignment_inspectionId_assigneeUserId_key`(`inspectionId`, `assigneeUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InspectionAnswer` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `assignmentId` INTEGER NOT NULL,
    `checklistItemId` INTEGER NOT NULL,
    `result` ENUM('PENDING', 'PASS', 'FAIL', 'UNABLE_TO_CHECK') NOT NULL DEFAULT 'PENDING',
    `comment` TEXT NULL,

    UNIQUE INDEX `InspectionAnswer_assignmentId_checklistItemId_key`(`assignmentId`, `checklistItemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Issue` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `workId` INTEGER NOT NULL,
    `inspectionAnswerId` INTEGER NOT NULL,
    `title` VARCHAR(512) NOT NULL,
    `description` TEXT NOT NULL,
    `status` ENUM('OPEN', 'REMEDIATION_SUBMITTED', 'RESOLVED') NOT NULL DEFAULT 'OPEN',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `resolvedAt` DATETIME(3) NULL,

    UNIQUE INDEX `Issue_inspectionAnswerId_key`(`inspectionAnswerId`),
    INDEX `Issue_workId_status_idx`(`workId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Remediation` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `issueId` INTEGER NOT NULL,
    `executorUserId` INTEGER NOT NULL,
    `comment` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Reinspection` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `issueId` INTEGER NOT NULL,
    `remediationId` INTEGER NOT NULL,
    `assigneeUserId` INTEGER NOT NULL,
    `status` ENUM('ASSIGNED', 'COMPLETED') NOT NULL DEFAULT 'ASSIGNED',
    `result` ENUM('RESOLVED', 'NOT_RESOLVED') NULL,
    `comment` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completedAt` DATETIME(3) NULL,

    UNIQUE INDEX `Reinspection_remediationId_key`(`remediationId`),
    INDEX `Reinspection_assigneeUserId_status_idx`(`assigneeUserId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Document` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `workId` INTEGER NOT NULL,
    `type` ENUM('INSPECTION_REPORT', 'REINSPECTION_REPORT', 'REASONED_REFUSAL', 'ACCEPTANCE_ACT') NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Document_workId_type_key`(`workId`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DocumentVersion` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `documentId` INTEGER NOT NULL,
    `version` INTEGER NOT NULL,
    `status` ENUM('DRAFT', 'FINAL', 'CONFIRMED', 'SUPERSEDED') NOT NULL DEFAULT 'FINAL',
    `payloadJson` JSON NOT NULL,
    `sha256` CHAR(64) NOT NULL,
    `storagePath` VARCHAR(512) NOT NULL,
    `publicKey` VARCHAR(64) NOT NULL,
    `createdByUserId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `confirmedAt` DATETIME(3) NULL,

    UNIQUE INDEX `DocumentVersion_publicKey_key`(`publicKey`),
    UNIQUE INDEX `DocumentVersion_documentId_version_key`(`documentId`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DocumentConfirmation` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `documentVersionId` INTEGER NOT NULL,
    `userId` INTEGER NOT NULL,
    `roleSnapshot` VARCHAR(100) NOT NULL,
    `confirmedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `DocumentConfirmation_documentVersionId_userId_key`(`documentVersionId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_lastHouseId_fkey` FOREIGN KEY (`lastHouseId`) REFERENCES `House`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Media` ADD CONSTRAINT `Media_inspectionAnswerId_fkey` FOREIGN KEY (`inspectionAnswerId`) REFERENCES `InspectionAnswer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Media` ADD CONSTRAINT `Media_remediationId_fkey` FOREIGN KEY (`remediationId`) REFERENCES `Remediation`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Media` ADD CONSTRAINT `Media_reinspectionId_fkey` FOREIGN KEY (`reinspectionId`) REFERENCES `Reinspection`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChecklistTemplateItem` ADD CONSTRAINT `ChecklistTemplateItem_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `ChecklistTemplate`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Inspection` ADD CONSTRAINT `Inspection_workId_fkey` FOREIGN KEY (`workId`) REFERENCES `Work`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Inspection` ADD CONSTRAINT `Inspection_checklistTemplateId_fkey` FOREIGN KEY (`checklistTemplateId`) REFERENCES `ChecklistTemplate`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Inspection` ADD CONSTRAINT `Inspection_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InspectionChecklistItem` ADD CONSTRAINT `InspectionChecklistItem_inspectionId_fkey` FOREIGN KEY (`inspectionId`) REFERENCES `Inspection`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InspectionAssignment` ADD CONSTRAINT `InspectionAssignment_inspectionId_fkey` FOREIGN KEY (`inspectionId`) REFERENCES `Inspection`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InspectionAssignment` ADD CONSTRAINT `InspectionAssignment_assigneeUserId_fkey` FOREIGN KEY (`assigneeUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InspectionAnswer` ADD CONSTRAINT `InspectionAnswer_assignmentId_fkey` FOREIGN KEY (`assignmentId`) REFERENCES `InspectionAssignment`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InspectionAnswer` ADD CONSTRAINT `InspectionAnswer_checklistItemId_fkey` FOREIGN KEY (`checklistItemId`) REFERENCES `InspectionChecklistItem`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Issue` ADD CONSTRAINT `Issue_workId_fkey` FOREIGN KEY (`workId`) REFERENCES `Work`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Issue` ADD CONSTRAINT `Issue_inspectionAnswerId_fkey` FOREIGN KEY (`inspectionAnswerId`) REFERENCES `InspectionAnswer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Remediation` ADD CONSTRAINT `Remediation_issueId_fkey` FOREIGN KEY (`issueId`) REFERENCES `Issue`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Reinspection` ADD CONSTRAINT `Reinspection_issueId_fkey` FOREIGN KEY (`issueId`) REFERENCES `Issue`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Reinspection` ADD CONSTRAINT `Reinspection_remediationId_fkey` FOREIGN KEY (`remediationId`) REFERENCES `Remediation`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Document` ADD CONSTRAINT `Document_workId_fkey` FOREIGN KEY (`workId`) REFERENCES `Work`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DocumentVersion` ADD CONSTRAINT `DocumentVersion_documentId_fkey` FOREIGN KEY (`documentId`) REFERENCES `Document`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DocumentVersion` ADD CONSTRAINT `DocumentVersion_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DocumentConfirmation` ADD CONSTRAINT `DocumentConfirmation_documentVersionId_fkey` FOREIGN KEY (`documentVersionId`) REFERENCES `DocumentVersion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DocumentConfirmation` ADD CONSTRAINT `DocumentConfirmation_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
-- CreateTable
CREATE TABLE `BotOutbox` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `eventKey` CHAR(64) NOT NULL,
    `chatId` VARCHAR(32) NOT NULL,
    `publicKey` VARCHAR(40) NOT NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `nextAttemptAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `sentText` BOOLEAN NOT NULL DEFAULT false,
    `fileToken` VARCHAR(512) NULL,
    `completedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `BotOutbox_eventKey_key`(`eventKey`),
    INDEX `BotOutbox_completedAt_nextAttemptAt_idx`(`completedAt`, `nextAttemptAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
