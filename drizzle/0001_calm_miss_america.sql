ALTER TABLE `invites` ADD `usedBy` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `invites` DROP COLUMN `email`;