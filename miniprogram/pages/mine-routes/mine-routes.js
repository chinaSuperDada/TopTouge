const mock = require('../../utils/mock')

/** 审核状态转展示文案与配色 */
const STATUS_MAP = {
  pending: { text: '审核中', cls: 'status-pending' },
  approved: { text: '已通过', cls: 'status-ok' },
  rejected: { text: '已驳回', cls: 'status-rejected' },
  deleted: { text: '已删除', cls: 'status-rejected' }
}

const ROAD_TYPE_LABEL = { mountain: '山路', track: '赛道', gravel: '非铺装', highway: '公路' }

Page({
  data: {
    routes: [],
    loading: true
  },

  onLoad() {
    this.load()
  },

  /** 删除后返回要刷新 */
  onShow() {
    if (!this.data.loading) this.load()
  },

  load() {
    mock.getMyRoutes().then((routes) => {
      this.setData({
        routes: routes.map((r) => {
          const km = r.distanceMeters / 1000
          const st = STATUS_MAP[r.reviewStatus] || STATUS_MAP.approved
          return {
            ...r,
            distanceText: km < 1 ? `${Math.round(r.distanceMeters)}m` : `${km.toFixed(1)}km`,
            roadTypeText: ROAD_TYPE_LABEL[r.roadType] || '山路',
            statusText: st.text,
            statusClass: st.cls,
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

  /** 长按删除自己的路线 */
  onLongPress(e) {
    const { id, name } = e.currentTarget.dataset

    wx.showModal({
      title: '删除路线',
      content: `「${name}」将从公开列表移除。已有的评论和成绩会保留。`,
      confirmText: '删除',
      confirmColor: '#e5484d',
      success: (res) => {
        if (!res.confirm) return

        mock.deleteMyRoute(id)
          .then(() => {
            this.setData({ routes: this.data.routes.filter((r) => r.id !== Number(id)) })
            wx.showToast({ title: '已删除', icon: 'none' })
          })
          .catch(() => {})
      }
    })
  }
})
