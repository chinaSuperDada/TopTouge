const api = require('../../utils/request')
const amap = require('../../utils/amap')
const { buildNavigationUrl, isLoopTrack } = require('../../utils/trackSimplify')

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
    isLoop: false
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
    const view = amap.fitView(route.referenceTrack)

    this.navigationUrl = buildNavigationUrl(route.referenceTrack, {
      destination: route.name
    })

    this.setData({
      route,
      loading: false,
      error: '',
      latitude: view.latitude,
      longitude: view.longitude,
      scale: view.scale,
      polyline: amap.buildPolyline(route.referenceTrack),
      markers: amap.buildMarkers(route),
      isLoop: isLoopTrack(route.referenceTrack)
    })
  },

  /**
   * 用高德导航打开这条路线。
   *
   * 为什么走 URI 而不是 wx.openLocation：
   * 后者只能传一个坐标点，无法表达「按这条路线走」。
   * URI 支持 via 途经点，能把抽稀后的关键点串成一条路径。
   *
   * 小程序无法直接唤起外部 App，只能把链接交给用户 ——
   * 复制到剪贴板后在高德/浏览器里粘贴打开。
   */
  onNavigate() {
    if (!this.navigationUrl) {
      wx.showToast({ title: '这条路线太短，无法导航', icon: 'none' })
      return
    }

    wx.showModal({
      title: this.data.isLoop ? '环线导航' : '用高德导航',
      content: this.data.isLoop
        ? '这是条环线，起终点重合。导航会带你到路线最远处，请沿路线自行绕行。链接将复制到剪贴板。'
        : '导航链接将复制到剪贴板，粘贴到高德地图或浏览器即可打开。',
      confirmText: '复制链接',
      success: (res) => {
        if (!res.confirm) return
        wx.setClipboardData({
          data: this.navigationUrl,
          success: () => {
            wx.showToast({ title: '链接已复制', icon: 'success' })
          }
        })
      }
    })
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
