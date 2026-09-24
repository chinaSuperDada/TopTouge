/**
 * 后端地址。
 *
 * 与开发机的位置关系决定了用哪个地址，三种场景：
 *
 *   1. 开发者工具模拟器 —— 与后端同机，用 localhost
 *   2. 真机 + 同一局域网 —— 用电脑的局域网 IP（最快，毫秒级）
 *   3. 真机 + 不在同一网络 —— 走 WireGuard 隧道，用 10.8.0.2
 *
 * 注意隧道方式会很慢：手机若开了全局代理，访问 10.8.0.2 也要先绕到
 * 海外 VPS 再回来，单程 200ms+。同一个 WiFi 下优先用局域网 IP。
 *
 * 局域网 IP 会随网络环境变化（换 WiFi、重启路由器），用下面命令查：
 *   ifconfig | grep "inet " | grep -v 127.0.0.1
 * 如果换了地址，改 LAN_BASE_URL 即可。
 */

const LAN_BASE_URL = 'http://192.168.1.199:3000'
const TUNNEL_BASE_URL = 'http://10.8.0.2:3000'
const LOCALHOST = 'http://localhost:3000'

// 手动指定用哪个。设为 'lan' | 'tunnel' | 'auto'
// 'auto' 会按运行环境猜：模拟器走 localhost，真机走局域网
const MODE = 'auto'

function resolveBaseUrl() {
  if (MODE === 'lan') return LAN_BASE_URL
  if (MODE === 'tunnel') return TUNNEL_BASE_URL

  try {
    const { platform } = wx.getSystemInfoSync()
    if (platform === 'devtools') return LOCALHOST
  } catch (err) {
    // 取不到就按真机处理
  }
  return LAN_BASE_URL
}

App({
  globalData: {
    baseUrl: resolveBaseUrl(),

    /**
     * 本地开发用的用户标识。
     *
     * 线上不需要这个 —— 小程序通过 callContainer 调用云托管时，
     * 微信会自动注入 X-WX-OPENID 请求头，后端直接拿它当身份。
     * 本地跑的时候没有这个头，才用下面这个值兜底。
     *
     * 想测多用户场景（比如看别人的评论长什么样），改这个值即可。
     */
    userId: 'test-user-001'
  },

  onLaunch() {
    console.log('[TopTouge] baseUrl =', this.globalData.baseUrl)
  }
})
