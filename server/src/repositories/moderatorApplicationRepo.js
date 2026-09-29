const config = require('../config')

/**
 * 版主申请。
 *
 * 只有 mysql 实现 —— 申请是要走审批流程的业务数据，必须持久化。
 * 内存模式下返回空，本地开发时版主申请功能不可用但不报错。
 */

const useMysql = () => config.dataSource === 'mysql'

function toIso(v) {
  if (!v) return null
  return v instanceof Date ? v.toISOString() : new Date(v).toISOString()
}

function rowToApplication(row) {
  if (!row) return null
  return {
    id: Number(row.id),
    userId: row.user_id,
    province: row.province,
    city: row.city,
    reason: row.reason || '',
    // 提交时的条件快照 —— 之后用户删了路线也不影响已提交的申请
    routeCount: row.route_count,
    runCount: row.run_count,
    status: row.status,
    reviewReason: row.review_reason || '',
    reviewedBy: row.reviewed_by || '',
    reviewedAt: toIso(row.reviewed_at),
    createdAt: toIso(row.created_at)
  }
}

const memoryImpl = {
  async create() { return null },
  async listPending() { return [] },
  async listByUser() { return [] },
  async findPendingByUser() { return null },
  async updateStatus() { return null }
}

const mysqlImpl = {
  async create(app) {
    const { getPool } = require('../db/pool')
    const [res] = await getPool().execute(
      `INSERT INTO moderator_applications
        (user_id, province, city, reason, route_count, run_count, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
      [
        app.userId, app.province, app.city, app.reason || '',
        app.routeCount, app.runCount, new Date(app.createdAt)
      ]
    )
    return this.getById(res.insertId)
  },

  async getById(id) {
    const { getPool } = require('../db/pool')
    const [rows] = await getPool().execute(
      'SELECT * FROM moderator_applications WHERE id = ? LIMIT 1',
      [id]
    )
    return rows.length ? rowToApplication(rows[0]) : null
  },

  /** 待审的申请，最旧的在前（先来先审） */
  async listPending(limit = 50) {
    const { getPool } = require('../db/pool')
    const [rows] = await getPool().query(
      `SELECT * FROM moderator_applications
        WHERE status = 'pending'
        ORDER BY created_at ASC
        LIMIT ${Number(limit) || 50}`
    )
    return rows.map(rowToApplication)
  },

  async listByUser(userId) {
    const { getPool } = require('../db/pool')
    const [rows] = await getPool().execute(
      `SELECT * FROM moderator_applications
        WHERE user_id = ?
        ORDER BY created_at DESC`,
      [userId]
    )
    return rows.map(rowToApplication)
  },

  /**
   * 某人有没有还没审的申请。
   *
   * 用来挡重复提交 —— 否则用户连点几次就攒出一堆一样的申请，
   * 管理员要挨个驳回。
   */
  async findPendingByUser(userId) {
    const { getPool } = require('../db/pool')
    const [rows] = await getPool().execute(
      `SELECT * FROM moderator_applications
        WHERE user_id = ? AND status = 'pending'
        ORDER BY created_at DESC LIMIT 1`,
      [userId]
    )
    return rows.length ? rowToApplication(rows[0]) : null
  },

  async updateStatus(id, { status, reason, reviewedBy }) {
    const { getPool } = require('../db/pool')
    await getPool().execute(
      `UPDATE moderator_applications
          SET status = ?, review_reason = ?, reviewed_by = ?, reviewed_at = ?
        WHERE id = ?`,
      [status, reason || '', reviewedBy, new Date(), id]
    )
    return this.getById(id)
  }
}

const impl = {
  create: (...a) => (useMysql() ? mysqlImpl : memoryImpl).create(...a),
  getById: (...a) => (useMysql() ? mysqlImpl : memoryImpl).getById(...a),
  listPending: (...a) => (useMysql() ? mysqlImpl : memoryImpl).listPending(...a),
  listByUser: (...a) => (useMysql() ? mysqlImpl : memoryImpl).listByUser(...a),
  findPendingByUser: (...a) => (useMysql() ? mysqlImpl : memoryImpl).findPendingByUser(...a),
  updateStatus: (...a) => (useMysql() ? mysqlImpl : memoryImpl).updateStatus(...a)
}

module.exports = impl
