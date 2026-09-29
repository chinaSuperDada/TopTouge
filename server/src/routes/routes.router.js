const express = require('express')
const routeService = require('../services/routeService')
const runService = require('../services/runService')
const {
  validateCreateRoute,
  normalizeTrackPoints,
  parseId,
  parseLimit
} = require('../validators/routeValidator')
const { asyncHandler } = require('../middleware/asyncHandler')

const router = express.Router()

/** GET /api/routes — 路线列表（不含轨迹，列表页用） */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    // 筛选与排序参数由前端传，service 层负责解释。
    // viewerId 让「自己传的（含私有、含待审）」也出现在列表里 ——
    // 别人看不到，但作者自己制作完能看到，否则会以为没保存
    res.json({
      routes: await routeService.listRoutes(
        {
          province: req.query.province || 'all',
          city: req.query.city || 'all',
          difficulty: req.query.difficulty || 'all',
          roadType: req.query.roadType || 'all',
          sort: req.query.sort || 'hot',
          lat: Number(req.query.lat) || undefined,
          lng: Number(req.query.lng) || undefined,
          limit: parseLimit(req.query.limit, 50, 200)
        },
        req.userId
      )
    })
  })
)

/**
 * GET /api/routes/:id — 路线详情，含最近的评论与路况提示
 *
 * 默认返回抽稀后的 track（displayTrack）。加 ?fullTrack=1 拿全量轨迹，
 * 供需要精确数据的场景（如生成导航链接）使用。
 */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id)
    const includeFullTrack = req.query.fullTrack === '1' || req.query.fullTrack === 'true'
    // 带上 userId —— 详情要回一个 favorited 标记给收藏按钮用
    res.json(await routeService.getRouteDetail(id, { includeFullTrack, userId: req.userId }))
  })
)

/**
 * POST /api/routes/check-duplicate — 上传前查重
 *
 * 传一条轨迹，返回库里与它重合的已有路线。
 * 放在 POST 而不是 GET，是因为轨迹可能有几千个点，塞进 query string
 * 会超出 URL 长度限制。
 *
 * 必须注册在 /:id 之前 —— 否则 "check-duplicate" 会被当成 id 参数吃掉。
 */
router.post(
  '/check-duplicate',
  asyncHandler(async (req, res) => {
    const track = normalizeTrackPoints(req.body && req.body.trackPoints)
    const similar = await routeService.findSimilarRoutes(track, {
      province: req.body.province || '',
      city: req.body.city || '',
      limit: parseLimit(req.body.limit, 5, 20)
    })
    res.json({ similar })
  })
)

/**
 * GET /api/routes/:id/similar — 这条路线的相似路线
 *
 * 用全量轨迹算，所以要绕开列表接口（它不返回 referenceTrack）。
 */
router.get(
  '/:id/similar',
  asyncHandler(async (req, res) => {
    const routeId = parseId(req.params.id)
    const limit = parseLimit(req.query.limit, 5, 20)
    res.json({ similar: await routeService.findSimilarToRoute(routeId, { limit }) })
  })
)

/** GET /api/routes/:id/ranking — 路线成绩榜 */
router.get(
  '/:id/ranking',
  asyncHandler(async (req, res) => {
    const routeId = parseId(req.params.id)
    const limit = parseLimit(req.query.limit, 50, 200)
    res.json({ ranking: await runService.getRanking(routeId, limit) })
  })
)

/** POST /api/routes — 上传路线，后端自动计算难度指标 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = validateCreateRoute(req.body)
    const route = await routeService.createRoute(input, req.userId)
    res.status(201).json(route)
  })
)

module.exports = router
