const config = require('../config')

/** 收藏。只有 mysql 实现 —— 内存模式不做，收藏本来就该持久化。 */

const useMysql = () => config.dataSource === 'mysql'

function toIso(v) {
  if (!v) return null
  return v instanceof Date ? v.toISOString() : new Date(v).toISOString()
}

const memoryImpl = {
  async listByUser() { return [] },
  async add() { return null },
  async remove() { return 0 },
  async countByUser() { return 0 },
  async countByRoute() { return 0 },
  /** 内存模式没有持久化，一律当作未收藏 */
  async isFavorited() { return false }
}

const mysqlImpl = {
  /** 某人收藏的路线（带路线信息，前端直接能渲染） */
  async listByUser(userId, limit = 50) {
    const { getPool } = require('../db/pool')
    const [rows] = await getPool().query(
      `SELECT r.id, r.name, r.distance_meters, r.curve_count, r.difficulty_stars,
              r.road_type, r.province, r.city, r.heat, f.created_at AS fav_at
         FROM favorites f
         JOIN routes r ON r.id = f.route_id
        WHERE f.user_id = ?
        ORDER BY f.created_at DESC
        LIMIT ${Number(limit) || 50}`,
      [userId]
    )
    return rows.map((row) => ({
      id: Number(row.id),
      name: row.name,
      distanceMeters: row.distance_meters,
      curveCount: row.curve_count,
      difficultyStars: row.difficulty_stars,
      roadType: row.road_type,
      province: row.province,
      city: row.city,
      heat: row.heat,
      favoritedAt: toIso(row.fav_at)
    }))
  },

  /**
   * 加收藏。
   * 用 INSERT IGNORE 处理重复 —— 唯一索引会挡住重复插入，
   * 但用 IGNORE 比先查再插更简洁，也不会并发时出错。
   */
  async add(userId, routeId) {
    const { getPool } = require('../db/pool')
    await getPool().execute(
      'INSERT IGNORE INTO favorites (user_id, route_id) VALUES (?, ?)',
      [userId, routeId]
    )
    return { userId, routeId }
  },

  async remove(userId, routeId) {
    const { getPool } = require('../db/pool')
    const [res] = await getPool().execute(
      'DELETE FROM favorites WHERE user_id = ? AND route_id = ?',
      [userId, routeId]
    )
    return res.affectedRows
  },

  async countByUser(userId) {
    const { getPool } = require('../db/pool')
    const [rows] = await getPool().execute(
      'SELECT COUNT(*) AS n FROM favorites WHERE user_id = ?',
      [userId]
    )
    return rows[0].n
  },

  /** 某条路线被收藏了多少次 */
  async countByRoute(routeId) {
    const { getPool } = require('../db/pool')
    const [rows] = await getPool().execute(
      'SELECT COUNT(*) AS n FROM favorites WHERE route_id = ?',
      [routeId]
    )
    return rows[0].n
  },

  /** 某人是否收藏了某条路线。详情页要据此决定按钮状态 */
  async isFavorited(userId, routeId) {
    const { getPool } = require('../db/pool')
    const [rows] = await getPool().execute(
      'SELECT 1 FROM favorites WHERE user_id = ? AND route_id = ? LIMIT 1',
      [userId, routeId]
    )
    return rows.length > 0
  }
}

const impl = {
  listByUser: (...a) => (useMysql() ? mysqlImpl : memoryImpl).listByUser(...a),
  add: (...a) => (useMysql() ? mysqlImpl : memoryImpl).add(...a),
  remove: (...a) => (useMysql() ? mysqlImpl : memoryImpl).remove(...a),
  countByUser: (...a) => (useMysql() ? mysqlImpl : memoryImpl).countByUser(...a),
  countByRoute: (...a) => (useMysql() ? mysqlImpl : memoryImpl).countByRoute(...a),
  isFavorited: (...a) => (useMysql() ? mysqlImpl : memoryImpl).isFavorited(...a)
}

module.exports = impl
