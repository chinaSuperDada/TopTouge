const mock = require('../../utils/mock')

Page({
  data: {
    info: null,
    regionText: '',
    stats: {
      pending: 0,
      managed: 0,
      activities: 0
    },
    loading: true
  },

  onLoad() {
    this.loadAll()
  },

  /** 从审核页返回时刷新统计，不然数字对不上 */
  onShow() {
    if (!this.data.loading) this.loadAll()
  },

  loadAll() {
    Promise.all([
      mock.getModeratorInfo(),
      mock.getPendingRoutes(),
      mock.getManagedRoutes(),
      mock.getManagedActivities()
    ]).then(([info, pending, managed, activities]) => {
      this.setData({
        info,
        regionText: info.regions.map((r) => r.city).join(' · ') || '暂无辖区',
        stats: {
          pending: pending.length,
          managed: managed.length,
          activities: activities.length
        },
        loading: false
      })
    })
  },

  onOpenPending() {
    wx.navigateTo({ url: '/pages/moderator-review/moderator-review' })
  },

  onOpenManaged() {
    wx.navigateTo({ url: '/pages/moderator-routes/moderator-routes' })
  },

  onOpenActivities() {
    wx.navigateTo({ url: '/pages/moderator-activities/moderator-activities' })
  }
})
