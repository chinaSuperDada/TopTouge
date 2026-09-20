const store = require('./memoryStore')
const { generateMockRoutes } = require('./mockRoutes')

/**
 * 把 3 条 mock 路线灌进内存 store。
 *
 * 幂等：如果已经存在 system 路线就跳过，避免热重载时重复灌入。
 *
 * @returns {number} 本次实际写入的条数
 */
function seedMockRoutes() {
  const existing = store.routes.findByUploadedBy('system')
  if (existing.length > 0) return 0

  const routes = generateMockRoutes()
  for (const route of routes) {
    store.routes.insert(route)
  }
  return routes.length
}

module.exports = { seedMockRoutes }
