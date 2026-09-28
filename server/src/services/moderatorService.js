const moderatorRepo = require('../repositories/moderatorRepo')
const routeRepo = require('../repositories/routeRepo')
const favoriteRepo = require('../repositories/favoriteRepo')
const { notFound, badRequest } = require('../errors')

/**
 * 版主。
 *
 * 权限的核心约束：**只能管自己的辖区**。每个方法都要传 region 进来，
 * 不能靠前端传的 id 就信任 —— 版主 A 不能审版主 B 城市的路线。
 */

/** 我的版主身份。不是版主时 regions 为空 */
async function getMyModeratorInfo(userId) {
  const rows = await moderatorRepo.listByUser(userId)
  return {
    isModerator: rows.length > 0,
    regions: rows.map((r) => ({ province: r.province, city: r.city })),
    permissions: rows.length ? rows[0].permissions : [],
    since: rows.length ? rows[0].createdAt : null
  }
}

/** 待审核的路线（只返回自己辖区的） */
async function listPendingRoutes(userId, limit) {
  const info = await getMyModeratorInfo(userId)
  if (!info.isModerator) throw badRequest('没有版主权限', 'NOT_MODERATOR')

  // 一个版主可能管多个城市，逐个查再合并
  const all = []
  for (const region of info.regions) {
    const list = await routeRepo.listPending({
      province: region.province,
      city: region.city,
      limit
    })
    all.push(...list)
  }

  // 按提交时间升序 —— 先来先审，避免老的积压
  all.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
  return all.slice(0, limit)
}

/**
 * 审核路线。
 *
 * 校验这条路线确实在版主辖区里 —— 否则版主可以构造请求审别人的。
 */
async function reviewRoute(userId, routeId, { status, reason }) {
  if (!['approved', 'rejected'].includes(status)) {
    throw badRequest('status 只能是 approved 或 rejected')
  }
  if (status === 'rejected' && !reason) {
    throw badRequest('驳回必须填写理由，否则作者不知道为什么被拒')
  }

  const route = await routeRepo.getById(routeId)
  if (!route) throw notFound(`路线 ${routeId} 不存在`)

  const info = await getMyModeratorInfo(userId)
  const inRegion = info.regions.some(
    (r) => r.province === route.province && r.city === route.city
  )
  if (!inRegion) {
    throw badRequest('只能审核自己辖区的路线', 'OUT_OF_REGION')
  }

  return routeRepo.updateReview(routeId, { status, reason, reviewedBy: userId })
}

/** 本区已上架的路线 */
async function listManagedRoutes(userId, limit = 50) {
  const info = await getMyModeratorInfo(userId)

  const all = []
  for (const region of info.regions) {
    const list = await routeRepo.list({
      province: region.province,
      city: region.city,
      reviewStatus: 'approved',
      limit
    })
    all.push(...list)
  }
  return all
}

/** 置顶 / 取消置顶 */
async function togglePin(userId, routeId, pinned) {
  const route = await routeRepo.getById(routeId)
  if (!route) throw notFound(`路线 ${routeId} 不存在`)

  const info = await getMyModeratorInfo(userId)
  const inRegion = info.regions.some(
    (r) => r.province === route.province && r.city === route.city
  )
  if (!inRegion) throw badRequest('只能管理自己辖区的路线', 'OUT_OF_REGION')

  return routeRepo.setPinned(routeId, pinned)
}

/**
 * 下架路线。
 *
 * 不是删除 —— 只是把审核状态改成 rejected，
 * 作者仍能在「我的路线」看到，数据不丢。
 */
async function takeDownRoute(userId, routeId, reason) {
  return reviewRoute(userId, routeId, {
    status: 'rejected',
    reason: reason || '版主下架'
  })
}

/** 版主工作台的统计数字 */
async function getModeratorStats(userId) {
  const info = await getMyModeratorInfo(userId)
  if (!info.isModerator) {
    return { isModerator: false, pending: 0, managed: 0 }
  }

  const pending = await listPendingRoutes(userId, 200)
  const managed = await listManagedRoutes(userId, 200)

  return {
    isModerator: true,
    pending: pending.length,
    managed: managed.length,
    regions: info.regions
  }
}

module.exports = {
  getMyModeratorInfo,
  listPendingRoutes,
  reviewRoute,
  listManagedRoutes,
  togglePin,
  takeDownRoute,
  getModeratorStats
}
