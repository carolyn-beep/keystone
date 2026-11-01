ALTER TABLE swarm_usage
  ADD COLUMN IF NOT EXISTS run_spec jsonb,
  ADD COLUMN IF NOT EXISTS estimated_usd numeric(10,4);
