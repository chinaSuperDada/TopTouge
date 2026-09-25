const config = require('../config')

/**
 * 确保数据库存在。
 *
 * 云托管的 MySQL 开通后只建系统库，业务库要自己创建。
 * 这个函数让 `npm run init` 能一步到位，不用去控制台手点。
 *
 * 幂等：用 CREATE DATABASE IF NOT EXISTS，已存在时 MySQL 只给个 warning，
 * 不会报错也不会清空数据 —— 这点很重要，初始化脚本绝不能在库已存在时
 * 覆盖任何东西。
 *
 * @returns {Promise<{created: boolean, name: string}>} created 表示这次是否真的建了
 */
async function ensureDatabase() {
  const { createConnectionWithoutDatabase } = require('./pool')
  const name = config.mysql.database

  // 库名会拼进 SQL（DDL 不支持参数化占位符），所以必须校验，
  // 防止配置里填了奇怪的东西造成注入。
  if (!/^[A-Za-z0-9_]{1,64}$/.test(name)) {
    throw new Error(
      `数据库名 "${name}" 不合法：只允许字母、数字、下划线，且不超过 64 字符`
    )
  }

  const conn = await createConnectionWithoutDatabase()
  try {
    // 先查是否已存在，这样能准确回报「新建了」还是「本来就有」
    const [rows] = await conn.query(
      'SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?',
      [name]
    )
    const existed = rows.length > 0

    if (existed) {
      return { created: false, name }
    }

    // 用 utf8mb4 支持中文与 emoji；排序规则与建表时保持一致
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS \`${name}\` ` +
        'CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
    )
    return { created: true, name }
  } finally {
    await conn.end()
  }
}

module.exports = { ensureDatabase }
