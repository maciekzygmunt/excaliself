ALTER TABLE "drawings" ADD COLUMN "deletedAt" timestamp;--> statement-breakpoint
ALTER TABLE "drawings" ADD COLUMN "trashRootId" text;--> statement-breakpoint
ALTER TABLE "folders" ADD COLUMN "deletedAt" timestamp;--> statement-breakpoint
ALTER TABLE "folders" ADD COLUMN "trashRootId" text;