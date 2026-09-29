const routeRepo = require('../repositories/routeRepo')
const commentRepo = require('../repositories/commentRepo')
const roadConditionRepo = require('../repositories/roadConditionRepo')

const { computeStats } = require('./statsService')
const { computeStars } = require('./difficultyService')
const { simplifyToMaxPoints, planarDistance } = require('../geo/simplify')
const { overlapRatio, similarityLevel } = require('../geo/similarity')
const { notFound, badRequest } = require('../errors')
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
 *
 * @param {object} filters 透传给 repo，其中 viewerId 决定「我的是否可见」
 * @param {string} [viewerId] 当前用户。传了才会带上「是不是我的」标记
 */
async function listRoutes(filters = {}, viewerId) {
  // viewerId 要透传给 repo —— 它决定「自己传的（含私有、含待审）」
  // 是否出现在结果里。只放在 toSummary 里是不够的，那样查不出来
  const routes = await routeRepo.list({ ...filters, viewerId })
  return routes.map((r) => toSummary(r, viewerId))
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

  const { includeFullTrack = false, userId } = options

  // 权限：私有路线和待审路线只对「作者本人 / 版主 / 平台管理员」可见。
  //
  // 这里必须挡，不能只靠列表接口过滤 —— 知道 id 就能直接调详情，
  // 那等于私有路线公开。之所以放版主进来：版主工作台点「看详情」
  // 跳的就是这个页面，待审路线正是他们要看的
  if (!(await canViewRoute(route, userId))) {
    throw notFound(`路线 ${id} 不存在`)
  }

  const result = { ...route }

  result.track = route.displayTrack && route.displayTrack.length
    ? route.displayTrack
    : route.referenceTrack

  if (!includeFullTrack) delete result.referenceTrack

  // 当前用户有没有收藏过 —— 详情页的收藏按钮要据此决定是实心还是空心。
  // 和评论/路况一样属于「随详情一起返回」的附属信息，不单独开接口
  const favoriteRepo = require('../repositories/favoriteRepo')
  const [comments, roadConditions, favorited, commentCount] = await Promise.all([
    commentRepo.listByRoute(id, DETAIL_EMBED_LIMIT),
    roadConditionRepo.listByRoute(id, DETAIL_EMBED_LIMIT),
    userId ? favoriteRepo.isFavorited(userId, id) : Promise.resolve(false),
    // 单独查总数 —— 内嵌的只有 10 条，拿它的长度当总数会一直卡在 10
    commentRepo.countByRoute(id)
  ])

  return { ...result, comments, roadConditions, favorited, commentCount }
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
  const {
    name, roadWidth, vehicleType, trackPoints,
    province, city, roadType, waypoints, visibility
  } = input

  const stats = computeStats(trackPoints)
  const first = trackPoints[0]
  const last = trackPoints[trackPoints.length - 1]

  return routeRepo.create({
    name,
    vehicleType,
    distanceMeters: stats.distanceMeters,
    startPoint: { lat: first.lat, lng: first.lng, radiusMeters: DEFAULT_RADIUS_METERS },
    endPoint: { lat: last.lat, lng: last.lng, radiusMeters: DEFAULT_RADIUS_METERS },
    // 途经点用于导航与分享，不参与难度计算
    waypoints: waypoints || [],
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
    // 区域与路型：用于列表筛选和版主辖区判断
    province: province || '',
    city: city || '',
    roadType: roadType || 'mountain',
    // 公开 / 私有。私有只有作者可见，且不进审核流程
    visibility: visibility || 'public',
    // 审核状态：私有直接通过；公开一律待审，由版主或平台管理员处理
    reviewStatus: await resolveReviewStatus(province, city, visibility),
    heat: 0,
    createdAt: new Date().toISOString()
  })
}

/**
 * 列表项：只保留展示需要的字段，去掉轨迹与途经点。
 *
 * @param {object} route
 * @param {string} [viewerId] 传了才计算 isMine —— 首页要靠它给
 *        自己的私有/待审路线打标记
 */
