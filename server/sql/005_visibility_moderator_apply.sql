-- 路线公开/私有 + 版主申请
--
-- 这次改动有两个独立的部分，放在一个迁移里是因为它们属于同一次
-- 产品设计（公开的才需要审核，版主负责审自己辖区的公开路线）。

/* ==================== 路线可见性 ==================== */

-- public  —— 进公开列表，需要审核
-- private —— 只有作者自己可见，不审核
ALTER TABLE routes
  ADD COLUMN IF NOT EXISTS visibility VARCHAR(16) NOT NULL DEFAULT 'public';

-- 「我的路线」要按作者+可见性筛，公开列表要按可见性+审核状态筛
CREATE INDEX IF NOT EXISTS idx_visibility ON routes (visibility, review_status);

/* ==================== 版主申请 ==================== */

-- 申请条件：贡献过至少 1 条路线 + 完成过至少 1 次跑山。
-- 条件在提交申请时校验一次并快照下来 —— 之后用户删了路线也不影响
-- 已经提交的申请，否则管理员审批时看到的依据会在脚下变。
CREATE TABLE IF NOT EXISTS moderator_applications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id VARCHAR(64) NOT NULL,

  -- 申请负责的区域
  province VARCHAR(32) NOT NULL,
  city VARCHAR(32) NOT NULL,

  -- 申请理由，选填
  reason VARCHAR(500) NOT NULL DEFAULT '',

  -- 提交时的条件快照
  route_count INT UNSIGNED NOT NULL DEFAULT 0,
  run_count INT UNSIGNED NOT NULL DEFAULT 0,

  -- pending / approved / rejected
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  review_reason VARCHAR(200) NOT NULL DEFAULT '',
  reviewed_by VARCHAR(64) NOT NULL DEFAULT '',
  reviewed_at DATETIME(3) NULL,

  created_at DATETIME(3) NOT NULL,

  PRIMARY KEY (id),
  KEY idx_status (status, created_at),
  KEY idx_user (user_id, created_at),
  KEY idx_region (province, city)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
