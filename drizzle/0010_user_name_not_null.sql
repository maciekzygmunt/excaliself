-- An unset display name is now "" instead of NULL: better-auth's cookie cache
-- schema requires a string name and dropped every cached session otherwise.
--
-- Rolling back to an older image, which writes NULL names, needs:
--   ALTER TABLE "users" ALTER COLUMN "name" DROP NOT NULL;
UPDATE "users" SET "name" = '' WHERE "name" IS NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "name" SET NOT NULL;
