require('dotenv').config()

/**
 * 集中读取环境变量，带默认值。
 * 其他模块只认这里的字段，不直接读 process.env。
 */
const config = {
  port: Number(process.env.PORT) || 3000,

  // 阶段一不做登录，用固定测试用户
  testUserId: process.env.TEST_USER_ID || 'test-user-001',

  /**
   * 数据源：
   *   memory —— 内存 mock，本地开发默认。重启即重置，不用起数据库。
   *   mysql  —— 真实数据库，线上部署用。
   */
  dataSource: process.env.DATA_SOURCE || 'memory',

  /**
   * MySQL 连接配置。
   *
   * 云托管的内网 MySQL 会注入带 MYSQL_ 前缀的环境变量，
   * 但不同版本的注入名不完全一致，这里几种常见写法都兜一下，
   * 最后回落到手动配置的 DB_* 。
   */
  mysql: {
    host: process.env.DB_HOST || process.env.MYSQL_ADDRESS?.split(':')[0] || 'localhost',
    port: Number(
      process.env.DB_PORT || process.env.MYSQL_ADDRESS?.split(':')[1] || 3306
    ),
    user: process.env.DB_USER || process.env.MYSQL_USERNAME || 'root',
    password: process.env.DB_PASSWORD || process.env.MYSQL_PASSWORD || '',
    database: process.env.DB_NAME || process.env.MYSQL_DATABASE || 'toptouge',
    // 云托管内网不需要 SSL，公网连接按需开
    ssl: process.env.DB_SSL === 'true'
  }
}

module.exports = config
