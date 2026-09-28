CREATE TABLE `WorkExecutorAssignment` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `workId` INTEGER NOT NULL,
  `userId` INTEGER NOT NULL,
  `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `unassignedAt` DATETIME(3) NULL,
  INDEX `WorkExecutorAssignment_userId_workId_idx` (`userId`, `workId`),
  INDEX `WorkExecutorAssignment_workId_unassignedAt_idx` (`workId`, `unassignedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `WorkExecutorAssignment` ADD CONSTRAINT `WorkExecutorAssignment_workId_fkey` FOREIGN KEY (`workId`) REFERENCES `Work`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `WorkExecutorAssignment` ADD CONSTRAINT `WorkExecutorAssignment_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO `WorkExecutorAssignment` (`workId`, `userId`, `assignedAt`, `unassignedAt`)
SELECT `id`, `executorUserId`, `createdAt`, NULL
FROM `Work`
WHERE `executorUserId` IS NOT NULL;
