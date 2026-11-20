ALTER TABLE users
  ADD COLUMN wechat_appid VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD COLUMN wechat_openid VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD UNIQUE KEY uq_users_wechat (wechat_appid, wechat_openid);
