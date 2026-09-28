/**
 * 跑山结果页。
 *
 * ⚠️ 任务书硬性要求：**只展示综合评分和排名，不展示用时、速度、
 * 任何原始时间数值。** 改这个页面时不要往里加时间相关的东西。
 *
 * 数据从 URL query 传进来 —— 跑山页算完直接跳过来，不在这里重新请求。
 */
Page({
  data: {
    mode: 'ranked', // ranked | local

    // ranked 模式
    score: 0,
    rank: 0,
    total: 0,

    // local 模式：不参与算分，只在本机看统计
    localElapsed: '',
    localDistance: ''
  },

  onLoad(query) {
    const mode = query.mode === 'local' ? 'local' : 'ranked'

    if (mode === 'local') {
      const seconds = Number(query.elapsed) || 0
      const meters = Number(query.distance) || 0

      this.setData({
        mode,
        localElapsed: formatDuration(seconds),
        localDistance: meters < 1000
          ? `${Math.round(meters)}m`
          : `${(meters / 1000).toFixed(2)}km`
      })
      return
    }

    this.setData({
      mode,
      score: Number(query.score) || 0,
      rank: Number(query.rank) || 0,
      total: Number(query.total) || 0
    })
  },

  /**
   * 回路线详情页。
   * 页面栈是 [详情页, 跑山页, 结果页]，退两层正好回到详情。
   */
  onBackToRoute() {
    const pages = getCurrentPages()
    wx.navigateBack({ delta: pages.length >= 3 ? 2 : 1 })
  },

  onShareAppMessage() {
    if (this.data.mode === 'local') {
      return { title: 'TopTouge 跑山路线', path: '/pages/route-list/route-list' }
    }

    return {
      title: `我在这条路线拿了 ${this.data.score} 分，第 ${this.data.rank} 名`,
      path: '/pages/route-list/route-list'
    }
  }
})

function formatDuration(seconds) {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`
}
