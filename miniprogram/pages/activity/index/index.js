const activityMock = require('../../../utils/activityMock')
const reporter = require('../../../utils/errorReporter')

/** 把 ISO 时间转成「10月4日 周三 08:30」 */
function formatMeetAt(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()]
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}月${d.getDate()}日 ${week} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

Page({
  data: {
    // all = 全部活动 | mine = 我的活动
    mode: 'all',

    filters: {
      place: { label: '地点', value: '不限', options: ['不限', '杭州市', '湖州市', '宁波市'] },
      time: { label: '时间', value: '不限', options: ['不限', '今天', '本周', '本月'],
              values: ['all', 'today', 'week', 'month'] },
      difficulty: { label: '难度', value: '不限', options: ['不限', '休闲', '进阶', '硬核'] },
      sort: { label: '排序', value: '离我最近', options: ['离我最近', '人数最多', '最新发布', '集合最早'],
              values: ['nearby', 'people', 'newest', 'time'] }
    },

    activities: [],
    loading: true,
    error: ''
  },

  onLoad() {
    this.load()
  },

  onShow() {
    // 同步底部选中态 —— 自定义 tabBar 不会自己跟着页面切
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 })
    }
    // 从创建 / 加入 / 详情返回时刷新，保证状态是最新的
    if (!this.data.loading) this.load()
  },

  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh())
  },

  /** 拉列表（全部 or 我的） */
  load() {
    this.setData({ loading: true, error: '' })

    const { mode, filters } = this.data

    const task = mode === 'mine'
      ? activityMock.listMyActivities('all').then((res) => res.activities)
      : activityMock.listActivities({
          difficulty: filters.difficulty.value === '不限' ? 'all' : filters.difficulty.value,
          sort: filters.sort.values[filters.sort.options.indexOf(filters.sort.value)],
          timeRange: filters.time.values[filters.time.options.indexOf(filters.time.value)]
        }).then((res) => res.activities)

    return task
      .then((list) => {
        this.setData({
          activities: list.map((a) => ({ ...a, meetText: formatMeetAt(a.meetAt) })),
          loading: false
        })
      })
      .catch((err) => {
        reporter.report({
          code: 'ACTIVITY_LIST_FAILED',
          message: '加载活动列表失败',
          detail: (err && err.detail) || (err && err.message) || ''
        })
        this.setData({ loading: false, error: '加载失败，下拉重试' })
      })
  },

  /* ==================== 交互 ==================== */

  onModeTap(e) {
    const mode = e.currentTarget.dataset.mode
    if (mode === this.data.mode) return
    this.setData({ mode }, () => this.load())
  },

  /** 筛选条：点哪个弹哪个 picker */
  onFilterTap(e) {
    const key = e.currentTarget.dataset.key
    const filter = this.data.filters[key]
    if (!filter) return

    wx.showActionSheet({
      itemList: filter.options,
      success: (res) => {
        this.setData({ [`filters.${key}.value`]: filter.options[res.tapIndex] }, () => this.load())
      },
      fail: () => {}
    })
  },

  onCardTap(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/activity/detail/detail?id=${id}` })
  },

  /**
   * 右下角加号：弹「创建 / 加入」。
   *
   * 创建和加入都不该是主导航项（低频），挂在加号下最合适。
   */
  onFabTap() {
    wx.showActionSheet({
      itemList: ['创建跑山活动', '加入房间（房间号 + 密码）'],
      success: (res) => {
        const url = res.tapIndex === 0
          ? '/pages/activity/create/create'
          : '/pages/activity/join/join'
        wx.navigateTo({ url })
      },
      fail: () => {}
    })
  }
})
