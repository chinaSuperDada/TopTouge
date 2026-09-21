/**
 * wx.request 的 Promise 封装。
 *
 * 统一处理三件事：拼 baseUrl、带 x-user-id 头、从 { error: { code, message } }
 * 里取出可读的错误信息。调用方只需要 try/catch。
 */

const app = getApp()

function request(options) {
  const { url, method = 'GET', data, showError = true } = options

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${app.globalData.baseUrl}${url}`,
      method,
      data,
      header: {
        'Content-Type': 'application/json',
        'x-user-id': app.globalData.userId
      },
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data)
          return
        }

        const message = (res.data && res.data.error && res.data.error.message) || `请求失败 (${res.statusCode})`
        if (showError) wx.showToast({ title: message, icon: 'none', duration: 2500 })
        reject(new Error(message))
      },
      fail(err) {
        const message = explainFailure(err, url)
        console.error('[request] 请求失败', url, err)
        if (showError) wx.showToast({ title: message, icon: 'none', duration: 3000 })
        reject(new Error(message))
      }
    })
  })
}

/**
 * 把 wx.request 的失败原因翻成人话。
 *
 * 光说「无法连接服务器」会把所有原因糊在一起，排查时完全没有方向。
 * 这里按错误码分开说，尤其是域名白名单 —— 真机预览最常见的就这个：
 * 「不校验合法域名」只对模拟器生效，真机强制校验，而 10.x/192.168.x
 * 这类私有 IP 无法备案、加不进白名单。
 */
function explainFailure(err, url) {
  const raw = (err && err.errMsg) || ''

  if (raw.includes('url not in domain list')) {
    return '域名未加入白名单：真机预览不生效「不校验合法域名」，请改用「真机调试」，或扫码后点右上角 ··· 打开调试'
  }
  if (raw.includes('timeout')) {
    return `连接超时，请确认手机能访问 ${url}`
  }
  if (raw.includes('fail ssl') || raw.includes('certificate')) {
    return 'HTTPS 证书校验失败'
  }
  return `无法连接服务器（${raw || '未知错误'}）`
}

const get = (url, options = {}) => request({ url, method: 'GET', ...options })

const post = (url, data, options = {}) => request({ url, method: 'POST', data, ...options })

module.exports = { request, get, post }
