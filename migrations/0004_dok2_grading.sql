-- DOK2 Grading: Add grading fields to dok2_summaries table
-- Evaluates whether owner truly synthesized DOK1 facts through their unique lens

ALTER TABLE "dok2_summaries" ADD COLUMN "grade" integer;--> statement-breakpoint
ALTER TABLE "dok2_summaries" ADD COLUMN "diagnosis" text;--> statement-breakpoint
ALTER TABLE "dok2_summaries" ADD COLUMN "feedback" text;--> statement-breakpoint
ALTER TABLE "dok2_summaries" ADD COLUMN "graded_at" timestamp;--> statement-breakpoint
ALTER TABLE "dok2_summaries" ADD COLUMN "fail_reason" text;--> statement-breakpoint
ALTER TABLE "dok2_summaries" ADD COLUMN "source_verified" boolean;
