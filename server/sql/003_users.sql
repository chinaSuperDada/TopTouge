-- 003：用户资料
--
-- 身份识别（openid）已经在用了 —— 云托管自动注入 x-wx-openid。
-- 这张表存的是**用户自己填的**资料：昵称和头像。
--
-- 注意：微信从 2022-10-25 起回收了 getUserProfile，
-- 拿不到真实微信昵称头像了。现在的做法是「头像昵称填写能力」——
-- 用户在头像列表里挑一个、自己填昵称，我们只负责存。
--
-- 头像存 base64：选这个是因为小程序 <image> 只能加载公网 URL，
-- 而 callContainer 走微信内网通道加载不了图片。存 base64 就不需要
-- 额外开公网访问或对象存储。客户端会先压到 132x132 再传，约 7KB。
-- 真到瓶颈再换成 URL —— 那时只改 userRepo 的存取，上层不用动。

CREATE TABLE IF NOT EXISTS users (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  -- 与 routes.uploaded_by / run_records.user_id 同一套标识
  user_id    VARCHAR(64)     NOT NULL,

  nick_name  VARCHAR(32)     NOT NULL DEFAULT '',
  -- base64 data URL，形如 data:image/png;base64,xxx
  -- 空串表示没设过，前端回落到首字母色块
  avatar     MEDIUMTEXT      NOT NULL,

  created_at DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (id),
  -- 一个用户一条资料
  UNIQUE KEY uk_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
