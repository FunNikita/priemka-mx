ALTER TABLE `HouseMembership` ADD COLUMN `requestedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);
UPDATE `HouseMembership` SET `requestedAt` = `createdAt`;
