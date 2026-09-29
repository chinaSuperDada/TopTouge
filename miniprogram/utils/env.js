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
 * 留空表示强制走本地直连。
 */
const CLOUD_ENV_ID = 'prod-d7gomqprncbcfb42b'

/** 云托管里的服务名，对应控制台创建服务时填的名字 */
const CLOUD_SERVICE = 'toptouge-server'

/** 临时开关：置 true 可在开发者工具里也走云托管（排查线上问题时用） */
const FORCE_CLOUD = false

/**
 * 当前运行版本。
 *
 * develop —— 开发者工具 / 真机调试
 * trial   —— 体验版
 * release —— 正式版
 */
function envVersion() {
  try {
    return wx.getAccountInfoSync().miniProgram.envVersion || 'develop'
  } catch (err) {
    // 老基础库取不到，按开发版处理
    return 'develop'
  }
}

/**
 * 是否走云托管。
 *
 * 开发版走本地直连 —— 改完代码立刻生效，不用每次重新部署云托管；
 * 体验版和正式版走云托管 —— 手机上访问不到 localhost，也没有能备案的域名。
 *
 * 这个判断放在这里而不是写死，是因为「本地调试」和「部署体验版」
 * 两个场景要的东西完全相反，写死任何一个都会让另一个变难用。
 */
const useCloud = () => {
  if (!CLOUD_ENV_ID) return false
  if (FORCE_CLOUD) return true
  return envVersion() !== 'develop'
}

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
