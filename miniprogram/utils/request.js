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
        // 模拟器里最常见的是后端没起，或没勾选「不校验合法域名」
        const message = '无法连接服务器，请确认后端已启动'
        console.error('[request] 请求失败', url, err)
        if (showError) wx.showToast({ title: message, icon: 'none', duration: 2500 })
        reject(new Error(message))
      }
    })
  })
}

const get = (url, options = {}) => request({ url, method: 'GET', ...options })

const post = (url, data, options = {}) => request({ url, method: 'POST', data, ...options })

module.exports = { request, get, post }
