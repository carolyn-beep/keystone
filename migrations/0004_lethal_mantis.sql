ALTER TABLE "brainlifts" ADD COLUMN "display_purpose" text;--> statement-breakpoint
ALTER TABLE "dok2_summaries" ADD COLUMN "grade" integer;--> statement-breakpoint
ALTER TABLE "dok2_summaries" ADD COLUMN "diagnosis" text;--> statement-breakpoint
ALTER TABLE "dok2_summaries" ADD COLUMN "feedback" text;--> statement-breakpoint
ALTER TABLE "dok2_summaries" ADD COLUMN "graded_at" timestamp;--> statement-breakpoint
ALTER TABLE "dok2_summaries" ADD COLUMN "fail_reason" text;--> statement-breakpoint
ALTER TABLE "dok2_summaries" ADD COLUMN "source_verified" boolean;