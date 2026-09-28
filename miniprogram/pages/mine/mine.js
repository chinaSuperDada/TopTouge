const mock = require('../../utils/mock')
const { displayName } = require('../../utils/user')

Page({
  data: {
    userName: '',
    avatarText: '',
    stats: {
      runCount: 0,
      routeCount: 0,
      favoriteCount: 0
    },
    isModerator: false,
    moderatorRegion: ''
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 })
    }
    this.loadProfile()
  },

  /**
   * 拉个人信息。
   *
   * 三个统计数字要各查一次 —— 用 Promise.all 并发，别串行等。
   * 任一失败不影响其他，所以每个都 catch 兜底成 0。
   */
  loadProfile() {
    const app = getApp()
    const name = displayName(app.globalData.userId)

    this.setData({
      userName: name,
      avatarText: name.slice(-2)
    })

    Promise.all([
      mock.getMyRuns().catch(() => []),
      mock.getMyRoutes().catch(() => []),
      mock.getMyFavorites().catch(() => []),
      mock.getModeratorInfo().catch(() => ({ isModerator: false, regions: [] }))
    ]).then(([runs, routes, favorites, modInfo]) => {
      this.setData({
        stats: {
          runCount: runs.length,
          routeCount: routes.length,
          favoriteCount: favorites.length
        },
        isModerator: Boolean(modInfo.isModerator),
        moderatorRegion: (modInfo.regions || []).map((r) => r.city).join(' · ')
      })
    })
  },

  onOpenRuns() {
    wx.navigateTo({ url: '/pages/mine-runs/mine-runs' })
  },

  onOpenRoutes() {
    wx.navigateTo({ url: '/pages/mine-routes/mine-routes' })
  },

  onOpenFavorites() {
    wx.navigateTo({ url: '/pages/mine-favorites/mine-favorites' })
  },

  onOpenModerator() {
    wx.navigateTo({ url: '/pages/moderator/moderator' })
  },

  onOpenSettings() {
    wx.showToast({ title: '设置页开发中', icon: 'none' })
  }
})
