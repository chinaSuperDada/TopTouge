const config = require('../config')

/**
 * comment 与 roadCondition 两张表结构完全相同（route_id / user_id /
 * content / created_at），只是表名不同，所以用同一个实现生成器，
 * 避免两份几乎一样的代码各自演化。
 */

const useMysql = () => config.dataSource === 'mysql'

/** Date 转 ISO，与内存实现返回格式一致 */
function toIso(value) {
  if (!value) return null
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

/**
 * 造一个「路线下属内容」的仓库。
 *
 * @param {string} table 表名
 * @param {object} memoryCollection memoryStore 里对应的集合
 * @param {string} label 日志与报错里显示的名字
 */
function createRepo(table, memoryCollection, label) {
  const memoryImpl = {
    async listByRoute(routeId, limit) {
      return memoryCollection.listByRoute(routeId, limit)
    },
    async create(item) {
      return memoryCollection.insert(item)
    }
  }

  const mysqlImpl = {
    async listByRoute(routeId, limit) {
      const { getPool } = require('../db/pool')
      const [rows] = await getPool().execute(
        // LIMIT 不能走占位符（预编译时会被当字符串），但这里 limit 来自
        // 我们自己的 parseLimit，已夹到合理范围，不存在注入风险
        `SELECT id, route_id, user_id, content, created_at
           FROM ${table}
          WHERE route_id = ?
          ORDER BY created_at DESC, id DESC
          LIMIT ${Number(limit) || 10}`,
        [routeId]
      )
      return rows.map((r) => ({
        id: Number(r.id),
        routeId: Number(r.route_id),
        userId: r.user_id,
        content: r.content,
        createdAt: toIso(r.created_at)
      }))
    },

    async create(item) {
      const { getPool } = require('../db/pool')
      const [result] = await getPool().execute(
        `INSERT INTO ${table} (route_id, user_id, content, created_at)
         VALUES (?, ?, ?, ?)`,
        [item.routeId, item.userId, item.content, new Date(item.createdAt)]
      )

      // 查回完整行，保证与 listByRoute 返回的结构一致
      const [rows] = await getPool().execute(
        `SELECT id, route_id, user_id, content, created_at
           FROM ${table} WHERE id = ? LIMIT 1`,
        [result.insertId]
      )
      if (!rows.length) {
        throw new Error(`[${label}] 插入后查不到 id=${result.insertId}`)
      }

      const r = rows[0]
      return {
        id: Number(r.id),
        routeId: Number(r.route_id),
        userId: r.user_id,
        content: r.content,
        createdAt: toIso(r.created_at)
      }
    }
  }

  return {
    listByRoute: (...a) => (useMysql() ? mysqlImpl : memoryImpl).listByRoute(...a),
    create: (...a) => (useMysql() ? mysqlImpl : memoryImpl).create(...a)
  }
}

module.exports = { createRepo }
