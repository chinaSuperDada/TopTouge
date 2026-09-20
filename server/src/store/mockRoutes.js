const { computeStats } = require('../services/statsService')
const { computeStars } = require('../services/difficultyService')
const { simplifyToMaxPoints } = require('../geo/simplify')
const {
  DEFAULT_RADIUS_METERS,
  DEFAULT_VEHICLE_TYPE,
  DISPLAY_TRACK_MAX_POINTS
} = require('../constants')

const METERS_PER_DEG_LAT = 111320

const metersToLatDeg = (m) => m / METERS_PER_DEG_LAT
const metersToLngDeg = (m, lat) => m / (METERS_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180))

/**
 * 三条 mock 路线的配方。
 *
 * 结构模拟真实盘山道：**直道爬坡 → 发夹弯 → 缓直路 → 发夹弯 …**，
 * 到顶后原路折返下山，最后直线收尾回到起点，因此是闭合环线。
 * 「开始跑山」能从起点出发、绕一圈回到起点附近的终点，阶段二的起终点匹配才有意义。
 *
 * 几个非显然的取值原因：
 *
 *  - **发夹弯之间必须有 `relaxSegs` 段缓直路**。检测器把「连续超过 30° 的转向」
 *    合并为一个弯道区间；如果弯与弯之间不留直路，整条路线会塌缩成 1 个弯道。
 *
 *  - **弯道密度 ≈ 345 / legMeters，与弯的数量无关**。因为总长度 ≈ 2·corners·leg，
 *    弯道数 ≈ 2·corners，corners 约掉了。想拉开难度档次只能缩短单段长度
 *    （或加大采样步长），加弯道数没用。`sampleStepMeters` 因此也是难度旋钮之一。
 *
 *  - **`turnDeg` 决定急弯占比**。检测器阈值是 60°，所以 turnDeg < 60 时急弯占比为 0，
 *    是「缓弯路线」；> 60 时全是急弯。
 *
 * 三条路线刻意拉到 2 / 3 / 5 星，用来验证前端难度区分度是否可见。
 * 参数是扫描出来的，改动前先跑 tests/mockRoutes 的断言。
 */
const RECIPES = [
  {
    name: '西山缓坡环线',
    roadWidth: 'wide',
    center: { lat: 39.9922, lng: 116.1901 }, // 北京西山一带
    headingDeg: 20,
    sampleStepMeters: 50,
    legMeters: 220,
    relaxSegs: 4,
    cornerCount: 14,
    turnDeg: 75,
    elevationGain: 300
  },
  {
    name: '一线天盘山道',
    roadWidth: 'medium',
    center: { lat: 30.2451, lng: 120.1152 }, // 杭州西湖群山
    headingDeg: 75,
    sampleStepMeters: 30,
    legMeters: 150,
    relaxSegs: 3,
    cornerCount: 20,
    turnDeg: 85,
    elevationGain: 450
  },
  {
    name: '九曲发夹弯',
    roadWidth: 'narrow',
    center: { lat: 30.6634, lng: 104.0658 }, // 成都龙泉山
    headingDeg: 140,
    sampleStepMeters: 25,
    legMeters: 100,
    relaxSegs: 2,
    cornerCount: 32,
    turnDeg: 115,
    elevationGain: 1300
  }
]

// 收尾段步数：把轨迹平滑地拉回起点
const CLOSING_STEPS = 8

/**
 * 沿某航向前进 meters 米，按 stepMeters 打点，高度分摊到各点。
 */
function advance(points, state, bearingDeg, meters, altitudeDelta, stepMeters) {
  const steps = Math.max(1, Math.round(meters / stepMeters))
  const perStep = meters / steps
  const altPerStep = altitudeDelta / steps

  for (let i = 0; i < steps; i++) {
    const rad = (bearingDeg * Math.PI) / 180
    state.lat += metersToLatDeg(Math.cos(rad) * perStep)
    state.lng += metersToLngDeg(Math.sin(rad) * perStep, state.lat)
    state.altitude += altPerStep

    points.push({
      lat: state.lat,
      lng: state.lng,
      altitude: Math.max(0, Math.round(state.altitude))
    })
  }
}

