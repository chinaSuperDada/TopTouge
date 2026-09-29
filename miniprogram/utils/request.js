/**
 * 后端请求的 Promise 封装。
 *
 * 两种走法，由 utils/env.js 决定：
 *   云托管 —— wx.cloud.callContainer，微信会注入 X-WX-OPENID
 *   本地   —— wx.request 直连开发机
 *
 * 对外只暴露 get / post / put / del，调用方不关心底下走哪条路。
 *
 * ## 错误处理原则
 *
 * **技术细节永远不给用户看。** 用户看到「无法连接服务器（errMsg: xxx）」
 * 只会觉得产品不专业，而且他既看不懂也做不了什么。
 *
 *   用户看到的：一句人话（「网络开小差了」）
 *   管理员看到的：完整细节，通过 errorReporter 上报到后端存档
 *
 * 所以这里 reject 的错误对象，message 是**能直接展示的白话**，
 * 技术细节放在 err.detail 上，只用于上报。
 */

const app = getApp()
const env = require('./env')
const reporter = require('./errorReporter')

/** 网络不通时的文案。用户唯一能做的是重试 */
const NETWORK_MESSAGE = '网络开小差了，请稍后再试'
/** 服务端出错时的文案。用户做不了什么，别让他瞎试 */
const SERVER_MESSAGE = '服务暂时不可用，请稍后再试'

/** 单次请求超时（毫秒）。微信默认 60 秒太长，用户会以为卡死 */
const TIMEOUT_MS = 15000
/** 网络失败时的重试次数。移动网络抖动很常见，重试一次能救回大部分情况 */
const MAX_RETRIES = 2
/** 重试间隔基数，第 n 次重试等 BASE * n 毫秒（简单退避） */
const RETRY_BASE_MS = 600

/**
 * 判断是否值得重试。
 *
 * 只重试网络层失败 —— 服务端明确返回 4xx/5xx 说明请求本身有问题，
 * 重试也是一样的结果，还会让用户多等。
 */
function isRetryable(err) {
  const raw = (err && err.errMsg) || ''
  if (!raw) return false
  // 请求超时、连接失败、域名解析失败都属于可重试
  return (
    raw.includes('timeout') ||
    raw.includes('fail') ||
    raw.includes('ERR_')
  )
}

/**
 * 把对象拼成 query string。
 *
 * GET 请求的参数必须走 URL —— wx.request 会自动帮我们转，
 * 但 wx.cloud.callContainer 不会，它会把 data 当请求体。
 * 为了两种模式行为一致，这里统一自己拼。
 */
