const config = require('./config')
const { createApp } = require('./app')
const { seedMockRoutes } = require('./store/seed')

/**
 * 启动流程。
 *
 * 关于示例数据：
 *   内存模式 —— 启动时自动灌 3 条示例路线。内存本来就是空的，
 *              每次重启都要重新灌，不灌的话界面永远是空的。
 *   MySQL 模式 —— **不自动灌**。数据是持久的，自动灌会在真实环境
 *              混入示例数据。要示例数据请显式跑 `npm run seed`。
 */
async function main() {
  if (config.dataSource === 'mysql') {
    const { ping } = require('./db/pool')
    const ok = await ping()
    if (!ok) {
      console.error('[TopTouge] 数据库连接失败，请检查 DB_* 环境变量')
      process.exit(1)
    }
    console.log('[TopTouge] 已连接 MySQL')
  } else {
    const inserted = await seedMockRoutes()
    if (inserted > 0) {
      console.log(`[TopTouge] 已灌入 ${inserted} 条示例路线`)
    }
  }

  const app = createApp()
  app.listen(config.port, () => {
    console.log(`[TopTouge] 服务已启动 http://localhost:${config.port}`)
    console.log(`[TopTouge] 数据源: ${config.dataSource}`)
    console.log(`[TopTouge] 固定测试用户: ${config.testUserId}`)
  })
}

main().catch((err) => {
  console.error('[TopTouge] 启动失败:', err)
  process.exit(1)
})
