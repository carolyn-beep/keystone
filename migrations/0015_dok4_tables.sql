-- DOK4 Tables Migration
-- Creates dok4_spovs and dok4_dok3_links tables for DOK4 grading

-- DOK4 SPOVs table
CREATE TABLE IF NOT EXISTS dok4_spovs (
  id SERIAL PRIMARY KEY,
  brainlift_id INTEGER NOT NULL REFERENCES brainlifts(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  workflowy_node_id TEXT,

  -- Status
  status TEXT NOT NULL DEFAULT 'pending_linking',

  -- POV Validation (Step 1)
  rejection_reason TEXT,
  rejection_category TEXT,

  -- Foundation Integrity (Step 2)
  foundation_integrity_index TEXT,
  dok1_foundation_score TEXT,
  dok2_foundation_score TEXT,
  dok3_foundation_score TEXT,
  foundation_ceiling INTEGER,

  -- Traceability (Step 3)
  traceability_flagged BOOLEAN DEFAULT FALSE,
  traceability_flagged_source TEXT,
  traceability_overlap_summary TEXT,

  -- Divergence (Step 4)
  divergence_question TEXT,
  divergence_vanilla_response TEXT,

  -- Quality Evaluation (Step 5)
  quality_score_raw INTEGER,
  score INTEGER,
  position_summary TEXT,
  framework_dependency TEXT,
  key_evidence JSONB,
  vulnerability_points JSONB,
  criteria_breakdown JSONB,
  rationale TEXT,
  feedback TEXT,

  -- Antimemetic Assessment (Step 6)
  antimemetic_assessment JSONB,

  -- Metadata
  evaluator_model TEXT,
  graded_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dok4_spovs_brainlift ON dok4_spovs(brainlift_id);

-- DOK4 -> DOK3 Links
CREATE TABLE IF NOT EXISTS dok4_dok3_links (
  id SERIAL PRIMARY KEY,
  spov_id INTEGER NOT NULL REFERENCES dok4_spovs(id) ON DELETE CASCADE,
  dok3_insight_id INTEGER NOT NULL REFERENCES dok3_insights(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE(spov_id, dok3_insight_id)
);

CREATE INDEX IF NOT EXISTS idx_dok4_dok3_links_spov ON dok4_dok3_links(spov_id);
CREATE INDEX IF NOT EXISTS idx_dok4_dok3_links_dok3 ON dok4_dok3_links(dok3_insight_id);
