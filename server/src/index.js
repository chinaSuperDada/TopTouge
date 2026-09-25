const config = require('./config')
const { createApp } = require('./app')
const { seedMockRoutes } = require('./store/seed')

/**
 * 启动流程。
 *
 * 关于数据库初始化：
 *   MySQL 模式启动时会自动跑一次「建库 + 建表 + 灌示例」，全部幂等，
 *   已有数据不会被动。这样部署到新环境不需要先进 WebShell 手动执行 ——
 *   而且也必须自动化：库不存在时容器起不来，进不了 WebShell，
 *   就成了死循环（要跑迁移得先有容器，要有容器得先建库）。
 *
 *   初始化失败不退出进程。库连不上时服务照常监听，health 接口返回
 *   not-ready，等数据库恢复后下次重启或再次调用即可完成初始化。
 *   比直接崩溃重启好：崩溃重启会陷入 Back-off，日志刷屏且永远进不去。
 */
async function prepareDataSource() {
  if (config.dataSource !== 'mysql') {
    const inserted = await seedMockRoutes()
    if (inserted > 0) {
      console.log(`[TopTouge] 已灌入 ${inserted} 条示例路线`)
    }
    return
  }

  try {
    const { ensureDatabase } = require('./db/ensureDatabase')
    const { runMigrations } = require('./db/migrate')
    const { closePool } = require('./db/pool')

    const { created, name } = await ensureDatabase()
    console.log(created ? `[TopTouge] 已创建数据库 ${name}` : `[TopTouge] 数据库 ${name} 已就绪`)

    await runMigrations()

    const inserted = await seedMockRoutes()
    if (inserted > 0) {
      console.log(`[TopTouge] 已写入 ${inserted} 条示例路线`)
    }

    await closePool()
    console.log('[TopTouge] 数据库准备完成')
  } catch (err) {
    // 不退出：让服务先起来，health 会报 not-ready，便于排查
    console.error('[TopTouge] 数据库准备失败，服务将以降级状态启动')
    console.error('[TopTouge] 失败原因:', err.message)
    if (err.code) console.error('[TopTouge] 错误码:', err.code)
    const { describeConnection } = require('./db/pool')
    console.error('[TopTouge] 连接参数:', describeConnection())
  }
}

async function main() {
  await prepareDataSource()

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
