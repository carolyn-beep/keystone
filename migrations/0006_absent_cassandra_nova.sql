CREATE TABLE "brainlift_shares" (
	"id" serial PRIMARY KEY NOT NULL,
	"brainlift_id" integer NOT NULL,
	"type" text NOT NULL,
	"permission" text NOT NULL,
	"user_id" text,
	"token" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by_user_id" text NOT NULL,
	CONSTRAINT "brainlift_shares_token_unique" UNIQUE("token"),
	CONSTRAINT "unique_user_share" UNIQUE("brainlift_id","user_id"),
	CONSTRAINT "valid_type" CHECK ("brainlift_shares"."type" IN ('user', 'token')),
	CONSTRAINT "valid_permission" CHECK ("brainlift_shares"."permission" IN ('viewer', 'editor')),
	CONSTRAINT "user_share_has_user_id" CHECK (
    ("brainlift_shares"."type" = 'user' AND "brainlift_shares"."user_id" IS NOT NULL AND "brainlift_shares"."token" IS NULL) OR
    ("brainlift_shares"."type" = 'token' AND "brainlift_shares"."token" IS NOT NULL AND "brainlift_shares"."user_id" IS NULL)
  )
);
--> statement-breakpoint
ALTER TABLE "brainlift_shares" ADD CONSTRAINT "brainlift_shares_brainlift_id_brainlifts_id_fk" FOREIGN KEY ("brainlift_id") REFERENCES "public"."brainlifts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brainlift_shares" ADD CONSTRAINT "brainlift_shares_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brainlift_shares" ADD CONSTRAINT "brainlift_shares_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_brainlift_shares_brainlift_id" ON "brainlift_shares" USING btree ("brainlift_id");--> statement-breakpoint
CREATE INDEX "idx_brainlift_shares_user_id" ON "brainlift_shares" USING btree ("user_id") WHERE "brainlift_shares"."user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_brainlift_shares_token" ON "brainlift_shares" USING btree ("token") WHERE "brainlift_shares"."token" IS NOT NULL;