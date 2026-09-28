const runRepo = require('../repositories/runRepo')
const routeRepo = require('../repositories/routeRepo')
const { inRadius } = require('../geo/radius')
const { haversineMeters: distanceMeters } = require('../geo/haversine')
const { notFound, badRequest } = require('../errors')

// 原始轨迹保留时长。任务书要求 72 小时
const RETENTION_HOURS = 72

// 没有历史成绩时的保底分。
// 不能让第一次跑的人得 0 分 —— 那会让人以为系统坏了
const FIRST_RUN_BASE_SCORE = 600

/**
 * 提交跑山成绩。
 *
 * 流程（对应任务书「二、开始跑山与算分」）：
 *   1. dataMode 为 local_only → 不落库，直接返回
 *   2. 轨迹匹配：找第一次进起点区域、之后第一次进终点区域的时间戳
 *   3. 两者相减得到用时
 *   4. 查该路线所有历史成绩，算这次用时的百分位
 *   5. score = 百分位 × 1000
 *   6. 按用时升序排名次
 *
 * @param {{routeId, vehicleType, trackPoints, dataMode}} input
 * @param {string} userId
 */
async function submitRun(input, userId) {
  const { routeId, vehicleType = 'car', trackPoints, dataMode } = input

  // 仅本机记录：不落库、不算分，前端自己看统计
  if (dataMode === 'local_only') {
    return { mode: 'local_only' }
  }

  const route = await routeRepo.getById(routeId)
  if (!route) throw notFound(`路线 ${routeId} 不存在`)

  const match = matchTrack(trackPoints, route)
  if (!match) {
    throw badRequest(
      '未检测到完整完成路线，本次不计入排名',
      'ROUTE_NOT_COMPLETED'
    )
  }

  const now = new Date()
  const expiresAt = new Date(now.getTime() + RETENTION_HOURS * 3600 * 1000)

  const base = {
    routeId,
    userId,
    vehicleType,
    rawTrackPoints: trackPoints,
    status: 'completed',
    totalTimeSeconds: match.seconds,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString()
  }

  // 先落库拿到 id，再算分。因为算百分位时要排除自己
  const created = await runRepo.create({ ...base, score: 0, rank: 0 })

  const score = await computeScore(routeId, match.seconds, created.id)
  // 名次用「比自己快的人数 + 1」，这个值当下是准确的。
  // 后面有更快的成绩插进来时它会变，所以榜单接口是查询时现算的 ——
  // 这里的值只用于「刚跑完」的结果页展示
  const rank = await runRepo.rankOf(routeId, match.seconds)

  // 分数和名次都要回填 —— 插入时只能先占位，
  // 因为这两个值都依赖「排除自己之后」的查询结果
  await runRepo.setScoreAndRank(created.id, score, rank)

  return {
    id: created.id,
    mode: 'ranked',
    score,
    rank,
    total: await runRepo.countByRoute(routeId)
  }
}

/**
 * 轨迹匹配：找出这次跑山的有效用时。
 *
 * 分两种情况，因为起终点是否重合会导致完全不同的语义：
 *
 * **闭环路线**（起终点重合，跑山的常见形态）
 *   起点和终点是同一个圆。不能取「第一次进入终点」—— 那会得到
 *   出发瞬间的下一个采样点，用时接近 0。
 *   正确做法是找**离起点最远的那个点**（即绕到了最远处），
 *   再找它之后第一次回到起点区域的时间。这就是「跑完一圈」的用时。
 *
 * **非闭环路线**（起点 ≠ 终点）
 *   取第一次进起点 → 之后第一次进终点 的时间差。
 *   同样不能简单取首尾点，用户可能从半路开始记录，
 *   或者跑完又溜达了一段。
 *
 * @returns {{startIndex, endIndex, seconds}|null}
 */
