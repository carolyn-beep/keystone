CREATE TABLE "dok_item_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"dok_level" integer NOT NULL,
	"item_id" integer NOT NULL,
	"brainlift_id" integer NOT NULL,
	"version_number" integer NOT NULL,
	"text_content" text NOT NULL,
	"score" integer,
	"feedback" text,
	"diagnosis" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "dok_item_versions_unique" UNIQUE("dok_level","item_id","version_number")
);
--> statement-breakpoint
ALTER TABLE "dok2_summaries" ADD COLUMN "is_stale" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "dok2_summaries" ADD COLUMN "stale_reason" text;--> statement-breakpoint
ALTER TABLE "dok2_summaries" ADD COLUMN "updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "dok3_insights" ADD COLUMN "is_stale" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "dok3_insights" ADD COLUMN "stale_reason" text;--> statement-breakpoint
ALTER TABLE "dok3_insights" ADD COLUMN "updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "dok4_spovs" ADD COLUMN "is_stale" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "dok4_spovs" ADD COLUMN "stale_reason" text;--> statement-breakpoint
ALTER TABLE "dok4_spovs" ADD COLUMN "updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "facts" ADD COLUMN "is_stale" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "facts" ADD COLUMN "stale_reason" text;--> statement-breakpoint
ALTER TABLE "facts" ADD COLUMN "updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "dok_item_versions" ADD CONSTRAINT "dok_item_versions_brainlift_id_brainlifts_id_fk" FOREIGN KEY ("brainlift_id") REFERENCES "public"."brainlifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_dok_item_versions_brainlift" ON "dok_item_versions" USING btree ("brainlift_id");