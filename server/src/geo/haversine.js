const EARTH_RADIUS_METERS = 6371008.8

const toRad = (deg) => (deg * Math.PI) / 180

/**
 * 两点球面大圆距离（米）。
 * @param {{lat:number, lng:number}} a
 * @param {{lat:number, lng:number}} b
 * @returns {number}
 */
function haversineMeters(a, b) {
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const dLat = lat2 - lat1
  const dLng = toRad(b.lng - a.lng)

  const sinHalfLat = Math.sin(dLat / 2)
  const sinHalfLng = Math.sin(dLng / 2)

  const h = sinHalfLat * sinHalfLat + Math.cos(lat1) * Math.cos(lat2) * sinHalfLng * sinHalfLng
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)))
}

module.exports = { haversineMeters, EARTH_RADIUS_METERS }
