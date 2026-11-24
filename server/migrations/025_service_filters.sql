CREATE TABLE IF NOT EXISTS h5_service_categories (
  id VARCHAR(32) PRIMARY KEY,
  label VARCHAR(4) NOT NULL UNIQUE,
  position SMALLINT UNSIGNED NOT NULL DEFAULT 100,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO h5_service_categories (id,label,position) VALUES
  ('grooming','洗护',10),
  ('boarding','代养',20),
  ('home-service','上门',30),
  ('photography','拍摄',40),
  ('package','套餐',50),
  ('other','其他',99)
ON DUPLICATE KEY UPDATE id=h5_service_categories.id;

SET @store_location_migration = IF(
  EXISTS(SELECT 1 FROM information_schema.columns
    WHERE table_schema=DATABASE() AND table_name='h5_stores' AND column_name='city_code'),
  'DO 0',
  'ALTER TABLE h5_stores
    ADD COLUMN city_code CHAR(6) NULL,
    ADD COLUMN latitude DECIMAL(8,6) NULL,
    ADD COLUMN longitude DECIMAL(9,6) NULL,
    ADD INDEX idx_h5_stores_city (city_code)'
);
PREPARE store_location_migration FROM @store_location_migration;
EXECUTE store_location_migration;
DEALLOCATE PREPARE store_location_migration;
