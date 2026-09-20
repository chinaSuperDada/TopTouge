const METERS_PER_DEG_LAT = 111320

const toRad = (deg) => (deg * Math.PI) / 180

/**
 * 两点近似平面距离（米）。
 *
 * 用等距投影而非球面距离：抽稀只关心相对远近，几十公里内误差可忽略，
 * 而且比 haversine 快得多 —— 抽稀要做 O(n²) 次距离计算。
 */
function planarDistance(a, b) {
  const dLat = (b.lat - a.lat) * METERS_PER_DEG_LAT
  const dLng = (b.lng - a.lng) * METERS_PER_DEG_LAT * Math.cos(toRad((a.lat + b.lat) / 2))
  return Math.sqrt(dLat * dLat + dLng * dLng)
}

/**
 * 点到线段的最短距离（米）。线段退化成一个点时退化为点距。
 *
 * 全部用「相对 a 的偏移」计算，不用绝对坐标。
 * 原因是经度乘以 111320 后是个很大的数（如经度 120 → 1.3e7），
 * 若对每个点各用自己的纬度算 cos 因子，两点的 cos 差异会被这个大数放大，
 * 产生几百米的假距离。改成相对偏移后，只有差值参与运算。
 */
function pointToSegmentDistance(p, a, b) {
  const kx = METERS_PER_DEG_LAT * Math.cos(toRad(a.lat))
  const ky = METERS_PER_DEG_LAT

  const ax = 0
  const ay = 0
  const bx = (b.lng - a.lng) * kx
  const by = (b.lat - a.lat) * ky
  const px = (p.lng - a.lng) * kx
  const py = (p.lat - a.lat) * ky

  const dx = bx - ax
  const dy = by - ay
  const lenSq = dx * dx + dy * dy

  if (lenSq === 0) return Math.sqrt(px * px + py * py)

  // 把 p 投影到线段上，t 夹到 [0,1] 保证落在线段内
  let t = (px * dx + py * dy) / lenSq
  t = Math.max(0, Math.min(1, t))

  const projX = ax + t * dx
  const projY = ay + t * dy
  return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2)
}

/**
 * Douglas-Peucker 抽稀。
 *
 * 思路：连接首尾成一条线，找离这条线最远的点；若超过容差就保留它，
 * 并以它为界把轨迹切成两段递归处理。容差越大，保留的点越少。
 *
 * 与「按转向角挑关键点」的区别：DP 的目标是**保形状** —— 抽稀后视觉上
 * 看不出区别，适合给地图绘制用。转向角法专门丢直线留弯道，适合塞进导航 URL。
 *
 * 返回的是**原数组的子集**（同一批对象引用，不是拷贝）——
 * 这样 displayTrack 不会让内存翻倍，序列化时也正确。
 *
 * @param {Array<{lat:number, lng:number}>} points
 * @param {number} toleranceMeters 容差（米）
 * @returns {Array} 抽稀后的点，首尾一定保留
 */
function douglasPeucker(points, toleranceMeters) {
  if (!Array.isArray(points) || points.length <= 2) return (points || []).slice()
  if (!(toleranceMeters > 0)) return points.slice()

  const keep = new Array(points.length).fill(false)
  keep[0] = true
  keep[points.length - 1] = true

  // 用显式栈代替递归：轨迹可能有几百上千个点，避免爆栈
  const stack = [[0, points.length - 1]]

  while (stack.length > 0) {
    const [start, end] = stack.pop()
    if (end - start < 2) continue

    let maxDist = -1
    let maxIndex = start

    for (let i = start + 1; i < end; i++) {
      const d = pointToSegmentDistance(points[i], points[start], points[end])
      if (d > maxDist) {
        maxDist = d
        maxIndex = i
      }
    }

    if (maxDist > toleranceMeters) {
      keep[maxIndex] = true
      stack.push([start, maxIndex])
      stack.push([maxIndex, end])
    }
  }

  return points.filter((_, i) => keep[i])
}

/**
 * 把轨迹抽稀到不超过 maxPoints 个点。
 *
 * DP 的容差和输出点数不是线性关系，没法一次算准。做法是二分容差，
 * 逼近目标点数 —— 比「先全量抽再截断」好，后者会把尾部整段丢掉。
 *
 * @param {Array} points
 * @param {number} maxPoints 上限
 * @returns {Array}
 */
function simplifyToMaxPoints(points, maxPoints = 100) {
  if (!Array.isArray(points) || points.length <= maxPoints) return (points || []).slice()

  // 容差范围按轨迹尺度给：先从"极小"到"整条轨迹长度"之间二分
  let totalMeters = 0
  for (let i = 1; i < points.length; i++) {
    totalMeters += planarDistance(points[i - 1], points[i])
  }

  let lo = 0
  let hi = Math.max(1, totalMeters)
  let best = douglasPeucker(points, hi)

  // 20 次二分足够收敛到米级精度
  for (let iter = 0; iter < 20; iter++) {
    const mid = (lo + hi) / 2
    const result = douglasPeucker(points, mid)

    if (result.length > maxPoints) {
      // 点太多，放宽容差
      lo = mid
    } else {
      // 点够少，收紧容差以保留更多细节
      best = result
      hi = mid
    }

    if (hi - lo < 0.5) break
  }

  return best
}

module.exports = {
  douglasPeucker,
  simplifyToMaxPoints,
  planarDistance,
  pointToSegmentDistance,
  METERS_PER_DEG_LAT
}
