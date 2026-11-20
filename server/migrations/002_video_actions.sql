ALTER TABLE assets
  ADD COLUMN sprite_columns SMALLINT UNSIGNED NULL,
  ADD COLUMN sprite_rows SMALLINT UNSIGNED NULL,
  ADD COLUMN fps DOUBLE NULL,
  ADD COLUMN duration_seconds DOUBLE NULL,
  ADD COLUMN source_video_key VARCHAR(80) NULL;
ALTER TABLE generation_jobs
  ADD COLUMN mode ENUM('image','video') NOT NULL DEFAULT 'image',
  ADD COLUMN duration_seconds TINYINT UNSIGNED NOT NULL DEFAULT 3,
  ADD COLUMN fps TINYINT UNSIGNED NOT NULL DEFAULT 12,
  ADD COLUMN model VARCHAR(100) NULL,
  ADD COLUMN phase VARCHAR(100) NOT NULL DEFAULT '';
CREATE TABLE generation_actions (
  job_id CHAR(36) NOT NULL,
  action ENUM('idle','happy','walk','sleep') NOT NULL,
  status ENUM('queued','submitting','generating','processing','completed','failed') NOT NULL DEFAULT 'queued',
  provider_task_id VARCHAR(200) NULL,
  error VARCHAR(400) NULL,
  poll_failures INT UNSIGNED NOT NULL DEFAULT 0,
  next_poll_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (job_id, action),
  FOREIGN KEY (job_id) REFERENCES generation_jobs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE UNIQUE INDEX asset_job_action ON assets (job_id, action);
