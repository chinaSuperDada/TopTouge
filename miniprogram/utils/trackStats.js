/**
 * 提交前的轨迹统计。
 *
 * 和 `server/src/services/statsService.js` 是**同一套算法**，为的是
 * 在用户点提交之前就把距离、弯道数、爬升算出来给他确认。
 *
 * 为什么不直接调后端算：那样用户点「提交」要先等一次网络往返，
 * 确认框才弹出来；网络一慢就像卡死了。本地算 800 个点是微秒级，
 * 弹窗立刻能出来。
 *
 * ⚠️ 阈值必须和后端 constants.js 保持一致，否则确认框显示的数字
 * 会和提交后详情页的对不上 —— 那比不显示还糟。
 */

// 与 server/src/constants.js 同步
const TURN_THRESHOLD_DEG = 30
const SHARP_TURN_DEG = 60
const CURVES_PER_KM_MAX = 6
const GAIN_PER_KM_MAX = 100

const toRad = (deg) => (deg * Math.PI) / 180

/** 两点球面距离（米）。用 haversine，与后端一致 */
function distanceMeters(a, b) {
  const R = 6371008.8
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2

  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

function bearing(a, b) {
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const y = Math.sin(dLng) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)
  return (Math.atan2(y, x) * 180) / Math.PI
}

/** 相邻三点的转向角，归一化到 (-180, 180] */
function turnAngle(p0, p1, p2) {
  let delta = bearing(p1, p2) - bearing(p0, p1)
  delta = (((delta + 180) % 360) + 360) % 360 - 180
  // 边界吸附：180° 调头算出的 -179.999 会被阈值漏掉
  if (delta < -179.9) return -180
  if (delta > 179.9) return 180
  return delta
}

/**
 * 数弯道：连续超阈值的转向点合并成一个弯道区间，区间数即弯道数。
 * 区间内峰值角超急弯阈值，整个区间记为急弯。
 */
function countCurves(points) {
  if (points.length < 3) return { total: 0, sharp: 0 }

  let total = 0
  let sharp = 0
  let inCurve = false
  let peak = 0

  const close = () => {
    if (!inCurve) return
    total += 1
    if (peak > SHARP_TURN_DEG) sharp += 1
    inCurve = false
    peak = 0
  }

  for (let i = 1; i < points.length - 1; i++) {
    const angle = Math.abs(turnAngle(points[i - 1], points[i], points[i + 1]))
    if (angle > TURN_THRESHOLD_DEG) {
      inCurve = true
      if (angle > peak) peak = angle
    } else {
      close()
    }
  }
  close()

  return { total, sharp }
}

/**
 * 按后端同一套规则算难度星级。
 *
 * 取两个维度的**较大值**而不是平均 —— 后端就是这么做的：
 * 一段带爬升的缓弯，平均会被小爬升拉低星级。
 */
function computeStars({ curveCount, distanceMeters, elevationGainMeters }) {
  const km = distanceMeters / 1000
  if (km <= 0) return 1

  const curvesPerKm = curveCount / km
  const gainPerKm = elevationGainMeters / km

  // 线性映射到 0~1，超出上限即封顶
  const curveScore = Math.min(1, curvesPerKm / CURVES_PER_KM_MAX)
  const gainScore = Math.min(1, gainPerKm / GAIN_PER_KM_MAX)

  const stars = Math.round(Math.max(curveScore, gainScore) * 5)
  return Math.min(5, Math.max(1, stars))
}

/**
 * 算一条轨迹的全部统计指标。
 *
 * @param {Array<{lat,lng,altitude?}>} track
 * @returns {{distanceMeters, curveCount, sharpCurveCount, elevationGainMeters, difficultyStars}}
 */
function computeTrackStats(track) {
  const points = Array.isArray(track) ? track : []

  let distance = 0
  for (let i = 1; i < points.length; i++) {
    distance += distanceMeters(points[i - 1], points[i])
  }
  distance = Math.round(distance)

  const { total: curveCount, sharp: sharpCurveCount } = countCurves(points)

  // 只累加上升段 —— 起伏路线的净爬升是 0，但实际爬了很多
  let gain = 0
  for (let i = 1; i < points.length; i++) {
    const prev = Number(points[i - 1].altitude) || 0
    const cur = Number(points[i].altitude) || 0
    if (cur > prev) gain += cur - prev
  }
  gain = Math.round(gain)

  return {
    distanceMeters: distance,
    curveCount,
    sharpCurveCount,
    elevationGainMeters: gain,
    difficultyStars: computeStars({
      curveCount,
      distanceMeters: distance,
      elevationGainMeters: gain
    })
  }
}

module.exports = {
  computeTrackStats,
  computeStars,
  countCurves,
  distanceMeters,
  turnAngle,
  TURN_THRESHOLD_DEG,
  SHARP_TURN_DEG,
  CURVES_PER_KM_MAX,
  GAIN_PER_KM_MAX
}
