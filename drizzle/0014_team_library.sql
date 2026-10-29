-- The team library: one row per Library panel item, shared by every member.
CREATE TABLE "library_items" (
	"id" text PRIMARY KEY NOT NULL,
	"item" jsonb NOT NULL,
	"seq" integer GENERATED ALWAYS AS IDENTITY (sequence name "library_items_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1)
);
