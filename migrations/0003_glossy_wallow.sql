CREATE TABLE "dok2_fact_relations" (
	"id" serial PRIMARY KEY NOT NULL,
	"summary_id" integer NOT NULL,
	"fact_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dok2_points" (
	"id" serial PRIMARY KEY NOT NULL,
	"summary_id" integer NOT NULL,
	"text" text NOT NULL,
	"sort_order" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "dok2_summaries" (
	"id" serial PRIMARY KEY NOT NULL,
	"brainlift_id" integer NOT NULL,
	"category" text NOT NULL,
	"source_name" text NOT NULL,
	"source_url" text,
	"workflowy_node_id" text,
	"source_workflowy_node_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dok2_fact_relations" ADD CONSTRAINT "dok2_fact_relations_summary_id_dok2_summaries_id_fk" FOREIGN KEY ("summary_id") REFERENCES "public"."dok2_summaries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dok2_fact_relations" ADD CONSTRAINT "dok2_fact_relations_fact_id_facts_id_fk" FOREIGN KEY ("fact_id") REFERENCES "public"."facts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dok2_points" ADD CONSTRAINT "dok2_points_summary_id_dok2_summaries_id_fk" FOREIGN KEY ("summary_id") REFERENCES "public"."dok2_summaries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dok2_summaries" ADD CONSTRAINT "dok2_summaries_brainlift_id_brainlifts_id_fk" FOREIGN KEY ("brainlift_id") REFERENCES "public"."brainlifts"("id") ON DELETE no action ON UPDATE no action;