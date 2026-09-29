const moderatorRepo = require('../repositories/moderatorRepo')
const applicationRepo = require('../repositories/moderatorApplicationRepo')
const routeRepo = require('../repositories/routeRepo')
const runRepo = require('../repositories/runRepo')
const favoriteRepo = require('../repositories/favoriteRepo')
const config = require('../config')
const { notFound, badRequest } = require('../errors')

/**
 * 版主。
 *
 * 权限的核心约束：**只能管自己的辖区**。每个方法都要传 region 进来，
 * 不能靠前端传的 id 就信任 —— 版主 A 不能审版主 B 城市的路线。
 *
 * 平台管理员比版主高一层：不受辖区限制，负责审批版主申请，
 * 以及审核「本地还没有版主」的区域的公开路线。
 */

/** 是不是平台管理员 */
function isAdmin(userId) {
  return config.adminUserIds.includes(userId)
}

/**
 * 申请版主的门槛。
 *
 * 定这两个数是想确保申请人真的用过这个产品，而不是来占坑的。
 */
const APPLY_MIN_ROUTES = 1
const APPLY_MIN_RUNS = 1

/** 我的版主身份。不是版主时 regions 为空 */
async function getMyModeratorInfo(userId) {
  const rows = await moderatorRepo.listByUser(userId)
  return {
    isModerator: rows.length > 0,
    isAdmin: isAdmin(userId),
    regions: rows.map((r) => ({ province: r.province, city: r.city })),
    permissions: rows.length ? rows[0].permissions : [],
    since: rows.length ? rows[0].createdAt : null
  }
}

/**
 * 待审核的路线。
 *
 * 版主只看自己辖区的；**平台管理员看全部** —— 包括那些还没有版主的区域，
 * 否则那些地方的路线传上来就永远没人审。
 */
async function listPendingRoutes(userId, limit) {
  const admin = isAdmin(userId)
  const info = await getMyModeratorInfo(userId)

  if (!admin && !info.isModerator) {
    throw badRequest('没有版主权限', 'NOT_MODERATOR')
  }

  // 管理员：不按区域过滤，一次拿全
  if (admin) {
    return routeRepo.listPending({ limit })
  }

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

/**
 * 版主删除本区路线。
 * 走和审核一样的辖区校验 —— 不能删别人城市的。
 */
async function deleteRoute(userId, routeId) {
  const route = await routeRepo.getById(routeId)
  if (!route) throw notFound(`路线 ${routeId} 不存在`)

  const info = await getMyModeratorInfo(userId)
  const inRegion = info.regions.some(
    (r) => r.province === route.province && r.city === route.city
  )
  if (!inRegion) throw badRequest('只能删除自己辖区的路线', 'OUT_OF_REGION')

  await routeRepo.softDelete(routeId)
  return { id: routeId, deleted: true }
}

/**
 * 申请版主的资格检查。
 *
 * 两个条件：贡献过路线 + 跑过山。返回进度而不是布尔值 ——
 * 前端要据此告诉用户「还差什么」，光说「不符合条件」没有指导意义。
 */
async function checkApplyEligibility(userId) {
  const [routeCount, runCount] = await Promise.all([
    routeRepo.countByUploadedBy(userId),
    runRepo.countByUser(userId)
  ])

  return {
    routeCount,
    runCount,
    minRoutes: APPLY_MIN_ROUTES,
    minRuns: APPLY_MIN_RUNS,
    eligible: routeCount >= APPLY_MIN_ROUTES && runCount >= APPLY_MIN_RUNS
  }
}

/**
 * 提交版主申请。
 *
 * 提交时把条件快照进申请表 —— 之后用户删了路线，已提交的申请
 * 依据不变。否则管理员审批时看到的数字会在脚下变。
 */
async function applyForModerator(userId, { province, city, reason }) {
  if (!province || !city) {
    throw badRequest('请选择要负责的区域', 'REGION_REQUIRED')
  }

  const existing = await applicationRepo.findPendingByUser(userId)
  if (existing) {
    throw badRequest('你已经有一份待审的申请了', 'APPLICATION_PENDING')
  }

  const eligibility = await checkApplyEligibility(userId)
  if (!eligibility.eligible) {
    throw badRequest('还不满足申请条件', 'NOT_ELIGIBLE')
  }

  const info = await getMyModeratorInfo(userId)
  if (info.regions.some((r) => r.province === province && r.city === city)) {
    throw badRequest('你已经是该区域的版主了', 'ALREADY_MODERATOR')
  }

  return applicationRepo.create({
    userId,
    province,
    city,
    reason,
    routeCount: eligibility.routeCount,
    runCount: eligibility.runCount,
    createdAt: new Date().toISOString()
  })
}

/** 我的申请记录 */
async function listMyApplications(userId) {
  return applicationRepo.listByUser(userId)
}

/** 待审的版主申请（仅平台管理员） */
async function listApplications(userId, limit) {
  if (!isAdmin(userId)) throw badRequest('需要平台管理员权限', 'NOT_ADMIN')
  return applicationRepo.listPending(limit)
}

/**
 * 审批版主申请（仅平台管理员）。
 *
 * 通过时**直接授予版主身份** —— 让管理员再点一次「授予」是多余的一步，
 * 审批通过的含义本来就是要给他权限。
 */
async function reviewApplication(userId, applicationId, { status, reason }) {
  if (!isAdmin(userId)) throw badRequest('需要平台管理员权限', 'NOT_ADMIN')
  if (!['approved', 'rejected'].includes(status)) {
    throw badRequest('status 只能是 approved 或 rejected')
  }

  const app = await applicationRepo.getById(applicationId)
  if (!app) throw notFound(`申请 ${applicationId} 不存在`)
  if (app.status !== 'pending') {
    throw badRequest('这份申请已经处理过了', 'ALREADY_REVIEWED')
  }

  const updated = await applicationRepo.updateStatus(applicationId, {
    status,
    reason,
    reviewedBy: userId
  })

  if (status === 'approved') {
    await moderatorRepo.create({
      userId: app.userId,
      province: app.province,
      city: app.city
    })
  }

  return updated
}

module.exports = {
  getMyModeratorInfo,
  isAdmin,
  checkApplyEligibility,
  applyForModerator,
  listMyApplications,
  listApplications,
  reviewApplication,
  deleteRoute,
  listPendingRoutes,
  reviewRoute,
  listManagedRoutes,
  togglePin,
  takeDownRoute,
  getModeratorStats,
  APPLY_MIN_ROUTES,
  APPLY_MIN_RUNS
}
