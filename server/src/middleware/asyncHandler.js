/**
 * 把 async 路由处理函数包一层，让抛出的异常走到 errorHandler。
 *
 * 为什么需要：Express 4 只捕获同步抛出的错误。async 函数里 throw 会变成
 * 一个 rejected Promise，Express 不会管它，请求就一直挂着不返回，
 * 客户端只能等超时 —— 排查起来很费劲，因为服务端连日志都没有。
 *
 * 换成 async 数据源后所有 handler 都变成 async，所以必须包。
 * Express 5 内置了这个能力，升上去之后可以删掉。
 *
 * @param {Function} fn async (req, res, next) => {}
 * @returns {Function} Express 能用的处理函数
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

module.exports = { asyncHandler }
