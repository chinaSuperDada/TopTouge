/**
 * 导航到第三方地图 App。
 *
 * 用 MapContext.openMapApp 直接唤醒手机上的地图 App —— 这是微信官方提供的
 * 能力，比「跳小程序再让小程序跳 App」少一层，也不会像 navigateToMiniProgram
 * 那样先弹一次确认框。
 *
 * 参数（来自官方文档）：
 *   latitude / longitude  目的地坐标，必须是 Number（传字符串拉不起来）
 *   destination           目的地名称，**必填**，为空的会显示不出名字
 *   preferApplication     推荐用哪个 App：'amap' 高德 | 'tencent' 腾讯
 *
 * 两个坑：
 *   1. **只在真机可用**，开发者工具会报「暂时不支持此 API 调试」。
 *      所以这一项没法自动化验证，只能真机手测。
 *   2. 承载它的 <map> 组件必须真实渲染，不能用 wx:if / hidden 藏起来，
 *      否则 createMapContext 取不到上下文。本项目的地图是常驻的，没问题。
 *
 * 坐标系：openMapApp 要 GCJ-02，本项目全程 GCJ-02，不需要转换。
 *
 * 另外保留「复制高德链接」这条路，因为它能做到 openMapApp 做不到的事：
 * 带上多个途经点。openMapApp 只能传一个目的地。
 */

const { buildAmapUrl } = require('./amapShare')

/** preferApplication 的合法值 */
const APPS = [
  { key: 'amap', label: '高德地图' },
  { key: 'tencent', label: '腾讯地图' }
]

/** 承载地图的组件 id，openMapApp 要从它取上下文 */
const MAP_ID = 'routeMap'

/**
 * 唤醒地图 App 导航到某条路线的终点。
 *
 * 注意这里只传**终点**：openMapApp 的参数里没有途经点，
 * 带途经点要用 copyAmapShareLink。
 *
 * @param {string} key 'amap' | 'tencent'
 * @param {{name:string, endPoint:{lat:number, lng:number}}} route
 * @returns {Promise<void>}
 */
function openInMapApp(key, route) {
  const app = APPS.find((a) => a.key === key)
  if (!app) return Promise.reject(new Error(`未知的地图应用: ${key}`))
  if (!route || !route.endPoint) return Promise.reject(new Error('路线缺少终点，无法导航'))

  return new Promise((resolve, reject) => {
    let ctx
    try {
      ctx = wx.createMapContext(MAP_ID)
    } catch (err) {
      reject(new Error('地图未就绪，无法唤起导航'))
      return
    }

    if (typeof ctx.openMapApp !== 'function') {
      // 基础库低于 2.14.0
      reject(new Error('当前微信版本过低，不支持唤起地图 App'))
      return
    }

    ctx.openMapApp({
      latitude: Number(route.endPoint.lat),
      longitude: Number(route.endPoint.lng),
      destination: route.name || '终点',
      preferApplication: app.key,
      success: () => resolve(),
      fail: (err) => {
        const msg = (err && err.errMsg) || ''
        if (msg.includes('cancel')) {
          // 用户在系统弹的选择框里取消了，不算失败
          resolve()
          return
        }
        reject(new Error(`${app.label}打开失败：${msg}`))
      }
    })
  })
}

/**
 * 复制高德分享链接。
 *
 * 为什么留着：openMapApp 只能传一个终点，带不了途经点。
 * 这条路生成的链接能让高德按完整路线（含多个途经点）导航。
 *
 * 用法：粘到微信里发送，对方点击时微信渲染成高德卡片，直接唤起高德。
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

module.exports = { APPS, MAP_ID, openInMapApp, copyAmapShareLink }
