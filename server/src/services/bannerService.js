const bannerRepo = require('../repositories/bannerRepo')
const routeRepo = require('../repositories/routeRepo')

/**
 * 活动位。
 *
 * 两种来源的组装方式不同：
 *   人工活动（platform / moderator）—— 从库里查，运营配置的
 *   算法位（algorithm）—— **查询时动态算**，不落库
 *
 * 为什么算法位不落库：它的内容每天在变（本周最热下周就不同）。
 * 落库就要写定时任务重算，还会攒下一堆过期垃圾。查询时算一次更简单。
 */

const MIN_BANNERS = 4
const MAX_BANNERS = 10

/**
 * 首页活动位。
 *
 * 先取人工活动，不够 4 个就用算法位补足 —— 保证首页不会空着。
 */
async function listBanners({ province, city } = {}) {
  const manual = await bannerRepo.listActive({ province, city, limit: MAX_BANNERS })

  const result = manual.map((b) => ({
    id: `m${b.id}`,
    source: b.source,
    title: b.title,
    subtitle: b.subtitle,
    tag: b.tag,
    image: b.image,
    color: b.color,
    link: b.link
  }))

  // 人工活动够了就不补算法位，避免首页被塞满
  if (result.length >= MIN_BANNERS) return result.slice(0, MAX_BANNERS)

  const algorithmic = await buildAlgorithmicBanners({ province, city })
  return result.concat(algorithmic).slice(0, MAX_BANNERS)
}

/**
 * 算法位。
 *
 * 现在做三个：本周最热、新收录、高难度挑战。
 * 以后要加新维度（离我最近、最多人跑过…）在这里加一条即可。
 */
async function buildAlgorithmicBanners({ province, city }) {
  const banners = []

  const filters = {
    province: province || 'all',
    city: city || 'all',
    limit: 1
  }

  // ① 本周最热 —— 热度最高的一条
  const hottest = await routeRepo.list({ ...filters, sort: 'hot' })
  if (hottest.length) {
    banners.push({
      id: 'a-hot',
      source: 'algorithm',
      title: hottest[0].name,
      subtitle: `热度 ${hottest[0].heat || 0}`,
      tag: '本周最热',
      image: '',
      color: '#d97706',
      link: `/pages/route-detail/route-detail?id=${hottest[0].id}`
    })
  }

  // ② 新收录 —— 最新的一条
  const newest = await routeRepo.list({ ...filters, sort: 'newest' })
  if (newest.length) {
    banners.push({
      id: 'a-new',
      source: 'algorithm',
      title: newest[0].name,
      subtitle: '刚被收录',
      tag: '新路线',
      image: '',
      color: '#2ea043',
      link: `/pages/route-detail/route-detail?id=${newest[0].id}`
    })
  }

  // ③ 高难度挑战 —— 星级最高的一条
  const all = await routeRepo.list({ ...filters, sort: 'hot', limit: 50 })
  const hardest = all.slice().sort((a, b) => b.difficultyStars - a.difficultyStars)[0]
  if (hardest) {
    banners.push({
      id: 'a-hard',
      source: 'algorithm',
      title: hardest.name,
      subtitle: `${hardest.difficultyStars} 星难度 · ${hardest.curveCount} 个弯`,
      tag: '高难度',
      image: '',
      color: '#be185d',
      link: `/pages/route-detail/route-detail?id=${hardest.id}`
    })
  }

  return banners
}

/** 版主创建活动 */
async function createModeratorBanner(input, userId) {
  return bannerRepo.create({ ...input, source: 'moderator', createdBy: userId })
}

async function listModeratorBanners(region) {
  return bannerRepo.listByCreator('', region)
}

async function updateBannerStatus(id, status) {
  return bannerRepo.updateStatus(id, status)
}

async function removeBanner(id) {
  return bannerRepo.remove(id)
}

/**
 * 活动列表。
 *
 * 和首页活动位的区别：这里**只要人工活动**（平台活动 + 版主活动），
 * 不含算法位 —— 算法位是「本周最热」这类自动推荐，不是活动。
 * 活动页把它们混在一起会让人分不清哪些是真人组织的。
 *
 * @param {{province?, city?, limit?}} options
 */
async function listActivities({ province, city, limit = 30 } = {}) {
  const rows = await bannerRepo.listActive({ province, city, limit })

  return rows.map((b) => ({
    id: b.id,
    source: b.source,
    // platform 是平台级活动，moderator 是版主活动 —— 前端要分开展示
    organizer: b.source === 'platform' ? '官方' : '版主',
    title: b.title,
    subtitle: b.subtitle,
    tag: b.tag,
    image: b.image,
    color: b.color,
    link: b.link,
    province: b.province || '',
    city: b.city || '',
    startsAt: b.startsAt,
    endsAt: b.endsAt,
    status: b.status
  }))
}

module.exports = {
  listBanners,
  listActivities,
  createModeratorBanner,
  listModeratorBanners,
  updateBannerStatus,
  removeBanner
}
