/**
 * 数据库初始化 —— 一步到位。
 *
 * 用法：npm run init
 *
 * 做三件事，全部幂等：
 *   ① 建库    CREATE DATABASE IF NOT EXISTS
 *   ② 建表    执行 sql/*.sql，已执行的跳过
 *   ③ 灌数据  写入示例路线，已有则跳过
 *
 * 「幂等」在这里不是可选项：这个脚本会在云托管部署后被执行，
 * 也可能被重复执行。任何一步都不允许覆盖或清空已有数据 ——
 * 已有库不动、已有表不动、已有数据不动。
 *
 * 部署到新环境时的完整流程就是这一条命令。
 */

const config = require('../config')
const { ensureDatabase } = require('./ensureDatabase')
const { runMigrations } = require('./migrate')

async function main() {
  console.log('='.repeat(46))
  console.log('TopTouge 数据库初始化')
  console.log('='.repeat(46))

  if (config.dataSource !== 'mysql') {
    console.log(`\n当前数据源是 ${config.dataSource}，不需要初始化数据库。`)
    console.log('如需初始化请设置 DATA_SOURCE=mysql 并配好数据库环境变量。')
    return
  }

  const { closePool } = require('../db/pool')

  /* ---------- ① 建库 ---------- */
  console.log('\n[1/3] 检查数据库…')
  const { created, name } = await ensureDatabase()
  console.log(created ? `  已创建数据库 ${name}` : `  数据库 ${name} 已存在，跳过`)

  /* ---------- ② 建表 ---------- */
  console.log('\n[2/3] 检查表结构…')
  const { ran, skipped } = await runMigrations()
  if (ran === 0) {
    console.log(`  表结构已是最新（${skipped} 个文件全部执行过）`)
  }

  /* ---------- ③ 灌示例数据 ---------- */
  console.log('\n[3/3] 检查示例数据…')
  const { seedMockRoutes } = require('../store/seed')
  const inserted = await seedMockRoutes()
  console.log(
    inserted > 0
      ? `  已写入 ${inserted} 条示例路线`
      : '  示例路线已存在，跳过（不覆盖已有数据）'
  )

  await closePool()

  console.log('\n' + '='.repeat(46))
  console.log('初始化完成')
  console.log('='.repeat(46))
}

main().catch((err) => {
  console.error('\n[init] 初始化失败:', err.message)
  if (err.code) console.error('[init] 错误码:', err.code)
  process.exit(1)
})
