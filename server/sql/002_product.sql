-- 002：为产品化补齐的字段与新表
--
-- 001 是阶段一的骨架，只够跑通「上传-展示-评论」。
-- 这一版补上产品化需要的东西：区域、路型、热度、审核状态，
-- 以及跑山成绩、收藏、活动位、版主四张新表。
--
-- 全部用 IF NOT EXISTS / ADD COLUMN，可重复执行 ——
-- 云端已经跑过 001，不能再改它，必须靠新增迁移文件往前推。

/* ==================== routes 补字段 ==================== */

-- 区域：列表页按省市筛选，版主按市管理
ALTER TABLE routes
  ADD COLUMN IF NOT EXISTS province VARCHAR(32) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS city VARCHAR(32) NOT NULL DEFAULT '';

-- 路型：山路 / 赛道 / 非铺装 / 公路。
-- 与 road_width 是两个维度 —— road_width 是宽窄，这个是路面类型
ALTER TABLE routes
  ADD COLUMN IF NOT EXISTS road_type VARCHAR(16) NOT NULL DEFAULT 'mountain';

-- 热度：用于「热度最高」排序。真实场景由浏览/收藏/跑山次数算出，
-- 现在先存一个累计值，定时任务重算
ALTER TABLE routes
  ADD COLUMN IF NOT EXISTS heat INT UNSIGNED NOT NULL DEFAULT 0;

-- 审核状态：有版主的城市走 pending，没版主的直接 approved
ALTER TABLE routes
  ADD COLUMN IF NOT EXISTS review_status VARCHAR(16) NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS review_reason VARCHAR(200) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR(64) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS reviewed_at DATETIME(3) NULL;

-- 版主置顶
ALTER TABLE routes
  ADD COLUMN IF NOT EXISTS pinned TINYINT(1) NOT NULL DEFAULT 0;

-- 列表页的筛选与排序都建立在这几列上
CREATE INDEX IF NOT EXISTS idx_region ON routes (province, city);
CREATE INDEX IF NOT EXISTS idx_review ON routes (review_status, created_at);
CREATE INDEX IF NOT EXISTS idx_heat ON routes (heat);

/* ==================== 跑山成绩 ==================== */

CREATE TABLE IF NOT EXISTS run_records (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  route_id           BIGINT UNSIGNED NOT NULL,
  user_id            VARCHAR(64)     NOT NULL,
  vehicle_type       VARCHAR(16)     NOT NULL DEFAULT 'car',

  -- 原始轨迹点，形如 [{lat,lng,altitude,speed,timestamp}]
  -- 任务书要求 72 小时后清空这个字段（保留分数和排名）
  -- 所以允许为 NULL，清理任务执行后置空
  raw_track_points   JSON            NULL,

  -- recording / completed / invalid
  status             VARCHAR(16)     NOT NULL DEFAULT 'completed',

  -- 对外展示的两个数字
  score              SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  rank_no            INT UNSIGNED    NOT NULL DEFAULT 0,

  -- 内部字段，不对外展示。任务书明确要求结果页不能出现时间
  total_time_seconds INT UNSIGNED    NOT NULL DEFAULT 0,

  created_at         DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires_at         DATETIME(3)     NULL,

  PRIMARY KEY (id),
  -- 算分要查「该路线所有有效记录按用时排序」——这条查询很频繁，索引必须有
  KEY idx_route_time (route_id, total_time_seconds),
  -- 清理任务按 expires_at 扫
  KEY idx_expires (expires_at),
  KEY idx_user (user_id, created_at),
  CONSTRAINT fk_runs_route FOREIGN KEY (route_id) REFERENCES routes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

/* ==================== 收藏 ==================== */

CREATE TABLE IF NOT EXISTS favorites (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    VARCHAR(64)     NOT NULL,
  route_id   BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (id),
  -- 同一个人不能重复收藏同一条路线
  UNIQUE KEY uk_user_route (user_id, route_id),
  KEY idx_user (user_id, created_at),
  CONSTRAINT fk_fav_route FOREIGN KEY (route_id) REFERENCES routes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

/* ==================== 活动位 ==================== */

CREATE TABLE IF NOT EXISTS banners (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

  -- 三种来源，生命周期和权限完全不同：
  --   algorithm  算法生成（本周最热、离你最近…），不落库，查询时算
  --   platform   平台活动，官方运营创建，全平台可见
  --   moderator  版主活动，只能管自己辖区
  source      VARCHAR(16)     NOT NULL,

  title       VARCHAR(64)     NOT NULL,
  subtitle    VARCHAR(64)     NOT NULL DEFAULT '',
  tag         VARCHAR(16)     NOT NULL DEFAULT '',
  image       VARCHAR(255)    NOT NULL DEFAULT '',
  -- 没有海报图时的兜底配色
  color       VARCHAR(16)     NOT NULL DEFAULT '#1f6feb',
  -- 点击去向，比如 /pages/route-detail/route-detail?id=3
  link        VARCHAR(255)    NOT NULL DEFAULT '',

  -- 区域：algorithm 和 moderator 需要，platform 留空表示全局
  province    VARCHAR(32)     NOT NULL DEFAULT '',
  city        VARCHAR(32)     NOT NULL DEFAULT '',

  -- 有效期。algorithm 类型的为空 —— 它的内容每次查询时动态算
  starts_at   DATETIME(3)     NULL,
  ends_at     DATETIME(3)     NULL,

  -- 人工排序权重，越大越靠前
  priority    INT             NOT NULL DEFAULT 0,

  -- draft / published / offline
  status      VARCHAR(16)     NOT NULL DEFAULT 'draft',
  created_by  VARCHAR(64)     NOT NULL DEFAULT '',

  created_at  DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (id),
  -- 首页查询固定是「某区域 + 已发布 + 有效期内 + 按优先级排」
  KEY idx_query (status, province, city, priority),
  KEY idx_window (starts_at, ends_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

/* ==================== 版主 ==================== */

CREATE TABLE IF NOT EXISTS moderators (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     VARCHAR(64)     NOT NULL,
  province    VARCHAR(32)     NOT NULL,
  city        VARCHAR(32)     NOT NULL,

  -- 权限范围：早期只有审核与内容管理，留字段方便以后细分
  -- 形如 ["review","pin","activity"]
  permissions JSON            NOT NULL,

  granted_by  VARCHAR(64)     NOT NULL DEFAULT 'system',
  created_at  DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (id),
  -- 一个人在同一个城市只能当一次版主
  UNIQUE KEY uk_user_city (user_id, province, city),
  -- 查「这个城市有哪些版主」——审核时和活动查询都要用
  KEY idx_city (province, city)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

/* ==================== 数据回填 ==================== */

-- 加列时给了默认值 ''，已有数据的 province/city 就是空的 ——
-- 按区域筛选会一条都查不到。
--
-- 这里按路线名回填 mock 数据的区域。只 UPDATE 还没有区域的行，
-- 重复执行不会覆盖已经填好的值（幂等）。
UPDATE routes SET province = '浙江省', city = '杭州市'
 WHERE province = '' AND name IN ('九曲发夹弯', '一线天盘山道');

UPDATE routes SET province = '浙江省', city = '湖州市'
 WHERE province = '' AND name = '西山缓坡环线';
