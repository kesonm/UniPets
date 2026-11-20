CREATE TABLE IF NOT EXISTS h5_catalog_items (
  id CHAR(36) PRIMARY KEY,
  module ENUM('immortality','services','friends','charity','shop','medical','travel','education') NOT NULL,
  category VARCHAR(32) NOT NULL,
  kind ENUM('article','appointment','enrollment','product','group','link') NOT NULL,
  title VARCHAR(120) NOT NULL,
  provider VARCHAR(120) NOT NULL DEFAULT '',
  description TEXT NOT NULL,
  area VARCHAR(40) NULL,
  venue VARCHAR(160) NULL,
  starts_at DATETIME(3) NULL,
  closes_at DATETIME(3) NULL,
  price_cents INT UNSIGNED NULL,
  stock INT UNSIGNED NULL,
  external_url VARCHAR(500) NULL,
  published BOOLEAN NOT NULL DEFAULT FALSE,
  CHECK (kind <> 'product' OR (price_cents BETWEEN 1 AND 10000000 AND stock IS NOT NULL)),
  CHECK (starts_at IS NULL OR closes_at IS NULL OR closes_at <= starts_at),
  INDEX (published, module, category, starts_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS h5_engagements (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  item_id CHAR(36) NOT NULL,
  pet_id CHAR(36) NULL,
  subject_key VARCHAR(36) NOT NULL,
  note VARCHAR(500) NOT NULL DEFAULT '',
  status ENUM('requested','joined','confirmed','completed','cancelled') NOT NULL,
  checked_in_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES h5_catalog_items(id),
  FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE,
  UNIQUE KEY (user_id, item_id, subject_key),
  INDEX (user_id, created_at),
  INDEX (item_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS h5_orders (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  request_key CHAR(36) NOT NULL,
  status ENUM('submitted','confirmed','completed','cancelled') NOT NULL DEFAULT 'submitted',
  total_cents BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY (user_id, request_key),
  INDEX (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS h5_order_items (
  order_id CHAR(36) NOT NULL,
  item_id CHAR(36) NOT NULL,
  title VARCHAR(120) NOT NULL,
  provider VARCHAR(120) NOT NULL,
  unit_cents INT UNSIGNED NOT NULL,
  quantity SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (order_id, item_id),
  FOREIGN KEY (order_id) REFERENCES h5_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES h5_catalog_items(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS h5_order_support (
  order_id CHAR(36) PRIMARY KEY,
  message VARCHAR(500) NOT NULL,
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (order_id) REFERENCES h5_orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS h5_pet_health (
  id CHAR(36) PRIMARY KEY,
  pet_id CHAR(36) NOT NULL,
  kind ENUM('exam','consultation','medicine','care') NOT NULL,
  happened_on DATE NOT NULL,
  title VARCHAR(100) NOT NULL,
  note VARCHAR(1500) NOT NULL DEFAULT '',
  FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE,
  INDEX (pet_id, happened_on, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS h5_memorials (
  pet_id CHAR(36) PRIMARY KEY,
  title VARCHAR(100) NOT NULL,
  remembrance VARCHAR(3000) NOT NULL DEFAULT '',
  cover_asset_id CHAR(36) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE,
  FOREIGN KEY (cover_asset_id) REFERENCES assets(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS h5_memorial_entries (
  id CHAR(36) PRIMARY KEY,
  pet_id CHAR(36) NOT NULL,
  kind ENUM('message','candle','tribute') NOT NULL,
  body VARCHAR(500) NOT NULL DEFAULT '',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (pet_id) REFERENCES h5_memorials(pet_id) ON DELETE CASCADE,
  INDEX (pet_id, created_at, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS h5_stories (
  id CHAR(36) PRIMARY KEY,
  pet_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  cover_asset_id CHAR(36) NULL,
  title VARCHAR(100) NOT NULL,
  scenes JSON NOT NULL,
  published_at DATETIME(3) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (cover_asset_id) REFERENCES assets(id) ON DELETE SET NULL,
  INDEX (published_at, id),
  INDEX (user_id, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS h5_story_reactions (
  story_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  kind ENUM('like','favorite') NOT NULL,
  PRIMARY KEY (story_id, user_id, kind),
  FOREIGN KEY (story_id) REFERENCES h5_stories(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX (user_id, kind, story_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS h5_wallet_entries (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  pet_id CHAR(36) NULL,
  currency ENUM('points','coins') NOT NULL,
  quantity INT NOT NULL,
  label VARCHAR(120) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CHECK (quantity <> 0),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE SET NULL,
  INDEX (user_id, created_at),
  INDEX (user_id, pet_id, currency)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS h5_post_comments (
  id CHAR(36) PRIMARY KEY,
  post_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  body VARCHAR(500) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (post_id) REFERENCES h5_posts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX (post_id, created_at, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS h5_match_profiles (
  pet_id CHAR(36) PRIMARY KEY,
  area VARCHAR(40) NOT NULL,
  intent ENUM('friends','dating','both') NOT NULL,
  introduction VARCHAR(300) NOT NULL DEFAULT '',
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE,
  INDEX (area, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS h5_friend_requests (
  id CHAR(36) PRIMARY KEY,
  source_pet_id CHAR(36) NOT NULL,
  target_pet_id CHAR(36) NOT NULL,
  status ENUM('pending','accepted','declined') NOT NULL DEFAULT 'pending',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (source_pet_id) REFERENCES pets(id) ON DELETE CASCADE,
  FOREIGN KEY (target_pet_id) REFERENCES pets(id) ON DELETE CASCADE,
  UNIQUE KEY (source_pet_id, target_pet_id),
  INDEX (target_pet_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS h5_group_messages (
  id CHAR(36) PRIMARY KEY,
  group_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  body VARCHAR(500) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (group_id) REFERENCES h5_catalog_items(id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX (group_id, created_at, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS h5_creators (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL UNIQUE,
  bio VARCHAR(1000) NOT NULL DEFAULT '',
  published BOOLEAN NOT NULL DEFAULT FALSE,
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX (published, featured)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
