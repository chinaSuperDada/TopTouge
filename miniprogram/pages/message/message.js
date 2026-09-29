const reporter = require('../../utils/errorReporter')

/**
 * 消息。
 *
 * ⚠️ **功能还没做**。这个页面目前只占住 TabBar 的一个位置，
 * 让底部导航对称（跑山路线 / 跑山活动 / ＋ / 消息 / 我的）。
 *
 * 要做的时候需要的几块：
 *   - 会话列表（群 + 私信合并按时间排）
 *   - 未读计数，TabBar 上要显示小红点
 *   - 消息推送（订阅消息或长连接）
 *   - 服务端：conversations / messages 两张表，以及群成员的权限模型
 */
Page({
  data: {},

  onShow() {
    // 同步底部选中态 —— 自定义 tabBar 不会自己跟着页面切
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3 })
    }
  }
})
