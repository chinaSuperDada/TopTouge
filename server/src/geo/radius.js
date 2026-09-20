const METERS_PER_DEG_LAT = 111320

/**
 * 点是否落在圆心 radiusMeters 范围内。
 * 用等距投影做欧氏近似：在几十公里尺度内误差可忽略，
 * 用于跑山时判断是否进入起终点区域，不需要精确球面距离。
 *
 * @param {{lat:number, lng:number}} point
 * @param {{lat:number, lng:number}} center
 * @param {number} radiusMeters
 * @returns {boolean}
 */
function inRadius(point, center, radiusMeters) {
  const dLatMeters = (point.lat - center.lat) * METERS_PER_DEG_LAT
  const dLngMeters = (point.lng - center.lng) * METERS_PER_DEG_LAT * Math.cos((center.lat * Math.PI) / 180)

  return Math.sqrt(dLatMeters * dLatMeters + dLngMeters * dLngMeters) <= radiusMeters
}

module.exports = { inRadius, METERS_PER_DEG_LAT }
