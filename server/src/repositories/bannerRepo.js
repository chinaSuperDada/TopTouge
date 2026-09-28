const config = require('../config')

/**
 * 活动位。
 *
 * 三种来源（见 002_product.sql 的注释）：
 *   algorithm —— 算法生成，**不落库**，查询时动态算
 *   platform  —— 平台活动
 *   moderator —— 版主活动
 *
 * 查库时只取 platform 和 moderator 两类，algorithm 的由 service 拼。
 */

const useMysql = () => config.dataSource === 'mysql'

function toIso(v) {
  if (!v) return null
  return v instanceof Date ? v.toISOString() : new Date(v).toISOString()
}

function rowToBanner(row) {
  return {
    id: Number(row.id),
    source: row.source,
    title: row.title,
    subtitle: row.subtitle,
    tag: row.tag,
    image: row.image,
    color: row.color,
    link: row.link,
    province: row.province,
    city: row.city,
    startsAt: toIso(row.starts_at),
    endsAt: toIso(row.ends_at),
    priority: row.priority,
    status: row.status
  }
}

const memoryImpl = {
  async listActive() { return [] },
  async create(b) { return { ...b, id: Date.now() } },
  async updateStatus() { return null },
  async listByCreator() { return [] }
}

const mysqlImpl = {
  /**
   * 某区域当前有效的活动。
   *
   * 筛选条件：
   *   status = published
   *   在有效期内（starts_at 为空或已到，ends_at 为空或未过）
   *   区域匹配：province 为空表示全平台，否则要匹配用户所在区域
   */
  async listActive({ province, city, limit = 10 }) {
    const { getPool } = require('../db/pool')
    const [rows] = await getPool().query(
      `SELECT id, source, title, subtitle, tag, image, color, link,
              province, city, starts_at, ends_at, priority, status
         FROM banners
        WHERE status = 'published'
          AND source <> 'algorithm'
          AND (starts_at IS NULL OR starts_at <= NOW(3))
          AND (ends_at IS NULL OR ends_at >= NOW(3))
          AND (
            province = ''
            OR (province = ? AND (city = '' OR city = ?))
          )
        ORDER BY priority DESC, created_at DESC
        LIMIT ${Number(limit) || 10}`,
      [province || '', city || '']
    )
    return rows.map(rowToBanner)
  },

  async create(banner) {
    const { getPool } = require('../db/pool')
    const [res] = await getPool().execute(
      `INSERT INTO banners
        (source, title, subtitle, tag, image, color, link,
         province, city, starts_at, ends_at, priority, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        banner.source, banner.title, banner.subtitle || '', banner.tag || '',
        banner.image || '', banner.color || '#1f6feb', banner.link || '',
        banner.province || '', banner.city || '',
        banner.startsAt ? new Date(banner.startsAt) : null,
        banner.endsAt ? new Date(banner.endsAt) : null,
        banner.priority || 0, banner.status || 'draft', banner.createdBy || ''
      ]
    )
    return { ...banner, id: res.insertId }
  },

  async updateStatus(id, status) {
    const { getPool } = require('../db/pool')
    await getPool().execute('UPDATE banners SET status = ? WHERE id = ?', [status, id])
    return { id, status }
  },

  async remove(id) {
    const { getPool } = require('../db/pool')
    const [res] = await getPool().execute('DELETE FROM banners WHERE id = ?', [id])
    return res.affectedRows
  },

  /** 某个版主创建的活动（版主工作台用） */
  async listByCreator(createdBy, { province, city } = {}) {
    const { getPool } = require('../db/pool')
    const where = ['source = ?']
    const params = ['moderator']

    if (province) { where.push('province = ?'); params.push(province) }
    if (city) { where.push('city = ?'); params.push(city) }

    const [rows] = await getPool().query(
      `SELECT id, source, title, subtitle, tag, image, color, link,
              province, city, starts_at, ends_at, priority, status
         FROM banners
        WHERE ${where.join(' AND ')}
        ORDER BY created_at DESC
        LIMIT 50`,
      params
    )
    return rows.map(rowToBanner)
  }
}

const impl = {
  listActive: (...a) => (useMysql() ? mysqlImpl : memoryImpl).listActive(...a),
  create: (...a) => (useMysql() ? mysqlImpl : memoryImpl).create(...a),
  updateStatus: (...a) => (useMysql() ? mysqlImpl : memoryImpl).updateStatus(...a),
  remove: (...a) => (useMysql() ? mysqlImpl : memoryImpl).remove(...a),
  listByCreator: (...a) => (useMysql() ? mysqlImpl : memoryImpl).listByCreator(...a)
}

module.exports = impl
