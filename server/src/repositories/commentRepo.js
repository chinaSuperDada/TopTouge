const store = require('../store/memoryStore')

/** 评论数据访问。当前走内存 store。 */

const listByRoute = (routeId, limit) => store.comments.listByRoute(routeId, limit)

const create = (comment) => store.comments.insert(comment)

module.exports = { listByRoute, create }
