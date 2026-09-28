const mock = require('../../utils/mock')

/** 审核状态对应的文案与样式 */
const STATUS_MAP = {
  pending: { text: '审核中', cls: 'status-pending' },
  approved: { text: '已通过', cls: 'status-ok' },
  rejected: { text: '已驳回', cls: 'status-rejected' }
}

Page({
  data: {
    routes: [],
    loading: true
  },

  onLoad() {
    mock.getMyRoutes().then((routes) => {
      this.setData({
        routes: routes.map((r) => {
          const km = r.distanceMeters / 1000
          const st = STATUS_MAP[r.reviewStatus] || STATUS_MAP.approved
          return {
            ...r,
            distanceText: km < 1 ? `${Math.round(r.distanceMeters)}m` : `${km.toFixed(1)}km`,
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
  }
})
