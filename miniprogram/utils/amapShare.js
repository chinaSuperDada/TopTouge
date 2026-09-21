/**
 * 高德分享链接的构造。
 *
 * 格式来自高德 App 实际分享出来的链接（实测确认，不是推测）：
 *
 *   https://m.amap.com/navigation/carmap/__r=...&saddr=..&daddr=..&viaaddr=..
 *
 *   起点 saddr = 经度,纬度,名称
 *   终点 daddr = 经度,纬度,名称
 *   途经点 viaaddr = 经度组,纬度组,名称组
 *
 * 注意 viaaddr 是**按字段分组**而不是按点分组 —— 三个途经点长这样：
 *
 *   viaaddr = 120.32|120.30|120.30, 30.07|30.04|30.04, 青化山下|诸坞林道|白风岭
 *             └──── 经度组 ────┘   └──── 纬度组 ────┘  └──── 名称组 ────┘
 *
 * 组内用「|」分隔，组间用「,」分隔。三个组的元素个数必须一致。
 *
 * 另外 `__r=` 后面那段是位置敏感的旧格式（第一个字段是纬度不是经度），
 * 容易搞错且含分享令牌，这里不用，只依赖有名字的 saddr/daddr/viaaddr。
 *
 * 坐标系：高德用 GCJ-02，与本项目一致，不需要转换。
 */

const BASE = 'https://m.amap.com/navigation/carmap/__r='

/** 一个点序列化成「经度,纬度,名称」 */
function formatPoint(point, name) {
  // 不四舍五入 —— 高德自己生成的就是全精度，透传避免引入偏差
  const lng = Number(point.lng)
  const lat = Number(point.lat)
  // 名称里的逗号会破坏结构，替换掉
  const safeName = String(name || '')
    .replace(/,/g, ' ')
    .trim()
  return `${lng},${lat},${safeName}`
}

/**
 * 途经点按字段分组序列化。
 *
 * @param {Array<{name:string, lat:number, lng:number}>} waypoints
 * @returns {string} 形如 "lng1|lng2,lat1|lat2,name1|name2"
 */
function formatViaAddr(waypoints) {
  if (!Array.isArray(waypoints) || waypoints.length === 0) return ''

  // 名称里的 , 和 | 都会破坏分组结构，替换成空格
  const safe = (s) => String(s || '').replace(/[,|]/g, ' ').trim()

  const lngs = waypoints.map((w) => Number(w.lng))
  const lats = waypoints.map((w) => Number(w.lat))
  const names = waypoints.map((w) => safe(w.name))

  return [lngs.join('|'), lats.join('|'), names.join('|')].join(',')
}

/**
 * 构造高德导航分享链接。
 *
 * @param {{name:string, startPoint:object, endPoint:object, waypoints:Array}} route
 * @returns {string|null} 起终点缺失时返回 null
 */
function buildAmapUrl(route) {
  if (!route || !route.startPoint || !route.endPoint) return null

  const params = [
    `saddr=${encodeURIComponent(formatPoint(route.startPoint, route.startName || '起点'))}`,
    `daddr=${encodeURIComponent(formatPoint(route.endPoint, route.name || '终点'))}`,
    'src=app_share',
    'sort=dist'
  ]

  const viaaddr = formatViaAddr(route.waypoints)
  if (viaaddr) params.push(`viaaddr=${encodeURIComponent(viaaddr)}`)

  return `${BASE}&${params.join('&')}`
}

module.exports = { buildAmapUrl, formatViaAddr, formatPoint }
