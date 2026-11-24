SET @store_binding_ddl = IF(
  EXISTS(SELECT 1 FROM information_schema.columns
    WHERE table_schema=DATABASE() AND table_name='h5_stores' AND column_name='owner_user_id'),
  'DO 0',
  'ALTER TABLE h5_stores
    ADD COLUMN owner_user_id CHAR(36) NULL,
    ADD COLUMN binding_code_hash BINARY(32) NULL,
    ADD COLUMN binding_code_expires_at DATETIME(3) NULL,
    ADD INDEX idx_h5_stores_owner (owner_user_id),
    ADD UNIQUE KEY uq_h5_stores_binding_code (binding_code_hash),
    ADD FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL'
);
PREPARE store_binding_ddl FROM @store_binding_ddl;
EXECUTE store_binding_ddl;
DEALLOCATE PREPARE store_binding_ddl;

SET @service_publisher_ddl = IF(
  EXISTS(SELECT 1 FROM information_schema.columns
    WHERE table_schema=DATABASE() AND table_name='h5_catalog_items' AND column_name='publisher_user_id'),
  'DO 0',
  'ALTER TABLE h5_catalog_items
    ADD COLUMN publisher_user_id CHAR(36) NULL,
    ADD INDEX idx_h5_catalog_publisher (publisher_user_id,module,updated_at),
    ADD FOREIGN KEY (publisher_user_id) REFERENCES users(id) ON DELETE SET NULL'
);
PREPARE service_publisher_ddl FROM @service_publisher_ddl;
EXECUTE service_publisher_ddl;
DEALLOCATE PREPARE service_publisher_ddl;
