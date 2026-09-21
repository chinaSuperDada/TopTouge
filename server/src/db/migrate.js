/**
 * 建表脚本。
 *
 * 用法：npm run migrate
 *
 * 按 sql/ 目录下的文件名顺序执行，已执行过的记录在 schema_migrations 表里，
 * 重复运行不会重放 —— 云托管的容器每次启动都可能调一次，必须幂等。
 */

const fs = require('fs')
const path = require('path')
const config = require('../config')

const SQL_DIR = path.resolve(__dirname, '../../sql')

async function main() {
  if (config.dataSource !== 'mysql') {
    console.log(`[migrate] 当前数据源是 ${config.dataSource}，不需要建表。`)
    console.log('[migrate] 要建表请设置 DATA_SOURCE=mysql 并配好 DB_* 环境变量。')
    return
  }

  const { getPool, closePool } = require('../db/pool')
  const pool = getPool()

  // 记录表本身也要建
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       VARCHAR(128) NOT NULL,
      applied_at DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  const [applied] = await pool.query('SELECT name FROM schema_migrations')
  const done = new Set(applied.map((r) => r.name))

  const files = fs
    .readdirSync(SQL_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  let ran = 0
  for (const file of files) {
    if (done.has(file)) {
      console.log(`[migrate] 跳过 ${file}（已执行）`)
      continue
    }

    const sql = fs.readFileSync(path.join(SQL_DIR, file), 'utf8')
    console.log(`[migrate] 执行 ${file} …`)

    // 一个文件里的多条语句逐条执行。
    // 不依赖 multipleStatements（默认关闭，且开了有注入风险）。
    const statements = sql
      .split(';')
      .map((s) => s.trim())
      // 去掉纯注释片段
      .filter((s) => s && !/^(--|\/\*)/.test(s))

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      for (const stmt of statements) {
        await conn.query(stmt)
      }
      await conn.execute('INSERT INTO schema_migrations (name) VALUES (?)', [file])
      await conn.commit()
      ran++
      console.log(`[migrate] ${file} 完成`)
    } catch (err) {
      await conn.rollback()
      console.error(`[migrate] ${file} 失败，已回滚:`, err.message)
      throw err
    } finally {
      conn.release()
    }
  }

  console.log(`[migrate] 共执行 ${ran} 个文件，${files.length - ran} 个已是最新`)
  await closePool()
}

main().catch((err) => {
  console.error('[migrate] 出错:', err.message)
  process.exit(1)
})
