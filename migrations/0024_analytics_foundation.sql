ALTER TABLE "brainlifts" ADD COLUMN "origin" text;--> statement-breakpoint
ALTER TABLE "facts" ADD COLUMN "created_at" timestamp;--> statement-breakpoint
UPDATE "facts" SET "created_at" = "brainlifts"."created_at"
FROM "brainlifts"
WHERE "facts"."brainlift_id" = "brainlifts"."id" AND "facts"."created_at" IS NULL;--> statement-breakpoint
ALTER TABLE "facts" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "facts" ALTER COLUMN "created_at" SET NOT NULL;--> statement-breakpoint

CREATE TABLE "brainlift_score_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"brainlift_id" integer NOT NULL,
	"owner_user_id" text,
	"origin" text,
	"window_started_at" timestamp NOT NULL,
	"last_event_at" timestamp NOT NULL,
	"event_count" integer DEFAULT 1 NOT NULL,
	"trigger_set" text[] NOT NULL,
	"start_overall_score" text NOT NULL,
	"end_overall_score" text NOT NULL,
	"peak_overall_score" text NOT NULL,
	"trough_overall_score" text NOT NULL,
	"start_fact_count" integer NOT NULL,
	"end_fact_count" integer NOT NULL,
	"peak_recorded_at" timestamp NOT NULL,
	"trough_recorded_at" timestamp NOT NULL
);--> statement-breakpoint
ALTER TABLE "brainlift_score_log" ADD CONSTRAINT "brainlift_score_log_brainlift_id_brainlifts_id_fk" FOREIGN KEY ("brainlift_id") REFERENCES "public"."brainlifts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brainlift_score_log" ADD CONSTRAINT "brainlift_score_log_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brainlift_score_log_brainlift_last_event_idx" ON "brainlift_score_log" USING btree ("brainlift_id","last_event_at");--> statement-breakpoint

CREATE TABLE "brainlift_score_summary" (
	"brainlift_id" integer PRIMARY KEY NOT NULL,
	"first_score" text NOT NULL,
	"first_recorded_at" timestamp NOT NULL,
	"latest_score" text NOT NULL,
	"latest_recorded_at" timestamp NOT NULL,
	"peak_score" text NOT NULL,
	"peak_recorded_at" timestamp NOT NULL,
	"total_events" integer DEFAULT 0 NOT NULL,
	"total_windows" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "brainlift_score_summary" ADD CONSTRAINT "brainlift_score_summary_brainlift_id_brainlifts_id_fk" FOREIGN KEY ("brainlift_id") REFERENCES "public"."brainlifts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brainlift_score_summary_latest_idx" ON "brainlift_score_summary" USING btree ("latest_recorded_at");--> statement-breakpoint

CREATE TABLE "qa_batches" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"is_baseline" boolean DEFAULT false NOT NULL,
	"baseline_batch_id" integer,
	"sample_count" integer DEFAULT 0 NOT NULL,
	"metrics" jsonb,
	"artifact_label" text,
	"error" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "qa_batches" ADD CONSTRAINT "qa_batches_baseline_batch_id_qa_batches_id_fk" FOREIGN KEY ("baseline_batch_id") REFERENCES "public"."qa_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "qa_batches_type_status_idx" ON "qa_batches" USING btree ("type","status");--> statement-breakpoint

CREATE TABLE "verification_truth_set" (
	"id" serial PRIMARY KEY NOT NULL,
	"batch_id" integer NOT NULL,
	"asset_key" text NOT NULL,
	"dok_level" integer NOT NULL,
	"stable_key" text NOT NULL,
	"brainlift_id" integer,
	"item_id" integer,
	"frozen_context" jsonb NOT NULL,
	"ai_score" integer,
	"human_score" integer,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "verification_truth_set" ADD CONSTRAINT "verification_truth_set_batch_id_qa_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."qa_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_truth_set" ADD CONSTRAINT "verification_truth_set_brainlift_id_brainlifts_id_fk" FOREIGN KEY ("brainlift_id") REFERENCES "public"."brainlifts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "verification_truth_set_unique" ON "verification_truth_set" USING btree ("batch_id","asset_key","dok_level","stable_key");--> statement-breakpoint
CREATE INDEX "verification_truth_set_batch_key_idx" ON "verification_truth_set" USING btree ("batch_id","asset_key","dok_level","stable_key");--> statement-breakpoint

INSERT INTO "brainlift_score_log" (
  "brainlift_id",
  "owner_user_id",
  "origin",
  "window_started_at",
  "last_event_at",
  "event_count",
  "trigger_set",
  "start_overall_score",
  "end_overall_score",
  "peak_overall_score",
  "trough_overall_score",
  "start_fact_count",
  "end_fact_count",
  "peak_recorded_at",
  "trough_recorded_at"
)
SELECT
  b."id",
  b."created_by_user_id",
  b."origin",
  b."created_at",
  b."created_at",
  1,
  ARRAY['import']::text[],
  COALESCE(b."summary"->>'meanScore', '0'),
  COALESCE(b."summary"->>'meanScore', '0'),
  COALESCE(b."summary"->>'meanScore', '0'),
  COALESCE(b."summary"->>'meanScore', '0'),
  COALESCE((b."summary"->>'totalFacts')::integer, 0),
  COALESCE((b."summary"->>'totalFacts')::integer, 0),
  b."created_at",
  b."created_at"
FROM "brainlifts" b
ON CONFLICT DO NOTHING;--> statement-breakpoint

INSERT INTO "brainlift_score_summary" (
  "brainlift_id",
  "first_score",
  "first_recorded_at",
  "latest_score",
  "latest_recorded_at",
  "peak_score",
  "peak_recorded_at",
  "total_events",
  "total_windows",
  "updated_at"
)
SELECT
  b."id",
  COALESCE(b."summary"->>'meanScore', '0'),
  b."created_at",
  COALESCE(b."summary"->>'meanScore', '0'),
  b."created_at",
  COALESCE(b."summary"->>'meanScore', '0'),
  b."created_at",
  1,
  1,
  now()
FROM "brainlifts" b
ON CONFLICT DO NOTHING;--> statement-breakpoint
