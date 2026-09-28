const express = require('express')
const runService = require('../services/runService')
const { parseLimit } = require('../validators/routeValidator')
const { asyncHandler } = require('../middleware/asyncHandler')

const router = express.Router()

/** GET /api/me/runs — 我的跑山记录 */
router.get(
  '/runs',
  asyncHandler(async (req, res) => {
    const limit = parseLimit(req.query.limit, 50, 200)
    const runs = await runService.getMyRuns(req.userId, limit)
    res.json({ runs })
  })
)

module.exports = router
