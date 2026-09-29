/**
 * 自定义 tabBar。
 *
 * ⚠️ 样式全部写死颜色，**不要用 CSS 变量**。
 *
 * 原因：custom-tab-bar 渲染在 page 标签之外，拿不到 app.wxss 里
 * 定义在 page 选择器下的变量。用了 var() 会静默失效 —— 表现为
 * 深色底上元素变成默认黑色，看起来像「没渲染」，极难排查。
 *
 * 改配色时这里的颜色要跟着 styles/tokens.wxss 手动同步。
 */

const COLOR_ACTIVE = '#0c9cfc'    // 对应 --accent
const COLOR_NORMAL = '#6e6e6e'    // 对应 --text-tertiary
const COLOR_BG = '#141414'        // 对应 --bg-surface

Component({
  data: {
    selected: 0,
    colorActive: COLOR_ACTIVE,
    colorNormal: COLOR_NORMAL,
    colorBg: COLOR_BG,
    tabs: [
      { key: 'home', label: '跑山路线', path: '/pages/route-list/route-list' },
      { key: 'activity', label: '跑山活动', path: '/pages/route-activity/route-activity' },
      { key: 'mine', label: '我的', path: '/pages/mine/mine' }
    ]
  },

  methods: {
    /**
     * 普通 tab 切换。
     * 必须用 switchTab —— 目标页在 app.json 的 tabBar.list 里，
     * 用 navigateTo 会报错。
     */
    onTabTap(e) {
      const index = Number(e.currentTarget.dataset.index)
      const tab = this.data.tabs[index]
      if (!tab || !tab.path || index === this.data.selected) return

      this.setData({ selected: index })
      wx.switchTab({ url: tab.path })
    },

    /**
     * 中间的加号：不是切换页面，而是弹制作方式的选择。
     *
     * 所以不改 selected —— 用户选完之后仍然停留在当前 tab，
     * 符合「新建后返回原页面」的预期。
     */
    onCreateTap() {
      wx.showActionSheet({
        itemList: ['搜索地点', '地图点选', '录制轨迹'],
        success: (res) => {
          const urls = [
            '/pages/route-upload/route-upload?mode=search',
            '/pages/route-upload/route-upload?mode=manual',
            '/pages/route-record/route-record'
          ]
          const url = urls[res.tapIndex]
          if (url) wx.navigateTo({ url })
        },
        fail: () => {}
      })
    }
  }
})
