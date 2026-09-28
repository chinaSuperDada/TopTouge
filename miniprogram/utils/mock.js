/**
 * 前端 mock 数据。
 *
 * ⚠️ 临时方案：后端接口还没实现，先用这份假数据把界面跑起来。
 * 接后端时把这里每个导出函数改成 request.get(...) 即可，
 * 页面代码不用动 —— 所以函数的签名要跟未来的接口保持一致。
 *
 * 数据结构也按后端返回的格式写（见 server/src/services/routeService.js），
 * 避免接入时还要改页面的字段引用。
 */

/* ==================== 活动位 ==================== */

/**
 * 首页顶部的横滑活动卡。
 * 后端接入后由运营配置，数量 4~10 个。
 */
const BANNERS = [
  { id: 1, title: '周末跑山季', subtitle: '精选 12 条路线', tag: '热门活动', color: '#1f6feb' },
  { id: 2, title: '新手友好', subtitle: '一星难度入门', tag: '推荐', color: '#2ea043' },
  { id: 3, title: '发夹弯挑战', subtitle: '弯道 50+ 的极限', tag: '热门路线', color: '#d97706' },
  { id: 4, title: '杭州周边', subtitle: '本周新收录 8 条', tag: '地区', color: '#8250df' },
  { id: 5, title: '非铺装探险', subtitle: '越野路况实拍', tag: '专题', color: '#bf3989' },
  { id: 6, title: '赛道日', subtitle: '封闭场地练习', tag: '活动', color: '#c2410c' }
]

/* ==================== 筛选选项 ==================== */

const DIFFICULTY_OPTIONS = [
  { value: 'all', label: '全部难度' },
  { value: 1, label: '简单', stars: 1 },
  { value: 2, label: '较易', stars: 2 },
  { value: 3, label: '中等', stars: 3 },
  { value: 4, label: '较难', stars: 4 },
  { value: 5, label: '困难', stars: 5 }
]

/** 路线类型。与后端的 vehicleType 不同，这是「路况类型」 */
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

/** 省份 → 城市。真实项目里应该从后端拉，先内置几个常用的 */
const REGIONS = [
  {
    province: '浙江省',
    cities: ['杭州市', '宁波市', '温州市', '湖州市', '绍兴市']
  },
  {
    province: '四川省',
    cities: ['成都市', '乐山市', '绵阳市', '雅安市']
  },
  {
    province: '北京市',
    cities: ['北京市']
  },
  {
    province: '广东省',
    cities: ['广州市', '深圳市', '珠海市', '惠州市']
  }
]

/* ==================== 路线 ==================== */

/**
 * 生成一条路线。
 * 字段与后端 API 返回保持一致（camelCase）。
 */
function makeRoute(i, overrides = {}) {
  const base = {
    id: i,
    name: `路线 ${i}`,
    distanceMeters: 8000,
    difficultyStars: 3,
    curveCount: 20,
    elevationGainMeters: 300,
    roadWidth: 'medium',
    roadType: 'mountain',
    vehicleType: 'car',
    province: '浙江省',
    city: '杭州市',
    heat: 100,
    // 离当前位置的距离，由「离我最近」排序用
    distanceFromMeMeters: 20000,
    createdAt: '2026-09-20T09:00:00.000Z'
  }
  return { ...base, ...overrides }
}

