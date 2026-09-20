const express = require('express')
const routeService = require('../services/routeService')
const { validateCreateRoute, parseId } = require('../validators/routeValidator')

const router = express.Router()

/** GET /api/routes — 路线列表（不含轨迹，列表页用） */
router.get('/', (req, res) => {
  res.json({ routes: routeService.listRoutes() })
})

/**
 * GET /api/routes/:id — 路线详情，含最近的评论与路况提示
 *
 * 默认返回抽稀后的 track（displayTrack）。加 ?fullTrack=1 拿全量轨迹，
 * 供需要精确数据的场景（如生成导航链接）使用。
 */
router.get('/:id', (req, res) => {
  const id = parseId(req.params.id)
  const includeFullTrack = req.query.fullTrack === '1' || req.query.fullTrack === 'true'
  res.json(routeService.getRouteDetail(id, { includeFullTrack }))
})

/** POST /api/routes — 上传路线，后端自动计算难度指标 */
router.post('/', (req, res) => {
  const input = validateCreateRoute(req.body)
  const route = routeService.createRoute(input, req.userId)
  res.status(201).json(route)
})

module.exports = router
