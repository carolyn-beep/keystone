CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"brainlift_id" integer NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dok2_summaries" ALTER COLUMN "category" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "facts" ALTER COLUMN "category" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "dok2_summaries" ADD COLUMN "learning_stream_item_id" integer;--> statement-breakpoint
ALTER TABLE "facts" ADD COLUMN "learning_stream_item_id" integer;--> statement-breakpoint
ALTER TABLE "learning_stream_items" ADD COLUMN "category_id" integer;--> statement-breakpoint
ALTER TABLE "native_brainlift_details" ADD COLUMN "phase3_celebrated_at" timestamp;--> statement-breakpoint
ALTER TABLE "native_brainlift_details" ADD COLUMN "category_suggestion" jsonb;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_brainlift_id_brainlifts_id_fk" FOREIGN KEY ("brainlift_id") REFERENCES "public"."brainlifts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "categories_brainlift_id_idx" ON "categories" USING btree ("brainlift_id");--> statement-breakpoint
ALTER TABLE "dok2_summaries" ADD CONSTRAINT "dok2_summaries_learning_stream_item_id_learning_stream_items_id_fk" FOREIGN KEY ("learning_stream_item_id") REFERENCES "public"."learning_stream_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facts" ADD CONSTRAINT "facts_learning_stream_item_id_learning_stream_items_id_fk" FOREIGN KEY ("learning_stream_item_id") REFERENCES "public"."learning_stream_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_stream_items" ADD CONSTRAINT "learning_stream_items_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_dok2_summaries_learning_stream_item_id" ON "dok2_summaries" USING btree ("learning_stream_item_id");--> statement-breakpoint
CREATE INDEX "idx_facts_learning_stream_item_id" ON "facts" USING btree ("learning_stream_item_id");