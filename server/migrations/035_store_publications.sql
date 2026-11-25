ALTER TABLE h5_posts ADD COLUMN store_id CHAR(36) NULL,
  ADD INDEX idx_h5_posts_store (store_id, created_at, id),
  ADD FOREIGN KEY (store_id) REFERENCES h5_stores(id) ON DELETE SET NULL;

ALTER TABLE h5_stories ADD COLUMN store_id CHAR(36) NULL,
  ADD INDEX idx_h5_stories_store (store_id, published_at, id),
  ADD FOREIGN KEY (store_id) REFERENCES h5_stores(id) ON DELETE SET NULL;
