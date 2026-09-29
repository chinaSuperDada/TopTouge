const mock = require('../../utils/mock')
const reporter = require('../../utils/errorReporter')

/** 把 ISO 时间转成「3月15日」这种简短格式 */
function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

/**
 * 活动时间的展示文案。
 *
 * 三种情况：有起止、只有开始、都没配。后两种不该显示成空的，
 * 运营建活动时经常只填标题就发布。
 */
function formatPeriod(startsAt, endsAt) {
  const s = formatDate(startsAt)
  const e = formatDate(endsAt)

  if (s && e) return `${s} - ${e}`
  if (s) return `${s} 起`
  if (e) return `截止 ${e}`
  return ''
}

Page({
  data: {
    activities: [],
    loading: true
  },

  onLoad() {
    this.load()
  },

  /**
   * 每次回到页面都重拉。
   *
   * 活动是运营随时在改的内容，用 onLoad 只拉一次的话，
   * 用户切走再回来看到的是旧数据。
   */
  onShow() {
    // 同步底部选中态 —— 自定义 tabBar 不会自己跟着页面切
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 })
    }
    this.load()
  },

  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh())
  },

  load() {
    return mock
      .getActivities()
      .then((activities) => {
        this.setData({
          activities: activities.map((a) => ({
            ...a,
            periodText: formatPeriod(a.startsAt, a.endsAt),
            // 区域：全平台的活动不显示区域标签
            regionText: a.city || a.province || '',
            // 有海报图用图，没有就用后端配的纯色底
            hasImage: Boolean(a.image)
          })),
          loading: false
        })
      })
      .catch((err) => {
        reporter.report({
          code: 'ACTIVITY_LIST_FAILED',
          message: '加载活动列表失败',
          detail: (err && err.detail) || (err && err.message) || ''
        })
        this.setData({ loading: false })
      })
  },

  /** 点活动卡片：有 link 就跳，没有就当作纯展示 */
  onActivityTap(e) {
    const { link, title } = e.currentTarget.dataset

    if (!link) {
      wx.showToast({ title: title || '活动详情待补充', icon: 'none' })
      return
    }

    // link 由后端生成，目前都是小程序内部路径
    if (!link.startsWith('/pages/')) {
      wx.showToast({ title: '活动详情待上线', icon: 'none' })
      return
    }

    wx.navigateTo({
      url: link,
      fail: () => wx.showToast({ title: '活动内容暂不可用', icon: 'none' })
    })
  }
})
