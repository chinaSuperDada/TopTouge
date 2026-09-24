const config = require('../config')

/**
 * 解析当前用户身份。
 *
 * 三种来源，按优先级：
 *
 *   1. x-wx-openid —— 微信云托管自动注入的真实用户身份。
 *      小程序通过 callContainer 调用时，微信会把用户信息塞进请求头，
 *      不需要 wx.login、不需要 code2Session、更不需要 AppSecret。
 *      官方说法是比传统流程少 200-500ms 延迟。
 *
 *   2. x-user-id —— 本地开发用。云托管才注入 openid，本地跑的时候
 *      请求头里没有，就靠这个手动指定一个用户来测多用户场景。
 *
 *   3. 固定测试用户 —— 兜底，保证任何情况下都有个身份，不会 500。
 *
 * 安全说明：x-wx-openid 由微信网关注入，容器内的应用代码无法伪造，
 * 所以线上可信。x-user-id 是明文请求头，谁都能改 —— 但它只在
 * 本地开发时生效（线上请求会带上 x-wx-openid，优先级更高），
 * 且这是开发期的便利，不是安全边界。
 */

/** 微信云托管注入的用户身份请求头 */
const WX_OPENID_HEADER = 'x-wx-openid'

function userId(req, res, next) {
  const openid = req.get(WX_OPENID_HEADER)
  if (openid && openid.trim()) {
    req.userId = `wx_${openid.trim()}`
    req.userSource = 'wechat'
    next()
    return
  }

  const manual = req.get('x-user-id')
  if (manual && manual.trim()) {
    req.userId = manual.trim()
    req.userSource = 'manual'
    next()
    return
  }

  req.userId = config.testUserId
  req.userSource = 'fallback'
  next()
}

module.exports = { userId, WX_OPENID_HEADER }
