/**
 * 路线重合度。
 *
 * 判断两条轨迹是不是「同一条路线」，用于上传查重和「相似路线」推荐。
 *
 * ## 为什么不用几何中心
 *
 * 最直觉的做法是取两条轨迹的中点（或重心）比距离。但跑山路线大量是**环形**，
 * 环的重心在山体内部，离路线本身好几公里 —— 环线和任何东西比对结果都是
 * 「不重合」，恰恰在跑山场景失效。
 *
 * ## 用的方法：采样点覆盖率
 *
 * 沿 A 等距抽若干点，逐点算它到 B 的最短距离，小于阈值算命中，
 * 命中率即 A 被 B 覆盖的比例。反过来再算一次，取**较小值**。
 *
 * 取 min 而不是平均，是为了处理「短路线套在长路线里」：
 * 2km 的一段恰好是 20km 路线的一部分时，B→A 覆盖率是 1，
 * 但 A→B 很低 —— 平均会得到 0.5 这种模棱两可的结果，
 * 取 min 则明确判定为「不是同一条路线」。
 *
 * ## 为什么按距离采样而不是按下标
 *
 * GPS 轨迹点间距不均匀：开得快时点稀疏，堵车时点密集。
 * 按下标采样会让慢速路段获得过高权重。按累计距离采则每个位置等权。
 *
 * ## 复杂度
 *
 * O(采样数 × 目标折线点数)。目标轨迹先用 Douglas-Peucker 抽稀，
 * 容差取阈值的 1/10，几何误差远小于判定阈值，不影响结果。
 */

const { planarDistance, pointToSegmentDistance, douglasPeucker } = require('./simplify')

/** 默认采样点数。50 个点对应 2% 的分辨率，足够区分「很像」和「有点像」 */
const DEFAULT_SAMPLE_COUNT = 50

/**
 * 默认距离阈值（米）。
 *
 * 50m 是这么定的：同一段路双向车道的间距通常 10~30m，
 * 手机 GPS 定位误差 5~15m，两者叠加后 50m 能容下「同一条路」的正常偏差，
 * 又不会把相邻的两条不同山路误判成一条。
 */
const DEFAULT_THRESHOLD_METERS = 50

/**
 * 点到折线的最短距离（米）。
 *
 * @param {{lat,lng}} p
 * @param {Array<{lat,lng}>} polyline
 * @returns {number} 折线为空时返回 Infinity
 */
function pointToPolylineDistance(p, polyline) {
  if (!Array.isArray(polyline) || polyline.length === 0) return Infinity
  if (polyline.length === 1) return planarDistance(p, polyline[0])

  let min = Infinity
  for (let i = 1; i < polyline.length; i++) {
    const d = pointToSegmentDistance(p, polyline[i - 1], polyline[i])
    if (d < min) min = d
  }
  return min
}

/**
 * 沿轨迹等距采样 count 个点。
 *
 * 采样点是在原始轨迹上**插值**出来的，不直接取原有顶点 ——
 * GPS 点间距可能上百米，取最近顶点会带来几十米的定位误差，
 * 而判定阈值本身只有 50m。
 *
 * @param {Array<{lat,lng}>} track
 * @param {number} count 采样点数，至少 2
 * @returns {Array<{lat,lng}>} 首尾一定包含
 */
function sampleAlong(track, count = DEFAULT_SAMPLE_COUNT) {
  if (!Array.isArray(track) || track.length === 0) return []
  if (track.length === 1) return [track[0]]

  const n = Math.max(2, count)
  if (track.length <= n) return track.slice()

  // 累计距离，用于把「第 k 个采样点」换算成轨迹上的位置
  const cum = [0]
  for (let i = 1; i < track.length; i++) {
    cum.push(cum[i - 1] + planarDistance(track[i - 1], track[i]))
  }

  const total = cum[cum.length - 1]
  // 轨迹所有点重合，没有长度可分
  if (total === 0) return [track[0]]

  const samples = []
  let seg = 0

  for (let i = 0; i < n; i++) {
    const target = (total * i) / (n - 1)

    // 找到 target 落在哪一段上。seg 只前进不后退 —— 采样点是递增的
    while (seg < cum.length - 2 && cum[seg + 1] < target) seg++

    const segLen = cum[seg + 1] - cum[seg]
    const t = segLen === 0 ? 0 : (target - cum[seg]) / segLen

    samples.push({
      lat: track[seg].lat + (track[seg + 1].lat - track[seg].lat) * t,
      lng: track[seg].lng + (track[seg + 1].lng - track[seg].lng) * t
    })
  }

  return samples
}

/**
 * A 上的采样点有多大比例落在 B 附近。
 *
 * @returns {number} 0~1
 */
function coverageRatio(fromTrack, toPolyline, thresholdMeters) {
  const samples = sampleAlong(fromTrack, DEFAULT_SAMPLE_COUNT)
  if (samples.length === 0) return 0

  let hit = 0
  for (let i = 0; i < samples.length; i++) {
    if (pointToPolylineDistance(samples[i], toPolyline) <= thresholdMeters) hit++
  }
  return hit / samples.length
}

/**
 * 两条轨迹的重合度。
 *
 * @param {Array<{lat,lng}>} trackA
 * @param {Array<{lat,lng}>} trackB
 * @param {{thresholdMeters?: number}} [options]
 * @returns {number} 0~1。1 表示两条轨迹完全贴合
 */
function overlapRatio(trackA, trackB, options = {}) {
  const threshold = Number(options.thresholdMeters) > 0
    ? Number(options.thresholdMeters)
    : DEFAULT_THRESHOLD_METERS

  if (!Array.isArray(trackA) || trackA.length < 2) return 0
  if (!Array.isArray(trackB) || trackB.length < 2) return 0

  // 只抽稀作为「参照物」的那条。容差取阈值的 1/10，
  // 引入的几何误差（≤5m）远小于判定阈值（50m），不会把命中判成未命中。
  // 采样那条不抽稀 —— 采样点要落在真实轨迹上才准。
  const refB = douglasPeucker(trackB, threshold / 10)
  const refA = douglasPeucker(trackA, threshold / 10)

  const aToB = coverageRatio(trackA, refB, threshold)
  const bToA = coverageRatio(trackB, refA, threshold)

  return Math.min(aToB, bToA)
}

/**
 * 把重合度翻成给人看的档位。
 *
 * 阈值来自实测：同一条路两条独立采集的轨迹重合度通常 >0.85；
 * 起终点相同但走了不同岔路的两条，一般在 0.4~0.7。
 */
function similarityLevel(ratio) {
  if (ratio >= 0.85) return 'duplicate'
  if (ratio >= 0.6) return 'similar'
  if (ratio >= 0.3) return 'partial'
  return 'distinct'
}

module.exports = {
  overlapRatio,
  similarityLevel,
  sampleAlong,
  coverageRatio,
  pointToPolylineDistance,
  DEFAULT_SAMPLE_COUNT,
  DEFAULT_THRESHOLD_METERS
}
