const express = require('express')
const runService = require('../services/runService')
const favoriteService = require('../services/favoriteService')
const routeRepo = require('../repositories/routeRepo')
const { parseLimit, parseId } = require('../validators/routeValidator')
const { asyncHandler } = require('../middleware/asyncHandler')

const router = express.Router()

/** GET /api/me/runs — 我的跑山记录 */
router.get(
  '/runs',
  asyncHandler(async (req, res) => {
    const limit = parseLimit(req.query.limit, 50, 200)
    res.json({ runs: await runService.getMyRuns(req.userId, limit) })
  })
)

/** GET /api/me/routes — 我上传的路线（含审核状态，作者自己能看到被驳回的） */
router.get(
  '/routes',
  asyncHandler(async (req, res) => {
    // 传 uploadedBy 过滤，且不限制审核状态 —— 作者要能看到自己待审/被拒的
    const routes = await routeRepo.list({ uploadedBy: req.userId, anyReviewStatus: true, limit: 200 })
    res.json({ routes })
  })
)

/** DELETE /api/me/routes/:routeId — 作者删除自己的路线 */
router.delete(
  '/routes/:routeId',
  asyncHandler(async (req, res) => {
    const routeId = parseId(req.params.routeId)
    const routeService = require('../services/routeService')
    res.json(await routeService.deleteOwnRoute(routeId, req.userId))
  })
)

/** GET /api/me/favorites — 我的收藏 */
router.get(
  '/favorites',
  asyncHandler(async (req, res) => {
    const limit = parseLimit(req.query.limit, 50, 200)
    res.json({ routes: await favoriteService.listFavorites(req.userId, limit) })
  })
)

/** POST /api/me/favorites/:routeId — 收藏 */
router.post(
  '/favorites/:routeId',
  asyncHandler(async (req, res) => {
    const routeId = parseId(req.params.routeId)
    res.status(201).json(await favoriteService.addFavorite(req.userId, routeId))
  })
)

/** DELETE /api/me/favorites/:routeId — 取消收藏 */
router.delete(
  '/favorites/:routeId',
  asyncHandler(async (req, res) => {
    const routeId = parseId(req.params.routeId)
    res.json(await favoriteService.removeFavorite(req.userId, routeId))
  })
)

/** GET /api/me/moderator — 我的版主身份 */
router.get(
  '/moderator',
  asyncHandler(async (req, res) => {
    const moderatorService = require('../services/moderatorService')
    res.json(await moderatorService.getMyModeratorInfo(req.userId))
  })
)

module.exports = router
