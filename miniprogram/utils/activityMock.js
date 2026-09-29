/**
 * 跑山活动 · 数据层（当前为 mock）
 *
 * 函数签名与将来的后端接口一一对应，**页面只依赖这里的函数名**。
 * 接后端时把每个函数体换成 `api.get/post` 即可，页面一行不用改 ——
 * 和 utils/mock.js 的做法一致（那边已经从 mock 换成了真实调用）。
 *
 * 接口对照（详见 docs/架构与技术设计.md「跑山活动」一节）：
 *   listActivities   GET  /api/activities
 *   getActivity      GET  /api/activities/:id
 *   createActivity   POST /api/activities
 *   applyJoin        POST /api/activities/:id/join-requests
 *   reviewJoin       POST /api/activities/:id/join-requests/:reqId/review
 *   joinByRoom       POST /api/activities/join
 *   getRoom          GET  /api/activities/:id/room
 *   listMyActivities GET  /api/me/activities
 */

const api = require('./request')

/** 当前用户（本地开发固定值；线上由云托管注入的 openid 决定） */
const app = getApp()
const currentUserId = () => (app && app.globalData && app.globalData.userId) || 'test-user-001'

/* ==================== mock 数据 ==================== */

/**
 * 演示用活动。
 *
 * 刻意做得像真实数据：有人数未满的、有已满的、有没指定路线只发定位的、
 * 有私有的（不在列表里出现）。
 */
const MOCK_ACTIVITIES = [
  {
    id: 1001,
    name: '浙西天路 · 周末同行',
    organizerId: 'test-user-002',
    organizerName: '王颖婵',
    organizerAvatar: '',
    meetAt: '2026-10-04T08:30:00.000Z',
    meetPlace: { name: '临安 · 白际乡政府', lat: 29.614, lng: 118.912 },
    routeId: 1,
    routeName: '浙西天路',
    routeMeta: '118.4 km · 爬升 2,180 m · 进阶',
    maxMembers: 8,
    memberCount: 4,
    difficulty: '进阶',
    visibility: 'public',
    status: 'recruiting',
    notice: '本活动只做同行记录与路况提示，不提供任何竞速、封闭道路或安全保障。参加即表示已阅读并同意：遵守交通法规，服从组织者安排，安全自负。',
    province: '浙江省',
    city: '杭州市',
    distanceKm: 12,
    createdAt: '2026-09-28T10:00:00.000Z'
  },
  {
    id: 1002,
    name: '莫干山 · 晨跑',
    organizerId: 'test-user-003',
    organizerName: '陈师傅',
    organizerAvatar: '',
    meetAt: '2026-10-05T06:00:00.000Z',
    meetPlace: { name: '德清 · 莫干山后坞', lat: 30.605, lng: 119.882 },
    routeId: 3,
    routeName: '后坞盘山',
    routeMeta: '41.6 km · 爬升 620 m · 休闲',
    maxMembers: 20,
    memberCount: 6,
    difficulty: '休闲',
    visibility: 'public',
    status: 'recruiting',
    notice: '休闲路线，新手友好。全程跟随头车，不超车、不落单。',
    province: '浙江省',
    city: '湖州市',
    distanceKm: 32,
    createdAt: '2026-09-29T09:00:00.000Z'
  },
  {
    id: 1003,
    name: '天目山 · 探路同行',
    organizerId: 'test-user-004',
    organizerName: '小李',
    organizerAvatar: '',
    meetAt: '2026-10-06T07:30:00.000Z',
    meetPlace: { name: '临安 · 天目山景区南门', lat: 30.317, lng: 119.435 },
    routeId: null,                      // 不指定路线，只发定位
    routeName: '',
    routeMeta: '仅定位集合点',
    maxMembers: 10,
    memberCount: 3,
    difficulty: '硬核',
    visibility: 'public',
    status: 'recruiting',
    notice: '探路性质，路况不明，请自备补给。遇到封路就地折返。',
    province: '浙江省',
    city: '杭州市',
    distanceKm: 65,
    createdAt: '2026-09-29T12:00:00.000Z'
  },
  {
    id: 1004,
    name: '四明山 · 环线',
    organizerId: 'test-user-005',
    organizerName: '周山',
    organizerAvatar: '',
    meetAt: '2026-10-03T09:00:00.000Z',
    meetPlace: { name: '余姚 · 梁弄镇', lat: 29.899, lng: 121.087 },
    routeId: 2,
    routeName: '四明山环线',
    routeMeta: '78.2 km · 爬升 1,140 m · 进阶',
    maxMembers: 5,
    memberCount: 5,                     // 已满
    difficulty: '进阶',
    visibility: 'public',
    status: 'recruiting',
    notice: '本活动只做同行记录与路况提示，不提供任何竞速、封闭道路或安全保障。',
    province: '浙江省',
    city: '宁波市',
    distanceKm: 88,
    createdAt: '2026-09-27T15:00:00.000Z'
  },
  {
    id: 1005,
    name: '安吉 · 竹海穿越',
    organizerId: 'test-user-006',
    organizerName: '老赵',
    organizerAvatar: '',
    meetAt: '2026-10-11T08:00:00.000Z',
    meetPlace: { name: '安吉 · 天荒坪', lat: 30.473, lng: 119.657 },
    routeId: null,
    routeName: '',
    routeMeta: '仅定位集合点',
    maxMembers: 12,
    memberCount: 2,
    difficulty: '休闲',
    visibility: 'public',
    status: 'recruiting',
    notice: '看天气，下雨取消。到点集合再定路线。',
    province: '浙江省',
    city: '湖州市',
    distanceKm: 105,
    createdAt: '2026-09-26T08:00:00.000Z'
  }
]

