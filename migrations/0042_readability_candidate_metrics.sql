-- Readability observability (spec 06-readability-observability).
-- Adds the best/last candidate's achieved FK/words to readability_rewrite_metrics,
-- so analytics can show attempted -> achieved even on the fallbacks that still
-- persist the grader original. fk_after/words_after keep meaning "persisted text".

ALTER TABLE "readability_rewrite_metrics" ADD COLUMN IF NOT EXISTS "candidate_fk"    double precision;
ALTER TABLE "readability_rewrite_metrics" ADD COLUMN IF NOT EXISTS "candidate_words" integer;
