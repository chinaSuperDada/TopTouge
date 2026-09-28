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
    // 版主标识。真实项目由后端返回，现在先用 mock 里的城市判断
    isModerator: false,
    moderatorRegion: ''
  },

  onShow() {
    // 切换 tab 时同步底部选中态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 })
    }
    this.loadProfile()
  },

  loadProfile() {
    // 接后端后换成 GET /api/me
    const app = getApp()
    const name = displayName(app.globalData.userId)

    this.setData({
      userName: name,
      // 没做头像上传，先用名字首字做一个色块头像
      avatarText: name.slice(-2),
      stats: {
        runCount: 12,
        routeCount: 3,
        favoriteCount: 8
      },
      // 假定杭州是当前用户所在区域，且有版主权限
      isModerator: true,
      moderatorRegion: '杭州市'
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
