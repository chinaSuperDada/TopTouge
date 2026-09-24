const routeRepo = require('../repositories/routeRepo')
const { generateMockRoutes } = require('./mockRoutes')

/**
 * 灌入示例路线。
 *
 * 两条路都走 repository，所以内存模式和 MySQL 模式都能用。
 *
 * 幂等：已经存在 system 路线就跳过。启动时调用（内存模式）和
 * `npm run seed`（MySQL 模式）都会用到，不能重复灌。
 *
 * 示例路线的 uploaded_by 是 'system'，前端会显示成「官方路线」，
 * 用户一眼能分辨这不是别人真跑的路线。
 *
 * @returns {Promise<number>} 本次实际写入的条数
 */
async function seedMockRoutes() {
  const existing = await routeRepo.countByUploadedBy('system')
  if (existing > 0) return 0

  const routes = generateMockRoutes()
  for (const route of routes) {
    await routeRepo.create(route)
  }
  return routes.length
}

module.exports = { seedMockRoutes }
