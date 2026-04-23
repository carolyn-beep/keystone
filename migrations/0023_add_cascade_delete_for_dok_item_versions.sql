ALTER TABLE dok_item_versions
  DROP CONSTRAINT dok_item_versions_brainlift_id_brainlifts_id_fk,
  ADD CONSTRAINT dok_item_versions_brainlift_id_brainlifts_id_fk
    FOREIGN KEY (brainlift_id) REFERENCES brainlifts(id) ON DELETE CASCADE;
