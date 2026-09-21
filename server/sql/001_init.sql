-- TopTouge 阶段一建表
--
-- 数据库：MySQL 8（微信云托管的 Serverless MySQL）
-- 字符集：utf8mb4，路线名、评论里有中文，也可能有 emoji
--
-- 关于坐标存储：reference_track / waypoints / start_point 这些用 JSON 列存。
-- 距离、弯道、爬升等几何计算全在应用层做（server/src/geo/），数据库不参与，
-- 所以不需要空间类型或空间索引。将来真要做「附近路线」这类查询再加。

CREATE TABLE IF NOT EXISTS routes (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name                  VARCHAR(64)     NOT NULL,
  vehicle_type          VARCHAR(16)     NOT NULL DEFAULT 'car',
  distance_meters       INT UNSIGNED    NOT NULL DEFAULT 0,

  -- 起终点：{ "lat": 30.1, "lng": 120.2, "radiusMeters": 30 }
  start_point           JSON            NOT NULL,
  end_point             JSON            NOT NULL,
  -- 途经点数组：[ { "name": "观景台", "lat": .., "lng": .. } ]
  waypoints             JSON            NOT NULL,

  -- 全量轨迹（难度计算的数据源）与抽稀轨迹（地图绘制用）
  reference_track       JSON            NOT NULL,
  display_track         JSON            NOT NULL,

  uploaded_by           VARCHAR(64)     NOT NULL,

  curve_count           INT UNSIGNED    NOT NULL DEFAULT 0,
  -- 0~1 的比例，用 DECIMAL 而不是 FLOAT，避免比较时的精度噪声
  sharp_curve_ratio     DECIMAL(5,4)    NOT NULL DEFAULT 0,
  elevation_gain_meters INT UNSIGNED    NOT NULL DEFAULT 0,
  road_width            VARCHAR(16)     NOT NULL,
  difficulty_stars      TINYINT UNSIGNED NOT NULL DEFAULT 1,

  created_at            DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (id),
  -- 列表页按创建时间倒序，加索引避免全表扫
  KEY idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS comments (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  route_id   BIGINT UNSIGNED NOT NULL,
  user_id    VARCHAR(64)     NOT NULL,
  content    VARCHAR(500)    NOT NULL,
  created_at DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (id),
  -- 查询模式固定是「某路线下按时间倒序取 N 条」，做成联合索引
  KEY idx_route_time (route_id, created_at DESC),
  CONSTRAINT fk_comments_route FOREIGN KEY (route_id) REFERENCES routes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS road_conditions (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  route_id   BIGINT UNSIGNED NOT NULL,
  user_id    VARCHAR(64)     NOT NULL,
  content    VARCHAR(500)    NOT NULL,
  created_at DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (id),
  KEY idx_route_time (route_id, created_at DESC),
  CONSTRAINT fk_road_conditions_route FOREIGN KEY (route_id) REFERENCES routes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
