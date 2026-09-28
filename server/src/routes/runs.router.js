const express = require('express')
const runService = require('../services/runService')
const { validateRun } = require('../validators/routeValidator')
const { asyncHandler } = require('../middleware/asyncHandler')

const router = express.Router()

/**
 * POST /api/runs — 提交跑山成绩
 *
 * 两种模式：
 *   ranked     —— 落库、算分、排名
 *   local_only —— 直接返回，不落库（隐私敏感用户）
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = validateRun(req.body)
    const result = await runService.submitRun(input, req.userId)
    res.status(201).json(result)
  })
)

module.exports = router
