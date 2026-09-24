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
  const server = app.listen(config.port, () => {
    console.log(`[TopTouge] 服务已启动，监听端口 ${config.port}`)
    console.log(`[TopTouge] 数据源: ${config.dataSource}`)
    console.log(`[TopTouge] 固定测试用户: ${config.testUserId}`)
  })

  /**
   * 监听失败必须显式处理。
   *
   * 不加这个的话，端口被占用或权限不足（比如以非 root 绑 80 端口）
   * 只会抛出一个裸的 "Unhandled 'error' event"，容器日志里完全看不出
   * 是 EACCES 还是 EADDRINUSE —— 排查时等于没有线索。
   */
  server.on('error', (err) => {
    const hints = {
      EACCES: `端口 ${config.port} 需要更高权限。1024 以下的端口要 root，容器里建议用 3000 以上`,
      EADDRINUSE: `端口 ${config.port} 已被占用`,
      EADDRNOTAVAIL: `端口 ${config.port} 不可用，检查监听地址配置`
    }
    console.error(`[TopTouge] 启动失败 (${err.code}): ${hints[err.code] || err.message}`)
    process.exit(1)
  })

  /** 收到停止信号时优雅退出，让连接池有机会释放 */
  const shutdown = async (signal) => {
    console.log(`[TopTouge] 收到 ${signal}，正在关闭…`)
    server.close(async () => {
      if (config.dataSource === 'mysql') {
        const { closePool } = require('./db/pool')
        await closePool()
      }
      process.exit(0)
    })
    // 兜底：10 秒内没关干净就强退，避免被编排系统强杀
    setTimeout(() => process.exit(0), 10000).unref()
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

main().catch((err) => {
  console.error('[TopTouge] 启动失败:', err)
  process.exit(1)
})
