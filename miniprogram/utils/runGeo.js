/**
 * 跑山用的几何计算。
 *
 * 与后端 server/src/geo/ 是同一套算法，但**必须在前端也有一份** ——
 * 跑山过程中要实时判断「是否进入终点区域」，每 2 秒就要算一次，
 * 不可能每次发请求问后端。
 *
 * 两边的算法要保持一致，否则会出现「前端说到终点了、后端说不匹配」
 * 这种诡异问题。改这里的时候记得同步改后端。
 */

const METERS_PER_DEG_LAT = 111320

const toRad = (deg) => (deg * Math.PI) / 180

/**
 * 两点球面距离（米）。
 * 与后端 haversine.js 一致。
 */
function distanceMeters(a, b) {
  const R = 6371008.8
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const dLat = lat2 - lat1
  const dLng = toRad(b.lng - a.lng)

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2

  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * 点是否落在圆心 radiusMeters 内。
 * 用等距投影，与后端 radius.js 一致 —— 跑山判断终点用这个，
 * 几十公里尺度内误差可忽略，但比球面距离快得多（每 2 秒要算一次）。
 */
function inRadius(point, center, radiusMeters) {
  const dLatMeters = (point.lat - center.lat) * METERS_PER_DEG_LAT
  const dLngMeters =
    (point.lng - center.lng) * METERS_PER_DEG_LAT * Math.cos(toRad(center.lat))

  return Math.sqrt(dLatMeters ** 2 + dLngMeters ** 2) <= radiusMeters
}

/** 秒数转 mm:ss / hh:mm:ss */
function formatDuration(seconds) {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`
}

/** 距离格式化 */
function formatDistance(meters) {
  const m = Number(meters) || 0
  return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(2)}km`
}

module.exports = { distanceMeters, inRadius, formatDuration, formatDistance }
