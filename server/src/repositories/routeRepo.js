const store = require('../store/memoryStore')

/**
 * 路线数据访问。
 *
 * 现在走内存 store。后续接数据库时，只需要把这里的实现换成 SQL，
 * 上层 service 与 router 不感知。
 */

const list = () => store.routes.all()

const getById = (id) => store.routes.findById(id)

const countByUploadedBy = (uploadedBy) => store.routes.findByUploadedBy(uploadedBy).length

const create = (route) => store.routes.insert(route)

module.exports = { list, getById, countByUploadedBy, create }
