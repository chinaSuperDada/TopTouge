const mock = require('../../utils/mock')

Page({
  data: {
    items: [],
    loading: true
  },

  onLoad() {
    this.load()
  },

  onShow() {
    if (!this.data.loading) this.load()
  },

  load() {
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

  /** 置顶 / 取消置顶。置顶的排在列表最前 */
  onTogglePin(e) {
    const id = Number(e.currentTarget.dataset.id)
    const item = this.data.items.find((r) => r.id === id)
    if (!item) return

    const next = !item.pinned

    mock.pinRoute(id, next)
      .then(() => {
        this.setData({
          items: this.data.items.map((r) => (r.id === id ? { ...r, pinned: next } : r))
        })
        wx.showToast({ title: next ? '已置顶' : '已取消置顶', icon: 'none' })
      })
      .catch(() => {})
  },

  /**
   * 下架：打回「已驳回」，作者仍能在「我的路线」看到并能改后重传。
   * 和「删除」的区别是作者侧还能看见 —— 所以要在确认框里说清楚。
   */
  onTakeDown(e) {
    const { id, name } = e.currentTarget.dataset

    wx.showModal({
      title: '下架路线',
      content: `「${name}」将从公开列表移除，作者会在「我的路线」看到已被下架。`,
      confirmText: '下架',
      confirmColor: '#e5484d',
      success: (res) => {
        if (!res.confirm) return

        mock.takeDownRoute(id)
          .then(() => {
            this.setData({ items: this.data.items.filter((r) => r.id !== Number(id)) })
            wx.showToast({ title: '已下架', icon: 'none' })
          })
          .catch(() => {})
      }
    })
  },

  /** 删除：软删除，作者的评论和成绩会保留 */
  onDelete(e) {
    const { id, name } = e.currentTarget.dataset

    wx.showModal({
      title: '删除路线',
      content: `「${name}」将从公开列表移除。已有的评论和成绩会保留，不会丢失。`,
      confirmText: '删除',
      confirmColor: '#e5484d',
      success: (res) => {
        if (!res.confirm) return

        mock.deleteManagedRoute(id)
          .then(() => {
            this.setData({ items: this.data.items.filter((r) => r.id !== Number(id)) })
            wx.showToast({ title: '已删除', icon: 'none' })
          })
          .catch(() => {})
      }
    })
  }
})
