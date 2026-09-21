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
 * @returns {Promise<boolean>}
 */
async function ping() {
  try {
    const conn = await getPool().getConnection()
    await conn.ping()
    conn.release()
    return true
  } catch (err) {
    console.error('[mysql] 连接失败:', err.message)
    return false
  }
}

module.exports = { getPool, closePool, ping }
