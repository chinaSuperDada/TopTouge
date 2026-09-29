-- 客户端错误日志。
--
-- 前端不把技术错误展示给用户，而是上报到这里由管理员排查。
-- 只写不读的业务表 —— 没有面向用户的读接口，管理员直接查库。
--
-- 写入量取决于线上出错频率，正常应该很少。但一旦客户端出现
-- 循环报错（比如某个页面每次打开都失败），这张表会涨得很快，
-- 所以加个时间索引方便定期清理。

CREATE TABLE IF NOT EXISTS client_errors (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

  -- 出错的人。可能为空 —— 请求还没走到身份解析就失败了
  user_id VARCHAR(64) NOT NULL DEFAULT '',

  -- 客户端自定义的短错误码，如 REQUEST_FAILED / UPLOAD_FAILED
  code VARCHAR(64) NOT NULL DEFAULT '',

  -- 给管理员看的错误摘要
  message VARCHAR(500) NOT NULL DEFAULT '',

  -- 技术细节：errMsg、堆栈。**只给管理员看，不给用户看**
  detail TEXT,

  -- 出错时用户在哪、在干什么
  page VARCHAR(128) NOT NULL DEFAULT '',
  method VARCHAR(8) NOT NULL DEFAULT '',
  url VARCHAR(512) NOT NULL DEFAULT '',
  status_code INT NULL,

  -- 环境。排查时要靠它区分是哪个版本、什么机型出的问题
  env_version VARCHAR(16) NOT NULL DEFAULT '',
  platform VARCHAR(32) NOT NULL DEFAULT '',
  brand VARCHAR(64) NOT NULL DEFAULT '',
  model VARCHAR(64) NOT NULL DEFAULT '',
  system VARCHAR(64) NOT NULL DEFAULT '',
  sdk_version VARCHAR(32) NOT NULL DEFAULT '',

  -- 兜底的附加信息，JSON 字符串
  extra TEXT,

  created_at DATETIME(3) NOT NULL,

  PRIMARY KEY (id),
  KEY idx_created (created_at),
  KEY idx_code (code, created_at),
  KEY idx_user (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
