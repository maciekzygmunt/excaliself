-- Team space: drawings and folders live in a space ('private' or 'team'),
-- ownerId becomes a nullable createdBy (Team rows outlive their creator),
-- deletedBy records who trashed a row (the creator for rows already in
-- trash), and stars become per member. Every existing row becomes private;
-- every star is kept for the drawing's owner.
--
-- Migrations run on boot with no down-migrations. The safe rollback is a
-- database backup taken before the deploy (docs/deployment.md). Without one,
-- rolling back to an older image needs this manual restore first. It is
-- lossy: Team rows go to their creator (or the first admin when the creator
-- is gone), and only that owner's star on each drawing survives.
--   ALTER TABLE "drawings" DROP CONSTRAINT "drawings_creator_unless_team";
--   ALTER TABLE "folders" DROP CONSTRAINT "folders_creator_unless_team";
--   UPDATE "drawings" SET "createdBy" = (SELECT "id" FROM "users"
--     WHERE "role" = 'admin' ORDER BY "createdAt" LIMIT 1)
--     WHERE "createdBy" IS NULL;
--   UPDATE "folders" SET "createdBy" = (SELECT "id" FROM "users"
--     WHERE "role" = 'admin' ORDER BY "createdAt" LIMIT 1)
--     WHERE "createdBy" IS NULL;
--   ALTER TABLE "drawings" RENAME COLUMN "createdBy" TO "ownerId";
--   ALTER TABLE "folders" RENAME COLUMN "createdBy" TO "ownerId";
--   ALTER TABLE "drawings" ALTER COLUMN "ownerId" SET NOT NULL;
--   ALTER TABLE "folders" ALTER COLUMN "ownerId" SET NOT NULL;
--   ALTER TABLE "drawings" DROP CONSTRAINT "drawings_createdBy_users_id_fk";
--   ALTER TABLE "folders" DROP CONSTRAINT "folders_createdBy_users_id_fk";
--   ALTER TABLE "drawings" ADD CONSTRAINT "drawings_ownerId_users_id_fk"
--     FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE cascade;
--   ALTER TABLE "folders" ADD CONSTRAINT "folders_ownerId_users_id_fk"
--     FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE cascade;
--   ALTER TABLE "drawings" ADD COLUMN "starred" boolean NOT NULL DEFAULT false;
--   UPDATE "drawings" SET "starred" = true FROM "stars"
--     WHERE "stars"."drawingId" = "drawings"."id"
--     AND "stars"."userId" = "drawings"."ownerId";
--   DROP TABLE "stars";
--   ALTER TABLE "drawings" DROP COLUMN "space", DROP COLUMN "deletedBy";
--   ALTER TABLE "folders" DROP COLUMN "space", DROP COLUMN "deletedBy";
ALTER TABLE "drawings" RENAME COLUMN "ownerId" TO "createdBy";--> statement-breakpoint
ALTER TABLE "folders" RENAME COLUMN "ownerId" TO "createdBy";--> statement-breakpoint
ALTER TABLE "drawings" ALTER COLUMN "createdBy" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "folders" ALTER COLUMN "createdBy" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "drawings" DROP CONSTRAINT "drawings_ownerId_users_id_fk";--> statement-breakpoint
ALTER TABLE "folders" DROP CONSTRAINT "folders_ownerId_users_id_fk";--> statement-breakpoint
ALTER TABLE "drawings" ADD CONSTRAINT "drawings_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawings" ADD COLUMN "space" text DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE "folders" ADD COLUMN "space" text DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE "drawings" ADD CONSTRAINT "drawings_creator_unless_team" CHECK ("drawings"."space" = 'team' OR "drawings"."createdBy" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_creator_unless_team" CHECK ("folders"."space" = 'team' OR "folders"."createdBy" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "drawings" ADD COLUMN "deletedBy" text;--> statement-breakpoint
ALTER TABLE "folders" ADD COLUMN "deletedBy" text;--> statement-breakpoint
ALTER TABLE "drawings" ADD CONSTRAINT "drawings_deletedBy_users_id_fk" FOREIGN KEY ("deletedBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_deletedBy_users_id_fk" FOREIGN KEY ("deletedBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Rows trashed before this release were trashed by their creator, the only
-- member who could see them. Without this, a trashed row moved to Team later
-- reads "Former member".
UPDATE "drawings" SET "deletedBy" = "createdBy" WHERE "deletedAt" IS NOT NULL;--> statement-breakpoint
UPDATE "folders" SET "deletedBy" = "createdBy" WHERE "deletedAt" IS NOT NULL;--> statement-breakpoint
CREATE TABLE "stars" (
	"userId" text NOT NULL,
	"drawingId" text NOT NULL,
	CONSTRAINT "stars_userId_drawingId_pk" PRIMARY KEY("userId","drawingId")
);
--> statement-breakpoint
ALTER TABLE "stars" ADD CONSTRAINT "stars_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stars" ADD CONSTRAINT "stars_drawingId_drawings_id_fk" FOREIGN KEY ("drawingId") REFERENCES "public"."drawings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
INSERT INTO "stars" ("userId", "drawingId")
  SELECT "createdBy", "id" FROM "drawings" WHERE "starred" = true;--> statement-breakpoint
ALTER TABLE "drawings" DROP COLUMN "starred";
