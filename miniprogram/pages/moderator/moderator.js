const mock = require('../../utils/mock')

Page({
  data: {
    info: null,
    regionText: '',
    stats: { pending: 0, managed: 0, activities: 0 },
    loading: true
  },

  onLoad() {
    this.loadAll()
  },

  /** 从审核/管理页返回时刷新统计 */
  onShow() {
    if (!this.data.loading) this.loadAll()
  },

  loadAll() {
    Promise.all([
      mock.getModeratorInfo(),
      mock.getPendingRoutes().catch(() => []),
      mock.getManagedRoutes().catch(() => []),
      mock.getManagedActivities().catch(() => [])
    ]).then(([info, pending, managed, activities]) => {
      this.setData({
        info,
        regionText: (info.regions || []).map((r) => r.city).join(' · ') || '暂无辖区',
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