function buildUrl(url, method, data) {
  if (method !== 'GET' || !data) return url

  const parts = Object.keys(data)
    .filter((k) => data[k] !== undefined && data[k] !== null && data[k] !== '')
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(data[k])}`)

  if (parts.length === 0) return url
  return url + (url.includes('?') ? '&' : '?') + parts.join('&')
}

/**
 * 造一个「给人看」的错误对象。
 *
 * message 是展示用的白话，detail 是上报用的技术细节。
 * 调用方要提示用户时直接用 err.message 就行，不需要再做翻译。
 */
function makeError(displayMessage, { detail, code, url, method, statusCode, extra }) {
  const err = new Error(displayMessage)
  err.detail = detail || ''
  err.code = code || 'REQUEST_FAILED'
  err.url = url || ''
  err.method = method || ''
  err.statusCode = statusCode || null
  err.extra = extra || null
  return err
}

/**
 * 把失败原因转成技术细节（给管理员）。
 *
 * 这些内容**只进日志**，绝不展示 —— 用户看「域名未加入白名单」
 * 没有任何意义，那是开发者该解决的问题。
 */
function describeFailure(err) {
  const raw = (err && err.errMsg) || ''
  const inCloud = env.useCloud()

  if (raw.includes('url not in domain list')) {
    return `域名未加入白名单: ${raw}（真机强制校验，「不校验合法域名」只对模拟器生效）`
  }
  if (raw.includes('timeout')) {
    return inCloud ? `云端请求超时: ${raw}` : `连接超时: ${raw}`
  }
  if (raw.includes('fail ssl') || raw.includes('certificate')) {
    return `HTTPS 证书校验失败: ${raw}`
  }
  if (inCloud && raw.includes('cloud')) {
    return `云托管调用失败: ${raw}（检查环境 ID、服务名、服务是否在运行）`
  }
  return raw || '未知错误'
}

function request(options) {
  const { url: rawUrl, method = 'GET', data, showError = true, retries = MAX_RETRIES } = options

  // GET 的参数拼进 URL，body 置空
  const url = buildUrl(rawUrl, method, data)
  const body = method === 'GET' ? undefined : data

  return new Promise((resolve, reject) => {
    /**
     * 发一次请求。
     *
     * @param {number} attempt 剩余重试次数
     * @param {boolean} notify 失败时是否弹提示 —— 重试途中不弹，
     *                         否则用户会看到提示连闪两次
     */
    const send = (attempt, notify) => {
      const handleSuccess = (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data)
          return
        }

        // 服务端返回的业务错误。后端 error.message 是人话（如「路线名称不能为空」），
        // 可以直接展示 —— 但 5xx 是服务端崩了，后端给的信息通常没有意义，用兜底文案
        const serverMessage =
          (res.data && res.data.error && res.data.error.message) || ''
        const code = (res.data && res.data.error && res.data.error.code) || ''
        const display =
          res.statusCode >= 500 || !serverMessage ? SERVER_MESSAGE : serverMessage

        reporter.report({
          code: code || `HTTP_${res.statusCode}`,
          message: `请求 ${method} ${url} 返回 ${res.statusCode}`,
          detail: serverMessage,
          url,
          method,
          statusCode: res.statusCode
        })

        if (notify && showError) wx.showToast({ title: display, icon: 'none', duration: 2500 })
        reject(
          makeError(display, {
            detail: serverMessage,
            code,
            url,
            method,
            statusCode: res.statusCode
          })
        )
      }

      const handleFail = (err) => {
        // 网络抖动先重试 —— 移动网络下偶发失败很常见，
        // 直接抛给用户会显得产品很不稳定
        if (attempt > 0 && isRetryable(err)) {
          // 首次失败时给个静默提示，让用户知道还在努力，而不是卡住了
          if (notify && showError) {
            wx.showToast({ title: '网络较慢，正在重试…', icon: 'none', duration: 1500 })
          }
          setTimeout(() => send(attempt - 1, notify), RETRY_BASE_MS * (MAX_RETRIES - attempt + 1))
          return
        }

        reporter.report({
          code: 'REQUEST_FAILED',
          message: `请求 ${method} ${url} 失败（已重试 ${MAX_RETRIES - attempt} 次）`,
          detail: describeFailure(err),
          url,
          method
        })

        if (notify && showError) {
          wx.showToast({ title: NETWORK_MESSAGE, icon: 'none', duration: 3000 })
        }
        reject(
          makeError(NETWORK_MESSAGE, {
            detail: describeFailure(err),
            code: 'REQUEST_FAILED',
            url,
            method
          })
        )
      }

      if (env.useCloud()) {
        wx.cloud.callContainer({
          config: { env: env.CLOUD_ENV_ID },
          path: url,
          method,
          data: body,
          header: {
            'X-WX-SERVICE': env.CLOUD_SERVICE,
            'Content-Type': 'application/json'
          },
          // 云托管默认超时太长，卡住时用户会以为死机
          timeout: TIMEOUT_MS,
          success: handleSuccess,
          fail: handleFail
        })

        // 云端模式没有可直接使用的绝对地址，攒下的错误只能借这条已经建立的
        // 通道补报（见 errorReporter.flushWith）。只在最外层触发一次，
        // 重试时不必重复
        if (attempt === retries) {
          reporter.flushWith((items) =>
            request({ url: '/api/client-errors', method: 'POST', data: items, showError: false, retries: 0 })
          )
        }
        return
      }

      wx.request({
        url: `${app.globalData.baseUrl}${url}`,
        method,
        data: body,
        timeout: TIMEOUT_MS,
        header: {
          'Content-Type': 'application/json',
          // 本地开发没有云托管注入，手动指定一个身份
          'x-user-id': app.globalData.userId
        },
        success: handleSuccess,
        fail: handleFail
      })
    }

    send(retries, true)
  })
}

const get = (url, options = {}) => request({ url, method: 'GET', ...options })

const post = (url, data, options = {}) => request({ url, method: 'POST', data, ...options })

const put = (url, data, options = {}) => request({ url, method: 'PUT', data, ...options })

const del = (url, options = {}) => request({ url, method: 'DELETE', ...options })

module.exports = { request, get, post, put, del }
