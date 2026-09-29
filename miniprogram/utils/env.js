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

/**
 * 真机调试用的开发机地址。
 *
 * ⚠️ **这个 IP 会变**。换 WiFi、路由器重新分配、重启电脑都会导致它变，
 * 变了之后真机就连不上，表现是「网络开小差了」。
 *
 * 改了别处代码时如果真机突然连不上，先来这里核对：
 *   ifconfig | grep "inet " | grep -v 127.0.0.1
 *
 * 只影响「开发版 + 真机调试」。体验版和正式版走云托管，与这里无关。
 */
const LAN_BASE_URL = 'http://192.168.1.200:3000'

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
 * 临时开关：置 true 可强制走局域网。
 *
 * 真机调试默认不走局域网（见 useCloud 的说明）。如果确实需要真机连本地
 * ——比如云托管还没部署、或者要改代码立刻在手机上看到效果——
 * 把这里置 true，并确认 LAN_BASE_URL 与 `ifconfig` 里的地址一致。
 */
const FORCE_LOCAL = false

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

/** 是不是在开发者工具里跑。取不到系统信息时按真机处理（更保守） */
function isDevtools() {
  try {
    return wx.getSystemInfoSync().platform === 'devtools'
  } catch (err) {
    return false
  }
}

/**
 * 是否走云托管。
 *
 *   开发者工具 → 本地直连（改代码立刻生效，不用每次重新部署云托管）
 *   真机 / 体验版 / 正式版 → 云托管
 *
 * **为什么真机不走局域网**：局域网要求手机和电脑同一个 WiFi、路由器没开
 * AP 隔离、防火墙放行、IP 没变 —— 四条同时成立才行，任何一条不满足
 * 就是「网络开小差了」，而且从错误信息看不出是哪条。
 * 云托管没这些前提，还能在服务端看到日志。
 *
 * 真机想连本地时把 FORCE_LOCAL 置 true。
 */
const useCloud = () => {
  if (!CLOUD_ENV_ID) return false
  if (FORCE_CLOUD) return true
  if (FORCE_LOCAL) return false

  // 真机调试也是 develop，所以要额外判断是不是在开发者工具里
  return envVersion() !== 'develop' || !isDevtools()
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