/** 私有活动：不在列表出现，只能房间号 + 密码进 */
const MOCK_PRIVATE = {
  id: 2001,
  name: '老地方 · 熟人群',
  roomNo: '482913',
  password: '6628',
  organizerId: 'test-user-002',
  organizerName: '王颖婵',
  organizerAvatar: '',
  meetAt: '2026-10-04T08:30:00.000Z',
  meetPlace: { name: '临安 · 白际乡政府', lat: 29.614, lng: 118.912 },
  routeId: 1,
  routeName: '浙西天路',
  routeMeta: '118.4 km · 爬升 2,180 m · 进阶',
  maxMembers: 8,
  memberCount: 3,
  difficulty: '进阶',
  visibility: 'private',
  status: 'recruiting',
  notice: '熟人局，别外传房间号。',
  province: '浙江省',
  city: '杭州市',
  distanceKm: 12,
  createdAt: '2026-09-29T10:00:00.000Z'
}

/** 待审批的加入申请（组织者视角） */
const MOCK_REQUESTS = [
  {
    id: 9001, activityId: 1001,
    userId: 'test-user-009', nickName: '小胖', initial: '小', avatar: '',
    vehicle: '高尔夫 GTI', status: 'pending',
    createdAt: '2026-09-29T14:00:00.000Z'
  },
  {
    id: 9002, activityId: 1001,
    userId: 'test-user-010', nickName: '阿豪', initial: '阿', avatar: '',
    vehicle: '思域', status: 'pending',
    createdAt: '2026-09-29T15:30:00.000Z'
  }
]

/** 房间成员 */
const MOCK_MEMBERS = [
  { userId: 'test-user-002', nickName: '王颖婵', avatar: '', role: 'organizer', vehicle: 'BRZ · 浙A·8F2K1', ready: true },
  { userId: 'test-user-003', nickName: '陈师傅', avatar: '', role: 'member', vehicle: '911', ready: true },
  { userId: 'test-user-004', nickName: '小李', avatar: '', role: 'member', vehicle: 'BRZ', ready: false },
  { userId: 'test-user-005', nickName: '周山', avatar: '', role: 'member', vehicle: '', ready: false }
]

