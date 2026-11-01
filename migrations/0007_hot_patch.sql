CREATE TABLE "learning_stream_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"brainlift_id" integer NOT NULL,
	"type" text NOT NULL,
	"author" text NOT NULL,
	"topic" text NOT NULL,
	"time" text NOT NULL,
	"facts" text NOT NULL,
	"url" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"source" text NOT NULL,
	"quality" integer,
	"alignment" text,
	"relevance_score" text,
	"ai_rationale" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "learning_stream_items" ADD CONSTRAINT "learning_stream_items_brainlift_id_brainlifts_id_fk" FOREIGN KEY ("brainlift_id") REFERENCES "public"."brainlifts"("id") ON DELETE cascade ON UPDATE no action;