const MOCK_ROUTES = [
  makeRoute(1, {
    name: '九曲发夹弯', distanceMeters: 10700, difficultyStars: 5, curveCount: 65,
    elevationGainMeters: 1300, roadWidth: 'narrow', heat: 4280,
    distanceFromMeMeters: 12000, city: '杭州市', province: '浙江省'
  }),
  makeRoute(2, {
    name: '一线天盘山道', distanceMeters: 12200, difficultyStars: 3, curveCount: 41,
    elevationGainMeters: 450, roadWidth: 'medium', heat: 3150,
    distanceFromMeMeters: 25000, city: '杭州市', province: '浙江省'
  }),
  makeRoute(3, {
    name: '西山缓坡环线', distanceMeters: 14500, difficultyStars: 2, curveCount: 29,
    elevationGainMeters: 300, roadWidth: 'wide', heat: 2680,
    distanceFromMeMeters: 32000, city: '湖州市', province: '浙江省'
  }),
  makeRoute(4, {
    name: '龙泉山十八弯', distanceMeters: 9600, difficultyStars: 4, curveCount: 52,
    elevationGainMeters: 880, roadWidth: 'narrow', heat: 3900,
    distanceFromMeMeters: 180000, city: '成都市', province: '四川省'
  }),
  makeRoute(5, {
    name: '妙峰山经典线', distanceMeters: 13400, difficultyStars: 4, curveCount: 48,
    elevationGainMeters: 960, roadWidth: 'medium', heat: 5120,
    distanceFromMeMeters: 1200000, city: '北京市', province: '北京市'
  }),
  makeRoute(6, {
    name: '梧桐山盘山公路', distanceMeters: 7800, difficultyStars: 2, curveCount: 18,
    elevationGainMeters: 260, roadWidth: 'wide', heat: 1890,
    distanceFromMeMeters: 1350000, city: '深圳市', province: '广东省'
  }),
  makeRoute(7, {
    name: '四明山越野线', distanceMeters: 11200, difficultyStars: 5, curveCount: 44,
    elevationGainMeters: 1100, roadWidth: 'narrow', roadType: 'gravel', heat: 2260,
    distanceFromMeMeters: 45000, city: '宁波市', province: '浙江省'
  }),
  makeRoute(8, {
    name: '南昆山赛道', distanceMeters: 5200, difficultyStars: 3, curveCount: 22,
    elevationGainMeters: 180, roadWidth: 'wide', roadType: 'track', heat: 3400,
    distanceFromMeMeters: 980000, city: '惠州市', province: '广东省'
  }),
  makeRoute(9, {
    name: '青城后山环线', distanceMeters: 12900, difficultyStars: 3, curveCount: 38,
    elevationGainMeters: 620, roadWidth: 'medium', heat: 2010,
    distanceFromMeMeters: 210000, city: '成都市', province: '四川省'
  }),
  makeRoute(10, {
    name: '千岛湖环湖路', distanceMeters: 28600, difficultyStars: 2, curveCount: 34,
    elevationGainMeters: 420, roadWidth: 'wide', roadType: 'highway', heat: 4650,
    distanceFromMeMeters: 78000, city: '杭州市', province: '浙江省'
  })
]

/* ==================== 查询接口 ==================== */

/**
 * 按条件筛选路线。
 *
 * 参数结构与未来的后端接口保持一致：
 *   GET /api/routes?province=&city=&difficulty=&roadType=&sort=
 *
 * @param {object} filters
 * @returns {Promise<Array>}
 */
function queryRoutes(filters = {}) {
  const {
    province = 'all',
    city = 'all',
    difficulty = 'all',
    roadType = 'all',
    sort = 'hot'
  } = filters

  let list = MOCK_ROUTES.slice()

  if (province !== 'all') list = list.filter((r) => r.province === province)
  if (city !== 'all') list = list.filter((r) => r.city === city)
  if (difficulty !== 'all') list = list.filter((r) => r.difficultyStars === Number(difficulty))
  if (roadType !== 'all') list = list.filter((r) => r.roadType === roadType)

  const sorters = {
    hot: (a, b) => b.heat - a.heat,
    length: (a, b) => b.distanceMeters - a.distanceMeters,
    nearby: (a, b) => a.distanceFromMeMeters - b.distanceFromMeMeters,
    newest: (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  }
  list.sort(sorters[sort] || sorters.hot)

  return Promise.resolve(list)
}

/**
 * 单个路线详情。接后端后换成 GET /api/routes/:id
 *
 * 备注：路径规划用的坐标放在 markRawData 里，
 * 详情页要用它画地图和生成导航链接。
 */
function getRoute(id) {
  const found = MOCK_ROUTES.find((r) => r.id === Number(id)) || MOCK_ROUTES[0]

  return Promise.resolve({
    ...found,
    // 轨迹：一圈带起伏的环线，够画出形状即可
    track: buildTrack(found),
    startPoint: { lat: 30.236382, lng: 119.955802, radiusMeters: 30 },
    endPoint: { lat: 30.236382, lng: 119.955802, radiusMeters: 30 },
    waypoints: [
      { name: '观景台', lat: 30.2451, lng: 119.9682 },
      { name: '半山亭', lat: 30.2288, lng: 119.9431 }
    ],
    comments: [],
    roadConditions: []
  })
}

/** 生成一条闭合轨迹，用于地图绘制 */
function buildTrack(route) {
  const centerLat = 30.236382
  const centerLng = 119.955802
  // 半径按路线长度粗略换算，让不同路线在地图上的大小有区别
  const radius = Math.min(0.03, route.distanceMeters / 1000 / 400)
  const points = []
  const steps = 48

  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * 2 * Math.PI
    // 加一点正弦扰动，看起来像山路而不是正圆
    const r = radius * (1 + 0.25 * Math.sin(angle * 4))
    points.push({
      lat: centerLat + Math.cos(angle) * r,
      lng: centerLng + Math.sin(angle) * r * 1.2,
      altitude: Math.round(200 + Math.sin(angle * 2) * 150)
    })
  }
  return points
}

