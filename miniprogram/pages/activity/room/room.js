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
    room: null,
    loading: true,
    error: '',
    // 刚创建完进来时给个提示
    justCreated: false
  },

  onLoad(query) {
    const id = Number(query.id)
    if (!id) {
      this.setData({ loading: false, error: '缺少活动 id' })
      return
    }
    this.setData({ id, justCreated: query.created === '1' })
    this.load()
  },

  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh())
  },

  load() {
    this.setData({ loading: true, error: '' })
    return activityMock.getRoom(this.data.id)
      .then((room) => {
        this.setData({
          loading: false,
          room: {
            ...room,
            activity: { ...room.activity, meetText: formatMeetAt(room.activity.meetAt) }
          }
        })
      })
      .catch((err) => {
        reporter.report({
          code: 'ACTIVITY_ROOM_FAILED',
          message: `加载活动房间失败 id=${this.data.id}`,
          detail: (err && err.detail) || (err && err.message) || ''
        })
        this.setData({ loading: false, error: '房间不存在或你没有权限' })
      })
  },

  /* ==================== 房间号 / 密码 ==================== */

  onCopyRoomNo() {
    const v = this.data.room && this.data.room.roomNo
    if (!v) return
    wx.setClipboardData({ data: v, success: () => wx.showToast({ title: '房间号已复制', icon: 'none' }) })
  },

  onCopyPassword() {
    const v = this.data.room && this.data.room.password
    if (!v) return
    wx.setClipboardData({ data: v, success: () => wx.showToast({ title: '密码已复制', icon: 'none' }) })
  },

  /** 把房间号 + 密码拼成一段话，方便直接发给朋友 */
  onCopyAll() {
    const r = this.data.room
    if (!r || !r.roomNo) return
    const text = `跑山活动「${r.activity.name}」\n房间号：${r.roomNo}\n密码：${r.password}`
    wx.setClipboardData({ data: text, success: () => wx.showToast({ title: '已复制，发给朋友即可', icon: 'none' }) })
  },

  onShareLink() {
    wx.showToast({ title: '分享链接待接入', icon: 'none' })
  },

  /* ==================== 审批 ==================== */

  onApprove(e) {
    this.review(e.currentTarget.dataset.id, 'approved')
  },

  onReject(e) {
    this.review(e.currentTarget.dataset.id, 'rejected')
  },

  review(requestId, status) {
    activityMock.reviewJoin(this.data.id, requestId, status)
      .then(() => {
        wx.showToast({ title: status === 'approved' ? '已同意' : '已拒绝', icon: 'none' })
        this.load()
      })
      .catch((err) => {
        reporter.report({
          code: 'ACTIVITY_REVIEW_FAILED',
          message: '审批加入申请失败',
          detail: (err && err.detail) || (err && err.message) || ''
        })
        wx.showToast({ title: '操作失败，请稍后再试', icon: 'none' })
      })
  },

  /* ==================== 其他 ==================== */

  /** 出发跑山：走现有单人记录流程 */
  onStartRun() {
    const r = this.data.room
    if (!r) return
    const routeId = r.activity.routeId
    if (!routeId) {
      return wx.showModal({
        title: '没有指定路线',
        content: '这个活动只发了集合定位，没有路线，无法开始记录。到场后可以和车友一起走。',
        showCancel: false
      })
    }
    wx.navigateTo({ url: `/pages/run/run?id=${routeId}` })
  },

  onLeave() {
    wx.showModal({
      title: '退出活动',
      content: '退出后不再看到这个活动的成员和房间号。确定吗？',
      success: (res) => {
        if (!res.confirm) return
        wx.showToast({ title: '退出功能待接入', icon: 'none' })
      }
    })
  },

  onOpenDetail() {
    wx.navigateTo({ url: `/pages/activity/detail/detail?id=${this.data.id}` })
  }
})
