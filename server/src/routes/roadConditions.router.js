const express = require('express')
const roadConditionService = require('../services/roadConditionService')
const { validateContent, parseId, parseLimit } = require('../validators/routeValidator')
const { asyncHandler } = require('../middleware/asyncHandler')
const { DEFAULT_ROAD_CONDITION_LIMIT } = require('../constants')

const router = express.Router({ mergeParams: true })

/** GET /api/routes/:id/road-conditions — 最近 10 条，时间倒序 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const routeId = parseId(req.params.id)
    const limit = parseLimit(req.query.limit, DEFAULT_ROAD_CONDITION_LIMIT, 100)
    res.json({ roadConditions: await roadConditionService.listRoadConditions(routeId, limit) })
  })
)

/** POST /api/routes/:id/road-conditions — 提交路况提示 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const routeId = parseId(req.params.id)
    const content = validateContent(req.body, '路况提示内容')
    const item = await roadConditionService.createRoadCondition(routeId, req.userId, content)
    res.status(201).json(item)
  })
)

module.exports = router