/**
 * 路线成绩榜。
 * 接后端后换成 GET /api/routes/:id/ranking
 */
function getRanking(routeId) {
  const base = [
    { userName: '车友 3072', score: 982, seconds: 512 },
    { userName: '车友 7790', score: 951, seconds: 548 },
    { userName: '车友 1145', score: 923, seconds: 571 },
    { userName: '车友 6203', score: 894, seconds: 602 },
    { userName: '车友 8834', score: 861, seconds: 634 },
    { userName: '车友 2261', score: 830, seconds: 668 },
    { userName: '车友 5518', score: 802, seconds: 695 },
    { userName: '车友 9907', score: 776, seconds: 721 }
  ]

  const list = base.map((item, i) => ({
    rank: i + 1,
    userName: item.userName,
    score: item.score,
    // 用时只在榜单上展示 —— 详情页的跑山结果页是不显示的（任务书要求）
    timeText: formatDuration(item.seconds)
  }))

  return Promise.resolve(list)
}

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * 提交跑山记录。
 *
 * 后端接口还没实现，这里按真实算法算一个分数出来，让流程能走通：
 *   分数 = 时间百分位 × 1000
 *
 * 真实实现里「百分位」要拿该路线所有历史成绩来算；没有历史数据时
 * 只能估一个。这里用「越快分越高」的简化映射，避免出现所有新路线
 * 第一次跑都是 0 分的情况。
 *
 * 接后端后换成 POST /api/runs { routeId, vehicleType, trackPoints, dataMode }
 */
function submitRun({ routeId, elapsedSeconds }) {
  const route = MOCK_ROUTES.find((r) => r.id === Number(routeId)) || MOCK_ROUTES[0]

  // 用路线长度估一个「参考用时」：按平均时速 35km 算，再留 30% 浮动
  const refSeconds = (route.distanceMeters / 1000 / 35) * 3600

  // 比参考用时快 → 分高。比值 0.5 得满分，2.0 得 0 分
  const ratio = elapsedSeconds / refSeconds
  const score = Math.max(1, Math.min(1000, Math.round((2 - ratio) * 666)))

  // 名次：假设榜上已有若干人，按分数粗排
  const total = 24
  const rank = Math.max(1, Math.min(total, Math.round((1 - score / 1000) * total) + 1))

  return Promise.resolve({ score, rank, total })
}


/* ==================== 我的 ==================== */

/**
 * 我跑过的记录。
 * 接后端后换成 GET /api/me/runs
 */
function getMyRuns() {
  const base = [
    { routeId: 1, routeName: '九曲发夹弯', score: 782, rank: 8, total: 24, daysAgo: 1 },
    { routeId: 1, routeName: '九曲发夹弯', score: 745, rank: 13, total: 24, daysAgo: 5 },
    { routeId: 2, routeName: '一线天盘山道', score: 861, rank: 3, total: 17, daysAgo: 8 },
    { routeId: 3, routeName: '西山缓坡环线', score: 690, rank: 11, total: 32, daysAgo: 12 },
    { routeId: 5, routeName: '妙峰山经典线', score: 903, rank: 2, total: 41, daysAgo: 20 },
    { routeId: 7, routeName: '四明山越野线', score: 618, rank: 9, total: 12, daysAgo: 33 }
  ]

  return Promise.resolve(
    base.map((r, i) => ({ ...r, id: i + 1, timeText: relativeDay(r.daysAgo) }))
  )
}

/** 我上传的路线。接后端后换成 GET /api/me/routes */
function getMyRoutes() {
  return Promise.resolve(
    MOCK_ROUTES.slice(0, 3).map((r) => ({
      id: r.id,
      name: r.name,
      distanceMeters: r.distanceMeters,
      difficultyStars: r.difficultyStars,
      curveCount: r.curveCount,
      heat: r.heat,
      // 审核状态：pending 待审核 / approved 已通过 / rejected 已驳回
      reviewStatus: 'approved'
    }))
  )
}

