const mock = require('../../utils/mock')

const ROAD_TYPE_LABEL = { mountain: '山路', track: '赛道', gravel: '非铺装', highway: '公路' }

Page({
  data: {
    routes: [],
    loading: true
  },

  /**
   * 每次进页面都重拉。
   *
   * 不能用 onLoad —— 从这个页面点进详情、在详情页取消收藏、再返回，
   * onLoad 不会重跑，列表还留着已经取消的那条。
   */
  onShow() {
    this.load()
  },

  load() {
    mock.getMyFavorites().then((routes) => {
      this.setData({
        routes: routes.map((r) => {
          const km = r.distanceMeters / 1000
          return {
            ...r,
            distanceText: km < 1 ? `${Math.round(r.distanceMeters)}m` : `${km.toFixed(1)}km`,
            roadTypeText: ROAD_TYPE_LABEL[r.roadType] || '山路',
            thumbClass: `thumb-${r.id % 6}`,
            stars: [1, 2, 3, 4, 5]
          }
        }),
        loading: false
      })
    })
  },

  onRouteTap(e) {
    wx.navigateTo({ url: `/pages/route-detail/route-detail?id=${e.currentTarget.dataset.id}` })
  },

  /** 长按取消收藏 */
  onLongPress(e) {
    const { id, name } = e.currentTarget.dataset

    wx.showModal({
      title: '取消收藏',
      content: `不再收藏「${name}」？`,
      confirmText: '取消收藏',
      success: (res) => {
        if (!res.confirm) return

        mock.removeFavorite(id)
          .then(() => {
            this.setData({ routes: this.data.routes.filter((r) => r.id !== Number(id)) })
            wx.showToast({ title: '已取消收藏', icon: 'none' })
          })
          .catch(() => {})
      }
    })
  }
})
