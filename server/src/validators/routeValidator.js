const { validationFailed } = require('../errors')
const { ROAD_WIDTHS, VEHICLE_TYPES, DEFAULT_VEHICLE_TYPE } = require('../constants')

const MAX_TRACK_POINTS = 5000
const MAX_NAME_LENGTH = 40
const MAX_WAYPOINTS = 16

/**
 * 严格解析数值。
 *
 * 不能直接用 Number()：Number(null)、Number('')、Number([]) 全是 0，
 * 于是 {lat: null, lng: null} 会被当成合法的 (0, 0) —— 那是几内亚湾，
 * 一条轨迹里混进这种点会算出几千公里的假距离。所以先挡掉空值。
 *
 * @returns {number|null} 不是有效数值时返回 null
 */
function toFiniteNumber(v) {
  if (v === null || v === undefined || v === '' || Array.isArray(v)) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * 校验上传路线的入参。
 *
 * 轨迹点由小程序端地图点选产生，只需要 lat/lng；
 * altitude 允许缺省（地图点选拿不到海拔），按 0 处理。
 *
 * @param {object} body
 * @returns {{ name, roadWidth, vehicleType, trackPoints, province, city, roadType, waypoints }}
 * @throws {AppError} 校验不通过时抛 VALIDATION_FAILED
 */
function validateCreateRoute(body) {
  if (!body || typeof body !== 'object') {
    throw validationFailed('请求体必须是 JSON 对象')
  }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) throw validationFailed('路线名称不能为空')
  if (name.length > MAX_NAME_LENGTH) {
    throw validationFailed(`路线名称不能超过 ${MAX_NAME_LENGTH} 个字符`)
  }

  const roadWidth = body.roadWidth
  if (!ROAD_WIDTHS.includes(roadWidth)) {
    throw validationFailed(`路宽必须是 ${ROAD_WIDTHS.join(' / ')} 之一`)
  }

  const vehicleType = body.vehicleType || DEFAULT_VEHICLE_TYPE
  if (!VEHICLE_TYPES.includes(vehicleType)) {
    throw validationFailed(`车型必须是 ${VEHICLE_TYPES.join(' / ')} 之一`)
  }

  const trackPoints = normalizeTrackPoints(body.trackPoints)

  // 区域与路型：列表筛选和版主辖区判断要用。
  // 不做强校验 —— 前端定位失败时可能拿不到，允许为空
  const province = typeof body.province === 'string' ? body.province.trim() : ''
  const city = typeof body.city === 'string' ? body.city.trim() : ''

  const ROAD_TYPES = ['mountain', 'track', 'gravel', 'highway']
  const roadType = ROAD_TYPES.includes(body.roadType) ? body.roadType : 'mountain'

  const waypoints = normalizeWaypoints(body.waypoints)

  // 公开还是私有。默认公开 —— 老客户端不传这个字段时行为不变
  const visibility = body.visibility === 'private' ? 'private' : 'public'

  return {
    name, roadWidth, vehicleType, trackPoints,
    province, city, roadType, waypoints, visibility
  }
}

/**
 * 规范化途经点。
 *
 * 途经点只用于导航与分享（生成高德的 viaaddr），不参与难度计算，
 * 所以缺省或格式不对时直接丢弃那一项，不像轨迹点那样抛错 ——
 * 少一个途经点不影响路线本身可用。
 */
function normalizeWaypoints(raw) {
  if (!Array.isArray(raw)) return []

  return raw
    .slice(0, MAX_WAYPOINTS)
    .map((p) => {
      if (!p || typeof p !== 'object') return null

      const lat = toFiniteNumber(p.lat)
      const lng = toFiniteNumber(p.lng)
      if (lat === null || lng === null) return null
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null

      return {
        lat,
        lng,
        name: typeof p.name === 'string' ? p.name.trim().slice(0, 60) : ''
      }
    })
    .filter(Boolean)
}

/**
 * 规范化并校验坐标序列。
 */
