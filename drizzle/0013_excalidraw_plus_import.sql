-- Where an imported folder or drawing came from in Excalidraw+, so running
-- the import again skips what it already brought over.
ALTER TABLE "drawings" ADD COLUMN "excalidrawPlusId" text;--> statement-breakpoint
ALTER TABLE "folders" ADD COLUMN "excalidrawPlusId" text;
