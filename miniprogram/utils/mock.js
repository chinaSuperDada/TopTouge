/**
 * 数据访问层。
 *
 * ⚠️ 这里曾经是一份 mock 数据。现在后端接口已就绪，改成真实调用 ——
 * **函数签名保持不变**，所以页面代码一行都不用改。
 *
 * 之所以保留这个中间层而不是让页面直接调 request，是因为：
 *   - 页面只需要关心「拿数据」，不用管 URL 和参数拼装
 *   - 排序/筛选这类逻辑集中在服务端，前端不重复实现
 *   - 将来加缓存、重试也只改这里
 *
 * 静态选项（难度、路型、排序、省市）仍然是前端常量 ——
 * 它们不会变，没必要每次请求。
 */

const api = require('./request')

/* ==================== 静态选项 ==================== */

const DIFFICULTY_OPTIONS = [
  { value: 'all', label: '全部难度' },
  { value: 1, label: '简单' },
  { value: 2, label: '较易' },
  { value: 3, label: '中等' },
  { value: 4, label: '较难' },
  { value: 5, label: '困难' }
]

const ROAD_TYPE_OPTIONS = [
  { value: 'all', label: '全部类型' },
  { value: 'mountain', label: '山路' },
  { value: 'track', label: '赛道' },
  { value: 'gravel', label: '非铺装' },
  { value: 'highway', label: '公路' }
]

const SORT_OPTIONS = [
  { value: 'hot', label: '热度最高' },
  { value: 'length', label: '长度最长' },
  { value: 'nearby', label: '离我最近' },
  { value: 'newest', label: '最新收录' }
]

/**
 * 省市列表。
 * 真实项目应该从后端拉（或者用高德的城市数据），
 * 但城市列表变动极少，先内置常用的几个。
 */
const REGIONS = [
  { province: '浙江省', cities: ['杭州市', '宁波市', '温州市', '湖州市', '绍兴市'] },
  { province: '四川省', cities: ['成都市', '乐山市', '绵阳市', '雅安市'] },
  { province: '北京市', cities: ['北京市'] },
  { province: '广东省', cities: ['广州市', '深圳市', '珠海市', '惠州市'] }
]

/* ==================== 路线 ==================== */

/**
 * 路线列表（带筛选与排序）。
 *
 * @param {{province, city, difficulty, roadType, sort, lat, lng}} filters
 */
function queryRoutes(filters = {}) {
  const query = {}

  // 只把有效条件传给后端，'all' 是前端的「不限」，后端不认
  if (filters.province && filters.province !== 'all') query.province = filters.province
  if (filters.city && filters.city !== 'all') query.city = filters.city
  if (filters.difficulty && filters.difficulty !== 'all') query.difficulty = filters.difficulty
  if (filters.roadType && filters.roadType !== 'all') query.roadType = filters.roadType
  if (filters.sort) query.sort = filters.sort
  if (filters.lat) query.lat = filters.lat
  if (filters.lng) query.lng = filters.lng

  return api.get('/api/routes', { data: query }).then((res) => res.routes || [])
}

/** 路线详情。返回值里带 favorited，收藏按钮据此决定状态 */
function getRoute(id) {
  return api.get(`/api/routes/${id}`)
}

/** 成绩榜 */
function getRanking(routeId) {
  return api.get(`/api/routes/${routeId}/ranking`).then((res) => res.ranking || [])
}

/** 这条路线的相似路线（按轨迹重合度） */
function getSimilarRoutes(routeId) {
  return api.get(`/api/routes/${routeId}/similar`).then((res) => res.similar || [])
}

/**
 * 上传前查重。
 *
 * 传一条轨迹，返回库里和它重合的已有路线。命中度高的（level=duplicate）
 * 应该提示用户确认，避免同一条山路被反复上传。
 */
function checkDuplicate({ trackPoints, province, city }) {
  return api.post('/api/routes/check-duplicate', { trackPoints, province, city })
}

/**
 * 提交跑山成绩。
 *
 * @param {{routeId, vehicleType, trackPoints, dataMode}} input
 */
function submitRun(input) {
  return api.post('/api/runs', {
    routeId: input.routeId,
    vehicleType: input.vehicleType || 'car',
    dataMode: input.dataMode || 'ranked',
    trackPoints: input.trackPoints || []
  })
}

/* ==================== 活动位 ==================== */

/** 首页活动位。人工活动 + 算法位，按区域返回 */
function getBanners({ province, city } = {}) {
  const query = {}
  if (province && province !== 'all') query.province = province
  if (city && city !== 'all') query.city = city

  return api.get('/api/banners', { data: query }).then((res) => res.banners || [])
}

