const config = require('../config')

/**
 * 客户端错误日志。
 *
 * 前端遇到错误时**不展示技术细节给用户**，而是报到这里存档，
 * 由管理员排查。所以这一层是只写不读的业务表（管理员直接查库或
 * 接日志平台），不提供面向用户的读接口。
 */

const useMysql = () => config.dataSource === 'mysql'

/** 内存模式下只保留最近若干条 —— 目的是本地开发时能看到，不是长期存储 */
const MEMORY_LIMIT = 200

const memoryImpl = {
  async insert(items, userId) {
    const store = require('../store/memoryStore')
    const bucket = store._state.clientErrors
    if (!bucket) return

    items.forEach((it) => {
      bucket.push({ ...it, userId, createdAt: new Date().toISOString() })
    })

    // 只留最近的，避免本地跑久了内存涨
    if (bucket.length > MEMORY_LIMIT) {
      bucket.splice(0, bucket.length - MEMORY_LIMIT)
    }
  },

  async list(limit = 50) {
    const store = require('../store/memoryStore')
    const bucket = store._state.clientErrors
    if (!bucket) return []
    return bucket.slice(-limit).reverse()
  }
}

const mysqlImpl = {
  /**
   * 批量插入。
   *
   * 用一条多值 INSERT 而不是循环单插 —— 客户端断网恢复后可能
   * 一次补报十几条，逐条插入就是十几个来回。
   */
  async insert(items, userId) {
    const { getPool } = require('../db/pool')

    const columns = [
      'user_id', 'code', 'message', 'detail', 'page',
      'method', 'url', 'status_code',
      'env_version', 'platform', 'brand', 'model', 'os_version', 'sdk_version',
      'extra', 'created_at'
    ]

    const placeholders = items.map(() => `(${columns.map(() => '?').join(', ')})`).join(', ')

    const params = []
    const now = new Date()
    items.forEach((it) => {
      params.push(
        userId || '',
        it.code, it.message, it.detail, it.page,
        it.method, it.url, it.statusCode,
        it.envVersion, it.platform, it.brand, it.model, it.system, it.sdkVersion,
        it.extra, now
      )
    })

    await getPool().execute(
      `INSERT INTO client_errors (${columns.join(', ')}) VALUES ${placeholders}`,
      params
    )
  },

  /** 管理员排查用：最近的错误 */
  async list(limit = 50) {
    const { getPool } = require('../db/pool')
    const [rows] = await getPool().query(
      `SELECT * FROM client_errors ORDER BY id DESC LIMIT ${Number(limit) || 50}`
    )
    return rows
  }
}

const impl = {
  insert: (...a) => (useMysql() ? mysqlImpl : memoryImpl).insert(...a),
  list: (...a) => (useMysql() ? mysqlImpl : memoryImpl).list(...a)
}

module.exports = { insertClientError: impl.insert, listClientErrors: impl.list }
