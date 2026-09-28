const mock = require('../../utils/mock')

Page({
  data: {
    items: [],
    loading: true
  },

  onLoad() {
    mock.getManagedRoutes().then((items) => {
      this.setData({
        items: items.map((r) => {
          const km = r.distanceMeters / 1000
          return {
            ...r,
            distanceText: km < 1 ? `${Math.round(r.distanceMeters)}m` : `${km.toFixed(1)}km`,
            stars: [1, 2, 3, 4, 5]
          }
        }),
        loading: false
      })
    })
  },

  onViewDetail(e) {
    wx.navigateTo({
      url: `/pages/route-detail/route-detail?id=${e.currentTarget.dataset.id}`
    })
  },

  /**
   * 置顶 / 取消置顶。
   *
   * 置顶的路线在列表页排在最前 —— 版主用它把优质路线推出去。
   * 同名只能置顶一个，这里先做简单版，允许多个。
   */
  onTogglePin(e) {
    const id = Number(e.currentTarget.dataset.id)

    this.setData({
      items: this.data.items.map((r) => (r.id === id ? { ...r, pinned: !r.pinned } : r))
    })

    const item = this.data.items.find((r) => r.id === id)
    wx.showToast({ title: item.pinned ? '已置顶' : '已取消置顶', icon: 'none' })
  },

  /** 下架：不删除，只是从公开列表隐藏 */
  onTakeDown(e) {
    const { id, name } = e.currentTarget.dataset

    wx.showModal({
      title: '下架路线',
      content: `「${name}」将从公开列表隐藏，作者仍能在「我的路线」里看到。`,
      confirmText: '下架',
      confirmColor: '#e5484d',
      success: (res) => {
        if (!res.confirm) return
        this.setData({ items: this.data.items.filter((r) => r.id !== Number(id)) })
        wx.showToast({ title: '已下架', icon: 'none' })
      }
    })
  }
})
