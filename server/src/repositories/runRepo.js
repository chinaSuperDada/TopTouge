const config = require('../config')
const memory = require('../store/memoryStore')

/**
 * 跑山成绩数据访问。
 *
 * memory 实现只在本地开发用 —— 云端一律 mysql。
 * 内存版不做真正的百分位计算（没有历史数据），
 * 直接返回预置值，够把流程跑通。
 */

const useMysql = () => config.dataSource === 'mysql'

function toIso(v) {
  if (!v) return null
  return v instanceof Date ? v.toISOString() : new Date(v).toISOString()
}

function parsePoints(v) {
  if (v === null || v === undefined) return null
  if (typeof v === 'object') return v
  try {
    return JSON.parse(v)
  } catch (err) {
    return null
  }
}

function rowToRecord(row) {
  if (!row) return null
  return {
    id: Number(row.id),
    routeId: Number(row.route_id),
    userId: row.user_id,
    vehicleType: row.vehicle_type,
    rawTrackPoints: parsePoints(row.raw_track_points),
    status: row.status,
    score: row.score,
    rank: row.rank_no,
    totalTimeSeconds: row.total_time_seconds,
    createdAt: toIso(row.created_at),
    expiresAt: toIso(row.expires_at)
  }
}

const memoryImpl = {
  async create(record) {
    return { ...record, id: Date.now(), rank: 1 }
  },
  async getById() {
    return null
  },
  async listByRoute() {
    return []
  },
  async countByRoute() {
    return 0
  },
  async scorePercentile() {
    // 内存模式没有历史数据，返回 null 让上层走保底分
    return null
  },
  async rankOf() {
    return 1
  },
  async setScoreAndRank() {
    // 内存模式不落库，无需回填
  },
  async listByUser() {
    return []
  },
  async countByUser() {
    // 内存模式不落库，没有成绩记录
    return 0
  },
  async clearExpiredTracks() {
    return 0
  }
}