/** 我收藏的路线。接后端后换成 GET /api/me/favorites */
function getMyFavorites() {
  return Promise.resolve(MOCK_ROUTES.slice(2, 7).map((r) => ({ ...r })))
}

/** 天数转「N天前」这种相对描述 */
function relativeDay(days) {
  if (days <= 0) return '今天'
  if (days === 1) return '昨天'
  if (days < 30) return `${days}天前`
  return `${Math.floor(days / 30)}个月前`
}


/* ==================== 版主 ==================== */

/**
 * 当前用户的版主身份。
 * 接后端后换成 GET /api/me/moderator
 */
function getModeratorInfo() {
  return Promise.resolve({
    // 没有版主身份时 regions 为空数组
    regions: [{ province: '浙江省', city: '杭州市' }],
    nickname: '车友 3072',
    // 什么时候成为版主的
    since: '2026-06-01'
  })
}

/**
 * 待审核的路线。
 * 接后端后换成 GET /api/moderator/routes?status=pending
 */
function getPendingRoutes() {
  const base = [
    { id: 101, name: '龙泉山新环线', distanceMeters: 12300, curveCount: 45, difficultyStars: 4,
      roadType: 'mountain', city: '杭州市', author: '车友 8834', hoursAgo: 2 },
    { id: 102, name: '径山盘山道', distanceMeters: 8700, curveCount: 28, difficultyStars: 3,
      roadType: 'mountain', city: '杭州市', author: '车友 2261', hoursAgo: 5 },
    { id: 103, name: '千岛湖东线', distanceMeters: 15200, curveCount: 33, difficultyStars: 2,
      roadType: 'highway', city: '杭州市', author: '车友 5518', hoursAgo: 26 },
    { id: 104, name: '莫干山非铺装', distanceMeters: 9400, curveCount: 51, difficultyStars: 5,
      roadType: 'gravel', city: '湖州市', author: '车友 9907', hoursAgo: 40 }
  ]

  return Promise.resolve(
    base.map((r) => ({ ...r, id: r.id, timeText: relativeHour(r.hoursAgo) }))
  )
}

/**
 * 本区已上架的路线。
 * 接后端后换成 GET /api/moderator/routes?status=approved
 */
function getManagedRoutes() {
  return Promise.resolve(
    MOCK_ROUTES.filter((r) => r.city === '杭州市').map((r) => ({
      id: r.id,
      name: r.name,
      distanceMeters: r.distanceMeters,
      curveCount: r.curveCount,
      difficultyStars: r.difficultyStars,
      heat: r.heat,
      // 版主可以把优质路线置顶
      pinned: r.id === 1
    }))
  )
}

/**
 * 本区活动。
 * 接后端后换成 GET /api/moderator/activities
 */
function getManagedActivities() {
  return Promise.resolve([
    { id: 1, title: '周六晨跑 · 九曲发夹弯', status: 'published', statusText: '进行中',
      joined: 12, startsAt: '09-28 07:00' },
    { id: 2, title: '新手教学 · 缓坡环线', status: 'draft', statusText: '草稿',
      joined: 0, startsAt: '10-05 09:00' }
  ])
}

/** 小时数转相对描述 */
function relativeHour(hours) {
  if (hours < 1) return '刚刚'
  if (hours < 24) return `${hours}小时前`
  const d = Math.floor(hours / 24)
  return d === 1 ? '昨天' : `${d}天前`
}

/** 当前位置。接后端/定位后由真实定位替换 */
function getCurrentLocation() {
  return Promise.resolve({ province: '浙江省', city: '杭州市', lat: 30.2741, lng: 120.1551 })
}

module.exports = {
  BANNERS,
  DIFFICULTY_OPTIONS,
  ROAD_TYPE_OPTIONS,
  SORT_OPTIONS,
  REGIONS,
  MOCK_ROUTES,
  queryRoutes,
  getRoute,
  getRanking,
  submitRun,
  getMyRuns,
  getMyRoutes,
  getMyFavorites,
  getModeratorInfo,
  getPendingRoutes,
  getManagedRoutes,
  getManagedActivities,
  getCurrentLocation
}
