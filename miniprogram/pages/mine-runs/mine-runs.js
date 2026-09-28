const mock = require('../../utils/mock')
const { formatTime } = require('../../utils/format')

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
          timeText: formatTime(r.createdAt),
          // 分数分三档配色，一眼看出哪次跑得好
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
