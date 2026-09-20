const { haversineMeters } = require('../geo/haversine')
const { turnAngleDeg } = require('../geo/turnAngle')
const { TURN_THRESHOLD_DEG, SHARP_TURN_DEG } = require('../constants')

/**
 * 从轨迹点序列算出路线的统计指标。纯函数，无 IO。
 *
 * @param {Array<{lat:number, lng:number, altitude?:number}>} trackPoints
 * @returns {{
 *   distanceMeters: number,
 *   curveCount: number,
 *   sharpCurveRatio: number,
 *   elevationGainMeters: number
 * }}
 */
function computeStats(trackPoints) {
  const points = Array.isArray(trackPoints) ? trackPoints : []

  return {
    distanceMeters: computeDistance(points),
    curveCount: countCurves(points).total,
    sharpCurveRatio: computeSharpCurveRatio(points),
    elevationGainMeters: computeElevationGain(points)
  }
}

/**
 * 累加相邻点球面距离。
 */
function computeDistance(points) {
  let total = 0
  for (let i = 1; i < points.length; i++) {
    total += haversineMeters(points[i - 1], points[i])
  }
  return Math.round(total)
}

/**
 * 统计弯道。
 *
 * 对每个转向顶点（即下标 1..n-2）算转向角。转向角超阈值的顶点称为「转向点」，
 * 连续的转向点合并为同一个弯道区间 —— 一个弯道区间就是驾驶时的一次连续过弯。
 * 区间数即弯道数；区间内的峰值转向角超急弯阈值则整个区间记为急弯。
 *
 * 注意：弯道区间按顶点索引连续来合并，中间只要有一个顶点不到阈值就断开。
 *
 * @param {Array} points
 * @returns {{ total: number, sharp: number }} total=弯道数，sharp=急弯数
 */
function countCurves(points) {
  if (points.length < 3) return { total: 0, sharp: 0 }

  let total = 0
  let sharp = 0

  let inCurve = false
  let peakInCurve = 0

  const closeCurve = () => {
    if (!inCurve) return
    total += 1
    if (peakInCurve > SHARP_TURN_DEG) sharp += 1
    inCurve = false
    peakInCurve = 0
  }

  for (let i = 1; i < points.length - 1; i++) {
    const angle = Math.abs(turnAngleDeg(points[i - 1], points[i], points[i + 1]))

    if (angle > TURN_THRESHOLD_DEG) {
      inCurve = true
      if (angle > peakInCurve) peakInCurve = angle
    } else {
      closeCurve()
    }
  }
  closeCurve()

  return { total, sharp }
}

/**
 * 急弯占弯道总数的比例，无弯道时为 0。
 */
function computeSharpCurveRatio(points) {
  const { total, sharp } = countCurves(points)
  if (total === 0) return 0
  return sharp / total
}

/**
 * 爬升高度：只累加上升段，不是简单最大值减最小值。
 * altitude 缺失按 0 处理。
 */
function computeElevationGain(points) {
  let gain = 0
  for (let i = 1; i < points.length; i++) {
    const prev = Number(points[i - 1].altitude) || 0
    const cur = Number(points[i].altitude) || 0
    if (cur > prev) gain += cur - prev
  }
  return Math.round(gain)
}

module.exports = {
  computeStats,
  computeDistance,
  countCurves,
  computeSharpCurveRatio,
  computeElevationGain
}
