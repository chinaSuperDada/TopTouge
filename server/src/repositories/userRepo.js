const config = require('../config')

/**
 * 用户资料。
 *
 * 只存用户自己填的昵称和头像 —— 身份标识（openid）由云托管注入，
 * 不作为业务字段落库。
 */

const useMysql = () => config.dataSource === 'mysql'

function toIso(v) {
  if (!v) return null
  return v instanceof Date ? v.toISOString() : new Date(v).toISOString()
}

function rowToUser(row) {
  if (!row) return null
  return {
    userId: row.user_id,
    nickName: row.nick_name || '',
    avatar: row.avatar || '',
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  }
}

const memoryImpl = {
  async getById() { return null },
  async upsert() { return null },
  async listByIds() { return [] }
}

const mysqlImpl = {
  async getById(userId) {
    const { getPool } = require('../db/pool')
    const [rows] = await getPool().execute(
      'SELECT user_id, nick_name, avatar, created_at, updated_at FROM users WHERE user_id = ? LIMIT 1',
      [userId]
    )
    return rows.length ? rowToUser(rows[0]) : null
  },

  /**
   * 写入或更新资料。
   *
   * 用 ON DUPLICATE KEY UPDATE —— 用户第一次没填过时插入，
   * 填过就更新。比「先查再决定 insert/update」简洁，也不会有并发问题。
   *
   * 注意：只更新传了值的字段。传 undefined 表示「这次不改这个字段」，
   * 否则用户只改昵称会把头像清空。
   */
  async upsert(userId, { nickName, avatar }) {
    const { getPool } = require('../db/pool')

    const existing = await this.getById(userId)

    if (!existing) {
      await getPool().execute(
        'INSERT INTO users (user_id, nick_name, avatar) VALUES (?, ?, ?)',
        [userId, nickName || '', avatar || '']
      )
    } else {
      const nextName = nickName === undefined ? existing.nickName : nickName
      const nextAvatar = avatar === undefined ? existing.avatar : avatar

      await getPool().execute(
        'UPDATE users SET nick_name = ?, avatar = ? WHERE user_id = ?',
        [nextName, nextAvatar, userId]
      )
    }

    return this.getById(userId)
  },

  /**
   * 批量查用户资料。
   *
   * 评论/成绩列表要显示昵称头像 —— 逐条查会 N+1，
   * 所以一次把涉及的 user_id 全查出来，在内存里拼。
   */
  async listByIds(userIds) {
    const ids = [...new Set((userIds || []).filter(Boolean))]
    if (ids.length === 0) return []

    const { getPool } = require('../db/pool')
    const placeholders = ids.map(() => '?').join(',')
    const [rows] = await getPool().query(
      `SELECT user_id, nick_name, avatar, created_at, updated_at
         FROM users WHERE user_id IN (${placeholders})`,
      ids
    )
    return rows.map(rowToUser)
  }
}

const impl = {
  getById: (...a) => (useMysql() ? mysqlImpl : memoryImpl).getById(...a),
  upsert: (...a) => (useMysql() ? mysqlImpl : memoryImpl).upsert(...a),
  listByIds: (...a) => (useMysql() ? mysqlImpl : memoryImpl).listByIds(...a)
}

module.exports = impl