function normalizeTrackPoints(raw) {
  if (!Array.isArray(raw)) throw validationFailed('trackPoints 必须是数组')
  if (raw.length < 2) throw validationFailed('trackPoints 至少需要 2 个点')
  if (raw.length > MAX_TRACK_POINTS) {
    throw validationFailed(`trackPoints 不能超过 ${MAX_TRACK_POINTS} 个点`)
  }

  return raw.map((p, i) => {
    if (!p || typeof p !== 'object') {
      throw validationFailed(`第 ${i + 1} 个坐标点格式错误`)
    }

    const lat = toFiniteNumber(p.lat)
    const lng = toFiniteNumber(p.lng)

    if (lat === null || lat < -90 || lat > 90) {
      throw validationFailed(`第 ${i + 1} 个点的 lat 非法: ${p.lat}`)
    }
    if (lng === null || lng < -180 || lng > 180) {
      throw validationFailed(`第 ${i + 1} 个点的 lng 非法: ${p.lng}`)
    }

    // 海拔允许缺省（地图点选拿不到），空值按 0 处理
    const altitude = toFiniteNumber(p.altitude)
    return {
      lat,
      lng,
      altitude: altitude === null ? 0 : altitude
    }
  })
}

/**
 * 校验评论 / 路况提示的内容。
 */
function validateContent(body, fieldLabel = '内容') {
  const content = body && typeof body.content === 'string' ? body.content.trim() : ''
  if (!content) throw validationFailed(`${fieldLabel}不能为空`)
  if (content.length > 500) throw validationFailed(`${fieldLabel}不能超过 500 个字符`)
  return content
}

/**
 * 解析路由参数里的 id。
 */
function parseId(raw) {
  const id = Number(raw)
  if (!Number.isInteger(id) || id <= 0) {
    throw validationFailed(`路径参数 id 非法: ${raw}`)
  }
  return id
}

/**
 * 解析列表查询里的 limit。
 */
function parseLimit(raw, fallback, max) {
  if (raw === undefined || raw === '') return fallback
  const n = Number(raw)
  if (!Number.isInteger(n) || n <= 0) return fallback
  return Math.min(n, max)
}

/**
 * 校验跑山提交。
 *
 * trackPoints 里的 timestamp 是必须的 —— 算分要靠它确定
 * 「进起点」到「进终点」的时间差。没有时间戳就无法匹配，
 * 所以这里比上传路线的校验更严。
 */
function validateRun(body) {
  if (!body || typeof body !== 'object') {
    throw validationFailed('请求体必须是 JSON 对象')
  }

  const routeId = Number(body.routeId)
  if (!Number.isInteger(routeId) || routeId <= 0) {
    throw validationFailed('routeId 非法')
  }

  const dataMode = body.dataMode === 'local_only' ? 'local_only' : 'ranked'
  const vehicleType = body.vehicleType || DEFAULT_VEHICLE_TYPE
  if (!VEHICLE_TYPES.includes(vehicleType)) {
    throw validationFailed(`车型必须是 ${VEHICLE_TYPES.join(' / ')} 之一`)
  }

  // 仅本机模式不需要轨迹 —— 前端根本不传
  if (dataMode === 'local_only') {
    return { routeId, vehicleType, dataMode, trackPoints: [] }
  }

  const raw = body.trackPoints
  if (!Array.isArray(raw) || raw.length < 2) {
    throw validationFailed('trackPoints 至少需要 2 个点')
  }
  if (raw.length > MAX_TRACK_POINTS) {
    throw validationFailed(`trackPoints 不能超过 ${MAX_TRACK_POINTS} 个点`)
  }

  const trackPoints = raw.map((p, i) => {
    const lat = Number(p && p.lat)
    const lng = Number(p && p.lng)
    const ts = Number(p && p.timestamp)

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw validationFailed(`第 ${i + 1} 个点的坐标非法`)
    }
    if (!Number.isFinite(ts) || ts <= 0) {
      throw validationFailed(`第 ${i + 1} 个点缺少时间戳，无法计算用时`)
    }

    return {
      lat,
      lng,
      altitude: Number(p.altitude) || 0,
      speed: Number(p.speed) || 0,
      timestamp: ts
    }
  })

  return { routeId, vehicleType, dataMode, trackPoints }
}

module.exports = {
  validateCreateRoute,
  validateRun,
  normalizeTrackPoints,
  validateContent,
  parseId,
  parseLimit,
  MAX_TRACK_POINTS
}
