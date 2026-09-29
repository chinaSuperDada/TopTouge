const mock = require('../../utils/mock')
const { displayName } = require('../../utils/user')

Page({
  data: {
    userName: '',
    avatar: '',
    avatarText: '',
    stats: {
      runCount: 0,
      routeCount: 0,
      favoriteCount: 0
    },
    isModerator: false,
    isAdmin: false,
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

    Promise.all([
      mock.getProfile().catch(() => ({ nickName: '', avatar: '' })),
      mock.getMyRuns().catch(() => []),
      mock.getMyRoutes().catch(() => []),
      mock.getMyFavorites().catch(() => []),
      mock.getModeratorInfo().catch(() => ({ isModerator: false, regions: [] }))
    ]).then(([profile, runs, routes, favorites, modInfo]) => {
      // 没设置昵称时回落成「车友 3072」这种由 openid 派生的短标识 ——
      // 不能显示原始 openid，又长又难认
      const name = profile.nickName || displayName(app.globalData.userId)

      this.setData({
        userName: name,
        avatar: profile.avatar || '',
        avatarText: name.slice(-2),
        stats: {
          runCount: runs.length,
          routeCount: routes.length,
          favoriteCount: favorites.length
        },
        isModerator: Boolean(modInfo.isModerator),
        isAdmin: Boolean(modInfo.isAdmin),
        moderatorRegion: (modInfo.regions || []).map((r) => r.city).join(' · ')
      })
    })
  },

  onEditProfile() {
    wx.navigateTo({ url: '/pages/profile-edit/profile-edit' })
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
    wx.navigateTo({ url: '/pages/settings/settings' })
  },

  onOpenApply() {
    wx.navigateTo({ url: '/pages/moderator-apply/moderator-apply' })
  },

  onOpenApplyReview() {
    wx.navigateTo({ url: '/pages/moderator-apply-review/moderator-apply-review' })
  }
})
