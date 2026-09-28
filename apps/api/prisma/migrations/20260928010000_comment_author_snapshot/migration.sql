ALTER TABLE `Comment`
  ADD COLUMN `authorTypeSnapshot` ENUM('USER', 'EXECUTOR') NULL,
  ADD COLUMN `authorDisplayNameSnapshot` VARCHAR(255) NULL;
