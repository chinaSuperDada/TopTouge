const express = require('express')
const userService = require('../services/userService')
const { asyncHandler } = require('../middleware/asyncHandler')

const router = express.Router()

/** GET /api/me/profile — 我的资料 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await userService.getProfile(req.userId))
  })
)

/**
 * PUT /api/me/profile — 更新昵称 / 头像
 *
 * body: { nickName?, avatar? }  两个字段都可选，只传要改的
 */
router.put(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await userService.updateProfile(req.userId, req.body || {}))
  })
)

module.exports = router