/**
 * 生成一条折返式盘山路。
 *
 * 上山每段由「直道爬升 + 发夹弯 + 缓直路」组成，下山整体折返 180° 沿走廊返回。
 */
function buildLoop(recipe) {
  const {
    center,
    legMeters,
    relaxSegs,
    cornerCount,
    turnDeg,
    elevationGain,
    headingDeg,
    sampleStepMeters
  } = recipe

  const points = [{ lat: center.lat, lng: center.lng, altitude: 0 }]
  const state = { lat: center.lat, lng: center.lng, altitude: 0 }
  let heading = headingDeg

  const climbPerCorner = elevationGain / cornerCount
  const relaxMeters = (legMeters * relaxSegs) / 3
  const step = sampleStepMeters

  // 上山
  for (let c = 0; c < cornerCount; c++) {
    advance(points, state, heading, legMeters, climbPerCorner * 0.7, step)
    heading += turnDeg
    advance(points, state, heading, relaxMeters, climbPerCorner * 0.3, step)
  }

  // 下山：折返 180°，高度降回 0
  heading += 180
  const descent = -state.altitude

  for (let c = 0; c < cornerCount; c++) {
    heading -= turnDeg
    advance(points, state, heading, relaxMeters, descent / (cornerCount * 2), step)
    advance(points, state, heading, legMeters, descent / (cornerCount * 2), step)
  }

  // 收尾：直线插值回到起点，高度归零，保证闭环
  const tail = { lat: state.lat, lng: state.lng, altitude: state.altitude }
  for (let i = 1; i <= CLOSING_STEPS; i++) {
    const t = i / CLOSING_STEPS
    points.push({
      lat: tail.lat + (center.lat - tail.lat) * t,
      lng: tail.lng + (center.lng - tail.lng) * t,
      altitude: Math.max(0, Math.round(tail.altitude * (1 - t)))
    })
  }

  return points
}

/**
 * 从轨迹点均匀抽取途经点，模拟山路上的地标。
 */
function pickWaypoints(points) {
  if (points.length < 12) return []

  const names = ['观景台', '半山亭', '急弯瞭望点', '垭口']
  const count = Math.min(names.length, Math.max(2, Math.floor(points.length / 40)))
  const waypoints = []

  for (let i = 1; i <= count; i++) {
    const idx = Math.floor((points.length * i) / (count + 1))
    const p = points[idx]
    waypoints.push({ name: names[i - 1], lat: p.lat, lng: p.lng })
  }
  return waypoints
}

/**
 * 生成 3 条 mock 路线对象。字段与用户上传路线完全一致，
 * 唯一区别是 uploadedBy 为 'system'。
 *
 * @returns {Array<object>}
 */
function generateMockRoutes() {
  const now = new Date().toISOString()

  return RECIPES.map((recipe) => {
    const referenceTrack = buildLoop(recipe)
    const stats = computeStats(referenceTrack)

    const first = referenceTrack[0]
    const last = referenceTrack[referenceTrack.length - 1]

    return {
      name: recipe.name,
      vehicleType: DEFAULT_VEHICLE_TYPE,
      distanceMeters: stats.distanceMeters,
      startPoint: { lat: first.lat, lng: first.lng, radiusMeters: DEFAULT_RADIUS_METERS },
      endPoint: { lat: last.lat, lng: last.lng, radiusMeters: DEFAULT_RADIUS_METERS },
      waypoints: pickWaypoints(referenceTrack),
      // 全量轨迹：难度计算的数据源
      referenceTrack,
      // 展示用轨迹：DP 抽稀保形状，供地图绘制
      displayTrack: simplifyToMaxPoints(referenceTrack, DISPLAY_TRACK_MAX_POINTS),
      uploadedBy: 'system',
      curveCount: stats.curveCount,
      sharpCurveRatio: stats.sharpCurveRatio,
      elevationGainMeters: stats.elevationGainMeters,
      roadWidth: recipe.roadWidth,
      difficultyStars: computeStars(stats),
      createdAt: now
    }
  })
}

module.exports = { generateMockRoutes, RECIPES, buildLoop, pickWaypoints, CLOSING_STEPS }
