ALTER TABLE `Work` ADD COLUMN `sourceObservationId` INTEGER NULL;
CREATE UNIQUE INDEX `Work_sourceObservationId_key` ON `Work`(`sourceObservationId`);
ALTER TABLE `Work` ADD CONSTRAINT `Work_sourceObservationId_fkey` FOREIGN KEY (`sourceObservationId`) REFERENCES `Observation`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
