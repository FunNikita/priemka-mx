-- Preserve existing User rows and MAX IDs; the old schema has no foreign keys to User.id.
ALTER TABLE `User` ADD COLUMN `systemRole` ENUM('USER', 'ADMIN') NOT NULL DEFAULT 'USER';
ALTER TABLE `User` ADD COLUMN `newId` INTEGER NOT NULL AUTO_INCREMENT UNIQUE;
ALTER TABLE `User` DROP PRIMARY KEY, DROP COLUMN `id`, CHANGE COLUMN `newId` `id` INTEGER NOT NULL AUTO_INCREMENT, ADD PRIMARY KEY (`id`);
ALTER TABLE `User` DROP INDEX `newId`;

-- CreateTable
CREATE TABLE `House` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `address` VARCHAR(512) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `HouseMembership` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `houseId` INTEGER NOT NULL,
    `userId` INTEGER NOT NULL,
    `role` ENUM('RESIDENT', 'CHAIRMAN', 'COUNCIL_MEMBER', 'EXECUTOR') NOT NULL,
    `status` ENUM('PENDING', 'ACTIVE', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `joinedVia` ENUM('CHAT', 'INVITE', 'REQUEST', 'ADMIN') NOT NULL DEFAULT 'ADMIN',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `HouseMembership_userId_status_idx`(`userId`, `status`),
    UNIQUE INDEX `HouseMembership_houseId_userId_key`(`houseId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `HouseChat` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `houseId` INTEGER NOT NULL,
    `title` VARCHAR(255) NULL,
    `joinUrl` VARCHAR(2048) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `HouseChat_houseId_key`(`houseId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `HouseObject` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `houseId` INTEGER NOT NULL,
    `title` VARCHAR(255) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Work` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `houseId` INTEGER NOT NULL,
    `houseObjectId` INTEGER NULL,
    `executorUserId` INTEGER NULL,
    `title` VARCHAR(255) NOT NULL,
    `description` TEXT NOT NULL,
    `category` VARCHAR(100) NOT NULL,
    `status` ENUM('NEW', 'IN_REVIEW', 'IN_PROGRESS', 'WAITING', 'ACCEPTED') NOT NULL DEFAULT 'NEW',
    `date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `completedAt` DATETIME(3) NULL,
    `executorName` VARCHAR(255) NULL,
    `representativeName` VARCHAR(255) NULL,

    INDEX `Work_houseId_status_date_idx`(`houseId`, `status`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WorkSubscription` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `workId` INTEGER NOT NULL,
    `userId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `WorkSubscription_workId_userId_key`(`workId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WorkHistory` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `workId` INTEGER NOT NULL,
    `event` VARCHAR(100) NOT NULL,
    `details` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Observation` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `houseId` INTEGER NOT NULL,
    `houseObjectId` INTEGER NULL,
    `authorId` INTEGER NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `description` TEXT NOT NULL,
    `category` VARCHAR(100) NOT NULL,
    `status` ENUM('NEW', 'IN_REVIEW', 'IN_PROGRESS', 'WAITING', 'ACCEPTED') NOT NULL DEFAULT 'NEW',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Observation_houseId_status_createdAt_idx`(`houseId`, `status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Comment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `workId` INTEGER NOT NULL,
    `authorId` INTEGER NOT NULL,
    `text` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Comment_workId_createdAt_idx`(`workId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MediaBlob` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sha256` CHAR(64) NOT NULL,
    `mimeType` VARCHAR(32) NOT NULL,
    `size` INTEGER NOT NULL,
    `width` INTEGER NOT NULL,
    `height` INTEGER NOT NULL,
    `storagePath` VARCHAR(512) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `MediaBlob_sha256_key`(`sha256`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Media` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `blobId` INTEGER NOT NULL,
    `ownerUserId` INTEGER NOT NULL,
    `publicKey` VARCHAR(16) NULL,
    `temporary` BOOLEAN NOT NULL DEFAULT true,
    `expiresAt` DATETIME(3) NULL,
    `observationId` INTEGER NULL,
    `commentId` INTEGER NULL,
    `workId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Media_publicKey_key`(`publicKey`),
    INDEX `Media_temporary_expiresAt_idx`(`temporary`, `expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `HouseMembership` ADD CONSTRAINT `HouseMembership_houseId_fkey` FOREIGN KEY (`houseId`) REFERENCES `House`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HouseMembership` ADD CONSTRAINT `HouseMembership_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HouseChat` ADD CONSTRAINT `HouseChat_houseId_fkey` FOREIGN KEY (`houseId`) REFERENCES `House`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HouseObject` ADD CONSTRAINT `HouseObject_houseId_fkey` FOREIGN KEY (`houseId`) REFERENCES `House`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Work` ADD CONSTRAINT `Work_houseId_fkey` FOREIGN KEY (`houseId`) REFERENCES `House`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Work` ADD CONSTRAINT `Work_houseObjectId_fkey` FOREIGN KEY (`houseObjectId`) REFERENCES `HouseObject`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Work` ADD CONSTRAINT `Work_executorUserId_fkey` FOREIGN KEY (`executorUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkSubscription` ADD CONSTRAINT `WorkSubscription_workId_fkey` FOREIGN KEY (`workId`) REFERENCES `Work`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkSubscription` ADD CONSTRAINT `WorkSubscription_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkHistory` ADD CONSTRAINT `WorkHistory_workId_fkey` FOREIGN KEY (`workId`) REFERENCES `Work`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Observation` ADD CONSTRAINT `Observation_houseId_fkey` FOREIGN KEY (`houseId`) REFERENCES `House`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Observation` ADD CONSTRAINT `Observation_houseObjectId_fkey` FOREIGN KEY (`houseObjectId`) REFERENCES `HouseObject`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Observation` ADD CONSTRAINT `Observation_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Comment` ADD CONSTRAINT `Comment_workId_fkey` FOREIGN KEY (`workId`) REFERENCES `Work`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Comment` ADD CONSTRAINT `Comment_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Media` ADD CONSTRAINT `Media_blobId_fkey` FOREIGN KEY (`blobId`) REFERENCES `MediaBlob`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Media` ADD CONSTRAINT `Media_ownerUserId_fkey` FOREIGN KEY (`ownerUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Media` ADD CONSTRAINT `Media_observationId_fkey` FOREIGN KEY (`observationId`) REFERENCES `Observation`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Media` ADD CONSTRAINT `Media_commentId_fkey` FOREIGN KEY (`commentId`) REFERENCES `Comment`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Media` ADD CONSTRAINT `Media_workId_fkey` FOREIGN KEY (`workId`) REFERENCES `Work`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
