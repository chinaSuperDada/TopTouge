Component({
  data: {
    selected: 0,
    tabs: [
      { key: 'home', label: '首页', path: '/pages/route-list/route-list' },
      { key: 'create', label: '', path: '' }, // 中间凸起按钮，单独渲染
      { key: 'mine', label: '我的', path: '/pages/mine/mine' }
    ]
  },

  methods: {
    /** 普通 tab 切换。必须用 switchTab，且目标页必须在 tabBar 列表里 */
    onTabTap(e) {
      const index = Number(e.currentTarget.dataset.index)
      const tab = this.data.tabs[index]
      if (!tab || !tab.path || index === this.data.selected) return

      this.setData({ selected: index })
      wx.switchTab({ url: tab.path })
    },

    /**
     * 中间的加号：不是切换页面，而是弹出制作方式的选择。
     *
     * 所以它不走 switchTab，也不改 selected —— 用户选完之后
     * 仍然停留在当前 tab，符合「新建后返回原页面」的预期。
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
