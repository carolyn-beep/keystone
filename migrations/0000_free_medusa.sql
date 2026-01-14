CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brainlift_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"brainlift_id" integer NOT NULL,
	"version_number" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"source_type" text NOT NULL,
	"snapshot" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brainlifts" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"author" text,
	"created_by_user_id" text,
	"classification" text DEFAULT 'brainlift' NOT NULL,
	"rejection_reason" text,
	"rejection_subtype" text,
	"rejection_recommendation" text,
	"flags" text[],
	"improperly_formatted" boolean DEFAULT false NOT NULL,
	"original_content" text,
	"source_type" text,
	"expert_diagnostics" jsonb,
	"summary" jsonb NOT NULL,
	CONSTRAINT "brainlifts_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "contradiction_clusters" (
	"id" serial PRIMARY KEY NOT NULL,
	"brainlift_id" integer NOT NULL,
	"name" text NOT NULL,
	"tension" text NOT NULL,
	"status" text NOT NULL,
	"fact_ids" text[] NOT NULL,
	"claims" text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "experts" (
	"id" serial PRIMARY KEY NOT NULL,
	"brainlift_id" integer NOT NULL,
	"name" text NOT NULL,
	"rank_score" integer NOT NULL,
	"rationale" text NOT NULL,
	"source" text NOT NULL,
	"twitter_handle" text,
	"is_following" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fact_model_scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"verification_id" integer NOT NULL,
	"model" text NOT NULL,
	"score" integer,
	"rationale" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "fact_redundancy_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"brainlift_id" integer NOT NULL,
	"group_name" text NOT NULL,
	"fact_ids" integer[] NOT NULL,
	"primary_fact_id" integer,
	"similarity_score" text NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fact_verifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"fact_id" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"evidence_url" text,
	"evidence_content" text,
	"evidence_fetched_at" timestamp,
	"evidence_error" text,
	"consensus_score" integer,
	"confidence_level" text,
	"needs_review" boolean DEFAULT false NOT NULL,
	"verification_notes" text,
	"human_override_score" integer,
	"human_override_notes" text,
	"human_override_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "facts" (
	"id" serial PRIMARY KEY NOT NULL,
	"brainlift_id" integer NOT NULL,
	"original_id" text NOT NULL,
	"category" text NOT NULL,
	"source" text,
	"fact" text NOT NULL,
	"summary" text,
	"score" integer NOT NULL,
	"contradicts" text,
	"note" text,
	"flags" text[],
	"is_gradeable" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_feedback" (
	"id" serial PRIMARY KEY NOT NULL,
	"verification_id" integer NOT NULL,
	"fact_id" integer NOT NULL,
	"llm_model" text NOT NULL,
	"llm_score" integer NOT NULL,
	"human_score" integer NOT NULL,
	"score_difference" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_accuracy_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"model" text NOT NULL,
	"total_samples" integer DEFAULT 0 NOT NULL,
	"total_absolute_error" integer DEFAULT 0 NOT NULL,
	"mean_absolute_error" text DEFAULT '0' NOT NULL,
	"weight" text DEFAULT '1' NOT NULL,
	"last_updated" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "model_accuracy_stats_model_unique" UNIQUE("model")
);
--> statement-breakpoint
CREATE TABLE "reading_list_grades" (
	"id" serial PRIMARY KEY NOT NULL,
	"reading_list_item_id" integer NOT NULL,
	"aligns" text,
	"contradicts" text,
	"new_info" text,
	"quality" integer
);
--> statement-breakpoint
CREATE TABLE "reading_list_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"brainlift_id" integer NOT NULL,
	"type" text NOT NULL,
	"author" text NOT NULL,
	"topic" text NOT NULL,
	"time" text NOT NULL,
	"facts" text NOT NULL,
	"url" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "source_feedback" (
	"id" serial PRIMARY KEY NOT NULL,
	"brainlift_id" integer NOT NULL,
	"source_id" text NOT NULL,
	"source_type" text NOT NULL,
	"title" text NOT NULL,
	"snippet" text NOT NULL,
	"url" text NOT NULL,
	"decision" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brainlift_versions" ADD CONSTRAINT "brainlift_versions_brainlift_id_brainlifts_id_fk" FOREIGN KEY ("brainlift_id") REFERENCES "public"."brainlifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brainlifts" ADD CONSTRAINT "brainlifts_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contradiction_clusters" ADD CONSTRAINT "contradiction_clusters_brainlift_id_brainlifts_id_fk" FOREIGN KEY ("brainlift_id") REFERENCES "public"."brainlifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experts" ADD CONSTRAINT "experts_brainlift_id_brainlifts_id_fk" FOREIGN KEY ("brainlift_id") REFERENCES "public"."brainlifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_model_scores" ADD CONSTRAINT "fact_model_scores_verification_id_fact_verifications_id_fk" FOREIGN KEY ("verification_id") REFERENCES "public"."fact_verifications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_redundancy_groups" ADD CONSTRAINT "fact_redundancy_groups_brainlift_id_brainlifts_id_fk" FOREIGN KEY ("brainlift_id") REFERENCES "public"."brainlifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_verifications" ADD CONSTRAINT "fact_verifications_fact_id_facts_id_fk" FOREIGN KEY ("fact_id") REFERENCES "public"."facts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facts" ADD CONSTRAINT "facts_brainlift_id_brainlifts_id_fk" FOREIGN KEY ("brainlift_id") REFERENCES "public"."brainlifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_feedback" ADD CONSTRAINT "llm_feedback_verification_id_fact_verifications_id_fk" FOREIGN KEY ("verification_id") REFERENCES "public"."fact_verifications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_feedback" ADD CONSTRAINT "llm_feedback_fact_id_facts_id_fk" FOREIGN KEY ("fact_id") REFERENCES "public"."facts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_list_grades" ADD CONSTRAINT "reading_list_grades_reading_list_item_id_reading_list_items_id_fk" FOREIGN KEY ("reading_list_item_id") REFERENCES "public"."reading_list_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_list_items" ADD CONSTRAINT "reading_list_items_brainlift_id_brainlifts_id_fk" FOREIGN KEY ("brainlift_id") REFERENCES "public"."brainlifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_feedback" ADD CONSTRAINT "source_feedback_brainlift_id_brainlifts_id_fk" FOREIGN KEY ("brainlift_id") REFERENCES "public"."brainlifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");