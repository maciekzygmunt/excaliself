-- Personal access tokens for the MCP endpoint. Deleting a member deletes
-- their tokens, so a deleted member's AI client stops working at once.
CREATE TABLE "access_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"name" text NOT NULL,
	"tokenHash" text NOT NULL,
	"start" text NOT NULL,
	"lastUsedAt" timestamp,
	"createdAt" timestamp NOT NULL,
	CONSTRAINT "access_tokens_tokenHash_unique" UNIQUE("tokenHash")
);
--> statement-breakpoint
ALTER TABLE "access_tokens" ADD CONSTRAINT "access_tokens_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;