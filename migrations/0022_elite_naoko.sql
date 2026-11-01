ALTER TABLE "dok2_summaries" ADD COLUMN "grading_status" text DEFAULT 'graded' NOT NULL;--> statement-breakpoint
ALTER TABLE "facts" ADD COLUMN "grading_status" text DEFAULT 'graded' NOT NULL;