/** 可变状态：加入 / 创建会改这里，保证同一次会话内流程连贯 */
const state = {
  /** 我参加过的活动 id */
  joined: new Set([1001]),
  /** 我发起的活动 id */
  organized: new Set(),
  /** 我申请过的活动 id → 状态 */
  applied: { 1001: 'pending' },
  /** 运行时新建的活动 */
  created: [],
  requests: MOCK_REQUESTS.slice()
}

const delay = (data, ms = 180) => new Promise((resolve) => setTimeout(() => resolve(data), ms))

/* ==================== 列表 ==================== */

/**
 * 活动列表。
 *
 * @param {{province?, city?, timeRange?, difficulty?, sort?, lat?, lng?}} filters
 *   timeRange: all | today | week | month
 *   sort:      nearby | people | newest | time
 */
function listActivities(filters = {}) {
  const { difficulty = 'all', sort = 'nearby', timeRange = 'all', keyword = '' } = filters

  let list = MOCK_ACTIVITIES.slice()

  if (difficulty !== 'all') list = list.filter((a) => a.difficulty === difficulty)
  if (keyword) list = list.filter((a) => a.name.includes(keyword))

  // 时间范围：按集合时间筛
  if (timeRange !== 'all') {
    const now = Date.now()
    const span = { today: 864e5, week: 7 * 864e5, month: 30 * 864e5 }[timeRange] || Infinity
    list = list.filter((a) => {
      const t = new Date(a.meetAt).getTime()
      return t >= now - 864e5 && t <= now + span
    })
  }

  const sorters = {
    nearby: (a, b) => (a.distanceKm || 0) - (b.distanceKm || 0),
    people: (a, b) => b.memberCount - a.memberCount,
    newest: (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
    time: (a, b) => new Date(a.meetAt) - new Date(b.meetAt)
  }
  list.sort(sorters[sort] || sorters.nearby)

  // 补上「我」的状态，页面直接可用
  return delay({
    activities: list.map((a) => decorate(a)),
    total: list.length
  })
}

/** 取名字首字做头像。WXML 里字符串下标不一定可用，所以在这里算好 */
const initialOf = (name) => String(name || '?').trim().slice(0, 1) || '?'

/** 给活动补上「我」相关的状态 */
function decorate(a) {
  return {
    ...a,
    organizerInitial: initialOf(a.organizerName),
    isFull: a.memberCount >= a.maxMembers,
    isOrganizer: a.organizerId === currentUserId(),
    joined: state.joined.has(a.id) || state.organized.has(a.id),
    applyStatus: state.applied[a.id] || ''      // pending | approved | rejected | ''
  }
}

/* ==================== 详情 ==================== */

function getActivity(id) {
  const numId = Number(id)
  const found =
    MOCK_ACTIVITIES.find((a) => a.id === numId) ||
    state.created.find((a) => a.id === numId) ||
    (MOCK_PRIVATE.id === numId ? MOCK_PRIVATE : null)

  if (!found) return Promise.reject(new Error('活动不存在'))

  return delay({
    ...decorate(found),
    members: MOCK_MEMBERS.map((m) => ({ ...m, initial: initialOf(m.nickName), isMe: m.userId === currentUserId() })),
    isPrivate: found.visibility === 'private'
  })
}

/* ==================== 创建 ==================== */

/**
 * 创建活动。
 *
 * @param {{name, meetAt, meetPlace, routeId, routeName, routeMeta,
 *          maxMembers, difficulty, vehicle, notice, visibility}} input
 * @returns 私有活动会带上 roomNo / password
 */
function createActivity(input) {
  const id = 3000 + state.created.length + 1
  const isPrivate = input.visibility === 'private'

  const activity = {
    id,
    name: input.name,
    organizerId: currentUserId(),
    organizerName: '我',
    organizerAvatar: '',
    meetAt: input.meetAt,
    meetPlace: input.meetPlace,
    routeId: input.routeId || null,
    routeName: input.routeName || '',
    routeMeta: input.routeMeta || '仅定位集合点',
    maxMembers: input.maxMembers || 8,
    memberCount: 1,
    difficulty: input.difficulty || '进阶',
    visibility: input.visibility || 'public',
    status: 'recruiting',
    notice: input.notice || '',
    province: input.province || '',
    city: input.city || '',
    distanceKm: 0,
    createdAt: new Date().toISOString(),
    // 私有活动才有
    roomNo: isPrivate ? genRoomNo() : '',
    password: isPrivate ? genPassword() : ''
  }

  state.created.push(activity)
  state.organized.add(id)

  return delay(activity, 260)
}

/** 6 位房间号（避开易混淆的 0/1） */
function genRoomNo() {
  const pool = '23456789'
  let s = ''
  for (let i = 0; i < 6; i++) s += pool[Math.floor(Math.random() * pool.length)]
  return s
}

/** 4 位数字密码 */
function genPassword() {
  return String(Math.floor(1000 + Math.random() * 9000))
}

/* ==================== 加入 ==================== */

/** 公开活动：申请加入，等组织者同意 */
function applyJoin(id) {
  const numId = Number(id)
  state.applied[numId] = 'pending'
  return delay({ activityId: numId, status: 'pending' })
}

/**
 * 私有活动：房间号 + 密码加入。
 *
 * 校验失败时**不区分是房间号还是密码错** —— 避免被用来爆破房间号。
 */
function joinByRoom({ roomNo, password }) {
  const cleanRoom = String(roomNo || '').replace(/\s/g, '')
  const cleanPwd = String(password || '').trim()

  if (cleanRoom === MOCK_PRIVATE.roomNo && cleanPwd === MOCK_PRIVATE.password) {
    state.joined.add(MOCK_PRIVATE.id)
    return delay({ ok: true, activityId: MOCK_PRIVATE.id })
  }
  return delay({ ok: false, message: '房间号或密码不对' }, 260)
}

/** 直接加入（从分享链接进来） */
function joinDirect(id) {
  const numId = Number(id)
  state.joined.add(numId)
  return delay({ ok: true, activityId: numId })
}

/* ==================== 房间 ==================== */

/** 房间详情：活动 + 成员 + （组织者才有）房间号密码 */
function getRoom(id) {
  return getActivity(id).then((activity) => {
    const isOrganizer = activity.isOrganizer
    return {
      activity,
      members: activity.members,
      // 房间号密码只给组织者，其他人拿到的是空
      roomNo: isOrganizer ? (activity.roomNo || MOCK_PRIVATE.roomNo) : '',
      password: isOrganizer ? (activity.password || MOCK_PRIVATE.password) : '',
      isOrganizer,
      isPrivate: activity.visibility === 'private',
      // 组织者视角：待审批的申请
      requests: isOrganizer ? state.requests.filter((r) => r.activityId === activity.id && r.status === 'pending') : []
    }
  })
}

/* ==================== 审批 ==================== */

/** 组织者同意 / 拒绝 */
function reviewJoin(activityId, requestId, status) {
  const r = state.requests.find((x) => x.id === Number(requestId))
  if (r) r.status = status
  return delay({ requestId: Number(requestId), status })
}

/* ==================== 我的活动 ==================== */

/**
 * 我的活动。
 * @param {'all'|'organized'|'joined'} role  all = 我发起的 + 我参加的
 */
function listMyActivities(role = 'all') {
  const ids = role === 'organized' ? state.organized
    : role === 'joined' ? state.joined
    : new Set([...state.joined, ...state.organized])

  const all = MOCK_ACTIVITIES.concat(state.created)
  const list = all
    .filter((a) => ids.has(a.id))
    .map((a) => decorate(a))
    .sort((a, b) => new Date(b.meetAt) - new Date(a.meetAt))

  // 我发起的：附上待审批数，页面要显示红点
  const withPending = list.map((a) => ({
    ...a,
    pendingCount: state.requests.filter((r) => r.activityId === a.id && r.status === 'pending').length
  }))

  return delay({ activities: withPending })
}

module.exports = {
  listActivities,
  getActivity,
  createActivity,
  applyJoin,
  joinByRoom,
  joinDirect,
  getRoom,
  reviewJoin,
  listMyActivities,
  // 供页面判断状态用
  MOCK_PRIVATE
}
