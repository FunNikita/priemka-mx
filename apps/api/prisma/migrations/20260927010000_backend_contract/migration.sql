ALTER TABLE `WorkSubscription` ADD COLUMN `sourceObservationId` INTEGER NULL;
ALTER TABLE `Comment` MODIFY COLUMN `workId` INTEGER NULL, ADD COLUMN `observationId` INTEGER NULL;
CREATE INDEX `Comment_observationId_createdAt_idx` ON `Comment`(`observationId`, `createdAt`);
ALTER TABLE `Comment` DROP FOREIGN KEY `Comment_workId_fkey`;
ALTER TABLE `Comment` ADD CONSTRAINT `Comment_workId_fkey` FOREIGN KEY (`workId`) REFERENCES `Work`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE `Comment` ADD CONSTRAINT `Comment_observationId_fkey` FOREIGN KEY (`observationId`) REFERENCES `Observation`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE `Comment` ADD CONSTRAINT `Comment_exactly_one_parent` CHECK ((`workId` IS NULL) <> (`observationId` IS NULL));

CREATE TABLE `ObservationSubscription` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `observationId` INTEGER NOT NULL,
  `userId` INTEGER NOT NULL,
  `reason` VARCHAR(16) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `ObservationSubscription_observationId_userId_key`(`observationId`, `userId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `ObservationSubscription` ADD CONSTRAINT `ObservationSubscription_observationId_fkey` FOREIGN KEY (`observationId`) REFERENCES `Observation`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `ObservationSubscription` ADD CONSTRAINT `ObservationSubscription_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO `ObservationSubscription` (`observationId`, `userId`, `reason`)
SELECT `id`, `authorId`, 'AUTHOR' FROM `Observation`;
INSERT IGNORE INTO `WorkSubscription` (`workId`, `userId`, `sourceObservationId`)
SELECT w.`id`, s.`userId`, s.`observationId` FROM `Work` w JOIN `ObservationSubscription` s ON s.`observationId` = w.`sourceObservationId`;

CREATE TABLE `PreviewAccess` (
  `maxUserId` VARCHAR(32) NOT NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`maxUserId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ActivityEvent` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `event` VARCHAR(100) NOT NULL,
  `subjectType` VARCHAR(50) NOT NULL,
  `subjectId` INTEGER NULL,
  `subjectKey` VARCHAR(128) NULL,
  `houseId` INTEGER NULL,
  `workId` INTEGER NULL,
  `observationId` INTEGER NULL,
  `actorUserId` INTEGER NULL,
  `actorName` VARCHAR(512) NULL,
  `actorRole` VARCHAR(32) NULL,
  `metadata` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `ActivityEvent_subjectType_subjectId_createdAt_idx`(`subjectType`, `subjectId`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `ActivityEvent` ADD CONSTRAINT `ActivityEvent_houseId_fkey` FOREIGN KEY (`houseId`) REFERENCES `House`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `ActivityEvent` ADD CONSTRAINT `ActivityEvent_workId_fkey` FOREIGN KEY (`workId`) REFERENCES `Work`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `ActivityEvent` ADD CONSTRAINT `ActivityEvent_observationId_fkey` FOREIGN KEY (`observationId`) REFERENCES `Observation`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `ActivityEvent` ADD CONSTRAINT `ActivityEvent_actorUserId_fkey` FOREIGN KEY (`actorUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `BotOutbox` ADD COLUMN `kind` VARCHAR(16) NOT NULL DEFAULT 'DOCUMENT',
  ADD COLUMN `targetType` VARCHAR(16) NOT NULL DEFAULT 'CHAT',
  ADD COLUMN `text` TEXT NULL,
  ADD COLUMN `buttonText` VARCHAR(100) NULL,
  ADD COLUMN `buttonUrl` VARCHAR(2048) NULL;
ALTER TABLE `BotOutbox` ADD COLUMN `deadAt` DATETIME(3) NULL;
