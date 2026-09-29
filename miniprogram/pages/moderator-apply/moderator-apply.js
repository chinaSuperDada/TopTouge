const mock = require('../../utils/mock')
const reporter = require('../../utils/errorReporter')
const { REGIONS } = mock

const STATUS_TEXT = {
  pending: '审核中',
  approved: '已通过',
  rejected: '已驳回'
}

/** 把 ISO 时间转成「2026年9月29日」 */
function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

Page({
  data: {
    loading: true,

    // 资格进度
    routeCount: 0,
    runCount: 0,
    minRoutes: 1,
    minRuns: 1,
    eligible: false,

    // 我的申请记录
    applications: [],

    // 是不是已经有待审的申请了。有的话不能再提交 ——
    // 否则连点几次就攒出一堆一样的申请，管理员要挨个驳回
    hasPending: false,

    // 是不是已经是版主了（已是版主就不显示申请表单）
    isModerator: false,
    isAdmin: false,

    // 表单
    provinceIndex: 0,
    cityIndex: 0,
    provinceLabels: [],
    cityLabels: [],
    region: { province: '', city: '' },
    reason: '',
    submitting: false
  },

  onLoad() {
    this.initRegions()
    this.load()
  },

  onShow() {
    if (!this.data.loading) this.load()
  },

  initRegions() {
    this.setData({
      provinceLabels: REGIONS.map((r) => r.province),
      cityLabels: REGIONS[0] ? REGIONS[0].cities : []
    })
  },

  load() {
    return Promise.all([
      mock.getApplyEligibility(),
      mock.getModeratorInfo()
    ])
      .then(([elig, info]) => {
        const applications = (elig.applications || []).map((a) => ({
          ...a,
          statusText: STATUS_TEXT[a.status] || a.status,
          createdAtText: formatDate(a.createdAt)
        }))

        this.setData({
          routeCount: elig.routeCount,
          runCount: elig.runCount,
          minRoutes: elig.minRoutes,
          minRuns: elig.minRuns,
          eligible: elig.eligible,
          applications,
          // 有待审的就不能再申请
          hasPending: applications.some((a) => a.status === 'pending'),
          isModerator: Boolean(info.isModerator),
          isAdmin: Boolean(info.isAdmin),
          loading: false
        })
      })
      .catch((err) => {
        reporter.report({
          code: 'APPLY_PAGE_LOAD_FAILED',
          message: '加载版主申请页失败',
          detail: (err && err.detail) || (err && err.message) || ''
        })
        this.setData({ loading: false })
      })
  },

  onProvinceChange(e) {
    const index = Number(e.detail.value)
    const region = REGIONS[index]
    this.setData({
      provinceIndex: index,
      cityIndex: 0,
      cityLabels: region ? region.cities : [],
      region: region
        ? { province: region.province, city: region.cities[0] || '' }
        : { province: '', city: '' }
    })
  },

  onCityChange(e) {
    const index = Number(e.detail.value)
    const region = REGIONS[this.data.provinceIndex]
    this.setData({
      cityIndex: index,
      region: {
        province: region.province,
        city: region.cities[index] || ''
      }
    })
  },

  onReasonInput(e) {
    this.setData({ reason: e.detail.value })
  },

  onSubmit() {
    if (this.data.submitting) return
    if (this.data.hasPending) {
      wx.showToast({ title: '申请正在审核中', icon: 'none' })
      return
    }
    if (!this.data.eligible) {
      wx.showToast({ title: '还不满足申请条件', icon: 'none' })
      return
    }

    const { province, city } = this.data.region
    if (!province || !city) {
      wx.showToast({ title: '请选择要负责的区域', icon: 'none' })
      return
    }

    this.setData({ submitting: true })

    mock.applyModerator({ province, city, reason: this.data.reason })
      .then(() => {
        wx.showToast({ title: '申请已提交', icon: 'success' })
        this.setData({ submitting: false, reason: '' })
        this.load()
      })
      .catch(() => {
        this.setData({ submitting: false })
      })
  },

  onOpenAdminReview() {
    wx.navigateTo({ url: '/pages/moderator-apply-review/moderator-apply-review' })
  }
})
