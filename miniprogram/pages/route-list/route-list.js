const api = require('../../utils/request')

Page({
  data: {
    routes: [],
    loading: true,
    error: ''
  },

  onLoad() {
    this.loadRoutes()
  },

  onShow() {
    // 从上传页返回时刷新，让新路线立刻出现
    if (this.data.routes.length > 0) this.loadRoutes()
  },

  onPullDownRefresh() {
    this.loadRoutes().finally(() => wx.stopPullDownRefresh())
  },

  loadRoutes() {
    this.setData({ loading: true, error: '' })

    return api
      .get('/api/routes', { showError: false })
      .then((data) => {
        this.setData({ routes: data.routes || [], loading: false })
      })
      .catch((err) => {
        this.setData({ loading: false, error: err.message })
      })
  },

  onRouteTap(e) {
    wx.navigateTo({ url: `/pages/route-detail/route-detail?id=${e.detail.id}` })
  },

  /**
   * 制作路线：先选方式，再进对应页面。
   *
   * 用系统 ActionSheet 而不是自定义弹层 —— 少写样式，交互也是微信原生。
   * 代价是 itemList 只支持单行文字，说明只能并进选项里。
   */
  onCreate() {
    const items = ['搜索 / 选点 · 搜起终点自动规划，或在地图上点', '录制路线 · 跑一段路，把它变成路线']

    wx.showActionSheet({
      itemList: items,
      success: (res) => {
        if (res.tapIndex === 0) {
          wx.navigateTo({ url: '/pages/route-upload/route-upload' })
        } else if (res.tapIndex === 1) {
          wx.navigateTo({ url: '/pages/route-record/route-record' })
        }
      },
      // 用户点取消也会走 fail，这里不需要提示
      fail: () => {}
    })
  },

  onRetry() {
    this.loadRoutes()
  },

  onShareAppMessage() {
    const n = this.data.routes.length
    return {
      title: n > 0 ? `TopTouge 跑山路线 · 已有 ${n} 条` : 'TopTouge 跑山路线',
      path: '/pages/route-list/route-list'
    }
  },

  onShareTimeline() {
    return { title: 'TopTouge 跑山路线' }
  }
})