const mysqlImpl = {
  async create(record) {
    const { getPool } = require('../db/pool')
    const [res] = await getPool().execute(
      `INSERT INTO run_records
        (route_id, user_id, vehicle_type, raw_track_points, status,
         score, rank_no, total_time_seconds, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.routeId,
        record.userId,
        record.vehicleType,
        JSON.stringify(record.rawTrackPoints || []),
        record.status,
        record.score,
        record.rank,
        record.totalTimeSeconds,
        new Date(record.createdAt),
        record.expiresAt ? new Date(record.expiresAt) : null
      ]
    )
    return this.getById(res.insertId)
  },

  async getById(id) {
    const { getPool } = require('../db/pool')
    const [rows] = await getPool().execute(
      'SELECT * FROM run_records WHERE id = ? LIMIT 1',
      [id]
    )
    return rows.length ? rowToRecord(rows[0]) : null
  },

  /**
   * 某条路线的成绩榜。
   *
   * 按用时升序 —— 用时越短分越高，所以榜是按用时排的。
   * 只返回公开字段，**原始轨迹不返回**（体积大且涉及隐私）。
   */
  async listByRoute(routeId, limit = 50) {
    const { getPool } = require('../db/pool')
    const [rows] = await getPool().query(
      `SELECT id, route_id, user_id, vehicle_type, status,
              score, rank_no, total_time_seconds, created_at, expires_at
         FROM run_records
        WHERE route_id = ? AND status = 'completed'
        ORDER BY total_time_seconds ASC, created_at ASC
        LIMIT ${Number(limit) || 50}`,
      [routeId]
    )
    return rows.map(rowToRecord)
  },

  /**
   * 算百分位：该路线有多少比例的成绩比自己慢。
   *
   * 返回 0~1。比所有历史成绩都快 → 接近 1；最慢 → 接近 0。
   * 用 COUNT 两次查询而不是拉全量数据回来算 —— 成绩多了以后省内存。
   */
  async scorePercentile(routeId, totalTimeSeconds, excludeId) {
    const { getPool } = require('../db/pool')

    const [totalRows] = await getPool().execute(
      `SELECT COUNT(*) AS n FROM run_records
        WHERE route_id = ? AND status = 'completed' AND id <> ?`,
      [routeId, excludeId || 0]
    )
    const total = totalRows[0].n
    if (total === 0) return null

    // 比自己慢的（用时更长）有多少
    const [slowerRows] = await getPool().execute(
      `SELECT COUNT(*) AS n FROM run_records
        WHERE route_id = ? AND status = 'completed' AND id <> ?
          AND total_time_seconds > ?`,
      [routeId, excludeId || 0, totalTimeSeconds]
    )

    return slowerRows[0].n / total
  },

  /** 该路线上的名次（用时升序） */
  async rankOf(routeId, totalTimeSeconds) {
    const { getPool } = require('../db/pool')
    const [rows] = await getPool().execute(
      `SELECT COUNT(*) + 1 AS r FROM run_records
        WHERE route_id = ? AND status = 'completed' AND total_time_seconds < ?`,
      [routeId, totalTimeSeconds]
    )
    return rows[0].r
  },

  /** 该路线有多少条有效成绩 */
  async countByRoute(routeId) {
    const { getPool } = require('../db/pool')
    const [rows] = await getPool().execute(
      `SELECT COUNT(*) AS n FROM run_records
        WHERE route_id = ? AND status = 'completed'`,
      [routeId]
    )
    return rows[0].n
  },

  /**
   * 回填分数和名次。
   *
   * 插入时这两个值还不可知 —— 分数要算百分位（需排除自己），
   * 名次要统计比自己快的记录数。所以先占位为 0，算完再更新。
   */
  async setScoreAndRank(id, score, rank) {
    const { getPool } = require('../db/pool')
    await getPool().execute(
      'UPDATE run_records SET score = ?, rank_no = ? WHERE id = ?',
      [score, rank, id]
    )
  },

  /**
   * 我的跑山记录。
   *
   * 名次用子查询现算，不用存的 rank_no —— 后者是插入当时的快照，
   * 后来有更快的成绩进来就过期了。榜单接口同理。
   *
   * 子查询在 idx_route_time(route_id, total_time_seconds) 上走索引，
   * 这里最多几十条记录，开销可忽略。
   */
  async listByUser(userId, limit = 50) {
    const { getPool } = require('../db/pool')
    const [rows] = await getPool().query(
      `SELECT r.id, r.route_id, r.user_id, r.score,
              r.total_time_seconds, r.created_at,
              rt.name AS route_name,
              (SELECT COUNT(*) + 1 FROM run_records r2
                WHERE r2.route_id = r.route_id
                  AND r2.status = 'completed'
                  AND r2.total_time_seconds < r.total_time_seconds) AS live_rank
         FROM run_records r
         JOIN routes rt ON rt.id = r.route_id
        WHERE r.user_id = ? AND r.status = 'completed'
        ORDER BY r.created_at DESC
        LIMIT ${Number(limit) || 50}`,
      [userId]
    )
    return rows.map((row) => ({
      id: Number(row.id),
      routeId: Number(row.route_id),
      routeName: row.route_name,
      score: row.score,
      rank: Number(row.live_rank),
      totalTimeSeconds: row.total_time_seconds,
      createdAt: toIso(row.created_at)
    }))
  },

  /**
   * 清理过期轨迹。
   *
   * 任务书要求：只清空 raw_track_points，**不删记录** ——
   * score 和 rank 要保留，否则历史成绩就没了。
   */
  async clearExpiredTracks() {
    const { getPool } = require('../db/pool')
    const [res] = await getPool().query(
      `UPDATE run_records
          SET raw_track_points = NULL
        WHERE expires_at IS NOT NULL
          AND expires_at < NOW()
          AND raw_track_points IS NOT NULL`
    )
    return res.affectedRows
  },

  /**
   * 某人的有效成绩条数。
   *
   * 版主申请资格要用（「完成一次跑山」）。只算 completed 的 ——
   * 中途放弃的记录不该算数。
   */
  async countByUser(userId) {
    const { getPool } = require('../db/pool')
    const [rows] = await getPool().execute(
      `SELECT COUNT(*) AS n FROM run_records
        WHERE user_id = ? AND status = 'completed'`,
      [userId]
    )
    return rows[0].n
  }
}

const impl = {
  create: (...a) => (useMysql() ? mysqlImpl : memoryImpl).create(...a),
  getById: (...a) => (useMysql() ? mysqlImpl : memoryImpl).getById(...a),
  listByRoute: (...a) => (useMysql() ? mysqlImpl : memoryImpl).listByRoute(...a),
  listByUser: (...a) => (useMysql() ? mysqlImpl : memoryImpl).listByUser(...a),
  countByUser: (...a) => (useMysql() ? mysqlImpl : memoryImpl).countByUser(...a),
  scorePercentile: (...a) => (useMysql() ? mysqlImpl : memoryImpl).scorePercentile(...a),
  rankOf: (...a) => (useMysql() ? mysqlImpl : memoryImpl).rankOf(...a),
  countByRoute: (...a) => (useMysql() ? mysqlImpl : memoryImpl).countByRoute(...a),
  setScoreAndRank: (...a) => (useMysql() ? mysqlImpl : memoryImpl).setScoreAndRank(...a),
  clearExpiredTracks: (...a) => (useMysql() ? mysqlImpl : memoryImpl).clearExpiredTracks(...a)
}

module.exports = impl
