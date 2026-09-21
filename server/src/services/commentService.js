const commentRepo = require('../repositories/commentRepo')
const routeRepo = require('../repositories/routeRepo')
const { notFound } = require('../errors')

/** 路线评论。 */

async function listComments(routeId, limit) {
  await ensureRouteExists(routeId)
  return commentRepo.listByRoute(routeId, limit)
}

async function createComment(routeId, userId, content) {
  await ensureRouteExists(routeId)
  return commentRepo.create({
    routeId,
    userId,
    content,
    createdAt: new Date().toISOString()
  })
}

/**
 * 评论挂在路线下，路线不存在就返回 404 而不是 500。
 * 外键约束也会挡，但那样抛的是数据库错误，提示不友好。
 */
async function ensureRouteExists(routeId) {
  const route = await routeRepo.getById(routeId)
  if (!route) throw notFound(`路线 ${routeId} 不存在`)
}

module.exports = { listComments, createComment }
