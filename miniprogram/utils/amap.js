/**
 * 高德地图小程序 SDK 封装。
 *
 * Key 已配置。还需要 SDK 文件才能用：
 *   从高德控制台下载 amap-wx.130.js 放到 miniprogram/libs/
 *
 * SDK 文件缺失时地图区域显示提示文案，其余页面逻辑照常跑。
 */

// 高德开放平台 Key（应用名 TopTougeVXKey，服务平台：微信小程序）
// 注意：这个 Key 与小程序 AppID 绑定，换 AppID 需要重新申请
const AMAP_KEY = '87d2234859e6301536b6441473f657f4'

/** Key 是否已配置 */
const isConfigured = () => Boolean(AMAP_KEY)

/**
 * 地图元素用色。
 *
 * map 组件的 polyline / marker 颜色走的是组件属性，拿不到 WXSS 变量，
 * 只能在这里写常量。改配色时这里要跟着 styles/tokens.wxss 一起改。
 */
const ACCENT_COLOR = '#0c9cfc'
const ALT_COLOR = '#6c9c3c'
const DANGER_COLOR = '#e5484d'
const MUTED_COLOR = '#8b98a5'
const TRACK_COLOR = ACCENT_COLOR

/**
 * SDK 文件是否已就位。
 *
 * 页面用这个决定要不要盖「地图暂不可用」的提示浮层 —— 真正影响地图能不能
 * 渲染的是 SDK 文件在不在，而不是 Key 配没配。
 *
 * 只在启动时探测一次：require 失败会被小程序缓存，反复试没有意义。
 */
let sdkAvailable = null

function isSdkAvailable() {
  if (sdkAvailable !== null) return sdkAvailable

  try {
    require('../libs/amap-wx.130.js')
    sdkAvailable = true
  } catch (err) {
    sdkAvailable = false
  }
  return sdkAvailable
}

/**
 * 创建高德 SDK 实例。
 * SDK 文件缺失或 Key 未配置时返回 null，由调用方决定怎么降级。
 *
 * @returns {object|null}
 */
function createAMapInstance() {
  if (!isConfigured()) {
    console.warn('[amap] 尚未配置 Key，地图功能不可用')
    return null
  }

  try {
    // 本地文件，不是 npm 包。
    // SDK 导出的是具名属性 module.exports.AMapWX，不是默认导出 ——
    // 写成 `const AMapWX = require(...)` 会拿到整个 module 对象，
    // new 的时候报 "AMapWX is not a constructor"。
    const { AMapWX } = require('../libs/amap-wx.130.js')
    return new AMapWX({ key: AMAP_KEY })
  } catch (err) {
    console.warn('[amap] SDK 初始化失败', err)
    return null
  }
}

/**
 * 把轨迹点转成 map 组件的 polyline。
 *
 * @param {Array<{lat:number, lng:number}>} track
 * @returns {Array} map 组件的 polyline 属性
 */
function buildPolyline(track) {
  if (!Array.isArray(track) || track.length < 2) return []

  return [
    {
      points: track.map((p) => ({ latitude: p.lat, longitude: p.lng })),
      color: ACCENT_COLOR,
      width: 4,
      arrowLine: true
    }
  ]
}

/**
 * 把起终点与途经点转成 map 组件的 markers。
 *
 * 闭环路线（跑山常见的回环）首尾点几乎重合，两个 marker 叠在一起会互相遮挡，
 * 这种情况合并成一个「起终点」标记。
 *
 * @param {{startPoint, endPoint, waypoints}} route
 * @returns {Array} map 组件的 markers 属性
 */