function toSummary(route, viewerId) {
  return {
    id: route.id,
    name: route.name,
    distanceMeters: route.distanceMeters,
    difficultyStars: route.difficultyStars,
    curveCount: route.curveCount,
    elevationGainMeters: route.elevationGainMeters,
    roadWidth: route.roadWidth,
    roadType: route.roadType,
    province: route.province,
    city: route.city,
    heat: route.heat,
    pinned: route.pinned,
    vehicleType: route.vehicleType,
    // 列表要能区分公开/私有（「我的路线」里两者混在一起）
    visibility: route.visibility,
    reviewStatus: route.reviewStatus,
    isMine: Boolean(viewerId && route.uploadedBy === viewerId),
    createdAt: route.createdAt
  }
}

/**
 * 判断某人能不能看某条路线。
 *
 * 规则：
 *   - 公开且已通过 → 谁都能看
 *   - 待审 / 已下架 → 只有作者、辖区版主、平台管理员能看
 *   - 私有 → 只有作者、辖区版主、平台管理员能看
 *
 * 版主和管理员放行是有意的：版主工作台点「看详情」跳的就是详情页，
 * 待审路线正是他们要看的东西；管理员要能处理所有区域。
 *
 * 注意用 notFound 而不是 forbidden 拒绝 —— 对外一律说「不存在」，
 * 不暴露「这条路线存在但你没权限」这个信息
 *
 * @returns {Promise<boolean>}
 */
async function canViewRoute(route, userId) {
  // 缺省视为「公开 + 已通过」—— 内存模式的 mock 路线不带这两个字段，
  // 仓库层别处也是这么兜底的（见 routeRepo 的 `|| 'approved'`）
  const visibility = route.visibility || 'public'
  const reviewStatus = route.reviewStatus || 'approved'

  // 公开且已通过，谁都能看
  if (visibility !== 'private' && reviewStatus === 'approved') {
    return true
  }

  if (!userId) return false

  // 作者本人
  if (route.uploadedBy === userId) return true

  const moderatorService = require('./moderatorService')

  // 平台管理员：不受辖区限制
  if (moderatorService.isAdmin(userId)) return true

  // 辖区版主：只管自己那片
  const info = await moderatorService.getMyModeratorInfo(userId)
  if (!info.isModerator) return false

  return info.regions.some(
    (r) => r.province === route.province && r.city === route.city
  )
}

/**
 * 判断新上传的路线要不要审核。
 *
 * **私有路线不审核** —— 它不进公开列表，审核没有意义，只会让用户白等。
 *
 * 公开路线一律 pending：
 *   本地有版主 → 版主审
 *   本地无版主 → 平台管理员审（见 moderatorService.listPendingRoutes）
 *
 * 注意「没有省市信息」也走 pending。之前这里返回 approved，
 * 结果定位失败反而成了绕过审核的后门 —— 拿不到区域就没人管了。
 */
async function resolveReviewStatus(province, city, visibility) {
  if (visibility === 'private') return 'approved'

  // 公开路线一律待审。审核人是谁由 listPendingRoutes 按辖区算，
  // 这里不需要区分「版主审」还是「平台审」
  return 'pending'
}

/**
 * 删除路线（作者本人）。
 *
 * 软删除 —— 不是物理删。这条路线下面挂着别人的评论、跑山成绩、
 * 收藏，物理删会级联清掉这些不属于作者的数据。
 */
async function deleteOwnRoute(routeId, userId) {
  const route = await routeRepo.getById(routeId)
  if (!route) throw notFound(`路线 ${routeId} 不存在`)
  if (route.uploadedBy !== userId) {
    throw badRequest('只能删除自己上传的路线', 'NOT_OWNER')
  }

  await routeRepo.softDelete(routeId)
  return { id: routeId, deleted: true }
}