function matchTrack(trackPoints, route) {
  if (!Array.isArray(trackPoints) || trackPoints.length < 2) return null

  const start = route.startPoint
  const end = route.endPoint
  if (!start || !end) return null

  const startRadius = start.radiusMeters || 30
  const endRadius = end.radiusMeters || 30

  // 起终点相距小于一个起点半径 → 视为闭环
  const isLoop = distanceMeters(start, end) <= startRadius

  // 找第一次进入起点区域的点
  let startIndex = -1
  for (let i = 0; i < trackPoints.length; i++) {
    if (inRadius(trackPoints[i], start, startRadius)) {
      startIndex = i
      break
    }
  }
  if (startIndex < 0) return null

  let endIndex = -1

  if (isLoop) {
    // 闭环：先找离起点最远的点，再从那里往后找回到起点的第一个点
    let farthestIndex = startIndex
    let farthestDist = 0

    for (let i = startIndex + 1; i < trackPoints.length; i++) {
      const d = distanceMeters(trackPoints[i], start)
      if (d > farthestDist) {
        farthestDist = d
        farthestIndex = i
      }
    }

    // 至少要绕出去一段距离才算跑了一圈，否则可能只是原地移动
    if (farthestDist <= startRadius) return null

    for (let i = farthestIndex + 1; i < trackPoints.length; i++) {
      if (inRadius(trackPoints[i], start, startRadius)) {
        endIndex = i
        break
      }
    }
  } else {
    for (let i = startIndex + 1; i < trackPoints.length; i++) {
      if (inRadius(trackPoints[i], end, endRadius)) {
        endIndex = i
        break
      }
    }
  }

  if (endIndex < 0) return null

  const startAt = toMillis(trackPoints[startIndex])
  const endAt = toMillis(trackPoints[endIndex])
  if (startAt === null || endAt === null) return null

  const seconds = Math.round((endAt - startAt) / 1000)
  // 时间倒流或为 0 都不合理，视为匹配失败
  if (!Number.isFinite(seconds) || seconds <= 0) return null

  return { startIndex, endIndex, seconds }
}

/** 轨迹点的时间戳，兼容秒和毫秒两种 */
function toMillis(point) {
  const t = Number(point.timestamp)
  if (!Number.isFinite(t) || t <= 0) return null
  // 10 位是秒，13 位是毫秒
  return t < 1e12 ? t * 1000 : t
}

/**
 * 算分：时间百分位 × 1000。
 *
 * 没有历史成绩时（这条路线第一个人跑）百分位算不出来，
 * 给一个跟路线难度相关的保底分 —— 难的路保底分高一点，
 * 但不能给 0，否则用户以为系统坏了。
 */
async function computeScore(routeId, seconds, excludeId) {
  const percentile = await runRepo.scorePercentile(routeId, seconds, excludeId)

  if (percentile === null) {
    const route = await routeRepo.getById(routeId)
    const stars = (route && route.difficultyStars) || 3
    // 1 星 500 分起步，5 星 700 分，每星 50
    return 500 + (stars - 1) * 50
  }

  return Math.round(Math.min(1, Math.max(0, percentile)) * 1000)
}

/**
 * 某条路线的成绩榜。
 *
 * 名次**在查询时现算**（排序后的行号），不用库里存的 rank_no。
 *
 * 原因：rank_no 是插入当时算的，那时榜上还没有后来的人。
 * 比如 A 跑 600 秒时排第 1，之后 B 跑 450 秒插进来，
 * A 就应该是第 2 —— 但 A 的 rank_no 还停在 1。
 * 名次本质是「排序后的位置」，天然该查询时算，存下来反而容易不一致。
 *
 * 只返回展示需要的字段 —— 原始轨迹不出去（体积大且涉及隐私）。
 */
async function getRanking(routeId, limit = 50) {
  const records = await runRepo.listByRoute(routeId, limit)

  return records.map((r, i) => ({
    rank: i + 1,
    userId: r.userId,
    score: r.score,
    totalTimeSeconds: r.totalTimeSeconds,
    createdAt: r.createdAt
  }))
}

/** 我的跑山记录 */
async function getMyRuns(userId, limit = 50) {
  return runRepo.listByUser(userId, limit)
}

module.exports = {
  submitRun,
  matchTrack,
  computeScore,
  getRanking,
  getMyRuns,
  RETENTION_HOURS,
  FIRST_RUN_BASE_SCORE
}
