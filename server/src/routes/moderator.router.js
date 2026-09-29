const express = require('express')
const moderatorService = require('../services/moderatorService')
const bannerService = require('../services/bannerService')
const { parseId, validationFailed } = require('../validators/routeValidator')
const { asyncHandler } = require('../middleware/asyncHandler')

const router = express.Router()

/** GET /api/moderator — 我的版主身份与统计 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await moderatorService.getModeratorStats(req.userId))
  })
)

/* ==================== 版主申请 ==================== */

/** GET /api/moderator/apply/eligibility — 我够不够格申请 */
router.get(
  '/apply/eligibility',
  asyncHandler(async (req, res) => {
    const [eligibility, applications] = await Promise.all([
      moderatorService.checkApplyEligibility(req.userId),
      moderatorService.listMyApplications(req.userId)
    ])
    res.json({ ...eligibility, applications })
  })
)

/** POST /api/moderator/apply — 提交申请 */
router.post(
  '/apply',
  asyncHandler(async (req, res) => {
    const { province, city, reason } = req.body || {}
    const application = await moderatorService.applyForModerator(req.userId, {
      province, city, reason
    })
    res.status(201).json(application)
  })
)

/**
 * GET /api/moderator/applications — 待审的申请
 *
 * 只有平台管理员能调，同时看全部（含没有版主的区域）。
 */
router.get(
  '/applications',
  asyncHandler(async (req, res) => {
    res.json({ applications: await moderatorService.listApplications(req.userId, 100) })
  })
)

/** POST /api/moderator/applications/:id/review — 审批申请 */
router.post(
  '/applications/:id/review',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id)
    const { status, reason } = req.body || {}
    res.json(await moderatorService.reviewApplication(req.userId, id, { status, reason }))
  })
)

/** GET /api/moderator/pending — 待审核路线 */
router.get(
  '/pending',
  asyncHandler(async (req, res) => {
    const routes = await moderatorService.listPendingRoutes(req.userId, 100)
    res.json({ routes })
  })
)

/** GET /api/moderator/routes — 本区已上架的路线 */
router.get(
  '/routes',
  asyncHandler(async (req, res) => {
    const routes = await moderatorService.listManagedRoutes(req.userId, 100)
    res.json({ routes })
  })
)

/**
 * POST /api/moderator/routes/:id/review — 审核
 *
 * body: { status: 'approved' | 'rejected', reason?: string }
 */
router.post(
  '/routes/:id/review',
  asyncHandler(async (req, res) => {
    const routeId = parseId(req.params.id)
    const { status, reason } = req.body || {}
    const route = await moderatorService.reviewRoute(req.userId, routeId, { status, reason })
    res.json(route)
  })
)

/** POST /api/moderator/routes/:id/pin — 置顶 / 取消置顶 */
router.post(
  '/routes/:id/pin',
  asyncHandler(async (req, res) => {
    const routeId = parseId(req.params.id)
    const pinned = Boolean(req.body && req.body.pinned)
    res.json(await moderatorService.togglePin(req.userId, routeId, pinned))
  })
)

/**
 * DELETE /api/moderator/routes/:id — 删除本区路线
 *
 * 软删除：只标记为 deleted，不物理删行。
 * 否则会级联清掉别人的评论和成绩。
 */
router.delete(
  '/routes/:id',
  asyncHandler(async (req, res) => {
    const routeId = parseId(req.params.id)
    res.json(await moderatorService.deleteRoute(req.userId, routeId))
  })
)

/**
 * POST /api/moderator/routes/:id/take-down — 下架本区路线
 *
 * 与 DELETE 的区别：下架只是打回「已驳回」，作者仍能在「我的路线」
 * 看到并能改后重传；删除是从公开列表彻底移除。
 * 作者侧看到的结果不同，所以是两个接口。
 */
router.post(
  '/routes/:id/take-down',
  asyncHandler(async (req, res) => {
    const routeId = parseId(req.params.id)
    const reason = (req.body && req.body.reason) || ''
    res.json(await moderatorService.takeDownRoute(req.userId, routeId, reason))
  })
)

/** GET /api/moderator/activities — 本区活动 */
router.get(
  '/activities',
  asyncHandler(async (req, res) => {
    const info = await moderatorService.getMyModeratorInfo(req.userId)
    const region = info.regions[0] || {}
    const activities = await bannerService.listModeratorBanners(region)
    res.json({ activities })
  })
)

/** POST /api/moderator/activities — 新建活动 */
router.post(
  '/activities',
  asyncHandler(async (req, res) => {
    const info = await moderatorService.getMyModeratorInfo(req.userId)
    if (!info.isModerator) throw validationFailed('没有版主权限')

    const region = info.regions[0] || {}
    const body = req.body || {}
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    if (!title) throw validationFailed('活动标题不能为空')

    const activity = await bannerService.createModeratorBanner(
      {
        title,
        subtitle: body.subtitle || '',
        tag: '车友活动',
        image: body.image || '',
        color: body.color || '#8250df',
        link: body.link || '',
        province: region.province,
        city: region.city,
        startsAt: body.startsAt || null,
        endsAt: body.endsAt || null,
        status: 'draft'
      },
      req.userId
    )
    res.status(201).json(activity)
  })
)

/** POST /api/moderator/activities/:id/status — 发布 / 下线 */
router.post(
  '/activities/:id/status',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id)
    const status = req.body && req.body.status === 'published' ? 'published' : 'draft'
    res.json(await bannerService.updateBannerStatus(id, status))
  })
)

/** DELETE /api/moderator/activities/:id */
router.delete(
  '/activities/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id)
    await bannerService.removeBanner(id)
    res.status(204).end()
  })
)

module.exports = router
