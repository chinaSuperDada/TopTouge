const activityMock = require('../../../utils/activityMock')
const reporter = require('../../../utils/errorReporter')

const pad = (n) => String(n).padStart(2, '0')

function formatMeetAt(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()]
  return `${d.getMonth() + 1}月${d.getDate()}日 ${week} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

Page({
  data: {
    id: null,
    activity: null,
    loading: true,
    error: '',
    applying: false,
    // 页面上的主按钮状态：apply | pending | joined | organizer | full | closed
    action: 'apply'
  },

  onLoad(query) {
    const id = Number(query.id)
    if (!id) {
      this.setData({ loading: false, error: '缺少活动 id' })
      return
    }
    this.setData({ id })
    this.load()
  },

  onShow() {
    if (this.data.id && !this.data.loading) this.load()
  },

  load() {
    this.setData({ loading: true, error: '' })
    return activityMock.getActivity(this.data.id)
      .then((activity) => {
        this.setData({
          activity: { ...activity, meetText: formatMeetAt(activity.meetAt) },
          loading: false,
          action: this.resolveAction(activity)
        })
      })
      .catch((err) => {
        reporter.report({
          code: 'ACTIVITY_DETAIL_FAILED',
          message: `加载活动详情失败 id=${this.data.id}`,
          detail: (err && err.detail) || (err && err.message) || ''
        })
        this.setData({ loading: false, error: '活动不存在或已结束' })
      })
  },

  /**
   * 主按钮该显示什么。
   * 优先级：我发起的 > 已加入 > 待同意 > 满员 > 可申请
   */
  resolveAction(a) {
    if (a.isOrganizer) return 'organizer'
    if (a.joined) return 'joined'
    if (a.applyStatus === 'pending') return 'pending'
    if (a.isFull) return 'full'
    return 'apply'
  },

  onActionTap() {
    const { action, id } = this.data
    if (action === 'apply') return this.apply()
    if (action === 'organizer') return wx.navigateTo({ url: `/pages/activity/room/room?id=${id}` })
    if (action === 'joined') return wx.navigateTo({ url: `/pages/activity/room/room?id=${id}` })
    if (action === 'pending') return wx.showToast({ title: '已申请，等待组织者同意', icon: 'none' })
    if (action === 'full') return wx.showToast({ title: '活动已满员', icon: 'none' })
  },

  apply() {
    if (this.data.applying) return
    this.setData({ applying: true })

    activityMock.applyJoin(this.data.id)
      .then(() => {
        this.setData({ applying: false, action: 'pending', 'activity.applyStatus': 'pending' })
        wx.showToast({ title: '已提交申请，等待组织者同意', icon: 'none' })
      })
      .catch((err) => {
        this.setData({ applying: false })
        reporter.report({
          code: 'ACTIVITY_APPLY_FAILED',
          message: '申请加入活动失败',
          detail: (err && err.detail) || (err && err.message) || ''
        })
        wx.showToast({ title: '申请失败，请稍后再试', icon: 'none' })
      })
  },

  onShareTap() {
    wx.showToast({ title: '分享功能待接入', icon: 'none' })
  }
})
