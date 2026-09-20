/**
 * 轨迹抽稀：从完整轨迹里挑出有代表性的点。
 *
 * 用途是生成导航链接。原轨迹动辄几百个点，拼进 URL 会超长，
 * 而且导航实际只需要关键转弯点 —— 直线段上多插几个点没有意义。
 *
 * 做法是复用 geo/turnAngle 的同一套判断：转向角大的地方是弯道，要保留；
 * 直线段上的点可以丢。首尾点永远保留。
 *
 * 注意这里的坐标系前提：高德返回 GCJ-02，导航 URI 也用 GCJ-02，
 * 不需要转换。如果要跳百度导航（BD-09）则必须先转坐标。
 */

// 转向角超过这个值就认为是要保留的关键点
const KEEP_ANGLE_DEG = 25

// 相邻保留点的最小间距，取路线总长的这个比例。
// 固定米数不行：紧凑的盘山路（总长 10km 但只占几百米范围）会被过滤得只剩首尾。
const MIN_KEEP_DISTANCE_RATIO = 1 / 40

const METERS_PER_DEG_LAT = 111320

function toRad(deg) {
  return (deg * Math.PI) / 180
}

/** 两点近似平面距离（米） */
function planarDistance(a, b) {
  const dLat = (b.lat - a.lat) * METERS_PER_DEG_LAT
  const dLng = (b.lng - a.lng) * METERS_PER_DEG_LAT * Math.cos(toRad(a.lat))
  return Math.sqrt(dLat * dLat + dLng * dLng)
}

/** a 指向 b 的方位角（度，0=正北，顺时针） */
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
  delta = ((delta + 180) % 360 + 360) % 360 - 180
  if (delta < -179.9) return -180
  if (delta > 179.9) return 180
  return delta
}

/**
 * 抽稀轨迹。
 *
 * @param {Array<{lat:number, lng:number}>} track 完整轨迹
 * @param {number} maxPoints 最大返回点数（导航 URI 建议不超过 10 个）
 * @returns {Array<{lat:number, lng:number}>}
 */
function simplifyTrack(track, maxPoints = 8) {
  if (!Array.isArray(track) || track.length <= 2) return track || []

  const first = track[0]
  const last = track[track.length - 1]

  // 1. 先算总长，用于自适应的最小间距
  let totalMeters = 0
  for (let i = 1; i < track.length; i++) {
    totalMeters += planarDistance(track[i - 1], track[i])
  }
  const minSpacing = Math.max(20, totalMeters * MIN_KEEP_DISTANCE_RATIO)

  // 2. 找出所有「弯道关键点」：转向角超阈值的顶点
  const candidates = []
  for (let i = 1; i < track.length - 1; i++) {
    const angle = Math.abs(turnAngle(track[i - 1], track[i], track[i + 1]))
    if (angle > KEEP_ANGLE_DEG) {
      candidates.push({ point: track[i], angle, index: i })
    }
  }

  // 3. 弯道太多时按转角从大到小挑，再按原始顺序排列
  let picked
  if (candidates.length > maxPoints - 2) {
    picked = candidates
      .slice()
      .sort((a, b) => b.angle - a.angle)
      .slice(0, maxPoints - 2)
      .sort((a, b) => a.index - b.index)
      .map((c) => c.point)
  } else {
    picked = candidates.map((c) => c.point)

    // 4. 弯道不够时按等距补点，保证整条路线被覆盖
    const needed = maxPoints - 2 - picked.length
    if (needed > 0) {
      const inner = track.slice(1, -1)
      const step = Math.max(1, Math.floor(inner.length / (needed + 1)))
      const filler = []
      for (let i = step; i < inner.length && filler.length < needed; i += step) {
        filler.push(inner[i])
      }
      const all = picked.concat(filler)
      all.sort((a, b) => track.indexOf(a) - track.indexOf(b))
      picked = all
    }
  }

  // 5. 去掉彼此太近的点
  const spaced = []
  for (const p of picked) {
    const prev = spaced[spaced.length - 1]
    if (!prev || planarDistance(prev, p) >= minSpacing) spaced.push(p)
  }

  // 6. 首尾固定保留
  const withEnds = [first, ...spaced, last]

  // 7. 去重相邻同坐标点
  const deduped = []
  for (const p of withEnds) {
    const prev = deduped[deduped.length - 1]
    if (!prev || prev.lat !== p.lat || prev.lng !== p.lng) deduped.push(p)
  }

  return deduped.slice(0, maxPoints)
}

/**
 * 生成高德导航 URI。
 *
 * 为什么用 URI 而不是 wx.openLocation：
 * 后者只能传单个坐标，做不到「按这条路线的完整轨迹导航」。
 * URI 支持 via 途经点，能把抽稀后的关键点串起来。
 *
 * 闭环路线（跑山的常见形态，起点=终点）不能直接用 —— 起终点相同的话
 * 导航没有意义。这种情况把路径中点当作终点，用户实际是「绕一圈」。
 *
 * @param {Array} track 完整轨迹（内部会抽稀）
 * @param {{source?:string, destination?:string}} names 起终点名称
 * @returns {string|null}
 */
function buildNavigationUrl(track, names = {}) {
  if (!Array.isArray(track) || track.length < 2) return null

  const isLoop = planarDistance(track[0], track[track.length - 1]) < 50

  // 闭环时截掉后半程，把最远点当终点，避免起终点重合
  const usable = isLoop ? track.slice(0, Math.max(2, Math.floor(track.length / 2))) : track

  const points = simplifyTrack(usable, 8)
  if (points.length < 2) return null

  const fmt = (p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`

  const from = fmt(points[0])
  const to = fmt(points[points.length - 1])
  const via = points.slice(1, -1).map(fmt).join(';')

  const params = [
    `from=${encodeURIComponent(from)}`,
    `to=${encodeURIComponent(to)}`,
    'mode=car',
    'policy=0',
    'src=toptouge',
    'coordinate=gaode'
  ]

  if (via) params.push(`via=${encodeURIComponent(via)}`)
  if (names.source) params.push(`fromname=${encodeURIComponent(names.source)}`)
  if (names.destination) params.push(`toname=${encodeURIComponent(names.destination)}`)

  return `https://uri.amap.com/navigation?${params.join('&')}`
}

/** 轨迹是否为闭环（起终点重合） */
function isLoopTrack(track) {
  if (!Array.isArray(track) || track.length < 2) return false
  return planarDistance(track[0], track[track.length - 1]) < 50
}

module.exports = {
  simplifyTrack,
  buildNavigationUrl,
  isLoopTrack,
  KEEP_ANGLE_DEG,
  MIN_KEEP_DISTANCE_RATIO
}