/* ==================== 我的 ==================== */

/** 我的跑山记录 */
function getMyRuns() {
  return api.get('/api/me/runs').then((res) => res.runs || [])
}

/** 我上传的路线（含待审和被驳回的） */
function getMyRoutes() {
  return api.get('/api/me/routes').then((res) => res.routes || [])
}

/** 我的收藏 */
function getMyFavorites() {
  return api.get('/api/me/favorites').then((res) => res.routes || [])
}

/** 收藏 / 取消收藏 */
function addFavorite(routeId) {
  return api.post(`/api/me/favorites/${routeId}`)
}

function removeFavorite(routeId) {
  return api.request({ url: `/api/me/favorites/${routeId}`, method: 'DELETE' })
}

/** 删除自己的路线 */
function deleteMyRoute(routeId) {
  return api.request({ url: `/api/me/routes/${routeId}`, method: 'DELETE' })
}

/* ==================== 用户资料 ==================== */

/** 我的资料。没填过时返回空的昵称和头像 */
function getProfile() {
  return api.get('/api/me/profile')
}

/**
 * 更新资料。
 *
 * 只传要改的字段 —— nickName 和 avatar 都可选。
 * 传 undefined 表示不改这个字段，传空串表示清除。
 */
function updateProfile(patch) {
  return api.request({ url: '/api/me/profile', method: 'PUT', data: patch })
}

/* ==================== 跑山相关 ==================== */

/** 当前位置。用真实定位，失败退回默认坐标 */
function getCurrentLocation() {
  const { getLocation } = require('./location')

  return getLocation({ silent: true }).then((pos) => {
    if (pos) return { lat: pos.lat, lng: pos.lng, province: '', city: '' }
    // 定位失败就给个默认值，不影响浏览
    return { lat: 30.2741, lng: 120.1551, province: '浙江省', city: '杭州市' }
  })
}

/* ==================== 版主 ==================== */

/** 我的版主身份 */
function getModeratorInfo() {
  return api.get('/api/me/moderator', { showError: false })
}

/** 待审核路线 */
function getPendingRoutes() {
  return api.get('/api/moderator/pending').then((res) => res.routes || [])
}

/** 本区已上架路线 */
function getManagedRoutes() {
  return api.get('/api/moderator/routes').then((res) => res.routes || [])
}

/** 审核通过 / 驳回 */
function reviewRoute(routeId, status, reason) {
  return api.post(`/api/moderator/routes/${routeId}/review`, { status, reason })
}

/** 置顶 / 取消置顶 */
function pinRoute(routeId, pinned) {
  return api.post(`/api/moderator/routes/${routeId}/pin`, { pinned })
}

/** 下架本区路线。作者仍能在「我的路线」看到，数据不丢 */
function takeDownRoute(routeId, reason) {
  return api.post(`/api/moderator/routes/${routeId}/take-down`, { reason })
}

/** 删除本区路线 */
function deleteManagedRoute(routeId) {
  return api.request({ url: `/api/moderator/routes/${routeId}`, method: 'DELETE' })
}

/** 本区活动 */
function getManagedActivities() {
  return api.get('/api/moderator/activities').then((res) => res.activities || [])
}

/** 新建活动 */
function createActivity({ title, subtitle, startsAt, endsAt }) {
  return api.post('/api/moderator/activities', { title, subtitle, startsAt, endsAt })
}

/** 发布 / 下线 */
function updateActivityStatus(id, status) {
  return api.post(`/api/moderator/activities/${id}/status`, { status })
}

/** 删除活动 */
function deleteActivity(id) {
  return api.request({ url: `/api/moderator/activities/${id}`, method: 'DELETE' })
}

module.exports = {
  // 静态选项
  DIFFICULTY_OPTIONS,
  ROAD_TYPE_OPTIONS,
  SORT_OPTIONS,
  REGIONS,

  // 路线
  queryRoutes,
  getRoute,
  getRanking,
  getSimilarRoutes,
  checkDuplicate,
  submitRun,
  getBanners,

  // 用户资料
  getProfile,
  updateProfile,

  // 我的
  getMyRuns,
  getMyRoutes,
  getMyFavorites,
  addFavorite,
  removeFavorite,
  deleteMyRoute,

  // 其他
  getCurrentLocation,

  // 版主
  getModeratorInfo,
  getPendingRoutes,
  getManagedRoutes,
  reviewRoute,
  pinRoute,
  takeDownRoute,
  deleteManagedRoute,
  getManagedActivities,
  createActivity,
  updateActivityStatus,
  deleteActivity
}
