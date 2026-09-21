/**
 * 导航到第三方地图。
 *
 * 用 wx.navigateToMiniProgram 跳到地图小程序，由它们再跳自家 App。
 * 这条路比「复制链接让用户自己粘贴」体验好得多。
 *
 * 两个平台的 appId 都已确认：
 *   腾讯地图 wx7643d5f831302ab0
 *   高德地图 wxbc0cf9b963bd3550
 *
 * 但 path 与参数格式都还需要真机验证 —— 小程序的内部页面路径
 * 不是公开文档，下面的写法是参照各家网页版分享链接推测的。
 * 跳一次看落在哪个页面，就知道对不对。
 * 注意：
 *   - wx.navigateToMiniProgram 从基础库 2.3.0 起必须在用户点击手势里调用，
 *     且会弹微信的确认框（「即将打开 XXX」），这是强制的绕不过去。
 *   - 2020-04-24 起跳转其他小程序不再需要声明 navigateToMiniProgramAppIdList。
 */

const { buildAmapUrl } = require('./amapShare')

const PLATFORMS = [
  {
    key: 'amap',
    label: '高德地图',
    appId: 'wxbc0cf9b963bd3550',
    envVersion: 'release',
    /**
     * 高德小程序的导航页路径。
     *
     * TODO 待真机验证：appId 已确认，但 path 和参数名是**推测**的 ——
     * 参照高德网页版分享链接的参数命名（from[lnglat] / to[lnglat]，
     * 见 https://www.amap.com/dir?from[lnglat]=..&to[lnglat]=..）写成。
     * 小程序内部页面不一定用这套参数，跳一次就知道对不对。
     */
    buildPath(route) {
      const { startPoint, endPoint } = route
      const parts = [
        `from[lnglat]=${startPoint.lng},${startPoint.lat}`,
        `to[lnglat]=${endPoint.lng},${endPoint.lat}`,
        'policy=1',
        'type=car'
      ]
      if (route.name) parts.push(`to[name]=${encodeURIComponent(route.name)}`)
      return `pages/route/route?${parts.join('&')}`
    }
  },
  {
    key: 'tencent',
    label: '腾讯地图',
    appId: 'wx7643d5f831302ab0',
    envVersion: 'release',
    /**
     * 腾讯地图小程序的路线页。
     * endLoc 接收 JSON 字符串，字段名是 endAddress / latitude / longitude。
     * 目前只见到传终点的用法，能否带途经点未确认。
     */
    buildPath(route) {
      const { startPoint, endPoint } = route
      const endLoc = JSON.stringify({
        endAddress: route.name || '终点',
        latitude: endPoint.lat,
        longitude: endPoint.lng
      })
      // 起点单独传，让腾讯知道从哪里出发
      const startLoc = JSON.stringify({
        latitude: startPoint.lat,
        longitude: startPoint.lng
      })
      return (
        'pages/multiScheme/multiScheme' +
        `?endLoc=${encodeURIComponent(endLoc)}` +
        `&startLoc=${encodeURIComponent(startLoc)}`
      )
    }
  }
]

/** 只返回 appId 已配置、可用的平台 */
function availablePlatforms() {
  return PLATFORMS.filter((p) => Boolean(p.appId))
}

/**
 * 复制高德分享链接到剪贴板。
 *
 * 为什么留着这条路：
 *   跳小程序（navigateWith）体验好，但高德小程序的 path 与参数格式是推测的，
 *   而且要真机才能验证。链接这条路格式是**实测确认**的，且能带多个途经点。
 *
 * 用法：把链接发到微信群，群友点击时微信会渲染成高德卡片，直接跳高德。
 *
 * @param {{name, startPoint, endPoint, waypoints}} route
 * @returns {Promise<void>}
 */
function copyAmapShareLink(route) {
  const url = buildAmapUrl(route)
  if (!url) return Promise.reject(new Error('路线缺少起终点，无法生成链接'))

  return new Promise((resolve, reject) => {
    wx.setClipboardData({
      data: url,
      success: () => resolve(),
      fail: (err) => reject(new Error((err && err.errMsg) || '复制失败'))
    })
  })
}

/**
 * 跳到指定平台的导航页。
 *
 * 必须在用户点击的回调里直接调用 —— API 会校验手势，异步之后再调会失败。
 *
 * @param {string} key 平台标识
 * @param {object} route 路线对象，需要 startPoint / endPoint / name
 * @returns {Promise<void>}
 */
function navigateWith(key, route) {
  const platform = PLATFORMS.find((p) => p.key === key)
  if (!platform) return Promise.reject(new Error(`未知的导航平台: ${key}`))
  if (!platform.appId) return Promise.reject(new Error(`${platform.label}暂未配置`))

  const path = platform.buildPath(route)

  return new Promise((resolve, reject) => {
    wx.navigateToMiniProgram({
      appId: platform.appId,
      path,
      envVersion: platform.envVersion,
      success: () => resolve(),
      fail: (err) => {
        const msg = (err && err.errMsg) || ''
        if (msg.includes('cancel')) {
          // 用户在确认框点了取消，不算错误
          resolve()
          return
        }
        reject(new Error(`${platform.label}打开失败：${msg}`))
      }
    })
  })
}

module.exports = { PLATFORMS, availablePlatforms, navigateWith, copyAmapShareLink }
