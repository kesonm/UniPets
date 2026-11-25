CREATE TABLE IF NOT EXISTS h5_service_post_images (
  item_id CHAR(36) NOT NULL,
  position TINYINT UNSIGNED NOT NULL,
  image MEDIUMBLOB NOT NULL,
  PRIMARY KEY (item_id,position),
  FOREIGN KEY (item_id) REFERENCES h5_catalog_items(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
