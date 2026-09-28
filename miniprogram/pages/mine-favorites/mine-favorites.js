const mock = require('../../utils/mock')

Page({
  data: {
    routes: [],
    loading: true
  },

  onLoad() {
    mock.getMyFavorites().then((routes) => {
      this.setData({
        routes: routes.map((r) => {
          const km = r.distanceMeters / 1000
          const ROAD_TYPE_LABEL = { mountain: '山路', track: '赛道', gravel: '非铺装', highway: '公路' }
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

  /** 左滑或长按取消收藏。这里先用长按，简单可靠 */
  onLongPress(e) {
    const { id, name } = e.currentTarget.dataset

    wx.showModal({
      title: '取消收藏',
      content: `不再收藏「${name}」？`,
      confirmText: '取消收藏',
      success: (res) => {
        if (!res.confirm) return
        this.setData({ routes: this.data.routes.filter((r) => r.id !== Number(id)) })
        wx.showToast({ title: '已取消收藏', icon: 'none' })
      }
    })
  }
})
