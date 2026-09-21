const config = require('../config')
const memory = require('../store/memoryStore')

/**
 * 路线数据访问。
 *
 * 两套实现：
 *   memory —— 直接读写内存 Map，本地开发用
 *   mysql  —— 真实数据库
 *
 * 对外契约完全一致（方法名、返回结构），上层 service 不感知用的是哪个。
 * 换数据源只改 DATA_SOURCE 环境变量。
 *
 * 所有方法都是 async —— 内存实现本来是同步的，但为了两套实现能互换，
 * 统一成 Promise。
 */

const useMysql = () => config.dataSource === 'mysql'

/* ==================== memory 实现 ==================== */

const memoryImpl = {
  async list() {
    return memory.routes.all()
  },

  async getById(id) {
    return memory.routes.findById(id)
  },

  async countByUploadedBy(uploadedBy) {
    return memory.routes.findByUploadedBy(uploadedBy).length
  },

  async create(route) {
    return memory.routes.insert(route)
  }
}

/* ==================== mysql 实现 ==================== */

/**
 * 数据库行转成 API 返回的结构。
 *
 * 列名是 snake_case，返回给前端的是 camelCase —— 转换集中在这里，
 * 别让 snake_case 泄漏到 service 以上。
 *
 * mysql2 对 JSON 列通常会自动 parse，但驱动版本或列定义有差异时
 * 可能给回字符串，所以统一过一遍 parseJson 兜底。
 */
function rowToRoute(row) {
  if (!row) return null

  return {
    id: Number(row.id),
    name: row.name,
    vehicleType: row.vehicle_type,
    distanceMeters: row.distance_meters,
    startPoint: parseJson(row.start_point),
    endPoint: parseJson(row.end_point),
    waypoints: parseJson(row.waypoints) || [],
    referenceTrack: parseJson(row.reference_track) || [],
    displayTrack: parseJson(row.display_track) || [],
    uploadedBy: row.uploaded_by,
    curveCount: row.curve_count,
    // DECIMAL 类型驱动会返回字符串，转成数字
    sharpCurveRatio: Number(row.sharp_curve_ratio),
    elevationGainMeters: row.elevation_gain_meters,
    roadWidth: row.road_width,
    difficultyStars: row.difficulty_stars,
    createdAt: toIso(row.created_at)
  }
}

function parseJson(value) {
  if (value === null || value === undefined) return null
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch (err) {
    console.error('[routeRepo] JSON 解析失败:', String(value).slice(0, 60))
    return null
  }
}

/** Date 转 ISO 字符串，与内存实现返回的格式一致 */
function toIso(value) {
  if (!value) return null
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

const ROUTE_COLUMNS = `
  id, name, vehicle_type, distance_meters,
  start_point, end_point, waypoints,
  reference_track, display_track,
  uploaded_by, curve_count, sharp_curve_ratio, elevation_gain_meters,
  road_width, difficulty_stars, created_at
`

const mysqlImpl = {
  async list() {
    const { getPool } = require('../db/pool')
    const [rows] = await getPool().query(
      `SELECT ${ROUTE_COLUMNS} FROM routes ORDER BY created_at DESC, id DESC`
    )
    return rows.map(rowToRoute)
  },

  async getById(id) {
    const { getPool } = require('../db/pool')
    const [rows] = await getPool().execute(
      `SELECT ${ROUTE_COLUMNS} FROM routes WHERE id = ? LIMIT 1`,
      [id]
    )
    return rows.length ? rowToRoute(rows[0]) : null
  },

  async countByUploadedBy(uploadedBy) {
    const { getPool } = require('../db/pool')
    const [rows] = await getPool().execute(
      'SELECT COUNT(*) AS n FROM routes WHERE uploaded_by = ?',
      [uploadedBy]
    )
    return rows[0].n
  },

  /**
   * 插入后按 id 查回完整行。
   *
   * 为什么不在插入时就返回：INSERT 只给 insertId，拿不到数据库生成的
   * 默认值（如 created_at）。再查一次能保证返回的对象和 getById 完全一致，
   * 上层不用区分「刚创建的」和「查出来的」两种形态。
   */
  async create(route) {
    const { getPool } = require('../db/pool')

    const [result] = await getPool().execute(
      `INSERT INTO routes
        (name, vehicle_type, distance_meters,
         start_point, end_point, waypoints,
         reference_track, display_track,
         uploaded_by, curve_count, sharp_curve_ratio, elevation_gain_meters,
         road_width, difficulty_stars, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        route.name,
        route.vehicleType,
        route.distanceMeters,
        JSON.stringify(route.startPoint),
        JSON.stringify(route.endPoint),
        JSON.stringify(route.waypoints || []),
        JSON.stringify(route.referenceTrack || []),
        JSON.stringify(route.displayTrack || []),
        route.uploadedBy,
        route.curveCount,
        route.sharpCurveRatio,
        route.elevationGainMeters,
        route.roadWidth,
        route.difficultyStars,
        // 内存实现里 createdAt 是 ISO 字符串，MySQL 要 Date 对象
        new Date(route.createdAt)
      ]
    )

    return this.getById(result.insertId)
  }
}

/* ==================== 统一出口 ==================== */

const impl = {
  list: (...a) => (useMysql() ? mysqlImpl : memoryImpl).list(...a),
  getById: (...a) => (useMysql() ? mysqlImpl : memoryImpl).getById(...a),
  countByUploadedBy: (...a) => (useMysql() ? mysqlImpl : memoryImpl).countByUploadedBy(...a),
  create: (...a) => (useMysql() ? mysqlImpl : memoryImpl).create(...a)
}

module.exports = impl
