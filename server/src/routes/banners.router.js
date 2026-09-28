const express = require('express')
const bannerService = require('../services/bannerService')
const { asyncHandler } = require('../middleware/asyncHandler')

const router = express.Router()

/**
 * GET /api/banners — 首页活动位
 *
 * 返回人工活动 + 算法位，按区域过滤。首页不需要登录也能看。
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { province, city } = req.query
    res.json({ banners: await bannerService.listBanners({ province, city }) })
  })
)

module.exports = router
