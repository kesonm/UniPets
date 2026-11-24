ALTER TABLE users
  ADD COLUMN avatar_version CHAR(16) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD COLUMN avatar_image MEDIUMBLOB NULL;
