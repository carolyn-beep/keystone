-- DOK3 Insights - Cross-source insights linking multiple DOK2 summaries
CREATE TABLE dok3_insights (
  id SERIAL PRIMARY KEY,
  brainlift_id INTEGER NOT NULL REFERENCES brainlifts(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  workflowy_node_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending_linking',  -- pending_linking | linked | grading | graded | scratchpadded | error
  score INTEGER,                    -- final 1-5, null = ungraded
  framework_name TEXT,
  framework_description TEXT,
  criteria_breakdown JSONB,         -- { V1: { assessment, evidence }, ... }
  rationale TEXT,
  feedback TEXT,
  foundation_integrity_index NUMERIC(3,2),
  dok1_foundation_score NUMERIC(3,2),
  dok2_synthesis_score NUMERIC(3,2),
  traceability_flagged BOOLEAN DEFAULT FALSE,
  traceability_flagged_source TEXT,
  evaluator_model TEXT,
  source_rankings JSONB,            -- { "source-name": 0.87, "other-source": 0.42, ... }
  graded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- DOK3 Insight Links (many-to-many: insight ↔ dok2_summary)
CREATE TABLE dok3_insight_links (
  id SERIAL PRIMARY KEY,
  insight_id INTEGER NOT NULL REFERENCES dok3_insights(id) ON DELETE CASCADE,
  dok2_summary_id INTEGER NOT NULL REFERENCES dok2_summaries(id) ON DELETE CASCADE,
  UNIQUE(insight_id, dok2_summary_id)
);

CREATE INDEX idx_dok3_insights_brainlift ON dok3_insights(brainlift_id);
CREATE INDEX idx_dok3_insight_links_insight ON dok3_insight_links(insight_id);
CREATE INDEX idx_dok3_insight_links_dok2 ON dok3_insight_links(dok2_summary_id);
