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
  /**
   * 内存实现的筛选排序。
   * 与 mysql 实现的语义保持一致，方便本地开发时验证前端行为。
   */
  async list(filters = {}) {
    const {
      province = 'all', city = 'all', difficulty = 'all',
      roadType = 'all', sort = 'hot', reviewStatus = 'approved',
      limit = 50, uploadedBy, anyReviewStatus = false
    } = filters

    let list = memory.routes.all()

    // 内存模式下没有 review_status 字段，用默认值兜底
    if (anyReviewStatus) {
      if (uploadedBy) list = list.filter((r) => r.uploadedBy === uploadedBy)
    } else {
      list = list.filter((r) => (r.reviewStatus || 'approved') === reviewStatus)
    }
    if (province !== 'all') list = list.filter((r) => r.province === province)
    if (city !== 'all') list = list.filter((r) => r.city === city)
    if (difficulty !== 'all') list = list.filter((r) => r.difficultyStars === Number(difficulty))
    if (roadType !== 'all') list = list.filter((r) => r.roadType === roadType)

    const sorters = {
      hot: (a, b) => (b.heat || 0) - (a.heat || 0),
      length: (a, b) => b.distanceMeters - a.distanceMeters,
      newest: (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
      // 内存模式没有真实定位，「离我最近」退化为热度排序
      nearby: (a, b) => (b.heat || 0) - (a.heat || 0)
    }
    list.sort(sorters[sort] || sorters.hot)

    return list.slice(0, limit)
  },

  async getById(id) {
    return memory.routes.findById(id)
  },

  async countByUploadedBy(uploadedBy) {
    return memory.routes.findByUploadedBy(uploadedBy).length
  },

  async create(route) {
    return memory.routes.insert(route)
  },
  async listPending() {
    return []
  },
  async updateReview() {
    return null
  },
  async setPinned() {
    return null
  },
  async countByRegion() {
    return 0
  },
  async softDelete() {
    return null
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
    // 002 新增的字段
    province: row.province || '',
    city: row.city || '',
    roadType: row.road_type || 'mountain',
    heat: row.heat || 0,
    reviewStatus: row.review_status || 'approved',
    reviewReason: row.review_reason || '',
    pinned: Boolean(row.pinned),
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
  road_width, difficulty_stars,
  province, city, road_type, heat, review_status, review_reason, pinned,
  created_at
`

const mysqlImpl = {
  /**
   * 路线列表，支持筛选与排序。
   *
   * 「离我最近」用经纬度算距离 —— 数据量小（几千条）时 MySQL 直接算
   * 足够快。真到几万条再考虑加 geometry 列 + GiST 索引（那时才需要 PostGIS）。
   *
   * @param {{province, city, difficulty, roadType, sort, reviewStatus, limit, lat, lng}} filters
   */
  async list(filters = {}) {
    const { getPool } = require('../db/pool')
    const {
      province = 'all', city = 'all', difficulty = 'all',
      roadType = 'all', sort = 'hot', reviewStatus = 'approved',
      limit = 50, lat, lng, uploadedBy, anyReviewStatus = false
    } = filters

    const where = []
    const params = []

    // 作者查自己的路线时要能看到待审和被驳回的 ——
    // 否则用户传完看不到，以为上传失败了
    if (anyReviewStatus) {
      if (uploadedBy) {
        where.push('uploaded_by = ?')
        params.push(uploadedBy)
      }
    } else {
      where.push('review_status = ?')
      params.push(reviewStatus)
    }

    if (province !== 'all') {
      where.push('province = ?')
      params.push(province)
    }
    if (city !== 'all') {
      where.push('city = ?')
      params.push(city)
    }
    if (difficulty !== 'all') {
      where.push('difficulty_stars = ?')
      params.push(Number(difficulty))
    }
    if (roadType !== 'all') {
      where.push('road_type = ?')
      params.push(roadType)
    }

    // 排序。置顶永远在最前 —— 版主推的路线该被优先看到
    let orderBy
    if (sort === 'length') {
      orderBy = 'pinned DESC, distance_meters DESC'
    } else if (sort === 'newest') {
      orderBy = 'pinned DESC, created_at DESC'
    } else if (sort === 'nearby' && Number.isFinite(lat) && Number.isFinite(lng)) {
      // 用起点坐标算平面距离平方 —— 只用来排序，不必开方
      orderBy =
        'pinned DESC, ' +
        'POW(JSON_EXTRACT(start_point, "$.lat") - ?, 2) + ' +
        'POW(JSON_EXTRACT(start_point, "$.lng") - ?, 2) ASC'
      params.push(lat, lng)
    } else {
      orderBy = 'pinned DESC, heat DESC, created_at DESC'
    }

    const [rows] = await getPool().query(
      `SELECT ${ROUTE_COLUMNS} FROM routes
        WHERE ${where.join(' AND ')}
        ORDER BY ${orderBy}
        LIMIT ${Number(limit) || 50}`,
      params
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
         road_width, difficulty_stars,
         province, city, road_type, heat, review_status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        route.province || '',
        route.city || '',
        route.roadType || 'mountain',
        route.heat || 0,
        route.reviewStatus || 'approved',
        // 内存实现里 createdAt 是 ISO 字符串，MySQL 要 Date 对象
        new Date(route.createdAt)
      ]
    )

    return this.getById(result.insertId)
  },

  /**
   * 待审核的路线。
   * 版主只审自己辖区的 —— 这个过滤由 service 传 province/city 进来。
   */
  async listPending({ province, city, limit = 50 }) {
    const { getPool } = require('../db/pool')
    const where = ["review_status = 'pending'"]
    const params = []

    if (province) { where.push('province = ?'); params.push(province) }
    if (city) { where.push('city = ?'); params.push(city) }

    const [rows] = await getPool().query(
      `SELECT ${ROUTE_COLUMNS} FROM routes
        WHERE ${where.join(' AND ')}
        ORDER BY created_at ASC
        LIMIT ${Number(limit) || 50}`,
      params
    )
    return rows.map(rowToRoute)
  },

  /** 审核：通过或驳回 */
  async updateReview(id, { status, reason, reviewedBy }) {
    const { getPool } = require('../db/pool')
    await getPool().execute(
      `UPDATE routes
          SET review_status = ?, review_reason = ?, reviewed_by = ?, reviewed_at = NOW(3)
        WHERE id = ?`,
      [status, reason || '', reviewedBy, id]
    )
    return this.getById(id)
  },

  /** 置顶 / 取消置顶 */
  async setPinned(id, pinned) {
    const { getPool } = require('../db/pool')
    await getPool().execute('UPDATE routes SET pinned = ? WHERE id = ?', [pinned ? 1 : 0, id])
    return this.getById(id)
  },

  /**
   * 删除路线。
   *
   * **软删除** —— 只把 review_status 改成 deleted，不删行。
   *
   * 为什么不做物理删除：这条路线下面挂着评论、路况、跑山成绩、
   * 别人的收藏。物理删会通过外键级联把这些一起清掉 ——
   * 别人跑出的成绩、写过的评论会莫名消失，这是不可接受的。
   *
   * 软删之后所有查询会自动过滤掉（list/listPending 都带
   * review_status 条件），对用户来说等同于已删除。
   */
  async softDelete(id) {
    const { getPool } = require('../db/pool')
    const [res] = await getPool().execute(
      "UPDATE routes SET review_status = 'deleted' WHERE id = ?",
      [id]
    )
    return res.affectedRows > 0
  },

  /** 某区域的路线数，版主工作台首页用 */
  async countByRegion({ province, city }) {
    const { getPool } = require('../db/pool')
    const [rows] = await getPool().execute(
      `SELECT COUNT(*) AS n FROM routes
        WHERE review_status = 'approved' AND province = ? AND city = ?`,
      [province, city]
    )
    return rows[0].n
  }
}

/* ==================== 统一出口 ==================== */

const impl = {
  list: (...a) => (useMysql() ? mysqlImpl : memoryImpl).list(...a),
  getById: (...a) => (useMysql() ? mysqlImpl : memoryImpl).getById(...a),
  countByUploadedBy: (...a) => (useMysql() ? mysqlImpl : memoryImpl).countByUploadedBy(...a),
  create: (...a) => (useMysql() ? mysqlImpl : memoryImpl).create(...a),
  listPending: (...a) => (useMysql() ? mysqlImpl : memoryImpl).listPending(...a),
  updateReview: (...a) => (useMysql() ? mysqlImpl : memoryImpl).updateReview(...a),
  setPinned: (...a) => (useMysql() ? mysqlImpl : memoryImpl).setPinned(...a),
  countByRegion: (...a) => (useMysql() ? mysqlImpl : memoryImpl).countByRegion(...a),
  softDelete: (...a) => (useMysql() ? mysqlImpl : memoryImpl).softDelete(...a)
}

module.exports = impl
