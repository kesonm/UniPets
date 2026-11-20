CREATE TABLE IF NOT EXISTS h5_posts (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  pet_id CHAR(36) NOT NULL,
  asset_id CHAR(36) NULL,
  title VARCHAR(100) NOT NULL,
  body VARCHAR(3000) NOT NULL DEFAULT '',
  area VARCHAR(40) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE,
  FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE SET NULL,
  INDEX (created_at, id), INDEX (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS h5_reactions (
  post_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  kind ENUM('like', 'favorite') NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (post_id, user_id, kind),
  FOREIGN KEY (post_id) REFERENCES h5_posts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX (post_id, kind, created_at), INDEX (user_id, kind, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
