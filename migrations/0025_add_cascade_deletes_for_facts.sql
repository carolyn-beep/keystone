-- Add ON DELETE CASCADE to all FK constraints referencing facts and fact_verifications.
-- This fixes delete failures where child rows (verifications, model scores, feedback)
-- block fact deletion due to NO ACTION FK constraints.

-- 1. fact_verifications.fact_id -> facts.id
ALTER TABLE fact_verifications
  DROP CONSTRAINT fact_verifications_fact_id_facts_id_fk,
  ADD CONSTRAINT fact_verifications_fact_id_facts_id_fk
    FOREIGN KEY (fact_id) REFERENCES facts(id) ON DELETE CASCADE;

-- 2. fact_model_scores.verification_id -> fact_verifications.id
ALTER TABLE fact_model_scores
  DROP CONSTRAINT fact_model_scores_verification_id_fact_verifications_id_fk,
  ADD CONSTRAINT fact_model_scores_verification_id_fact_verifications_id_fk
    FOREIGN KEY (verification_id) REFERENCES fact_verifications(id) ON DELETE CASCADE;

-- 3. llm_feedback.fact_id -> facts.id
ALTER TABLE llm_feedback
  DROP CONSTRAINT llm_feedback_fact_id_facts_id_fk,
  ADD CONSTRAINT llm_feedback_fact_id_facts_id_fk
    FOREIGN KEY (fact_id) REFERENCES facts(id) ON DELETE CASCADE;

-- 4. llm_feedback.verification_id -> fact_verifications.id
ALTER TABLE llm_feedback
  DROP CONSTRAINT llm_feedback_verification_id_fact_verifications_id_fk,
  ADD CONSTRAINT llm_feedback_verification_id_fact_verifications_id_fk
    FOREIGN KEY (verification_id) REFERENCES fact_verifications(id) ON DELETE CASCADE;

-- 5. dok2_fact_relations.fact_id -> facts.id
ALTER TABLE dok2_fact_relations
  DROP CONSTRAINT dok2_fact_relations_fact_id_facts_id_fk,
  ADD CONSTRAINT dok2_fact_relations_fact_id_facts_id_fk
    FOREIGN KEY (fact_id) REFERENCES facts(id) ON DELETE CASCADE;
