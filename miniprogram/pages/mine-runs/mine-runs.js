const mock = require('../../utils/mock')

Page({
  data: {
    runs: [],
    loading: true
  },

  onLoad() {
    mock.getMyRuns().then((runs) => {
      this.setData({
        runs: runs.map((r) => ({
          ...r,
          // 分数用颜色区分层次
          scoreClass: r.score >= 850 ? 'score-high' : r.score >= 700 ? 'score-mid' : 'score-low'
        })),
        loading: false
      })
    })
  },

  onRouteTap(e) {
    wx.navigateTo({ url: `/pages/route-detail/route-detail?id=${e.currentTarget.dataset.id}` })
  }
})
