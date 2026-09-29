const userRepo = require('../repositories/userRepo')
const { badRequest } = require('../errors')

const MAX_NICK_LENGTH = 16
// 头像压到 132x132 后约 5KB，base64 约 7KB。
// 给 200KB 上限是防客户端没压缩就传 —— 一张原图能有几 MB
const MAX_AVATAR_BYTES = 200 * 1024

/**
 * 我的资料。
 *
 * 没填过时返回空昵称 + 空头像 —— 前端回落到「车友 3072」和色块头像。
 * 不要在这里编一个默认昵称落库，那样用户改了就分不清是默认值还是真填的。
 */
async function getProfile(userId) {
  const user = await userRepo.getById(userId)
  return user || { userId, nickName: '', avatar: '' }
}

/**
 * 更新资料。
 *
 * 两个字段都是可选的 —— 只传昵称就只改昵称，不传头像不动头像。
 */
async function updateProfile(userId, input) {
  const patch = {}

  if (input.nickName !== undefined) {
    const name = String(input.nickName).trim()
    if (!name) throw badRequest('昵称不能为空')
    if (name.length > MAX_NICK_LENGTH) {
      throw badRequest(`昵称不能超过 ${MAX_NICK_LENGTH} 个字`)
    }
    patch.nickName = name
  }

  if (input.avatar !== undefined) {
    const avatar = String(input.avatar)
    // 允许传空串表示「清除头像」
    if (avatar && !/^data:image\/(png|jpeg|jpg|webp);base64,/.test(avatar)) {
      throw badRequest('头像格式不对，应为 data:image/...;base64 开头')
    }
    if (avatar.length > MAX_AVATAR_BYTES) {
      throw badRequest('头像太大了，请压缩后再传')
    }
    patch.avatar = avatar
  }

  if (Object.keys(patch).length === 0) {
    throw badRequest('没有要更新的字段')
  }

  return userRepo.upsert(userId, patch)
}

/**
 * 给一批记录补上昵称头像。
 *
 * 评论、成绩榜、路线列表都要显示「谁发的」——
 * 这里统一处理，避免每个 service 各写一遍。
 *
 * @param {Array} records 带 userId 字段的记录
 * @returns {Promise<Array>} 每条记录多出 nickName / avatar
 */
async function attachUserInfo(records) {
  if (!Array.isArray(records) || records.length === 0) return records

  const users = await userRepo.listByIds(records.map((r) => r.userId))
  const byId = new Map(users.map((u) => [u.userId, u]))

  return records.map((r) => {
    const u = byId.get(r.userId)
    return {
      ...r,
      nickName: u ? u.nickName : '',
      avatar: u ? u.avatar : ''
    }
  })
}

module.exports = { getProfile, updateProfile, attachUserInfo, MAX_NICK_LENGTH }
