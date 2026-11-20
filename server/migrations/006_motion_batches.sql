ALTER TABLE generation_jobs
  MODIFY COLUMN mode ENUM('image','video','motion_batch') NOT NULL DEFAULT 'image',
  ADD COLUMN batch_id CHAR(36) NULL,
  ADD COLUMN reused_asset_id CHAR(36) NULL,
  ADD COLUMN planned_units TINYINT UNSIGNED NULL,
  ADD COLUMN transparent_output BOOLEAN NULL,
  ADD FOREIGN KEY (batch_id) REFERENCES generation_jobs(id) ON DELETE CASCADE;
ALTER TABLE generation_actions ADD COLUMN submitted_at DATETIME(3) NULL;
