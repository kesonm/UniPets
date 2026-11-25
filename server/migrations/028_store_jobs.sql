CREATE TABLE IF NOT EXISTS h5_store_jobs (
  id CHAR(36) PRIMARY KEY,
  store_id CHAR(36) NOT NULL,
  title VARCHAR(80) NOT NULL,
  category VARCHAR(24) NOT NULL,
  employment_type ENUM('full-time','part-time') NOT NULL,
  salary VARCHAR(40) NOT NULL,
  description TEXT NOT NULL,
  status ENUM('pending','published','rejected','closed') NOT NULL DEFAULT 'pending',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  published_at DATETIME(3) NULL,
  FOREIGN KEY (store_id) REFERENCES h5_stores(id) ON DELETE CASCADE,
  INDEX idx_store_jobs_store (store_id,created_at,id),
  INDEX idx_store_jobs_public (status,published_at,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
