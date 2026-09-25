require('dotenv').config()

/**
 * 集中读取环境变量，带默认值。
 * 其他模块只认这里的字段，不直接读 process.env。
 */

/**
 * 是不是在跑单元测试。
 *
 * node --test 会设 NODE_TEST_CONTEXT 环境变量。
 * 测试必须走内存 —— 那些用例依赖 store.reset() 这类内存专有操作，
 * 连真数据库既慢又会污染数据（api.test.js 会真的写评论进去）。
 */
const isTest = Boolean(process.env.NODE_TEST_CONTEXT) || process.env.NODE_ENV === 'test'

const config = {
  port: Number(process.env.PORT) || 3000,

  // 阶段一不做登录，用固定测试用户
  testUserId: process.env.TEST_USER_ID || 'test-user-001',

  /**
   * 数据源：
   *   memory —— 内存 mock，本地开发默认。重启即重置，不用起数据库。
   *   mysql  —— 真实数据库，线上部署用。
   *
   * 测试环境无条件用内存，不受 .env 里的 DATA_SOURCE 影响 ——
   * 否则本地开发把 .env 配成 mysql 后，跑测试会连真库并写入脏数据。
   */
  dataSource: isTest ? 'memory' : process.env.DATA_SOURCE || 'memory',

  /**
   * MySQL 连接配置。
   *
   * 云托管的 MySQL 连接信息**不是自动注入的** —— 需要在服务设置里
   * 手动配置 MYSQL_ADDRESS / MYSQL_USERNAME / MYSQL_PASSWORD，
   * 值从控制台的 MySQL 页面取（内网地址形如 10.0.0.3:3306）。
   *
   * 这里同时兼容 DB_* 前缀，方便本地开发和连公网数据库时用。
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
