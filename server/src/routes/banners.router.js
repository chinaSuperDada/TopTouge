const express = require('express')
const bannerService = require('../services/bannerService')
const { asyncHandler } = require('../middleware/asyncHandler')

const router = express.Router()

/**
 * GET /api/banners/activities — 跑山活动列表
 *
 * 只要人工活动（平台级 + 版主级），不含算法位 —— 活动页把
 * 「本周最热」这类自动推荐混进去会让人分不清哪些是真人组织的。
 *
 * 必须注册在 '/' 之前：Express 里 '/' 只匹配根路径不会吃掉这个，
 * 但放在前面更符合「具体路径优先」的阅读顺序。
 */
router.get(
  '/activities',
  asyncHandler(async (req, res) => {
    const { province, city } = req.query
    res.json({ activities: await bannerService.listActivities({ province, city }) })
  })
)

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
