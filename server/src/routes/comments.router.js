const express = require('express')
const commentService = require('../services/commentService')
const { validateContent, parseId, parseLimit } = require('../validators/routeValidator')
const { asyncHandler } = require('../middleware/asyncHandler')
const { DEFAULT_COMMENT_LIMIT } = require('../constants')

const router = express.Router({ mergeParams: true })

/** GET /api/routes/:id/comments — 最近 20 条，时间倒序 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const routeId = parseId(req.params.id)
    const limit = parseLimit(req.query.limit, DEFAULT_COMMENT_LIMIT, 100)
    res.json({ comments: await commentService.listComments(routeId, limit) })
  })
)

/** POST /api/routes/:id/comments — 提交评论 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const routeId = parseId(req.params.id)
    const content = validateContent(req.body, '评论内容')
    const comment = await commentService.createComment(routeId, req.userId, content)
    res.status(201).json(comment)
  })
)

module.exports = router
