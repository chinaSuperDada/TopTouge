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

/** 单个路线详情。接后端后换成 GET /api/routes/:id */
function getRoute(id) {
  const found = MOCK_ROUTES.find((r) => r.id === Number(id)) || MOCK_ROUTES[0]
  return Promise.resolve({
    ...found,
    // 轨迹与起终点是详情页特有的字段
    track: [],
    startPoint: { lat: 30.236382, lng: 119.955802, radiusMeters: 30 },
    endPoint: { lat: 30.139339, lng: 119.884014, radiusMeters: 30 },
    waypoints: [
      { name: '观景台', lat: 30.21, lng: 119.93 },
      { name: '半山亭', lat: 30.18, lng: 119.91 }
    ],
    comments: [],
    roadConditions: []
  })
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
  getCurrentLocation
}
