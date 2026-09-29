const env = require('../../utils/env')

Page({
  data: {
    version: '1.0.0',
    modeText: '',
    locationDesc: '未授权'
  },

  onLoad() {
    // 运行模式直接读 env 的判断结果 —— 这里是唯一能把「为什么连不上」
    // 讲清楚的地方，用户报障时先让他看这一行
    this.setData({
      modeText: env.useCloud() ? '云端（云托管）' : '本地直连'
    })
  },

  onShow() {
    this.refreshPermission()
  },

  /** 位置授权是异步查的，每次回到页面都刷新一下 */
  refreshPermission() {
    wx.getSetting({
      success: (res) => {
        const granted = res.authSetting['scope.userLocation']
        this.setData({
          locationDesc: granted ? '已授权' : granted === false ? '已拒绝，点击去开启' : '未授权'
        })
      }
    })
  },

  onOpenPermission() {
    wx.openSetting({
      success: () => this.refreshPermission(),
      fail: () => {}
    })
  },

  /**
   * 清缓存。
   *
   * 只清 storage —— 路线的实际数据在服务端，这里清掉的是本机临时状态
   * （比如上次未提交的录制）。文案里必须说清楚，否则用户会以为路线没了。
   */
  onClearCache() {
    wx.showModal({
      title: '清除本地缓存',
      content: '只清理本机临时数据，你的路线、成绩和收藏都在服务器上，不会丢失。',
      confirmText: '清除',
      success: (res) => {
        if (!res.confirm) return
        wx.clearStorage({
          success: () => wx.showToast({ title: '已清除', icon: 'success' }),
          fail: () => wx.showToast({ title: '清除失败', icon: 'none' })
        })
      }
    })
  },

  onCopyVersion() {
    wx.setClipboardData({
      data: `TopTouge v${this.data.version} (${this.data.modeText})`,
      success: () => wx.showToast({ title: '已复制', icon: 'none' })
    })
  }
})
