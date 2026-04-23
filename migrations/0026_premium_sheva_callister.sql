CREATE TABLE "grader_monitoring_sets" (
	"id" serial PRIMARY KEY NOT NULL,
	"monitored_slugs" text[] NOT NULL,
	"schedule_timezone" text DEFAULT 'America/Sao_Paulo' NOT NULL,
	"drift_representative" text DEFAULT 'pass1' NOT NULL,
	"snapshot_version" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"frozen_at" timestamp,
	"created_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "grader_monitoring_sets" ADD CONSTRAINT "grader_monitoring_sets_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "grader_monitoring_sets_active_idx" ON "grader_monitoring_sets" USING btree ("active");
--> statement-breakpoint

CREATE TABLE "grader_monitoring_brainlifts" (
	"id" serial PRIMARY KEY NOT NULL,
	"monitoring_set_id" integer NOT NULL,
	"snapshot_version" integer NOT NULL,
	"source_brainlift_id" integer,
	"source_slug" text NOT NULL,
	"title" text NOT NULL,
	"purpose" text NOT NULL,
	"overall_score" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "grader_monitoring_brainlifts_unique" UNIQUE("monitoring_set_id","snapshot_version","source_slug")
);
--> statement-breakpoint
ALTER TABLE "grader_monitoring_brainlifts" ADD CONSTRAINT "grader_monitoring_brainlifts_monitoring_set_id_grader_monitoring_sets_id_fk" FOREIGN KEY ("monitoring_set_id") REFERENCES "public"."grader_monitoring_sets"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "grader_monitoring_brainlifts" ADD CONSTRAINT "grader_monitoring_brainlifts_source_brainlift_id_brainlifts_id_fk" FOREIGN KEY ("source_brainlift_id") REFERENCES "public"."brainlifts"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "grader_monitoring_brainlifts_set_idx" ON "grader_monitoring_brainlifts" USING btree ("monitoring_set_id","snapshot_version");
--> statement-breakpoint

CREATE TABLE "grader_monitoring_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"monitoring_set_id" integer NOT NULL,
	"snapshot_version" integer NOT NULL,
	"week_start" timestamp NOT NULL,
	"timezone" text DEFAULT 'America/Sao_Paulo' NOT NULL,
	"trigger_kind" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"representative_pass" integer DEFAULT 1 NOT NULL,
	"metrics" jsonb,
	"drift_metrics" jsonb,
	"error" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "grader_monitoring_runs_unique" UNIQUE("monitoring_set_id","snapshot_version","week_start")
);
--> statement-breakpoint
ALTER TABLE "grader_monitoring_runs" ADD CONSTRAINT "grader_monitoring_runs_monitoring_set_id_grader_monitoring_sets_id_fk" FOREIGN KEY ("monitoring_set_id") REFERENCES "public"."grader_monitoring_sets"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "grader_monitoring_runs_completed_idx" ON "grader_monitoring_runs" USING btree ("completed_at");
--> statement-breakpoint
CREATE INDEX "grader_monitoring_runs_set_week_idx" ON "grader_monitoring_runs" USING btree ("monitoring_set_id","snapshot_version","week_start");
--> statement-breakpoint

CREATE TABLE "grader_monitoring_pass_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer NOT NULL,
	"pass_number" integer NOT NULL,
	"brainlift_stable_key" text NOT NULL,
	"level" text NOT NULL,
	"stable_key" text NOT NULL,
	"score" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "grader_monitoring_pass_results_unique" UNIQUE("run_id","pass_number","brainlift_stable_key","level","stable_key")
);
--> statement-breakpoint
ALTER TABLE "grader_monitoring_pass_results" ADD CONSTRAINT "grader_monitoring_pass_results_run_id_grader_monitoring_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."grader_monitoring_runs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "grader_monitoring_pass_results_run_pass_idx" ON "grader_monitoring_pass_results" USING btree ("run_id","pass_number");
