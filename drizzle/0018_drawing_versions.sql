CREATE TABLE "drawing_version_files" (
	"drawingId" text NOT NULL,
	"fileId" text NOT NULL,
	"mimeType" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	CONSTRAINT "drawing_version_files_drawingId_fileId_pk" PRIMARY KEY("drawingId","fileId")
);
--> statement-breakpoint
CREATE TABLE "drawing_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"drawingId" text NOT NULL,
	"data" text NOT NULL,
	"fileIds" text[] NOT NULL,
	"savedAt" timestamp NOT NULL,
	"createdAt" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "drawing_version_files" ADD CONSTRAINT "drawing_version_files_drawingId_drawings_id_fk" FOREIGN KEY ("drawingId") REFERENCES "public"."drawings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawing_versions" ADD CONSTRAINT "drawing_versions_drawingId_drawings_id_fk" FOREIGN KEY ("drawingId") REFERENCES "public"."drawings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "drawing_versions_by_drawing" ON "drawing_versions" USING btree ("drawingId","createdAt");