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

/**
 * 把 SQL 文件拆成可逐条执行的语句。
 *
 * 不能简单地 split(';') 然后丢掉「以 -- 开头的片段」——
 * 那样会把「注释 + 建表语句」整段扔掉。001_init.sql 里 routes 表
 * 前面有大段说明注释，用那种写法会导致 routes 表根本不建，
 * 然后 comments 建外键时报「找不到被引用的表」，很难看出真正原因。
 *
 * 正确做法是逐行剥离注释，再按分号切分。
 */
function splitStatements(sql) {
  const withoutComments = sql
    .split('\n')
    .map((line) => {
      const trimmed = line.trim()
      // 整行注释直接去掉
      if (trimmed.startsWith('--')) return ''
      // 行尾注释去掉（SQL 里的 -- 不会出现在字符串字面量中，本项目没有这种用法）
      const idx = line.indexOf('--')
      return idx >= 0 ? line.slice(0, idx) : line
    })
    .join('\n')

  return withoutComments
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * 执行建表迁移。
 *
 * 幂等：已执行过的文件记在 schema_migrations 表里，重复运行不会重放。
 * 每个文件在事务里执行，失败整体回滚。
 *
 * @returns {Promise<{ran: number, skipped: number, total: number}>}
 */
async function runMigrations() {
  const { getPool } = require('../db/pool')
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
    const statements = splitStatements(sql)
    console.log(`[migrate] 执行 ${file}（${statements.length} 条语句）…`)

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
  return { ran, skipped: files.length - ran, total: files.length }
}

async function main() {
  if (config.dataSource !== 'mysql') {
    console.log(`[migrate] 当前数据源是 ${config.dataSource}，不需要建表。`)
    console.log('[migrate] 要建表请设置 DATA_SOURCE=mysql 并配好 DB_* 环境变量。')
    return
  }

  const { getPool, closePool } = require('../db/pool')
  getPool() // 提前建池，让连接失败早暴露
  await runMigrations()
  await closePool()
}

// 只有直接运行本文件时才执行。
// 被 require 引入时（init.js 会用 runMigrations）不碰数据库。
if (require.main === module) {
  main().catch((err) => {
    console.error('[migrate] 出错:', err.message)
    process.exit(1)
  })
}

module.exports = { splitStatements, runMigrations }
