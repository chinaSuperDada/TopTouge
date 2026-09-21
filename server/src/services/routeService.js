const routeRepo = require('../repositories/routeRepo')
const commentRepo = require('../repositories/commentRepo')
const roadConditionRepo = require('../repositories/roadConditionRepo')

const { computeStats } = require('./statsService')
const { computeStars } = require('./difficultyService')
const { simplifyToMaxPoints } = require('../geo/simplify')
const { notFound } = require('../errors')
const {
  DEFAULT_RADIUS_METERS,
  DETAIL_EMBED_LIMIT,
  DISPLAY_TRACK_MAX_POINTS
} = require('../constants')

/**
 * 路线列表。
 *
 * 列表页只需要展示用的字段，不带 referenceTrack —— 一条轨迹几百个点，
 * 全量返回会让列表接口的响应体膨胀到几百 KB。详情页才需要轨迹。
 */
async function listRoutes() {
  const routes = await routeRepo.list()
  return routes.map(toSummary)
}

/**
 * 路线详情：路线对象 + 内嵌最近的评论与路况提示。
 *
 * 默认不返回全量 referenceTrack —— 它有几百个点，详情接口的响应体会膨胀到
 * 十几 KB。地图绘制用 displayTrack 就够（视觉上看不出区别）。
 *
 * 需要全量数据的调用方（如导航抽稀）传 includeFullTrack。
 */
async function getRouteDetail(id, options = {}) {
  const route = await routeRepo.getById(id)
  if (!route) throw notFound(`路线 ${id} 不存在`)

  // 评论和路况互不依赖，并发查，省一个来回
  const [comments, roadConditions] = await Promise.all([
    commentRepo.listByRoute(id, DETAIL_EMBED_LIMIT),
    roadConditionRepo.listByRoute(id, DETAIL_EMBED_LIMIT)
  ])

  const { includeFullTrack = false } = options
  const result = { ...route }

  result.track = route.displayTrack && route.displayTrack.length
    ? route.displayTrack
    : route.referenceTrack

  if (!includeFullTrack) delete result.referenceTrack

  return { ...result, comments, roadConditions }
}

/**
 * 创建路线。
 *
 * 坐标点由小程序端提供（地图点选、搜索规划、或录制），这里负责算出全部派生指标。
 *
 * 注意两点：
 *  - 难度必须用**全量**轨迹算。先抽稀再算的话，连续转向会被合并，
 *    弯道数会明显偏少。
 *  - 同时存一份抽稀后的 displayTrack 供地图绘制，减少详情接口传输量。
 *
 * @param {{name, roadWidth, vehicleType, trackPoints}} input 已通过校验
 * @param {string} uploadedBy
 */
async function createRoute(input, uploadedBy) {
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
    // 全量轨迹：难度计算与导航抽稀的数据源
    referenceTrack: trackPoints,
    // 展示用轨迹：DP 抽稀保形状，供地图绘制
    displayTrack: simplifyToMaxPoints(trackPoints, DISPLAY_TRACK_MAX_POINTS),
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
