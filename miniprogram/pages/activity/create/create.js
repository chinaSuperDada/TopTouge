const activityMock = require('../../../utils/activityMock')
const reporter = require('../../../utils/errorReporter')

/** 可选的已有路线。真实实现从路线库拉（GET /api/routes）。 */
const ROUTE_OPTIONS = [
  { id: 1, name: '浙西天路', meta: '118.4 km · 爬升 2,180 m · 进阶' },
  { id: 2, name: '四明山环线', meta: '78.2 km · 爬升 1,140 m · 进阶' },
  { id: 3, name: '后坞盘山', meta: '41.6 km · 爬升 620 m · 休闲' }
]

/** 默认「全队阅读」文案。创建者可改。 */
const DEFAULT_NOTICE =
  '本活动只做同行记录与路况提示，不提供任何竞速、封闭道路或安全保障。' +
  '参加即表示已阅读并同意：遵守交通法规，服从组织者安排，安全自负。'

const DIFFICULTY = ['休闲', '进阶', '硬核']
const SIZE_OPTIONS = [5, 8, 10, 20]

const pad = (n) => String(n).padStart(2, '0')

Page({
  data: {
    form: {
      name: '',
      date: '',
      time: '08:30',
      place: '',
      routeMode: 'route',        // route | locate
      routeIndex: 0,
      difficulty: '进阶',
      maxMembers: 8,
      vehicle: 'BRZ · 浙A·8F2K1',
      notice: DEFAULT_NOTICE,
      visibility: 'public'
    },
    routeOptions: ROUTE_OPTIONS,
    routeNames: ROUTE_OPTIONS.map((r) => r.name),
    difficultyOptions: DIFFICULTY,
    sizeOptions: SIZE_OPTIONS,
    submitting: false,
    // 今天，给日期选择器做下限
    today: ''
  },

  onLoad() {
    const d = new Date()
    this.setData({ today: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` })
  },

  /* ==================== 表单 ==================== */

  onInput(e) {
    this.setData({ [`form.${e.currentTarget.dataset.field}`]: e.detail.value })
  },

  onDateChange(e) {
    this.setData({ 'form.date': e.detail.value })
  },

  onTimeChange(e) {
    this.setData({ 'form.time': e.detail.value })
  },

  onRouteMode(e) {
    this.setData({ 'form.routeMode': e.currentTarget.dataset.v })
  },

  onRouteChange(e) {
    this.setData({ 'form.routeIndex': Number(e.detail.value) })
  },

  onDifficulty(e) {
    this.setData({ 'form.difficulty': e.currentTarget.dataset.v })
  },

  onSize(e) {
    this.setData({ 'form.maxMembers': Number(e.currentTarget.dataset.v) })
  },

  onVisibility(e) {
    this.setData({ 'form.visibility': e.currentTarget.dataset.v })
  },

  /** 地图选点（待接入高德） */
  onPickPlace() {
    wx.showToast({ title: '地图选点待接入', icon: 'none' })
  },

  /* ==================== 提交 ==================== */

  onSubmit() {
    if (this.data.submitting) return

    const f = this.data.form
    const name = (f.name || '').trim()
    if (!name) return wx.showToast({ title: '请填活动名称', icon: 'none' })
    if (!f.date) return wx.showToast({ title: '请选集合日期', icon: 'none' })
    if (!(f.place || '').trim()) return wx.showToast({ title: '请填集合地点', icon: 'none' })

    const isRoute = f.routeMode === 'route'
    const route = isRoute ? ROUTE_OPTIONS[f.routeIndex] : null

    this.setData({ submitting: true })

    activityMock.createActivity({
      name,
      // 用本地时间拼，避免时区偏移
      meetAt: `${f.date}T${f.time}:00`,
      meetPlace: { name: f.place.trim(), lat: 0, lng: 0 },
      routeId: route ? route.id : null,
      routeName: route ? route.name : '',
      routeMeta: route ? route.meta : '仅定位集合点',
      maxMembers: f.maxMembers,
      difficulty: f.difficulty,
      vehicle: f.vehicle,
      notice: f.notice,
      visibility: f.visibility
    })
      .then((activity) => {
        this.setData({ submitting: false })
        // 创建成功后直接进活动房间（私有活动在那里能看到房间号 + 密码）
        wx.redirectTo({ url: `/pages/activity/room/room?id=${activity.id}&created=1` })
      })
      .catch((err) => {
        this.setData({ submitting: false })
        reporter.report({
          code: 'ACTIVITY_CREATE_FAILED',
          message: '创建活动失败',
          detail: (err && err.detail) || (err && err.message) || ''
        })
        wx.showToast({ title: '创建失败，请稍后再试', icon: 'none' })
      })
  }
})
