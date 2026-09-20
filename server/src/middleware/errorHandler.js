const { AppError } = require('../errors')

/**
 * 统一错误响应：{ error: { code, message } }。
 * 小程序端 request.js 依赖这个固定结构来取提示文案。
 */
// eslint-disable-next-line no-unused-vars -- Express 靠四个参数识别错误中间件
function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({
      error: { code: err.code, message: err.message }
    })
  }

  // express.json() 解析失败时抛的是带 status 的 SyntaxError。
  // 这是客户端请求体的问题，不该算服务器故障，否则前端会拿到 500 而找不到原因。
  const status = err.status || err.statusCode
  if (Number.isInteger(status) && status >= 400 && status < 500) {
    return res.status(status).json({
      error: {
        code: err.type === 'entity.parse.failed' ? 'INVALID_JSON' : 'BAD_REQUEST',
        message: err.type === 'entity.parse.failed' ? '请求体不是合法的 JSON' : err.message
      }
    })
  }

  console.error('[未处理异常]', err)
  return res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: '服务器内部错误' }
  })
}

/**
 * 未匹配到任何路由时走这里。
 */
function notFoundHandler(req, res) {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `接口不存在: ${req.method} ${req.path}` }
  })
}

module.exports = { errorHandler, notFoundHandler }
