-- Readability rewrite integration (spec 03-rewrite-integration).
-- Adds nullable *_raw columns holding the grader's original long field; the
-- existing column now holds the rewritten/user-facing text. Adds the
-- readability_rewrite_metrics table (one row per rewrite attempt).

ALTER TABLE "facts"           ADD COLUMN IF NOT EXISTS "note_raw"      text;
ALTER TABLE "dok2_summaries"  ADD COLUMN IF NOT EXISTS "diagnosis_raw" text;
ALTER TABLE "dok3_insights"   ADD COLUMN IF NOT EXISTS "rationale_raw" text;
ALTER TABLE "dok4_spovs"      ADD COLUMN IF NOT EXISTS "rationale_raw" text;

CREATE TABLE IF NOT EXISTS "readability_rewrite_metrics" (
  "id"            serial PRIMARY KEY,
  "dok_level"     integer NOT NULL,
  "item_id"       integer NOT NULL,
  "brainlift_id"  integer REFERENCES "brainlifts"("id") ON DELETE SET NULL,
  "rewritten"     boolean NOT NULL,
  "reason"        text,
  "fk_before"     double precision,
  "fk_after"      double precision,
  "words_before"  integer,
  "words_after"   integer,
  "rounds"        integer,
  "model"         text,
  "recorded_at"   timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "readability_rewrite_metrics_brainlift_idx"
  ON "readability_rewrite_metrics" ("brainlift_id");
CREATE INDEX IF NOT EXISTS "readability_rewrite_metrics_level_idx"
  ON "readability_rewrite_metrics" ("dok_level");
