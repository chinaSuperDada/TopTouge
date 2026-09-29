const api = require('../../utils/request')
const mock = require('../../utils/mock')
const location = require('../../utils/location')
const amap = require('../../utils/amap')
const navigation = require('../../utils/navigation')
const reporter = require('../../utils/errorReporter')
const { isLoopTrack } = require('../../utils/trackSimplify')
const { displayName } = require('../../utils/user')

const ROAD_TYPE_LABEL = { mountain: '山路', track: '赛道', gravel: '非铺装', highway: '公路' }

/**
 * 审核状态的提示文案。
 *
 * 只对「未通过」的状态给提示 —— 已通过的路线不该占地方，
 * 用户也不需要看到「已通过」这种无信息量的标签。
 *
 * @returns {string} 空串表示不显示提示条
 */
function describeReviewStatus(route) {
  if (!route) return ''

  switch (route.reviewStatus) {
    case 'pending':
      return '这条路线正在审核，通过后才会出现在公开列表'
    case 'rejected':
      return route.reviewReason
        ? `这条路线已被下架：${route.reviewReason}`
        : '这条路线已被下架'
    case 'deleted':
      return '这条路线已被删除'
    default:
      return ''
  }
}

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

    // 收藏状态。favoriting 用来防连点
    favorited: false,
    favoriting: false,

    // 相似路线。后端按轨迹重合度算，见 routeService.findSimilarToRoute
    similar: [],

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

    // 刚制作完跳过来的：提示可以分享给好友
    this._justCreated = query.justCreated === '1'
  },

  /**
   * 刚创建完，问用户要不要分享。
   *
   * 用 wx.showModal 而不是直接弹分享面板 —— 微信不允许主动调起分享，
   * 必须用户点按钮触发。所以先问一句，他点了才走 onShareAppMessage。
   *
   * 只弹一次：_justCreated 消费掉就清空，之后返回本页不再打扰。
   */
  offerShareIfJustCreated() {
    if (!this._justCreated) return
    this._justCreated = false

    wx.showModal({
      title: '路线已保存',
      content: '分享给微信好友，他们点开就能看到这条路线并直接开跑。',
      confirmText: '分享给好友',
      cancelText: '暂不',
      success: (res) => {
        if (!res.confirm) return
        // 这个按钮点了才会触发 onShareAppMessage（微信的限制）
        wx.showShareMenu({
          withShareTicket: true,
          menus: ['shareAppMessage']
        })
        wx.showToast({ title: '点右上角「···」分享', icon: 'none', duration: 2500 })
      }
    })
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
      this.setData({
        ranking: ranking.map((r) => ({
          ...r,
          // 没设昵称的用 openid 派生的短标识，别直接把 openid 显示出来
          userName: r.nickName || displayName(r.userId),
          avatarText: (r.nickName || displayName(r.userId)).slice(-2)
        }))
      })
    })
  },

  /**
   * 相似路线。
   *
   * 后端按轨迹重合度算（见 module 02 §2.1）。单独一个请求 ——
   * 它要做几何计算，比详情本身慢，不该拖慢主内容的首屏。
   * 所以详情渲染完再拉，失败也不影响主内容（静默即可，不弹提示）。
   */
  loadSimilar() {
    return mock
      .getSimilarRoutes(this.data.routeId)
      .then((list) => {
        const km = (m) => (m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`)

        this.setData({
          similar: list.map((r) => ({
            ...r,
            distanceText: km(r.distanceMeters),
            // 重合度转成百分比整数，比小数好读
            overlapText: Math.round(r.overlapRatio * 100),
            // duplicate 档位要额外提示「可能是同一条路线」
            isDuplicate: r.level === 'duplicate'
          }))
        })
      })
      .catch(() => {
        // 相似路线是锦上添花，拉不到就不显示这个区块
        this.setData({ similar: [] })
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
        // 主内容渲染完再拉相似路线 —— 它要做几何计算，比详情慢，
        // 并联会让首屏等更久
        this.loadSimilar()
        // 刚制作完的话，问一句要不要分享
        this.offerShareIfJustCreated()
      })
      .catch((err) => {
        // err.message 已经是给人看的白话（见 utils/request.js），
        // 技术细节在 err.detail 里，只用于上报
        reporter.report({
          code: 'ROUTE_DETAIL_FAILED',
          message: '加载路线详情失败',
          detail: (err && err.detail) || (err && err.message) || '',
          url: (err && err.url) || '',
          statusCode: (err && err.statusCode) || null
        })
        this.setData({ loading: false, error: '路线加载失败，请下拉重试' })
      })
  },

  applyRoute(route) {
    const track = route.track || []
    const view = amap.fitView(track)

    const km = route.distanceMeters / 1000

    this.setData({
      route: {
        ...route,
        distanceText: km < 1 ? `${Math.round(route.distanceMeters)}m` : `${km.toFixed(1)}km`,
        roadTypeText: ROAD_TYPE_LABEL[route.roadType] || '山路'
      },
      favorited: Boolean(route.favorited),
      reviewNotice: describeReviewStatus(route),
      // 用后端给的总数，不是内嵌评论数组的长度 ——
      // 内嵌只有最近 10 条，用长度当总数会一直卡在 10
      commentCount: typeof route.commentCount === 'number'
        ? route.commentCount
        : (route.comments || []).length,
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
   * 收藏 / 取消收藏。
   *
   * 先乐观更新再发请求 —— 收藏是高频轻操作，等一个来回再变色会显得卡。
   * 失败时回滚，用户看到按钮弹回去了就知道没成功。
   */
  onToggleFavorite() {
    if (this.data.favoriting) return

    const next = !this.data.favorited
    this.setData({ favorited: next, favoriting: true })

    const call = next
      ? mock.addFavorite(this.data.routeId)
      : mock.removeFavorite(this.data.routeId)

    call
      .then(() => {
        this.setData({ favoriting: false })
        wx.showToast({ title: next ? '已收藏' : '已取消收藏', icon: 'none' })
      })
      .catch(() => {
        this.setData({ favorited: !next, favoriting: false })
      })
  },

  /**
   * 点相似路线。
   *
   * 用 redirectTo 而不是 navigateTo —— 相似路线之间可以来回点，
   * 用 navigateTo 会一层层堆栈，用户要按好几次返回才出得去。
   */
  onSimilarTap(e) {
    const id = Number(e.currentTarget.dataset.id)
    if (!id || id === this.data.routeId) return

    wx.redirectTo({ url: `/pages/route-detail/route-detail?id=${id}` })
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
        reporter.report({
          code: 'SHARE_LINK_FAILED',
          message: '详情页生成高德导航链接失败',
          detail: (err && err.detail) || (err && err.message) || ''
        })
        wx.showToast({ title: '生成导航链接失败，请稍后再试', icon: 'none' })
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
   * 先乐观更新（本地插入一条 + 计数加一），再发请求 ——
   * 用户立刻看到自己的评论，不用等一个来回。失败了把那一条撤掉。
   */
  onCommentSubmit(e) {
    const content = e.detail.content
    const component = this.selectComponent('#commentList')
    const app = getApp()

    // 先用本地对象乐观更新 —— 用户立刻看到自己发的评论，
    // 不用等请求回来。失败了再提示
    const optimistic = {
      id: Date.now(),
      userId: app.globalData.userId,
      content,
      createdAt: new Date().toISOString()
    }

    const comments = [optimistic, ...(this.data.route.comments || [])]
    // 计数是在原总数上加一 —— 不能写成 comments.length，
    // 那会把它重新压回内嵌条数（最多 10）
    this.setData({ 'route.comments': comments, commentCount: this.data.commentCount + 1 })

    api
      .post(`/api/routes/${this.data.routeId}/comments`, { content })
      .then(() => {
        wx.showToast({ title: '已发布', icon: 'success' })
        if (component) component.clearInput()
      })
      .catch(() => {
        // 失败就把乐观更新的那条撤掉
        this.setData({
          'route.comments': this.data.route.comments.filter((c) => c.id !== optimistic.id),
          commentCount: this.data.commentCount - 1
        })
      })
      .finally(() => {
        if (component) component.setSubmitting(false)
      })
  },

  onRoadConditionSubmit(e) {
    const content = e.detail.content
    const component = this.selectComponent('#roadConditionList')
    const app = getApp()

    const optimistic = {
      id: Date.now(),
      userId: app.globalData.userId,
      content,
      createdAt: new Date().toISOString()
    }

    this.setData({
      'route.roadConditions': [optimistic, ...(this.data.route.roadConditions || [])]
    })

    api
      .post(`/api/routes/${this.data.routeId}/road-conditions`, { content })
      .then(() => {
        wx.showToast({ title: '已发布', icon: 'success' })
        if (component) component.clearInput()
      })
      .catch(() => {
        this.setData({
          'route.roadConditions': this.data.route.roadConditions.filter((c) => c.id !== optimistic.id)
        })
      })
      .finally(() => {
        if (component) component.setSubmitting(false)
      })
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
