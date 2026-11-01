-- Per-model token pricing (USD per 1k tokens), the source of truth for cost
-- estimation. Seeded once from server/ai/learning-stream-swarm-v2/cost-prices.json
-- when empty (see loadModelPrices), then kept current by the monthly
-- `models:refresh-prices` cron via the OpenRouter pricing API.

CREATE TABLE IF NOT EXISTS "model_prices" (
  "model_id"              text PRIMARY KEY,
  "prompt_usd_per_1k"     double precision NOT NULL,
  "completion_usd_per_1k" double precision NOT NULL,
  "updated_at"            timestamp NOT NULL DEFAULT now()
);
