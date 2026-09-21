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
   * 导航：选方式 → 跳对应小程序，或复制高德链接。
   *
   * 两条路并存是因为能力不同：
   *   - 跳小程序：体验好（少一步粘贴），但只能传起终点
   *   - 复制链接：要用户自己粘贴，但能把途经点一起带上
   *
   * wx.navigateToMiniProgram 必须在用户点击的手势链路里调用，
   * 所以整个选择 + 跳转都放在同一个点击回调里，中间不插异步。
   */
  onNavigate() {
    const platforms = navigation.availablePlatforms()

    const items = platforms.map((p) => `用${p.label}打开`)
    items.push('复制高德路线链接（含途经点）')

    wx.showActionSheet({
      itemList: items,
      success: (res) => {
        if (res.tapIndex < platforms.length) {
          this.openNavigation(platforms[res.tapIndex].key)
        } else {
          this.copyAmapLink()
        }
      },
      fail: () => {}
    })
  },

  openNavigation(key) {
    const route = this.routeForNavigation()
    if (!route) return

    navigation.navigateWith(key, route).catch((err) => {
      wx.showToast({ title: err.message || '打开导航失败', icon: 'none', duration: 3000 })
    })
  },

  copyAmapLink() {
    const route = this.routeForNavigation()
    if (!route) return

    navigation
      .copyAmapShareLink(route)
      .then(() => {
        wx.showModal({
          title: '链接已复制',
          content: '粘贴到微信群或聊天窗口，好友点击后会打开高德并带上途经点。',
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
      wx.showToast({ title: '路线缺少起终点，无法导航', icon: 'none' })
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
