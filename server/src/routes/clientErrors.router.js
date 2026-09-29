const express = require('express')
const { asyncHandler } = require('../middleware/asyncHandler')
const { insertClientError } = require('../repositories/clientErrorRepo')

const router = express.Router()

/** 单条日志的长度上限，防止客户端塞超长字符串把库撑爆 */
const MAX_FIELD_LEN = 2000
/** 一次请求最多接受多少条（客户端断网重连后可能攒了一批） */
const MAX_BATCH = 20

function clip(v, max = MAX_FIELD_LEN) {
  if (v === null || v === undefined) return ''
  const s = typeof v === 'string' ? v : String(v)
  return s.length > max ? s.slice(0, max) + '…[截断]' : s
}

/**
 * 规范化客户端上报的错误。
 *
 * 全字段都做长度截断 —— 这些数据直接落库，不能让客户端决定写多大。
 */
function normalize(item) {
  if (!item || typeof item !== 'object') return null

  const message = clip(item.message, 500)
  if (!message) return null

  return {
    // 错误码：客户端自定义的短标识，如 REQUEST_FAILED / UPLOAD_FAILED
    code: clip(item.code, 64),
    message,
    // 技术细节：errMsg、堆栈。这部分**只给管理员看**，不给用户看
    detail: clip(item.detail, MAX_FIELD_LEN),
    // 出错时用户在哪
    page: clip(item.page, 128),
    method: clip(item.method, 8),
    url: clip(item.url, 512),
    statusCode: Number.isInteger(item.statusCode) ? item.statusCode : null,
    // 环境信息，排查时要靠它区分是哪个版本、什么设备
    envVersion: clip(item.envVersion, 16),
    platform: clip(item.platform, 32),
    brand: clip(item.brand, 64),
    model: clip(item.model, 64),
    system: clip(item.system, 64),
    sdkVersion: clip(item.sdkVersion, 32),
    extra: clip(
      item.extra ? JSON.stringify(item.extra) : '',
      MAX_FIELD_LEN
    )
  }
}

/**
 * POST /api/client-errors — 上报客户端错误
 *
 * 前端不把技术错误抛给用户，而是报到这里，由管理员查。
 * 支持单条对象或数组 —— 客户端断网时可以先攒起来，恢复后批量补报。
 *
 * 这个接口**永远返回 200**：上报失败不该再触发一次上报，形成循环。
 * 真的写不进去，服务端日志里有。
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = req.body
    const raw = Array.isArray(body) ? body.slice(0, MAX_BATCH) : [body]

    const items = raw.map(normalize).filter(Boolean)

    if (items.length > 0) {
      // 写入失败不影响响应 —— 上报是旁路，不能拖累主流程
      await insertClientError(items, req.userId).catch((err) => {
        console.error('[client-errors] 写入失败:', err.message)
      })
    }

    res.json({ received: items.length })
  })
)

module.exports = router
