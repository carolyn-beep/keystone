-- Pangram V3 response fields.
-- Adds documented response metadata and segment counts from
-- https://docs.pangram.com/api-reference/ai-detection.

ALTER TABLE "pangram_assessments"
  ADD COLUMN IF NOT EXISTS "version" text,
  ADD COLUMN IF NOT EXISTS "num_ai_segments" integer,
  ADD COLUMN IF NOT EXISTS "num_ai_assisted_segments" integer,
  ADD COLUMN IF NOT EXISTS "num_human_segments" integer,
  ADD COLUMN IF NOT EXISTS "dashboard_link" text;
