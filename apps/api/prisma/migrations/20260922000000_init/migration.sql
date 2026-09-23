CREATE TABLE `User` (
    `id` VARCHAR(30) NOT NULL,
    `maxUserId` VARCHAR(32) NOT NULL,
    `firstName` VARCHAR(255) NOT NULL,
    `lastName` VARCHAR(255) NOT NULL,
    `username` VARCHAR(255) NULL,
    `languageCode` VARCHAR(32) NOT NULL,
    `photoUrl` VARCHAR(2048) NULL,
    `lastAuthDate` DATETIME(3) NOT NULL,
    `lastSeenAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_maxUserId_key`(`maxUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
