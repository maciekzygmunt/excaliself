-- Canvas sharing (spec §3): shares table + drop of the never-used
-- drawings.isPublic in one step. Migrations run on boot with no
-- down-migrations, and pre-sharing images insert isPublic on every drawing
-- creation — so rolling back to an older image requires this manual restore
-- first:
--   ALTER TABLE drawings ADD COLUMN "isPublic" boolean NOT NULL DEFAULT false;
CREATE TABLE "shares" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"drawingId" text NOT NULL,
	"audience" text DEFAULT 'members' NOT NULL,
	"createdAt" timestamp NOT NULL,
	CONSTRAINT "shares_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_drawingId_drawings_id_fk" FOREIGN KEY ("drawingId") REFERENCES "public"."drawings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "shares_one_link_per_drawing" ON "shares" USING btree ("drawingId");--> statement-breakpoint
ALTER TABLE "drawings" DROP COLUMN "isPublic";