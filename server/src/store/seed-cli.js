/**
 * 灌入示例路线。
 *
 * 用法：npm run seed
 *
 * 示例路线用于让新用户打开就能看到内容，不是真实车友跑的。
 * uploaded_by 标记为 'system'，前端显示成「官方路线」。
 *
 * 幂等：已存在就跳过，重复跑不会灌出重复数据。
 */

const config = require('../config')
const { seedMockRoutes } = require('../store/seed')

async function main() {
  console.log(`[seed] 数据源: ${config.dataSource}`)

  if (config.dataSource === 'mysql') {
    const { ping, closePool } = require('../db/pool')
    if (!(await ping())) {
      console.error('[seed] 数据库连不上，先检查 DB_* 环境变量')
      process.exit(1)
    }
    const inserted = await seedMockRoutes()
    console.log(inserted > 0 ? `[seed] 已写入 ${inserted} 条示例路线` : '[seed] 示例路线已存在，跳过')
    await closePool()
  } else {
    const inserted = await seedMockRoutes()
    console.log(inserted > 0 ? `[seed] 已写入 ${inserted} 条示例路线` : '[seed] 示例路线已存在，跳过')
    console.log('[seed] 注意：内存模式重启即丢失，如需持久请用 DATA_SOURCE=mysql')
  }
}

main().catch((err) => {
  console.error('[seed] 出错:', err.message)
  process.exit(1)
})
