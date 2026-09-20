const roadConditionRepo = require('../repositories/roadConditionRepo')
const routeRepo = require('../repositories/routeRepo')
const { notFound } = require('../errors')

/** 路线路况提示。 */

function listRoadConditions(routeId, limit) {
  ensureRouteExists(routeId)
  return roadConditionRepo.listByRoute(routeId, limit)
}

function createRoadCondition(routeId, userId, content) {
  ensureRouteExists(routeId)
  return roadConditionRepo.create({
    routeId,
    userId,
    content,
    createdAt: new Date().toISOString()
  })
}

function ensureRouteExists(routeId) {
  if (!routeRepo.getById(routeId)) throw notFound(`路线 ${routeId} 不存在`)
}

module.exports = { listRoadConditions, createRoadCondition }
