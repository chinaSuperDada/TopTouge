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

  onUpload() {
    wx.navigateTo({ url: '/pages/route-upload/route-upload' })
  },

  onRecord() {
    wx.navigateTo({ url: '/pages/route-record/route-record' })
  },

  onRetry() {
    this.loadRoutes()
  }
})
