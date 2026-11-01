-- Pangram AI Writing Signal: polymorphic per-item assessments.
-- See features/integrity/pangram-ai-detection/decisions.md.

CREATE TABLE IF NOT EXISTS "pangram_assessments" (
  "id"                    serial PRIMARY KEY,
  "entity_type"           text NOT NULL,
  "entity_id"             integer NOT NULL,
  "brainlift_id"          integer NOT NULL REFERENCES "brainlifts"("id") ON DELETE CASCADE,
  "text_hash"             text NOT NULL,
  "prediction_short"      text,
  "fraction_ai"           numeric,
  "fraction_ai_assisted"  numeric,
  "fraction_human"        numeric,
  "headline"              text,
  "prediction"            text,
  "windows"               jsonb,
  "status"                text NOT NULL DEFAULT 'pending',
  "error_message"         text,
  "analyzed_at"           timestamp,
  "created_at"            timestamp NOT NULL DEFAULT now(),
  "updated_at"            timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "pangram_assessments_entity_type_valid"
    CHECK ("entity_type" IN ('dok2_summary', 'dok3_insight', 'dok4_spov')),
  CONSTRAINT "pangram_assessments_status_valid"
    CHECK ("status" IN ('pending', 'analyzing', 'done', 'error'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "pangram_assessments_entity_unique"
  ON "pangram_assessments" ("entity_type", "entity_id");

CREATE INDEX IF NOT EXISTS "pangram_assessments_brainlift_idx"
  ON "pangram_assessments" ("brainlift_id");
