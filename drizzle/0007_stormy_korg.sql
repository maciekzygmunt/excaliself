-- Rollback note (canvas-sharing spec §3): migrations run on container boot with
-- no down-migrations, and pre-sharing images write isPublic on every drawing
-- insert — rolling back to an old image after this drop breaks drawing
-- creation. Recovery SQL to run manually before such a rollback:
--   ALTER TABLE drawings ADD COLUMN "isPublic" boolean NOT NULL DEFAULT false;
CREATE TABLE "shares" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"drawingId" text NOT NULL,
	"audience" text DEFAULT 'members' NOT NULL,
	"createdAt" timestamp NOT NULL,
	CONSTRAINT "shares_token_unique" UNIQUE("token"),
	CONSTRAINT "shares_drawingId_unique" UNIQUE("drawingId")
);
--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_drawingId_drawings_id_fk" FOREIGN KEY ("drawingId") REFERENCES "public"."drawings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawings" DROP COLUMN "isPublic";