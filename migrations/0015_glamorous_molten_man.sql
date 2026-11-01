CREATE TABLE "dok4_dok3_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"spov_id" integer NOT NULL,
	"dok3_insight_id" integer NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	CONSTRAINT "dok4_dok3_links_unique" UNIQUE("spov_id","dok3_insight_id")
);
--> statement-breakpoint
CREATE TABLE "dok4_spovs" (
	"id" serial PRIMARY KEY NOT NULL,
	"brainlift_id" integer NOT NULL,
	"text" text NOT NULL,
	"workflowy_node_id" text,
	"status" text DEFAULT 'pending_linking' NOT NULL,
	"rejection_reason" text,
	"rejection_category" text,
	"foundation_integrity_index" text,
	"dok1_foundation_score" text,
	"dok2_foundation_score" text,
	"dok3_foundation_score" text,
	"foundation_ceiling" integer,
	"traceability_flagged" boolean DEFAULT false,
	"traceability_flagged_source" text,
	"traceability_overlap_summary" text,
	"divergence_question" text,
	"divergence_vanilla_response" text,
	"quality_score_raw" integer,
	"score" integer,
	"position_summary" text,
	"framework_dependency" text,
	"key_evidence" jsonb,
	"vulnerability_points" jsonb,
	"criteria_breakdown" jsonb,
	"rationale" text,
	"feedback" text,
	"antimemetic_assessment" jsonb,
	"evaluator_model" text,
	"graded_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "dok3_insights" ADD COLUMN "linking_flagged" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "dok4_dok3_links" ADD CONSTRAINT "dok4_dok3_links_spov_id_dok4_spovs_id_fk" FOREIGN KEY ("spov_id") REFERENCES "public"."dok4_spovs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dok4_dok3_links" ADD CONSTRAINT "dok4_dok3_links_dok3_insight_id_dok3_insights_id_fk" FOREIGN KEY ("dok3_insight_id") REFERENCES "public"."dok3_insights"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dok4_spovs" ADD CONSTRAINT "dok4_spovs_brainlift_id_brainlifts_id_fk" FOREIGN KEY ("brainlift_id") REFERENCES "public"."brainlifts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_dok4_dok3_links_spov" ON "dok4_dok3_links" USING btree ("spov_id");--> statement-breakpoint
CREATE INDEX "idx_dok4_dok3_links_dok3" ON "dok4_dok3_links" USING btree ("dok3_insight_id");--> statement-breakpoint
CREATE INDEX "idx_dok4_spovs_brainlift" ON "dok4_spovs" USING btree ("brainlift_id");