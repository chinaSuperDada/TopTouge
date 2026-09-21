const config = require('./config')
const { createApp } = require('./app')
const { seedMockRoutes } = require('./store/seed')

/**
 * 启动流程。
 *
 * 内存模式：把 3 条 mock 路线灌进内存，方便直接开发。
 * MySQL 模式：数据在库里，不做任何初始化 —— 重复灌 mock 会污染真实数据。
 *            建表和初始数据用 `npm run migrate`。
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
    const inserted = seedMockRoutes()
    if (inserted > 0) {
      console.log(`[TopTouge] 已灌入 ${inserted} 条 mock 路线`)
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
