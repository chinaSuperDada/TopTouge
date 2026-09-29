/**
 * 错误上报。
 *
 * ## 为什么要有这个
 *
 * 用户不该看到技术错误。页面上蹦出「无法连接服务器（errMsg: request:fail）」
 * 只会让人觉得产品不专业 —— 而且用户既看不懂，也做不了什么。
 *
 * 所以分开处理：
 *   - 给用户看：一句人话（「网络开小差了」）
 *   - 给管理员看：完整细节（URL、错误码、errMsg、页面、机型、版本），
 *     通过这个模块上报到后端存档
 *
 * ## 用法
 *
 *   const reporter = require('./errorReporter')
 *
 *   reporter.report({
 *     code: 'REQUEST_FAILED',
 *     message: '请求 /api/routes 失败',
 *     detail: err.errMsg,
 *     url, method, statusCode
 *   })
 *
 * 上报本身**绝不会抛错**，也不会阻塞调用方 —— 它是旁路。
 * 上报失败就待在本地队列里，下次再试。
 */

const MAX_QUEUE = 20
const STORAGE_KEY = 'toptouge_error_queue'

/** 攒着还没发出去的错误。断网时靠它兜底 */
let queue = []

/** 环境信息只取一次 —— 它不会变，每次上报都取太浪费 */
let cachedEnv = null

function getEnv() {
  if (cachedEnv) return cachedEnv

  const env = { envVersion: '', platform: '', brand: '', model: '', system: '', sdkVersion: '' }

  try {
    const info = wx.getAccountInfoSync()
    env.envVersion = (info && info.miniProgram && info.miniProgram.envVersion) || ''
  } catch (err) {
    // 老基础库没有这个接口，留空即可
  }

  try {
    const sys = wx.getSystemInfoSync()
    env.platform = sys.platform || ''
    env.brand = sys.brand || ''
    env.model = sys.model || ''
    env.system = sys.system || ''
    env.sdkVersion = sys.SDKVersion || ''
  } catch (err) {
    // 同上
  }

  cachedEnv = env
  return env
}

/** 当前页面路径，用于定位是哪个页面出的错 */
function currentPage() {
  try {
    const pages = getCurrentPages()
    if (!pages.length) return ''
    const page = pages[pages.length - 1]
    return page.route || ''
  } catch (err) {
    return ''
  }
}

/** 从本地存储恢复上次没发出去的队列 */
function loadQueue() {
  try {
    const saved = wx.getStorageSync(STORAGE_KEY)
    if (Array.isArray(saved)) queue = saved.slice(-MAX_QUEUE)
  } catch (err) {
    queue = []
  }
}

function saveQueue() {
  try {
    wx.setStorageSync(STORAGE_KEY, queue.slice(-MAX_QUEUE))
  } catch (err) {
    // 存储写不进去就算了，不能因为日志把主流程拖垮
  }
}

/**
 * 上报一条错误。
 *
 * @param {{code?, message, detail?, url?, method?, statusCode?, extra?}} input
 */
function report(input) {
  if (!input || !input.message) return

  const env = getEnv()

  queue.push({
    code: input.code || 'UNKNOWN',
    message: String(input.message).slice(0, 500),
    detail: input.detail ? String(input.detail).slice(0, 2000) : '',
    page: input.page || currentPage(),
    method: input.method || '',
    url: input.url || '',
    statusCode: input.statusCode || null,
    extra: input.extra || null,
    ...env,
    at: new Date().toISOString()
  })

  if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE)
  saveQueue()

  // 同时打一份到控制台 —— 开发者工具里调试时不用去翻服务端日志
  console.error('[error]', input.code, input.message, input.detail || '')

  flush()
}

/**
 * 把队列里的错误发给后端。
 *
 * 用原生 wx.request 而不是我们的 request 封装 —— 后者失败时会 toast，
 * 而上报失败不该打扰用户。这里要一条完全静默的通道。
 */
function flush() {
  if (queue.length === 0) return

  const env = require('./env')
  const app = getApp()
  // 本地模式下后端地址就是 baseUrl；云端模式没有可用的绝对地址，
  // 这种情况下不主动 flush，等下次有请求时由调用方带上（见 sendNow）
  if (env.useCloud()) return

  const base = (app && app.globalData && app.globalData.baseUrl) || ''
  if (!base) return

  const batch = queue.slice()
  const url = `${base}/api/client-errors`

  wx.request({
    url,
    method: 'POST',
    header: {
      'Content-Type': 'application/json',
      // 出错时 identity 可能还没建立，带上本地这份做兜底
      'x-user-id': (app && app.globalData && app.globalData.userId) || ''
    },
    data: batch,
    success: () => {
      // 发出去了才从队列里移除 —— 移除的是这一批，期间新加的保留
      queue = queue.filter((item) => !batch.includes(item))
      saveQueue()
    },
    fail: () => {
      // 静默失败，留在队列里下次再试
    }
  })
}

/**
 * 用已有的请求通道上报（云端模式走这条）。
 *
 * 云托管下没有可直接用的绝对地址，只能通过 request 封装发 ——
 * 所以由 request.js 在失败时顺带把攒的错误捎上，避免循环依赖。
 *
 * @param {Function} poster 形如 (items) => Promise 的发送函数
 */
function flushWith(poster) {
  if (queue.length === 0) return Promise.resolve()

  const batch = queue.slice()
  return poster(batch)
    .then(() => {
      queue = queue.filter((item) => !batch.includes(item))
      saveQueue()
    })
    .catch(() => {
      // 静默
    })
}

module.exports = {
  report,
  flush,
  flushWith,
  loadQueue,
  /** 仅测试/调试用 */
  _queue: () => queue.slice(),
  _clear: () => {
    queue = []
    saveQueue()
  }
}
