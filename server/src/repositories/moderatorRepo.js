const config = require('../config')

/** 版主身份。 */

const useMysql = () => config.dataSource === 'mysql'

const memoryImpl = {
  async listByUser() { return [] },
  async countInCity() { return 0 }
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
  }
}

const impl = {
  listByUser: (...a) => (useMysql() ? mysqlImpl : memoryImpl).listByUser(...a),
  countInCity: (...a) => (useMysql() ? mysqlImpl : memoryImpl).countInCity(...a)
}

module.exports = impl
