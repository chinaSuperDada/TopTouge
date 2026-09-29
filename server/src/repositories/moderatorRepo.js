const config = require('../config')

/** 版主身份。 */

const useMysql = () => config.dataSource === 'mysql'

const memoryImpl = {
  async listByUser() { return [] },
  async countInCity() { return 0 },
  async create(m) { return { ...m, id: Date.now() } }
}

const mysqlImpl = {
  /** 某人是不是版主、管哪些区域 */
  async listByUser(userId) {
    const { getPool } = require('../db/pool')
    const [rows] = await getPool().execute(
      'SELECT id, user_id, province, city, permissions, created_at FROM moderators WHERE user_id = ?',
      [userId]
    )
    return rows.map((row) => ({
      id: Number(row.id),
      userId: row.user_id,
      province: row.province,
      city: row.city,
      permissions: typeof row.permissions === 'string' ? JSON.parse(row.permissions) : row.permissions,
      createdAt: row.created_at
    }))
  },

  /** 某个城市有几个版主 */
  async countInCity(province, city) {
    const { getPool } = require('../db/pool')
    const [rows] = await getPool().execute(
      'SELECT COUNT(*) AS n FROM moderators WHERE province = ? AND city = ?',
      [province, city]
    )
    return rows[0].n
  },

  /**
   * 授予版主身份。
   *
   * 用 ON DUPLICATE KEY UPDATE 而不是先查再插 ——
   * 表上有 uk_user_city 唯一索引，同一区域的重复授予（管理员手抖点两次、
   * 或申请被重复审批）应该幂等，而不是抛唯一键冲突。
   */
  async create({ userId, province, city, permissions = ['review', 'pin', 'activity'] }) {
    const { getPool } = require('../db/pool')
    await getPool().execute(
      `INSERT INTO moderators (user_id, province, city, permissions, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE permissions = VALUES(permissions)`,
      [userId, province, city, JSON.stringify(permissions), new Date()]
    )

    const rows = await this.listByUser(userId)
    return rows.find((r) => r.province === province && r.city === city) || null
  }
}

const impl = {
  listByUser: (...a) => (useMysql() ? mysqlImpl : memoryImpl).listByUser(...a),
  countInCity: (...a) => (useMysql() ? mysqlImpl : memoryImpl).countInCity(...a),
  create: (...a) => (useMysql() ? mysqlImpl : memoryImpl).create(...a)
}

module.exports = impl
