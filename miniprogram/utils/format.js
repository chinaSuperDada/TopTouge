/**
 * 展示层格式化。后端返回的都是原始数值，这里负责转成人看的文案。
 */

const ROAD_WIDTH_LABEL = {
  narrow: '窄',
  medium: '中',
  wide: '宽'
}

/** 距离：小于 1km 显示米，否则显示公里一位小数 */
function formatDistance(meters) {
  const m = Number(meters) || 0
  if (m < 1000) return `${Math.round(m)}m`
  return `${(m / 1000).toFixed(1)}km`
}

/** 爬升 */
function formatElevation(meters) {
  return `${Math.round(Number(meters) || 0)}m`
}

/** 急弯占比：0.25 -> 25% */
function formatRatio(ratio) {
  return `${Math.round((Number(ratio) || 0) * 100)}%`
}

/** 路宽枚举转中文 */
function formatRoadWidth(width) {
  return ROAD_WIDTH_LABEL[width] || width || '-'
}

/** 星级转五格字符串，用于纯文字展示 */
function formatStars(stars) {
  const n = Math.max(1, Math.min(5, Math.round(Number(stars) || 1)))
  return '★'.repeat(n) + '☆'.repeat(5 - n)
}

/** ISO 时间转相对时间 */
function formatTime(iso) {
  if (!iso) return ''

  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''

  const diff = Date.now() - then
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour

  if (diff < minute) return '刚刚'
  if (diff < hour) return `${Math.floor(diff / minute)}分钟前`
  if (diff < day) return `${Math.floor(diff / hour)}小时前`
  if (diff < 30 * day) return `${Math.floor(diff / day)}天前`

  const d = new Date(then)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const pad = (n) => String(n).padStart(2, '0')

module.exports = {
  formatDistance,
  formatElevation,
  formatRatio,
  formatRoadWidth,
  formatStars,
  formatTime,
  ROAD_WIDTH_LABEL
}
