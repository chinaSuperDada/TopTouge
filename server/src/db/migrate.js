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
        const decision = await shouldSkip(conn, stmt)
        if (decision.skip) {
          console.log(`[migrate]   跳过（${decision.reason}）`)
          continue
        }
        await conn.query(decision.sql)
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

/**
 * MySQL 不支持 ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS
 * （那是 PostgreSQL 和 MariaDB 的语法）。但迁移脚本需要幂等 ——
 * 云托管每次部署都可能重跑。
 *
 * 这里在应用层补上这个能力：遇到这类语句先查 information_schema，
 * 已经存在就跳过。SQL 文件保持可读，幂等性由执行器保证。
 *
 * @returns {{skip: boolean, sql: string, reason?: string}}
 */
async function shouldSkip(conn, stmt) {
  // CREATE INDEX IF NOT EXISTS
  let m = stmt.match(/CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+(\w+)\s+ON\s+(\w+)/i)
  if (m) {
    const [, indexName, tableName] = m
    const [rows] = await conn.query(
      `SELECT 1 FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?
        LIMIT 1`,
      [tableName, indexName]
    )
    if (rows.length > 0) return { skip: true, reason: `索引 ${indexName} 已存在`, sql: stmt }
    // MySQL 不认 IF NOT EXISTS，去掉它再执行
    return { skip: false, sql: stmt.replace(/IF\s+NOT\s+EXISTS\s+/i, '') }
  }

  // ALTER TABLE ... ADD COLUMN IF NOT EXISTS 可能有多个，逐个处理
  if (/ALTER\s+TABLE\s+\w+\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS/i.test(stmt)) {
    const tableMatch = stmt.match(/ALTER\s+TABLE\s+(\w+)/i)
    const tableName = tableMatch[1]

    // 每条 ADD COLUMN 拆出来单独判断
    const addParts = stmt.split(/,\s*(?=ADD\s+COLUMN)/i)
    const keep = []

    for (const part of addParts) {
      const cm = part.match(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+(\w+)/i)
      if (!cm) {
        keep.push(part)
        continue
      }
      const colName = cm[1]
      const [rows] = await conn.query(
        `SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
          LIMIT 1`,
        [tableName, colName]
      )
      if (rows.length === 0) keep.push(part)
    }

    if (keep.length === 0) {
      return { skip: true, reason: `表 ${tableName} 的列都已存在`, sql: stmt }
    }
    // 把剩下的重新拼成一条 ALTER
    const rest = keep.map((p, i) => (i === 0 ? p : p.trim())).join(',\n  ')
    return { skip: false, sql: rest.replace(/IF\s+NOT\s+EXISTS\s+/gi, '') }
  }

  return { skip: false, sql: stmt }
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
