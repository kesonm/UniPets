ALTER TABLE assets
  MODIFY COLUMN action VARCHAR(40) NULL,
  ADD COLUMN motion_from_asset_id CHAR(36) NULL,
  ADD COLUMN motion_to_asset_id CHAR(36) NULL,
  ADD COLUMN motion_joinable BOOLEAN NULL;
ALTER TABLE generation_actions MODIFY COLUMN action VARCHAR(40) NOT NULL;
ALTER TABLE generation_jobs
  ADD COLUMN motion_key VARCHAR(40) NULL,
  ADD COLUMN end_asset_id CHAR(36) NULL,
  ADD FOREIGN KEY (end_asset_id) REFERENCES assets(id) ON DELETE SET NULL;
CREATE TABLE motion_poses (
  pet_id CHAR(36) NOT NULL, pose_key VARCHAR(40) NOT NULL, asset_id CHAR(36) NOT NULL,
  PRIMARY KEY (pet_id, pose_key),
  FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE,
  FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
