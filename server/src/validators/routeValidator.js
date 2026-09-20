const { validationFailed } = require('../errors')
const { ROAD_WIDTHS, VEHICLE_TYPES, DEFAULT_VEHICLE_TYPE } = require('../constants')

const MAX_TRACK_POINTS = 5000
const MAX_NAME_LENGTH = 40

/**
 * 校验上传路线的入参。
 *
 * 轨迹点由小程序端地图点选产生，只需要 lat/lng；
 * altitude 允许缺省（地图点选拿不到海拔），按 0 处理。
 *
 * @param {object} body
 * @returns {{ name, roadWidth, vehicleType, trackPoints }}
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

  return { name, roadWidth, vehicleType, trackPoints }
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

    const lat = Number(p.lat)
    const lng = Number(p.lng)

    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      throw validationFailed(`第 ${i + 1} 个点的 lat 非法: ${p.lat}`)
    }
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      throw validationFailed(`第 ${i + 1} 个点的 lng 非法: ${p.lng}`)
    }

    const altitude = Number(p.altitude)
    return {
      lat,
      lng,
      altitude: Number.isFinite(altitude) ? altitude : 0
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

module.exports = {
  validateCreateRoute,
  normalizeTrackPoints,
  validateContent,
  parseId,
  parseLimit,
  MAX_TRACK_POINTS
}
