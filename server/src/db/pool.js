const mysql = require('mysql2/promise')
const config = require('../config')

/**
 * MySQL 连接池。
 *
 * 只在 DATA_SOURCE=mysql 时才会被 require 到实际使用，
 * 本地开发走内存时这个模块即使加载也不会建连接（懒加载）。
 */

let pool = null

function getPool() {
  if (pool) return pool

  pool = mysql.createPool({
    host: config.mysql.host,
    port: config.mysql.port,
    user: config.mysql.user,
    password: config.mysql.password,
    database: config.mysql.database,

    // 云托管的内网 MySQL 通常不需要 SSL；本地/公网连接受环境限制时再开
    ssl: config.mysql.ssl ? { rejectUnauthorized: false } : undefined,

    // 连接池大小。云托管容器内存有限，别开太大
    connectionLimit: 5,
    waitForConnections: true,
    queueLimit: 0,

    // 时间是 UTC 存储，取出来也用 UTC，避免容器时区差异导致时间错乱
    timezone: 'Z',

    // JSON 列自动解析成对象，省得每处都 JSON.parse
    // 注意：mysql2 只在类型明确是 JSON 时才解析，见下面的 normalize 处理
    supportBigNumbers: true,
    bigNumberStrings: false
  })

  return pool
}

/** 关掉连接池，测试或进程退出时用 */
async function closePool() {
  if (pool) {
    await pool.end()
    pool = null
  }
}

/**
 * 健康检查用的连通性测试。
 *
 * 失败时把连接参数和完整错误都打出来 —— 排查数据库连不上的问题时，
 * 只有一句「连接失败」等于没有线索。密码要脱敏，其余照实打印。
 *
 * @returns {Promise<boolean>}
 */
async function ping() {
  try {
    const conn = await getPool().getConnection()
    await conn.ping()
    conn.release()
    return true
  } catch (err) {
    console.error('[mysql] 连接失败')
    console.error('[mysql] 使用的连接参数:', describeConnection())
    console.error('[mysql] 错误明细:', describeError(err))
    return false
  }
}

/** 连接参数摘要，密码脱敏 */
function describeConnection() {
  const c = config.mysql
  return {
    host: c.host,
    port: c.port,
    user: c.user,
    database: c.database,
    password: c.password ? `已设置(${c.password.length}位)` : '空',
    ssl: c.ssl
  }
}

/**
 * mysql2 的错误对象有的字段不在 message 里 ——
 * 比如认证失败时 message 可能是空的，真正的原因在 code / errno 里。
 * 所以把常见字段都摊开打印。
 */
function describeError(err) {
  if (!err) return '(无错误对象)'
  return {
    code: err.code,
    errno: err.errno,
    sqlState: err.sqlState,
    sqlMessage: err.sqlMessage,
    message: err.message || '(空)',
    // 云托管注入的变量名有多个版本，把实际读到的值打出来便于核对
    env: {
      MYSQL_ADDRESS: process.env.MYSQL_ADDRESS || '(未设置)',
      MYSQL_USERNAME: process.env.MYSQL_USERNAME || '(未设置)',
      MYSQL_PASSWORD: process.env.MYSQL_PASSWORD ? '已设置' : '(未设置)',
      MYSQL_DATABASE: process.env.MYSQL_DATABASE || '(未设置)',
      DB_HOST: process.env.DB_HOST || '(未设置)',
      DB_NAME: process.env.DB_NAME || '(未设置)'
    }
  }
}

module.exports = { getPool, closePool, ping, describeConnection, describeError }
