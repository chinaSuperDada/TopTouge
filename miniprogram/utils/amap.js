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

/**
 * 高德 SDK 实例缓存。
 *
 * SDK 每次 new 都要重建 requestConfig，没必要重复创建。
 */
let sdkInstance = null

function getInstance() {
  if (!sdkInstance) sdkInstance = createAMapInstance()
  return sdkInstance
}

/**
 * 地点联想搜索。
 *
 * @param {string} keywords 用户输入的关键词
 * @param {object} options { city: 限定城市, location: 'lng,lat' 以当前位置优先排序 }
 * @returns {Promise<Array<{name, district, adcode, location, address}>>}
 */
function searchPlaces(keywords, options = {}) {
  const sdk = getInstance()
  if (!sdk) return Promise.reject(new Error('地图服务未就绪'))

  const query = (keywords || '').trim()
  if (!query) return Promise.resolve([])

  return new Promise((resolve, reject) => {
    sdk.getInputtips({
      keywords: query,
      city: options.city || '',
      citylimit: Boolean(options.city),
      location: options.location || '',
      success(res) {
        const tips = (res && res.tips) || []

        // 高德返回的候选项里混有「区域」类结果，它们没有坐标，无法用于路线规划
        resolve(
          tips
            .filter((t) => typeof t.location === 'string' && t.location.includes(','))
            .map((t) => {
              const [lng, lat] = t.location.split(',').map(Number)
              return {
                name: t.name,
                district: t.district || '',
                adcode: t.adcode || '',
                address: t.address || '',
                lat,
                lng,
                location: t.location
              }
            })
            .filter((t) => Number.isFinite(t.lat) && Number.isFinite(t.lng))
        )
      },
      fail(err) {
        reject(new Error((err && err.errMsg) || '地点搜索失败'))
      }
    })
  })
}

/**
 * 驾车路线规划。
 *
 * @param {{lat,lng}} origin 起点
 * @param {{lat,lng}} destination 终点
 * @param {Array<{lat,lng}>} waypoints 途经点（可选，最多 16 个）
 * @returns {Promise<{track: Array<{lat,lng,altitude}>, distanceMeters: number, durationSeconds: number}>}
 */
function planDrivingRoute(origin, destination, waypoints = []) {
  const sdk = getInstance()
  if (!sdk) return Promise.reject(new Error('地图服务未就绪'))

  const fmt = (p) => `${p.lng},${p.lat}`

  return new Promise((resolve, reject) => {
    sdk.getDrivingRoute({
      origin: fmt(origin),
      destination: fmt(destination),
      waypoints: waypoints.length ? waypoints.map(fmt).join(';') : '',
      // strategy 10 = 不走高速，跑山场景更贴近实际
      strategy: 10,
      success(res) {
        const paths = (res && res.paths) || []
        if (!paths.length) {
          reject(new Error('未能规划出路线，请换个起终点试试'))
          return
        }

        const path = paths[0]
        const track = parsePolyline(path.steps)

        if (track.length < 2) {
          reject(new Error('规划结果为空'))
          return
        }

        resolve({
          track,
          distanceMeters: Number(path.distance) || 0,
          durationSeconds: Number(path.duration) || 0
        })
      },
      fail(err) {
        reject(new Error((err && err.errMsg) || '路线规划失败'))
      }
    })
  })
}

/**
 * 把高德路线规划结果里各步骤的 polyline 拼成完整轨迹。
 *
 * 响应格式：steps[].polyline = "lng,lat;lng,lat;lng,lat"
 * 相邻步骤的首尾点会重复，需要去重。
 *
 * 规划结果没有海拔信息，altitude 统一给 0 —— 这与上传页地图点选的行为一致。
 */
function parsePolyline(steps) {
  if (!Array.isArray(steps)) return []

  const points = []

  for (const step of steps) {
    const raw = step && step.polyline
    if (typeof raw !== 'string' || !raw) continue

    for (const pair of raw.split(';')) {
      const [lngStr, latStr] = pair.split(',')
      const lng = Number(lngStr)
      const lat = Number(latStr)
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue

      const prev = points[points.length - 1]
      if (prev && prev.lat === lat && prev.lng === lng) continue

      points.push({ lat, lng, altitude: 0 })
    }
  }

  return points
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
  searchPlaces,
  planDrivingRoute,
  parsePolyline,
  buildPolyline,
  buildMarkers,
  fitView
}
