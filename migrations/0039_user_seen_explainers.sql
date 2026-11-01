-- Per-user explainer-seen flag for the DOK Rubric Explainer Modal.
-- JSONB array of explainer keys (e.g. ["dok1"]). Append-only set semantics.
-- Default '[]' backfills all existing users (they will be treated as first-time
-- viewers and auto-shown the explainer once, per the FEATURE.md rollout decision).

ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS "seen_explainers" jsonb DEFAULT '[]'::jsonb NOT NULL;