function buildMarkers(route) {
  const markers = []
  let id = 1

  const start = route.startPoint
  const end = route.endPoint

  const isLoop =
    start &&
    end &&
    // 相距小于一个起点半径就当作同一点
    planarDistanceMeters(start, end) <= (start.radiusMeters || 30)

  if (start && isLoop) {
    markers.push({
      id: id++,
      latitude: start.lat,
      longitude: start.lng,
      width: 28,
      height: 28,
      callout: {
        content: '起终点',
        color: ACCENT_COLOR,
        fontSize: 12,
        borderRadius: 4,
        padding: 4,
        display: 'ALWAYS'
      }
    })
  } else {
    if (start) {
      markers.push({
        id: id++,
        latitude: start.lat,
        longitude: start.lng,
        width: 28,
        height: 28,
        callout: {
          content: '起点',
          color: ACCENT_COLOR,
          fontSize: 12,
          borderRadius: 4,
          padding: 4,
          display: 'ALWAYS'
        }
      })
    }

    if (end) {
      markers.push({
        id: id++,
        latitude: end.lat,
        longitude: end.lng,
        width: 28,
        height: 28,
        callout: {
          content: '终点',
          color: DANGER_COLOR,
          fontSize: 12,
          borderRadius: 4,
          padding: 4,
          display: 'ALWAYS'
        }
      })
    }
  }

  for (const w of route.waypoints || []) {
    markers.push({
      id: id++,
      latitude: w.lat,
      longitude: w.lng,
      width: 20,
      height: 20,
      callout: {
        content: w.name,
        color: MUTED_COLOR,
        fontSize: 11,
        borderRadius: 4,
        padding: 3,
        display: 'BYCLICK'
      }
    })
  }

  return markers
}

const METERS_PER_DEG_LAT = 111320

/** 两点间的近似平面距离（米），仅用于判断是否重合 */
function planarDistanceMeters(a, b) {
  const dLat = (a.lat - b.lat) * METERS_PER_DEG_LAT
  const dLng = (a.lng - b.lng) * METERS_PER_DEG_LAT * Math.cos((b.lat * Math.PI) / 180)
  return Math.sqrt(dLat * dLat + dLng * dLng)
}

/**
 * 由轨迹算出一个合适的中心点与缩放级别，让整条路线落在可视范围内。
 *
 * scale 与视野跨度的大致对照（小程序 map 组件，屏幕高度约 400rpx 时）：
 *   scale 16 ≈ 150m   scale 15 ≈ 300m   scale 14 ≈ 600m
 *   scale 13 ≈ 1.2km  scale 12 ≈ 2.5km  scale 11 ≈ 5km
 *   scale 10 ≈ 10km   scale  9 ≈ 20km   scale  8 ≈ 40km
 *
 * 取 spanMeters 的一半（半跨度）去匹配视野，留出边距。
 *
 * @param {Array<{lat:number, lng:number}>} track
 * @returns {{latitude, longitude, scale}}
 */
function fitView(track) {
  if (!Array.isArray(track) || track.length === 0) {
    return { latitude: 39.9042, longitude: 116.4074, scale: 11 }
  }

  let minLat = Infinity
  let maxLat = -Infinity
  let minLng = Infinity
  let maxLng = -Infinity

  for (const p of track) {
    if (p.lat < minLat) minLat = p.lat
    if (p.lat > maxLat) maxLat = p.lat
    if (p.lng < minLng) minLng = p.lng
    if (p.lng > maxLng) maxLng = p.lng
  }

  const centerLat = (minLat + maxLat) / 2
  const dNorthMeters = (maxLat - minLat) * METERS_PER_DEG_LAT
  const dEastMeters =
    (maxLng - minLng) * METERS_PER_DEG_LAT * Math.cos((centerLat * Math.PI) / 180)

  const spanMeters = Math.max(dNorthMeters, dEastMeters)

  return {
    latitude: centerLat,
    longitude: (minLng + maxLng) / 2,
    scale: scaleForSpan(spanMeters)
  }
}

/** 视野跨度（米）映射到缩放级别，向下取整留边距 */
function scaleForSpan(spanMeters) {
  const thresholds = [
    [150, 16],
    [300, 15],
    [600, 14],
    [1200, 13],
    [2500, 12],
    [5000, 11],
    [10000, 10],
    [20000, 9]
  ]

  for (const [limit, scale] of thresholds) {
    if (spanMeters <= limit) return scale
  }
  return 8
}

module.exports = {
  AMAP_KEY,
  ACCENT_COLOR,
  ALT_COLOR,
  DANGER_COLOR,
  MUTED_COLOR,
  TRACK_COLOR,
  isConfigured,
  isSdkAvailable,
  createAMapInstance,
  buildPolyline,
  buildMarkers,
  fitView
}
