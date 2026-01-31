PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_drawings` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`data` text DEFAULT '{}' NOT NULL,
	`thumbnail` text,
	`folderId` text,
	`ownerId` text NOT NULL,
	`isPublic` integer DEFAULT false NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`folderId`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_drawings`("id", "name", "data", "thumbnail", "folderId", "ownerId", "isPublic", "createdAt", "updatedAt") SELECT "id", "name", "data", "thumbnail", "folderId", "ownerId", "isPublic", "createdAt", "updatedAt" FROM `drawings`;--> statement-breakpoint
DROP TABLE `drawings`;--> statement-breakpoint
ALTER TABLE `__new_drawings` RENAME TO `drawings`;--> statement-breakpoint
PRAGMA foreign_keys=ON;