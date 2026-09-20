const commentRepo = require('../repositories/commentRepo')
const routeRepo = require('../repositories/routeRepo')
const { notFound } = require('../errors')

/** 路线评论。 */

function listComments(routeId, limit) {
  ensureRouteExists(routeId)
  return commentRepo.listByRoute(routeId, limit)
}

function createComment(routeId, userId, content) {
  ensureRouteExists(routeId)
  return commentRepo.create({
    routeId,
    userId,
    content,
    createdAt: new Date().toISOString()
  })
}

function ensureRouteExists(routeId) {
  if (!routeRepo.getById(routeId)) throw notFound(`路线 ${routeId} 不存在`)
}

module.exports = { listComments, createComment }
