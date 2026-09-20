const config = require('../config')

/**
 * 解析当前用户。阶段一没有登录系统，
 * 优先取请求头 x-user-id，缺省回落到配置里的固定测试用户。
 */
function userId(req, res, next) {
  const headerValue = req.get('x-user-id')
  req.userId = (headerValue && headerValue.trim()) || config.testUserId
  next()
}

module.exports = { userId }
