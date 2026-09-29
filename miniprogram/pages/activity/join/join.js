const activityMock = require('../../../utils/activityMock')
const reporter = require('../../../utils/errorReporter')

Page({
  data: {
    roomNo: '',
    password: '',
    submitting: false
  },

  onRoomNo(e) {
    // 只留数字
    this.setData({ roomNo: e.detail.value.replace(/\D/g, '').slice(0, 6) })
  },

  onPassword(e) {
    this.setData({ password: e.detail.value.replace(/\D/g, '').slice(0, 4) })
  },

  onSubmit() {
    const { roomNo, password, submitting } = this.data
    if (submitting) return
    if (roomNo.length !== 6) return wx.showToast({ title: '房间号是 6 位数字', icon: 'none' })
    if (password.length !== 4) return wx.showToast({ title: '密码是 4 位数字', icon: 'none' })

    this.setData({ submitting: true })

    activityMock.joinByRoom({ roomNo, password })
      .then((res) => {
        this.setData({ submitting: false })
        if (!res.ok) {
          // 不告诉用户是房间号错还是密码错 —— 避免被用来爆破
          return wx.showToast({ title: res.message || '房间号或密码不对', icon: 'none' })
        }
        wx.redirectTo({ url: `/pages/activity/room/room?id=${res.activityId}` })
      })
      .catch((err) => {
        this.setData({ submitting: false })
        reporter.report({
          code: 'ACTIVITY_JOIN_FAILED',
          message: '加入房间失败',
          detail: (err && err.detail) || (err && err.message) || ''
        })
        wx.showToast({ title: '加入失败，请稍后再试', icon: 'none' })
      })
  }
})
