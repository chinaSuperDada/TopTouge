const store = require('../store/memoryStore')

/** 路况提示数据访问。当前走内存 store。 */

const listByRoute = (routeId, limit) => store.roadConditions.listByRoute(routeId, limit)

const create = (roadCondition) => store.roadConditions.insert(roadCondition)

module.exports = { listByRoute, create }
