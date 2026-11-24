ALTER TABLE h5_posts
  ADD COLUMN pet_type ENUM('cat','dog','rabbit','other') NULL,
  MODIFY COLUMN topic ENUM('daily','travel','rescue','help') NOT NULL DEFAULT 'daily';

ALTER TABLE h5_stores
  ADD COLUMN district_code VARCHAR(32) NULL,
  ADD INDEX idx_h5_stores_district (district_code);

CREATE TABLE h5_service_likes (
  item_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  PRIMARY KEY (item_id, user_id),
  FOREIGN KEY (item_id) REFERENCES h5_catalog_items(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE h5_service_comments (
  id CHAR(36) PRIMARY KEY,
  item_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  body VARCHAR(500) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (item_id) REFERENCES h5_catalog_items(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_h5_service_comments_item (item_id, created_at, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
