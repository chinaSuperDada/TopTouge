const routeRepo = require('../repositories/routeRepo')
const commentRepo = require('../repositories/commentRepo')
const roadConditionRepo = require('../repositories/roadConditionRepo')

const { computeStats } = require('./statsService')
const { computeStars } = require('./difficultyService')
const { notFound } = require('../errors')
const { DEFAULT_RADIUS_METERS, DETAIL_EMBED_LIMIT } = require('../constants')

/**
 * 路线列表。
 *
 * 列表页只需要展示用的字段，不带 referenceTrack —— 一条轨迹几百个点，
 * 全量返回会让列表接口的响应体膨胀到几百 KB。详情页才需要轨迹。
 */
function listRoutes() {
  return routeRepo.list().map(toSummary)
}

/**
 * 路线详情：完整的路线对象 + 内嵌最近的评论与路况提示。
 */
function getRouteDetail(id) {
  const route = routeRepo.getById(id)
  if (!route) throw notFound(`路线 ${id} 不存在`)

  return {
    ...route,
    comments: commentRepo.listByRoute(id, DETAIL_EMBED_LIMIT),
    roadConditions: roadConditionRepo.listByRoute(id, DETAIL_EMBED_LIMIT)
  }
}

/**
 * 创建路线。
 *
 * 坐标点由小程序端地图点选提供，这里负责算出全部派生指标：
 * 距离、弯道数、急弯占比、爬升、难度星级，并把首尾点自动设为起终点。
 *
 * @param {{name, roadWidth, vehicleType, trackPoints}} input 已通过校验
 * @param {string} uploadedBy
 */
function createRoute(input, uploadedBy) {
  const { name, roadWidth, vehicleType, trackPoints } = input

  const stats = computeStats(trackPoints)
  const first = trackPoints[0]
  const last = trackPoints[trackPoints.length - 1]

  return routeRepo.create({
    name,
    vehicleType,
    distanceMeters: stats.distanceMeters,
    startPoint: { lat: first.lat, lng: first.lng, radiusMeters: DEFAULT_RADIUS_METERS },
    endPoint: { lat: last.lat, lng: last.lng, radiusMeters: DEFAULT_RADIUS_METERS },
    waypoints: [],
    referenceTrack: trackPoints,
    uploadedBy,
    curveCount: stats.curveCount,
    sharpCurveRatio: stats.sharpCurveRatio,
    elevationGainMeters: stats.elevationGainMeters,
    roadWidth,
    difficultyStars: computeStars(stats),
    createdAt: new Date().toISOString()
  })
}

/**
 * 列表项：只保留展示需要的字段，去掉轨迹与途经点。
 */
function toSummary(route) {
  return {
    id: route.id,
    name: route.name,
    distanceMeters: route.distanceMeters,
    difficultyStars: route.difficultyStars,
    curveCount: route.curveCount,
    elevationGainMeters: route.elevationGainMeters,
    roadWidth: route.roadWidth,
    vehicleType: route.vehicleType,
    createdAt: route.createdAt
  }
}

module.exports = { listRoutes, getRouteDetail, createRoute, toSummary }
