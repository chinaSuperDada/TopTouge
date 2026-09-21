/**
 * 后端地址。
 *
 * 模拟器和真机需要的地址不同：
 *   - 模拟器：跑在电脑上，与后端同机，用 localhost
 *   - 真机：需要通过 WireGuard 隧道访问电脑，用隧道内地址 10.8.0.2
 *     （手机需连上同一个 WireGuard 网络，本机隧道地址是 10.8.0.2）
 *
 * 备选：如果手机没连隧道，且与电脑同一 WiFi，可改用电脑的局域网 IP
 * （当前是 192.168.1.199，换网络后可能变，用 ifconfig 查）。
 * 局域网访问需要 macOS 防火墙放行 node。
 */

function resolveBaseUrl() {
  try {
    // 开发者工具里 platform 是 'devtools'，真机是 'ios' / 'android'
    const { platform } = wx.getSystemInfoSync()
    if (platform === 'devtools') return 'http://localhost:3000'
  } catch (err) {
    // 取不到就按真机处理
  }
  return 'http://10.8.0.2:3000'
}

App({
  globalData: {
    baseUrl: resolveBaseUrl(),

    // 阶段一不做登录系统，固定测试用户
    userId: 'test-user-001'
  },

  onLaunch() {
    console.log('[TopTouge] 运行环境 baseUrl =', this.globalData.baseUrl)
  }
})
