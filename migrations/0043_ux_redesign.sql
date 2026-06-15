-- 0043_ux_redesign.sql
--
-- THE single migration file for the entire ux-redesign effort
-- (features/ux-redesign/onboarding-wizard). Later increments EDIT this file
-- in place and reset the local DB; they never add a second migration file.
--
-- Local reset / apply (Docker Postgres, NEVER Neon during development):
--   docker exec -i wizardly_kalam psql -U postgres -d dok1grader_local < migrations/0043_ux_redesign.sql
--
-- Coordination note: the experts.is_following drop below pairs with the
-- code retirement in spec 02-experts-cleanup. Do not apply the drop to a
-- database serving code that still selects is_following.

ALTER TABLE "brainlifts" ADD COLUMN "in_scope" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "brainlifts" ADD COLUMN "out_of_scope" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "brainlifts" ADD COLUMN "onboarding_step" integer;--> statement-breakpoint
ALTER TABLE "experts" DROP COLUMN "is_following";--> statement-breakpoint
-- Starter-pack "Add" promotes a Learning Stream item to Second Brain with no
-- category choice presented, so sources may now be uncategorized (NULL).
ALTER TABLE "sources" ALTER COLUMN "category_id" DROP NOT NULL;
