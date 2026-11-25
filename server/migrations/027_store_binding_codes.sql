CREATE TABLE IF NOT EXISTS h5_store_binding_codes (
  code CHAR(12) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  slot TINYINT UNSIGNED NULL UNIQUE,
  used_at DATETIME(3) NULL,
  CHECK (slot BETWEEN 1 AND 10),
  CHECK ((slot IS NULL) = (used_at IS NOT NULL))
) ENGINE=InnoDB;

INSERT INTO h5_store_binding_codes (code,slot)
SELECT HEX(RANDOM_BYTES(6)), slots.number FROM (
  SELECT 1 AS number UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5
  UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9 UNION ALL SELECT 10
) AS slots LEFT JOIN h5_store_binding_codes active ON active.slot=slots.number
WHERE active.slot IS NULL;

SET @store_registration_ddl = IF(
  EXISTS(SELECT 1 FROM information_schema.columns
    WHERE table_schema=DATABASE() AND table_name='h5_stores' AND column_name='registration_key'),
  'DO 0',
  'ALTER TABLE h5_stores ADD COLUMN registration_key BINARY(32) NULL UNIQUE'
);
PREPARE store_registration_ddl FROM @store_registration_ddl;
EXECUTE store_registration_ddl;
DEALLOCATE PREPARE store_registration_ddl;
