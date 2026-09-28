const express = require('express')
const routeService = require('../services/routeService')
const runService = require('../services/runService')
const { validateCreateRoute, parseId, parseLimit } = require('../validators/routeValidator')
const { asyncHandler } = require('../middleware/asyncHandler')

const router = express.Router()

/** GET /api/routes — 路线列表（不含轨迹，列表页用） */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    // 筛选与排序参数由前端传，service 层负责解释
    res.json({
      routes: await routeService.listRoutes({
        province: req.query.province || 'all',
        city: req.query.city || 'all',
        difficulty: req.query.difficulty || 'all',
        roadType: req.query.roadType || 'all',
        sort: req.query.sort || 'hot',
        lat: Number(req.query.lat) || undefined,
        lng: Number(req.query.lng) || undefined,
        limit: parseLimit(req.query.limit, 50, 200)
      })
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
    res.json(await routeService.getRouteDetail(id, { includeFullTrack }))
  })
)

/**
 * GET /api/routes/:id/ranking — 路线成绩榜
 *
 * 放在这个 router 里而不是独立的 runs.router，是因为它属于
 * 路线资源下的子资源。runs.router 只处理 POST /api/runs（独立路径）。
 */
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
