-- Finishes 0008. Rows 0008 could not decode are not base64 image data URLs,
-- which Excalidraw never produces, so nothing can render them; they go.
-- drawings.thumbnail was never written.
--
-- Migrations run on boot with no down-migrations, so rolling back to an older
-- image needs this manual restore first:
--   ALTER TABLE drawings ADD COLUMN "thumbnail" text;
--   ALTER TABLE drawing_files ADD COLUMN "dataUrl" text;
--   UPDATE drawing_files SET "dataUrl" = 'data:' || "mimeType" || ';base64,'
--     || translate(encode("bytes", 'base64'), E'\n', '');
--   ALTER TABLE drawing_files ALTER COLUMN "dataUrl" SET NOT NULL;
--   ALTER TABLE drawing_files ALTER COLUMN "bytes" DROP NOT NULL;
-- The UPDATE rebuilds every dataUrl from bytes; the last line lets the older
-- image, which never writes bytes, save images.
DELETE FROM "drawing_files" WHERE "bytes" IS NULL;--> statement-breakpoint
ALTER TABLE "drawing_files" ALTER COLUMN "bytes" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "drawing_files" DROP COLUMN "dataUrl";--> statement-breakpoint
ALTER TABLE "drawings" DROP COLUMN "thumbnail";
