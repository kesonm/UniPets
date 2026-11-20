CREATE TABLE IF NOT EXISTS pet_cat_noseprints (
  pet_id CHAR(36) PRIMARY KEY,
  capture_digest BINARY(32) NOT NULL UNIQUE,
  feature_version VARCHAR(96) CHARACTER SET ascii NOT NULL,
  nose_template BLOB NOT NULL,
  FOREIGN KEY (pet_id) REFERENCES pet_identities(pet_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pet_dog_noseprints (
  pet_id CHAR(36) PRIMARY KEY,
  capture_digest BINARY(32) NOT NULL UNIQUE,
  feature_version VARCHAR(96) CHARACTER SET ascii NOT NULL,
  nose_template BLOB NOT NULL,
  FOREIGN KEY (pet_id) REFERENCES pet_identities(pet_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE pet_identities
  MODIFY capture_digest BINARY(32) NULL,
  MODIFY feature_version VARCHAR(96) CHARACTER SET ascii NULL,
  MODIFY nose_template BLOB NULL;

START TRANSACTION;

INSERT INTO pet_cat_noseprints (pet_id, capture_digest, feature_version, nose_template)
SELECT i.pet_id, i.capture_digest, i.feature_version, i.nose_template
FROM pet_identities i
JOIN pets p ON p.id = i.pet_id
LEFT JOIN pet_cat_noseprints n ON n.pet_id = i.pet_id
WHERE p.species = 'cat' AND i.capture_digest IS NOT NULL AND n.pet_id IS NULL;

INSERT INTO pet_dog_noseprints (pet_id, capture_digest, feature_version, nose_template)
SELECT i.pet_id, i.capture_digest, i.feature_version, i.nose_template
FROM pet_identities i
JOIN pets p ON p.id = i.pet_id
LEFT JOIN pet_dog_noseprints n ON n.pet_id = i.pet_id
WHERE p.species = 'dog' AND i.capture_digest IS NOT NULL AND n.pet_id IS NULL;

UPDATE pet_identities i
JOIN pets p ON p.id = i.pet_id
LEFT JOIN pet_cat_noseprints c ON p.species = 'cat' AND c.pet_id = i.pet_id
LEFT JOIN pet_dog_noseprints d ON p.species = 'dog' AND d.pet_id = i.pet_id
SET i.capture_digest = NULL, i.feature_version = NULL, i.nose_template = NULL
WHERE i.capture_digest = COALESCE(c.capture_digest, d.capture_digest)
  AND i.feature_version = COALESCE(c.feature_version, d.feature_version)
  AND i.nose_template = COALESCE(c.nose_template, d.nose_template);

COMMIT;
