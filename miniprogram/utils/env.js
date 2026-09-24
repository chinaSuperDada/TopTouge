/**
 * 后端接入方式。
 *
 * 两种模式：
 *
 *   本地开发 —— 直连开发机上的 Node 服务（wx.request）。
 *              模拟器用 localhost，真机用局域网 IP。
 *              局域网 IP 会随网络变化，用 `ifconfig | grep "inet "` 查。
 *
 *   线上 —— 走微信云托管（wx.cloud.callContainer）。
 *          不需要域名、不需要备案、不需要 HTTPS 证书，
 *          而且微信会自动在请求头注入 X-WX-OPENID，后端直接拿到用户身份。
 */

const LOCALHOST = 'http://localhost:3000'
const LAN_BASE_URL = 'http://192.168.1.199:3000'

/**
 * 云托管环境 ID。
 *
 * 在微信公众平台 → 云托管 → 环境设置里能看到，形如 prod-xxxxxx。
 * 留空表示不用云托管，走本地直连。
 *
 * 部署到云托管后把这里填上，本地开发仍然可以留空。
 */
const CLOUD_ENV_ID = 'prod-d7gomqprncbcfb42b'

/** 云托管里的服务名，对应控制台创建服务时填的名字 */
const CLOUD_SERVICE = 'toptouge-server'

/** 是否走云托管 */
const useCloud = () => Boolean(CLOUD_ENV_ID)

/** 本地开发用哪个地址 */
function localBaseUrl() {
  try {
    const { platform } = wx.getSystemInfoSync()
    if (platform === 'devtools') return LOCALHOST
  } catch (err) {
    // 取不到就按真机处理
  }
  return LAN_BASE_URL
}

/**
 * 初始化云托管。
 *
 * 必须在任何 callContainer 之前调用，所以放在 App onLaunch 里。
 * 没配环境 ID 就跳过 —— 本地开发不需要云能力。
 */
function initCloud() {
  if (!useCloud()) return

  if (!wx.cloud) {
    console.error('[TopTouge] 当前基础库不支持云能力，请升级到 2.2.3 以上')
    return
  }

  wx.cloud.init({
    env: CLOUD_ENV_ID,
    // 不用 traceUser，我们不需要用户访问记录
    traceUser: false
  })
  console.log('[TopTouge] 云托管已初始化，环境:', CLOUD_ENV_ID)
}

module.exports = {
  CLOUD_ENV_ID,
  CLOUD_SERVICE,
  useCloud,
  localBaseUrl,
  initCloud
}
