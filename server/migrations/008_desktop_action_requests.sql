CREATE TABLE desktop_action_requests (
  user_id CHAR(36) PRIMARY KEY,
  id CHAR(36) NOT NULL,
  pet_id CHAR(36) NOT NULL,
  action VARCHAR(40) NOT NULL,
  status ENUM('queued','playing','completed','failed') NOT NULL DEFAULT 'queued',
  claimed_by CHAR(64) NULL,
  error VARCHAR(240) NULL,
  expires_at DATETIME(3) NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
