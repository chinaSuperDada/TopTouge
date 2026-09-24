/**
 * 后端请求的 Promise 封装。
 *
 * 两种走法，由 utils/env.js 决定：
 *   云托管 —— wx.cloud.callContainer，微信会注入 X-WX-OPENID
 *   本地   —— wx.request 直连开发机
 *
 * 对外只暴露 get / post，调用方不关心底下走哪条路。
 * 两种走法的成功/失败回调结构一致，所以错误处理是共用的。
 */

const app = getApp()
const env = require('./env')

function request(options) {
  const { url, method = 'GET', data, showError = true } = options

  return new Promise((resolve, reject) => {
    const handleSuccess = (res) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        resolve(res.data)
        return
      }
      const message =
        (res.data && res.data.error && res.data.error.message) || `请求失败 (${res.statusCode})`
      if (showError) wx.showToast({ title: message, icon: 'none', duration: 2500 })
      reject(new Error(message))
    }

    const handleFail = (err) => {
      const message = explainFailure(err, url)
      console.error('[request] 请求失败', url, err)
      if (showError) wx.showToast({ title: message, icon: 'none', duration: 3000 })
      reject(new Error(message))
    }

    if (env.useCloud()) {
      wx.cloud.callContainer({
        config: { env: env.CLOUD_ENV_ID },
        path: url,
        method,
        data,
        header: {
          'X-WX-SERVICE': env.CLOUD_SERVICE,
          'Content-Type': 'application/json'
        },
        success: handleSuccess,
        fail: handleFail
      })
      return
    }

    wx.request({
      url: `${app.globalData.baseUrl}${url}`,
      method,
      data,
      header: {
        'Content-Type': 'application/json',
        // 本地开发没有云托管注入，手动指定一个身份
        'x-user-id': app.globalData.userId
      },
      success: handleSuccess,
      fail: handleFail
    })
  })
}

/**
 * 把失败原因翻成人话。
 *
 * 光说「无法连接服务器」会把所有原因糊在一起，排查时完全没有方向。
 * 这里按错误码分开说，尤其是域名白名单 —— 真机预览最常见的就这个：
 * 「不校验合法域名」只对模拟器生效，真机强制校验，而 10.x/192.168.x
 * 这类私有 IP 无法备案、加不进白名单。
 */
function explainFailure(err, url) {
  const raw = (err && err.errMsg) || ''
  const inCloud = env.useCloud()

  if (raw.includes('url not in domain list')) {
    return '域名未加入白名单：真机预览不生效「不校验合法域名」，请改用「真机调试」，或扫码后点右上角 ··· 打开调试'
  }
  if (raw.includes('timeout')) {
    return inCloud ? '云端请求超时，请稍后重试' : `连接超时，请确认手机能访问 ${url}`
  }
  if (raw.includes('fail ssl') || raw.includes('certificate')) {
    return 'HTTPS 证书校验失败'
  }
  if (inCloud && raw.includes('cloud')) {
    return `云托管调用失败：${raw}。检查环境 ID 与服务名是否正确、服务是否在运行`
  }
  return `无法连接服务器（${raw || '未知错误'}）`
}

const get = (url, options = {}) => request({ url, method: 'GET', ...options })

const post = (url, data, options = {}) => request({ url, method: 'POST', data, ...options })

module.exports = { request, get, post }
