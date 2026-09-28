const mock = require('../../utils/mock')
const location = require('../../utils/location')
const amap = require('../../utils/amap')
const navigation = require('../../utils/navigation')
const { isLoopTrack } = require('../../utils/trackSimplify')

Page({
  data: {
    routeId: null,
    route: null,
    loading: true,
    error: '',

    // 三个 tab：路线主页 / 路线排名 / 评论
    activeTab: 'home',
    commentCount: 0,
    ranking: [],

    // 地图
    latitude: 39.9042,
    longitude: 116.4074,
    scale: 11,
    polyline: [],
    markers: [],

    // 闭环路线用外部导航没有意义（起点=终点），要提示用户
    isLoop: false,
    navigating: false,

    // 自己的位置，拿到后地图上会显示蓝点
    myLocation: null
  },

  onLoad(query) {
    const routeId = Number(query.id)
    if (!routeId) {
      this.setData({ loading: false, error: '缺少路线 id' })
      return
    }
    this.setData({ routeId })
    this.loadDetail()
    this.requestLocation()
  },

  /**
   * 申请定位权限。
   *
   * map 组件的 show-location 只负责「已授权时显示蓝点」，
   * 它不会主动申请权限 —— 必须自己调一次定位 API 触发系统弹窗。
   * 不调的话，用户在地图上永远看不到自己的位置。
   *
   * 拿不到位置也不影响看路线，所以失败静默处理。
   */
  requestLocation() {
    location
      .getLocation({ silent: true })
      .then((pos) => {
        if (pos) this.setData({ myLocation: pos })
      })
      .catch(() => {})
  },

  /**
   * 点定位按钮：把地图移到自己所在位置。
   *
   * 微信 map 组件没有内置定位按钮，得自己画一个再调 moveToLocation。
   * 这次不传 silent —— 用户主动点的定位，没权限时应该引导他去开。
   */
  onLocateMe() {
    location.getLocation().then((pos) => {
      if (!pos) return

      this.setData({ myLocation: pos })

      const ctx = wx.createMapContext('routeMap')
      ctx.moveToLocation({
        latitude: pos.lat,
        longitude: pos.lng,
        // 部分基础库版本不接受坐标参数，退回用系统定位
        fail: () => ctx.moveToLocation({ fail: () => {} })
      })
    })
  },

  onTabChange(e) {
    const tab = e.currentTarget.dataset.tab
    if (tab === this.data.activeTab) return

    this.setData({ activeTab: tab })

    // 排名数据按需加载，切到那个 tab 才拉
    if (tab === 'rank' && this.data.ranking.length === 0) {
      this.loadRanking()
    }
  },

  loadRanking() {
    mock.getRanking(this.data.routeId).then((ranking) => {
      this.setData({ ranking })
    })
  },

  /**
   * 分享给好友。
   *
   * 带上路线 id，好友点开直接进这条路线的详情页。
   * 标题用路线名 + 关键数据，比默认的「XX小程序」有信息量。
   */
  onShareAppMessage() {
    const route = this.data.route

    if (!route) {
      return {
        title: 'TopTouge 跑山路线',
        path: '/pages/route-list/route-list'
      }
    }

    const km = (route.distanceMeters / 1000).toFixed(1)
    const stars = '★'.repeat(Math.max(1, Math.min(5, route.difficultyStars)))

    return {
      title: `${route.name} · ${km}km · ${route.curveCount}个弯 ${stars}`,
      path: `/pages/route-detail/route-detail?id=${route.id}`
    }
  },

  /** 分享到朋友圈。只有页面配置里允许了才会出现入口 */
  onShareTimeline() {
    const route = this.data.route
    if (!route) return { title: 'TopTouge 跑山路线' }

    const km = (route.distanceMeters / 1000).toFixed(1)
    return {
      title: `${route.name} · ${km}km · ${route.curveCount}个弯`,
      query: `id=${route.id}`
    }
  },

  loadDetail() {
    this.setData({ loading: true, error: '' })

    return mock
      .getRoute(this.data.routeId)
      .then((route) => {
        this.applyRoute(route)
      })
      .catch((err) => {
        this.setData({ loading: false, error: err.message })
      })
  },

  applyRoute(route) {
    const track = route.track || []
    const view = amap.fitView(track)

    this.setData({
      route,
      commentCount: (route.comments || []).length,
      loading: false,
      error: '',
      latitude: view.latitude,
      longitude: view.longitude,
      scale: view.scale,
      polyline: amap.buildPolyline(track),
      markers: amap.buildMarkers(route),
      isLoop: isLoopTrack(track)
    })
  },

  /**
   * 用高德导航打开这条路线。
   *
   * 导航需要全量轨迹来抽关键弯道点（详情接口给的是抽稀过的 displayTrack，
   * 细节已经丢了），所以这里单独拉一次全量数据。
   *
   * 为什么走 URI 而不是 wx.openLocation：
   * 后者只能传一个坐标点，无法表达「按这条路线走」。
   * URI 支持 via 途经点，能把抽稀后的关键点串成一条路径。
   *
   * 小程序无法直接唤起外部 App，只能把链接复制给用户，
   * 由用户在高德地图或浏览器里粘贴打开。
   */
  /**
   * 分享路线：把高德导航链接复制到剪贴板。
   *
   * 为什么是复制而不是直接跳转：
   *   直达高德 App 的官方接口只有 MapContext.openMapApp，但它只能传一个终点，
   *   带不了途经点。而「跑这条路线」的关键恰恰是途经点 —— 少了它，
   *   高德会按自己的算法规划，走的不一定是你要跑的那条路。
   *
   *   生成链接这条路能把起终点和全部途经点都带上。用户在聊天窗口发送后，
   *   微信会把它渲染成高德卡片，点击即用高德打开完整路线。
   *
   * 放弃的方案（都验证过，不可行）：
   *   - wx.navigateToMiniProgram 跳高德小程序：高德没有单独的地图小程序
   *   - openMapApp：无途经点参数
   *   - web-view 打开 amap.com：微信不允许把高德域名配成业务域名
   */
  onNavigate() {
    const route = this.routeForNavigation()
    if (!route) return

    navigation
      .copyAmapShareLink(route)
      .then(() => {
        const n = (route.waypoints || []).length
        wx.showModal({
          title: '路线链接已复制',
          content:
            n > 0
              ? `已包含起点、终点和 ${n} 个途经点。粘贴到微信发送，对方点击后即可用高德打开完整路线。`
              : '粘贴到微信发送，对方点击后即可用高德打开这条路线。',
          showCancel: false,
          confirmText: '知道了'
        })
      })
      .catch((err) => {
        wx.showToast({ title: err.message || '复制失败', icon: 'none' })
      })
  },

  /** 组装导航需要的数据，缺失时提示并返回 null */
  routeForNavigation() {
    const r = this.data.route
    if (!r || !r.startPoint || !r.endPoint) {
      wx.showToast({ title: '路线缺少起终点，无法生成链接', icon: 'none' })
      return null
    }

    return {
      name: r.name,
      startPoint: r.startPoint,
      endPoint: r.endPoint,
      waypoints: r.waypoints || []
    }
  },

  /**
   * 评论提交。
   *
   * 后端接口还没实现，先只往本地数组里塞一条，让交互能走通。
   * 接后端后换成 request.post(`/api/routes/${id}/comments`, { content })，
   * 并把返回的评论插到列表头部。
   */
  onCommentSubmit(e) {
    const content = e.detail.content
    const component = this.selectComponent('#commentList')
    const app = getApp()

    const comment = {
      id: Date.now(),
      userId: app.globalData.userId,
      content,
      createdAt: new Date().toISOString()
    }

    const comments = [comment, ...(this.data.route.comments || [])]

    this.setData({
      'route.comments': comments,
      commentCount: comments.length
    })

    wx.showToast({ title: '已发布', icon: 'success' })
    if (component) {
      component.clearInput()
      component.setSubmitting(false)
    }
  },

  onRoadConditionSubmit(e) {
    const content = e.detail.content
    const component = this.selectComponent('#roadConditionList')
    const app = getApp()

    const item = {
      id: Date.now(),
      userId: app.globalData.userId,
      content,
      createdAt: new Date().toISOString()
    }

    this.setData({
      'route.roadConditions': [item, ...(this.data.route.roadConditions || [])]
    })

    wx.showToast({ title: '已发布', icon: 'success' })
    if (component) {
      component.clearInput()
      component.setSubmitting(false)
    }
  },

  /** 跑山：进跑山页，带上路线信息 */
  onStartRun() {
    const route = this.data.route
    if (!route) return

    wx.navigateTo({
      url: `/pages/run/run?id=${route.id}&name=${encodeURIComponent(route.name)}`
    })
  },

  onRetry() {
    this.loadDetail()
  }
})
