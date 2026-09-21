const api = require('../../utils/request')
const amap = require('../../utils/amap')
const navigation = require('../../utils/navigation')
const { isLoopTrack } = require('../../utils/trackSimplify')

Page({
  data: {
    routeId: null,
    route: null,
    loading: true,
    error: '',

    // 地图
    latitude: 39.9042,
    longitude: 116.4074,
    scale: 11,
    polyline: [],
    markers: [],

    // 导航：闭环路线用外部导航没有意义（起点=终点），要提示用户
    isLoop: false,
    navigating: false
  },

  onLoad(query) {
    const routeId = Number(query.id)
    if (!routeId) {
      this.setData({ loading: false, error: '缺少路线 id' })
      return
    }
    this.setData({ routeId })
    this.loadDetail()
  },

  loadDetail() {
    this.setData({ loading: true, error: '' })

    return api
      .get(`/api/routes/${this.data.routeId}`, { showError: false })
      .then((route) => {
        this.applyRoute(route)
      })
      .catch((err) => {
        this.setData({ loading: false, error: err.message })
      })
  },

  applyRoute(route) {
    // 详情接口默认返回抽稀后的 track，画地图够用且传输量小
    const track = route.track && route.track.length ? route.track : route.referenceTrack
    const view = amap.fitView(track)

    this.setData({
      route,
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

  /** 评论提交：组件把内容抛上来，这里负责发请求和刷新 */
  onCommentSubmit(e) {
    const content = e.detail.content
    const component = this.selectComponent('#commentList')

    api
      .post(`/api/routes/${this.data.routeId}/comments`, { content })
      .then(() => {
        wx.showToast({ title: '已发布', icon: 'success' })
        if (component) component.clearInput()
        return this.loadDetail()
      })
      .catch(() => {})
      .finally(() => {
        if (component) component.setSubmitting(false)
      })
  },

  onRoadConditionSubmit(e) {
    const content = e.detail.content
    const component = this.selectComponent('#roadConditionList')

    api
      .post(`/api/routes/${this.data.routeId}/road-conditions`, { content })
      .then(() => {
        wx.showToast({ title: '已发布', icon: 'success' })
        if (component) component.clearInput()
        return this.loadDetail()
      })
      .catch(() => {})
      .finally(() => {
        if (component) component.setSubmitting(false)
      })
  },

  /** 阶段二实现：跑山与算分 */
  onStartRun() {
    wx.showToast({ title: '跑山功能将在下一阶段开放', icon: 'none', duration: 2000 })
  },

  onRetry() {
    this.loadDetail()
  }
})
