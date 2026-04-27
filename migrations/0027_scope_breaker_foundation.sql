ALTER TABLE "brainlifts" ADD COLUMN "gdrive_root_folder_id" text;
--> statement-breakpoint

CREATE TABLE "plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"brainlift_id" integer NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"gdrive_folder_id" text,
	"generation_error" text,
	"generation_started_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by_user_id" text NOT NULL,
	CONSTRAINT "plans_valid_status" CHECK ("plans"."status" IN ('active', 'complete', 'generating', 'failed'))
);
--> statement-breakpoint

CREATE TABLE "tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_id" integer NOT NULL,
	"brainlift_id" integer NOT NULL,
	"scheduled_date" date NOT NULL,
	"week_number" integer NOT NULL,
	"day_in_week" integer NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"milestone" text,
	CONSTRAINT "tasks_valid_week_number" CHECK ("tasks"."week_number" >= 1),
	CONSTRAINT "tasks_valid_day_in_week" CHECK ("tasks"."day_in_week" >= 1 AND "tasks"."day_in_week" <= 7),
	CONSTRAINT "tasks_valid_milestone" CHECK ("tasks"."milestone" IS NULL OR "tasks"."milestone" IN ('weekly_artifact'))
);
--> statement-breakpoint

CREATE TABLE "deliverables" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer NOT NULL,
	"brainlift_id" integer NOT NULL,
	"title" text NOT NULL,
	"doc_file_id" text NOT NULL,
	"doc_url" text NOT NULL,
	"source_surface" text DEFAULT 'ui' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by_user_id" text NOT NULL,
	CONSTRAINT "deliverables_task_id_unique" UNIQUE ("task_id"),
	CONSTRAINT "deliverables_valid_source_surface" CHECK ("deliverables"."source_surface" IN ('mcp', 'ui'))
);
--> statement-breakpoint

CREATE TABLE "platform_config" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

ALTER TABLE "plans" ADD CONSTRAINT "plans_brainlift_id_brainlifts_id_fk" FOREIGN KEY ("brainlift_id") REFERENCES "public"."brainlifts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_brainlift_id_brainlifts_id_fk" FOREIGN KEY ("brainlift_id") REFERENCES "public"."brainlifts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_brainlift_id_brainlifts_id_fk" FOREIGN KEY ("brainlift_id") REFERENCES "public"."brainlifts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

CREATE INDEX "plans_brainlift_id_idx" ON "plans" USING btree ("brainlift_id");
--> statement-breakpoint
CREATE INDEX "plans_status_idx" ON "plans" USING btree ("status");
--> statement-breakpoint
CREATE UNIQUE INDEX "plans_one_active_per_brainlift_idx" ON "plans" USING btree ("brainlift_id") WHERE "plans"."status" IN ('active', 'generating');
--> statement-breakpoint

CREATE INDEX "tasks_plan_id_idx" ON "tasks" USING btree ("plan_id");
--> statement-breakpoint
CREATE INDEX "tasks_brainlift_id_idx" ON "tasks" USING btree ("brainlift_id");
--> statement-breakpoint
CREATE INDEX "tasks_scheduled_date_idx" ON "tasks" USING btree ("scheduled_date");
--> statement-breakpoint

CREATE INDEX "deliverables_brainlift_id_idx" ON "deliverables" USING btree ("brainlift_id");
