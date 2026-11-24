ALTER TABLE users
  ADD COLUMN public_number MEDIUMINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ADD UNIQUE KEY uq_users_public_number (public_number);