/**
 * 找和给定轨迹重合的已有路线。
 *
 * 两处用得到：上传前查重（避免同一条山路被传好几遍）、
 * 详情页「相似路线」推荐。
 *
 * 性能上分两步，不能直接对全表算：
 *   1. 粗筛 —— 用起点距离从库里捞候选。跑山路线起点相隔几十公里
 *      就不可能是同一条，先用 SQL 把范围缩小到个位数
 *   2. 精算 —— 只对候选算轨迹重合度（O(采样数 × 点数)，比 SQL 贵得多）
 *
 * 粗筛半径默认 30km：同一条山路的不同入口、不同走法，起点一般不会
 * 超出这个量级；再大就会把不相干的路捞进来做无谓的精算。
 *
 * @param {Array<{lat,lng}>} track 待比对的轨迹
 * @param {{excludeId?, province?, city?, limit?, radiusMeters?}} [options]
 * @returns {Promise<Array>} 按重合度降序，含 overlapRatio 与 level
 */
async function findSimilarRoutes(track, options = {}) {
  const {
    excludeId = null,
    province = '',
    city = '',
    limit = 5,
    radiusMeters = 30000
  } = options

  if (!Array.isArray(track) || track.length < 2) return []

  const origin = track[0]

  // 粗筛。按起点距离排序取前 50 —— 比按热度靠谱，
  // 因为精算只关心几何上可能重合的。
  //
  // 两个关键点：
  //   1. anyReviewStatus —— 待审的也要参与查重。否则两个人前后脚传同一条路，
  //      谁都不会收到提醒，审核通过后才发现重复
  //   2. visibility='public' —— 私有路线绝不能被别人查到。查重返回了它，
  //      等于把用户的私人路线泄露出去
  const candidates = await routeRepo.list({
    province: province || 'all',
    city: city || 'all',
    sort: 'nearby',
    lat: origin.lat,
    lng: origin.lng,
    limit: 50,
    anyReviewStatus: true,
    visibility: 'public'
  })

  const scored = []

  for (const route of candidates) {
    if (excludeId !== null && Number(route.id) === Number(excludeId)) continue

    // 用全量轨迹算 —— 抽稀过的 displayTrack 已经丢了细节，
    // 拿它当比对基准会让「同一段路」看起来比实际更不像
    const otherTrack = route.referenceTrack
    if (!Array.isArray(otherTrack) || otherTrack.length < 2) continue

    // 起点太远直接跳过，省掉一次几何计算
    const startGap = planarDistance(origin, otherTrack[0])
    if (startGap > radiusMeters) continue

    const ratio = overlapRatio(track, otherTrack)
    if (ratio <= 0) continue

    scored.push({
      id: route.id,
      name: route.name,
      distanceMeters: route.distanceMeters,
      difficultyStars: route.difficultyStars,
      curveCount: route.curveCount,
      province: route.province,
      city: route.city,
      overlapRatio: Math.round(ratio * 100) / 100,
      level: similarityLevel(ratio)
    })
  }

  scored.sort((a, b) => b.overlapRatio - a.overlapRatio)
  return scored.slice(0, limit)
}

/**
 * 某条已存在路线的相似路线。
 *
 * 比 findSimilarRoutes 多一步：要先把这条路线自己的轨迹取出来。
 * 用全量 referenceTrack —— displayTrack 是抽稀过的，拿它当比对基准
 * 会让两条同路线的重合度被低估。
 */
async function findSimilarToRoute(routeId, options = {}) {
  const route = await routeRepo.getById(routeId)
  if (!route) throw notFound(`路线 ${routeId} 不存在`)

  const track = route.referenceTrack
  if (!Array.isArray(track) || track.length < 2) return []

  return findSimilarRoutes(track, {
    ...options,
    excludeId: routeId,
    // 不按省市过滤 —— 相似路线本来就该跨省也能发现，
    // 起点的 30km 粗筛已经把范围收得够紧了
    province: '',
    city: ''
  })
}

module.exports = {
  listRoutes,
  getRouteDetail,
  createRoute,
  toSummary,
  resolveReviewStatus,
  deleteOwnRoute,
  findSimilarRoutes,
  findSimilarToRoute
}
