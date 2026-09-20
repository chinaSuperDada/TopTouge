require('dotenv').config()

/**
 * 集中读取环境变量，带默认值。
 * 其他模块只认这里的字段，不直接读 process.env。
 */
const config = {
  port: Number(process.env.PORT) || 3000,

  // 阶段一不做登录，用固定测试用户
  testUserId: process.env.TEST_USER_ID || 'test-user-001',

  // 数据源：memory（当前）| postgres（后续接入）
  dataSource: process.env.DATA_SOURCE || 'memory'
}

module.exports = config
