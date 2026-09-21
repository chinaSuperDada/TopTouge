/**
 * 把路线分享到微信 —— 生成高德导航链接并复制到剪贴板。
 *
 * 为什么只有「复制链接」这一种方式，没有直接跳转：
 *
 *   直达高德 App 的官方接口只有 MapContext.openMapApp，但它的参数是
 *   { latitude, longitude, destination, preferApplication } —— **一个点**，
 *   没有途经点参数。少了途经点，高德会按自己的算法规划，走的不一定是
 *   用户标的这条跑山路线。
 *
 *   链接这条路能把起终点和全部途经点都带上。用户粘贴到聊天窗口发送，
 *   微信识别到 amap.com 链接会渲染成高德卡片，点击即唤起高德打开完整路线。
 *
 * 试过但不可行的方案，别再走一遍：
 *   - wx.navigateToMiniProgram 跳高德小程序
 *     → 高德没有独立的「地图」小程序（wxbc0cf9b963bd3550 是打车推广页）
 *   - MapContext.openMapApp
 *     → 只能传一个终点，无途经点参数
 *   - web-view 打开 amap.com
 *     → 微信不允许把高德域名配成业务域名，社区官方明确回复不支持
 */

const { buildAmapUrl } = require('./amapShare')

/**
 * 复制高德路线链接到剪贴板。
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

module.exports = { copyAmapShareLink }
