/**
 * 用户显示名。
 *
 * 后端返回的 userId 有两种形态：
 *   wx_o1B2c3...    微信 openid，前缀 wx_
 *   test-user-001   本地开发时的固定测试用户
 *
 * openid 是内部标识，既不好看也不该直接暴露给用户，所以要转成展示名。
 *
 * 现在还没有用户昵称体系（没做授权拿头像昵称），所以先由 openid
 * 派生一个稳定的短标识 —— 同一个人每次显示一致，看起来像随机用户名。
 * 将来接上昵称后，这里换成读昵称即可，调用方不用改。
 */

/** 从字符串算一个稳定的正整数散列 */
function hash(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

/**
 * @param {string} userId 后端返回的用户标识
 * @returns {string} 用于界面展示的名字
 */
function displayName(userId) {
  if (!userId) return '匿名车友'

  const id = String(userId)

  // 本地开发的固定用户，显示得直白一点方便调试
  if (id.startsWith('test-user')) return '测试用户'

  // 官方 mock 数据
  if (id === 'system') return '官方路线'

  // 微信 openid -> 稳定的短标识
  if (id.startsWith('wx_')) {
    const n = hash(id) % 9000 + 1000
    return `车友 ${n}`
  }

  return id
}

module.exports = { displayName, hash }
