-- Members links dropped by a move to Team leave a token → drawing row, so a
-- signed-in member who opens the old link lands on the drawing.
CREATE TABLE "share_redirects" (
	"token" text PRIMARY KEY NOT NULL,
	"drawingId" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "share_redirects" ADD CONSTRAINT "share_redirects_drawingId_drawings_id_fk" FOREIGN KEY ("drawingId") REFERENCES "public"."drawings"("id") ON DELETE cascade ON UPDATE no action;