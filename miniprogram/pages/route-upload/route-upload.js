const api = require('../../utils/request')
const mock = require('../../utils/mock')
const reporter = require('../../utils/errorReporter')
const amap = require('../../utils/amap')
const location = require('../../utils/location')
const { ROAD_WIDTH_OPTIONS, ROAD_WIDTH_LABELS } = require('../../utils/roadWidth')

/** 路型选项。value 必须与后端 constants / validator 里的枚举一致 */
const ROAD_TYPE_OPTIONS = [
  { value: 'mountain', label: '山路' },
  { value: 'track', label: '赛道' },
  { value: 'gravel', label: '非铺装' },
  { value: 'highway', label: '公路' }
]

const ROAD_TYPE_LABELS = ROAD_TYPE_OPTIONS.map((o) => o.label)

// 搜索联想用的防抖间隔，避免每敲一个字都发请求
const SEARCH_DEBOUNCE_MS = 350

// 途经点数量上限。高德路线规划接口本身支持 16 个，
// 但再多用户也理不清顺序，UI 限到 5 个。
const MAX_WAYPOINTS = 5

Page({
  data: {
    // 采集方式：search（搜索起终点自动规划）| manual（地图点选）
    mode: 'search',

    // 地图
    latitude: 39.9042,
    longitude: 116.4074,
    scale: 14,
    polyline: [],
    markers: [],

    // 表单
    name: '',
    roadWidthIndex: 1,
    roadWidthLabels: ROAD_WIDTH_LABELS,
    roadTypeIndex: 0,
    roadTypeLabels: ROAD_TYPE_LABELS,
    // 提交时由逆地理编码填上，只用于展示
    regionText: '',

    // 采集结果
    points: [],

    // ---- 搜索模式状态 ----
    // 当前正在编辑哪个字段：source | destination | waypoint
    picking: '',
    sourceKeyword: '',
    destinationKeyword: '',
    waypointKeyword: '',
    sourcePlace: null,
    destinationPlace: null,
    // 每项形如 { key, place }。key 用于列表渲染 —— 排序时不能靠 name，
    // 两个途经点重名的话 wx:key 会错乱
    waypoints: [],
    waypointSeq: 0,
    canAddWaypoint: true,
    maxWaypoints: MAX_WAYPOINTS,
    // 新加的途经点输入框是否展开
    pickingWaypoint: false,
    candidates: [],
    searching: false,
    planning: false,
    planError: '',

    submitting: false
  },

  onLoad() {
    this._debounceTimer = null
    this.initLocation()
  },

  /**
   * 进页面先定位到当前位置。
   *
   * 用户多半就在要标记的地方附近，直接把他放到当前点比让他自己找方便。
   * 没给权限时降级到默认中心（北京），不影响后续操作。
   */
  initLocation() {
    location.getLocation().then((pos) => {
      if (!pos) return
      this.setData({ myLocation: pos, latitude: pos.lat, longitude: pos.lng, scale: 15 })
    })
  },

  /**
   * 点定位按钮：回到自己的位置。
   *
   * 微信 map 组件没有内置定位按钮，得自己画一个再调 moveToLocation。
   */
  onLocateMe() {
    location.getLocation().then((pos) => {
      if (!pos) return

      this.setData({ myLocation: pos })

      const ctx = wx.createMapContext('pickMap')
      ctx.moveToLocation({
        latitude: pos.lat,
        longitude: pos.lng,
        // 部分基础库版本不接受坐标参数，退回用系统定位
        fail: () => ctx.moveToLocation({ fail: () => {} })
      })
    })
  },

  onUnload() {
    if (this._debounceTimer) clearTimeout(this._debounceTimer)
  },

  /* ==================== 模式切换 ==================== */

  onSwitchMode(e) {
    const mode = e.currentTarget.dataset.mode
    if (mode === this.data.mode) return
    // 切换时清空已采集的点，避免两种方式的点混在一起
    this.setData({ mode, candidates: [], picking: '', pickingWaypoint: false, waypointKeyword: '' })
    this.refreshMap([])
  },

  /* ==================== 搜索模式 ==================== */

  /** 聚焦某个搜索框，之后的候选列表就填给它 */
  onFocusField(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ picking: field, candidates: [] })
  },

  onKeywordInput(e) {
    const field = e.currentTarget.dataset.field
    const keyword = e.detail.value

    this.setData({ [`${field}Keyword`]: keyword, picking: field })

    if (this._debounceTimer) clearTimeout(this._debounceTimer)

    if (!keyword.trim()) {
      this.setData({ candidates: [], searching: false })
      return
    }

    this._debounceTimer = setTimeout(() => this.runSearch(field, keyword), SEARCH_DEBOUNCE_MS)
  },

  runSearch(field, keyword) {
    this.setData({ searching: true, planError: '' })

    amap
      .searchPlaces(keyword)
      .then((list) => {
        // 用户可能已经改了输入框，过期结果丢弃
        if (this.data[`${field}Keyword`].trim() !== keyword.trim()) return
        this.setData({ candidates: list.slice(0, 10), searching: false })
      })
      .catch((err) => {
        reporter.report({
          code: 'PLACE_SEARCH_FAILED',
          message: '地点搜索失败',
          detail: (err && err.detail) || (err && err.message) || ''
        })
        this.setData({ searching: false, planError: '搜索失败，请重试' })
      })
  },

  /** 从候选列表里选中一个地点 */
  onPickCandidate(e) {
    const index = e.currentTarget.dataset.index
    const place = this.data.candidates[index]
    if (!place) return

    const field = this.data.picking
    const patch = { candidates: [], picking: '' }

    if (field === 'source') {
      patch.sourceKeyword = place.name
      patch.sourcePlace = place
    } else if (field === 'destination') {
      patch.destinationKeyword = place.name
      patch.destinationPlace = place
    } else if (field === 'waypoint') {
      // 用自增序号当 key，而不是 name —— 两个途经点可能重名
      const seq = this.data.waypointSeq + 1
      const waypoints = this.data.waypoints.concat([{ key: `w${seq}`, place }])
      patch.waypoints = waypoints
      patch.waypointSeq = seq
      patch.waypointKeyword = ''
      patch.pickingWaypoint = false
      patch.canAddWaypoint = waypoints.length < MAX_WAYPOINTS
    }

    this.setData(patch)
    this.afterPlaceChange()
  },

  /** 展开一个新途经点的输入框 */
  onAddWaypoint() {
    if (!this.data.canAddWaypoint) return
    this.setData({ pickingWaypoint: true, picking: 'waypoint', candidates: [] })
  },

  onRemoveWaypoint(e) {
    const index = e.currentTarget.dataset.index
    const waypoints = this.data.waypoints.slice()
    waypoints.splice(index, 1)
    this.setData({
      waypoints,
      canAddWaypoint: waypoints.length < MAX_WAYPOINTS
    })
    this.afterPlaceChange()
  },

  /** 途经点上移。第一个的 ↑ 是禁用的，所以 index 不会是 0 */
  onMoveWaypointUp(e) {
    const index = Number(e.currentTarget.dataset.index)
    if (index <= 0) return
    this.swapWaypoints(index, index - 1)
  },

  onMoveWaypointDown(e) {
    const index = Number(e.currentTarget.dataset.index)
    if (index >= this.data.waypoints.length - 1) return
    this.swapWaypoints(index, index + 1)
  },

  swapWaypoints(a, b) {
    const waypoints = this.data.waypoints.slice()
    const tmp = waypoints[a]
    waypoints[a] = waypoints[b]
    waypoints[b] = tmp
    this.setData({ waypoints })
    // 途经点顺序直接影响路线走向，必须重新规划
    this.afterPlaceChange()
  },

  /** 取途经点的坐标数组，供路线规划用 */
  waypointPlaces() {
    return this.data.waypoints.map((w) => w.place)
  },

  /** 起终点或途经点变化后，重新规划路线 */
  afterPlaceChange() {
    const { sourcePlace, destinationPlace } = this.data

    if (!sourcePlace || !destinationPlace) {
      this.setData({ planError: '' })
      this.refreshMap([])
      return
    }

    this.setData({ planning: true, planError: '' })

    amap
      .planDrivingRoute(sourcePlace, destinationPlace, this.waypointPlaces())
      .then((result) => {
        this.refreshMap(result.track)
      })
      .catch((err) => {
        reporter.report({
          code: 'ROUTE_PLAN_FAILED',
          message: '驾车路线规划失败',
          detail: (err && err.detail) || (err && err.message) || ''
        })
        this.setData({ planError: '没能规划出路线，换个起终点试试' })
        this.refreshMap([])
      })
      .finally(() => {
        this.setData({ planning: false })
      })
  },

  onSwapEnds() {
    const { sourcePlace, destinationPlace, sourceKeyword, destinationKeyword } = this.data
    this.setData({
      sourcePlace: destinationPlace,
      destinationPlace: sourcePlace,
      sourceKeyword: destinationKeyword,
      destinationKeyword: sourceKeyword,
      candidates: []
    })
    this.afterPlaceChange()
  },

  /* ==================== 手动点选模式 ==================== */

  onMapTap(e) {
    if (this.data.mode !== 'manual') return

    const { latitude, longitude } = e.detail || {}
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      wx.showToast({ title: '当前基础库不支持地图取点', icon: 'none', duration: 2500 })
      return
    }

    const points = this.data.points.concat([{ lat: latitude, lng: longitude, altitude: 0 }])
    this.refreshMap(points, { latitude, longitude })
  },

  onUndo() {
    if (this.data.mode !== 'manual' || this.data.points.length === 0) return
    this.refreshMap(this.data.points.slice(0, -1))
  },

  onClearPoints() {
    if (this.data.points.length === 0) return
    wx.showModal({
      title: '清空所有点',
      content: `已采集 ${this.data.points.length} 个点，确认全部清空？`,
      success: (res) => {
        if (res.confirm) this.refreshMap([])
      }
    })
  },

  /* ==================== 地图渲染 ==================== */

  /** 根据当前点集刷新地图上的轨迹线与标记 */
  refreshMap(points, center) {
    const track = points.map((p) => ({ lat: p.lat, lng: p.lng }))
    const patch = {
      points,
      polyline: amap.buildPolyline(track.length >= 2 ? track : []),
      markers: this.buildMarkers(points)
    }

    if (center) {
      patch.latitude = center.latitude
      patch.longitude = center.longitude
    } else if (points.length > 0) {
      const view = amap.fitView(track)
      patch.latitude = view.latitude
      patch.longitude = view.longitude
      patch.scale = view.scale
    }

    this.setData(patch)
  },

  /**
   * 地图上的标记。
   *
   * ⚠️ 只画起点终点，**不给每个点画标记**。
   *
   * 搜索模式规划出来的轨迹有几百上千个点，逐点画标记会让地图糊成
   * 一片彩色方块 —— 既看不出路线形状，也让地图组件卡顿。轨迹的形状
   * 由 polyline 表达就够了，标记只负责标出首尾。
   *
   * 手动点选时点少（几个到几十个），但仍然只标首尾，保持一致。
   */
  buildMarkers(points) {
    if (points.length === 0) return []

    const lastIndex = points.length - 1
    const first = points[0]
    const last = points[lastIndex]

    const markers = [
      {
        id: 1,
        latitude: first.lat,
        longitude: first.lng,
        width: 26,
        height: 26,
        callout: {
          content: '起点',
          color: amap.ACCENT_COLOR,
          fontSize: 12,
          borderRadius: 4,
          padding: 4,
          display: 'ALWAYS'
        }
      }
    ]

    // 只有一个点时首尾重合，不用再画一个终点标记
    if (lastIndex > 0) {
      markers.push({
        id: 2,
        latitude: last.lat,
        longitude: last.lng,
        width: 26,
        height: 26,
        callout: {
          content: '终点',
          color: amap.DANGER_COLOR,
          fontSize: 12,
          borderRadius: 4,
          padding: 4,
          display: 'ALWAYS'
        }
      })
    }

    return markers
  },

  /* ==================== 表单与提交 ==================== */

  onNameInput(e) {
    this.setData({ name: e.detail.value })
  },

  onRoadWidthChange(e) {
    this.setData({ roadWidthIndex: Number(e.detail.value) })
  },

  onRoadTypeChange(e) {
    this.setData({ roadTypeIndex: Number(e.detail.value) })
  },

  /**
   * 解析路线所在的省市。
   *
   * 用起点坐标反查 —— 一条跑山路线通常不会跨省，起点足够代表。
   * 解析失败不阻断提交：省市只影响列表筛选和版主辖区判断，
   * 拿不到就让后端存空串（那条路线会直接过审，见 routeService）。
   *
   * @returns {Promise<{province: string, city: string}>}
   */
  resolveRegion(point) {
    return amap
      .reverseGeocode(point)
      .then((r) => ({ province: r.province, city: r.city }))
      .catch(() => ({ province: '', city: '' }))
  },

  /**
   * 查重。
   *
   * 命中重复时不直接拒绝 —— 判断权交给用户：同一条山路的不同走法、
   * 或者对方传得不准想重传，都该允许。这里只负责提醒。
   *
   * 查重失败不阻断提交（返回 null 表示「没查到 / 查不了」）——
   * 它是锦上添花的功能，不该因为它挂了就传不了路线。
   *
   * @returns {Promise<{duplicate: object|null, similar: Array}>}
   */
  checkDuplicate(points, region) {
    return mock
      .checkDuplicate({
        trackPoints: points,
        province: region.province,
        city: region.city
      })
      .then((res) => {
        const similar = res.similar || []
        return {
          duplicate: similar.find((s) => s.level === 'duplicate') || null,
          similar
        }
      })
      .catch(() => ({ duplicate: null, similar: [] }))
  },

  /** 真正发提交请求 */
  doSubmit(name, points, region, similar) {
    return api
      .post('/api/routes', {
        name,
        roadWidth: ROAD_WIDTH_OPTIONS[this.data.roadWidthIndex].value,
        roadType: ROAD_TYPE_OPTIONS[this.data.roadTypeIndex].value,
        // 途经点只用于导航与分享，按采集顺序传
        waypoints: this.data.waypoints.map((w) => ({
          lat: w.place.lat,
          lng: w.place.lng,
          name: w.place.name
        })),
        trackPoints: points,
        province: region.province,
        city: region.city
      })
      .then((route) => {
        wx.hideLoading()

        // 说清楚到底发生了什么。有版主的城市会先走审核，
        // 这时候只说「上传成功」会让用户回首页找不到自己的路线，以为没保存
        if (route.reviewStatus === 'pending') {
          wx.showModal({
            title: '已提交审核',
            content: '本地区有版主，路线通过审核后才会出现在公开列表。你可以在「我的 - 我的路线」里查看进度。',
            showCancel: false,
            confirmText: '知道了',
            success: () => {
              wx.redirectTo({ url: `/pages/route-detail/route-detail?id=${route.id}` })
            }
          })
          return
        }

        wx.showToast({ title: '上传成功', icon: 'success' })
        setTimeout(() => {
          wx.redirectTo({ url: `/pages/route-detail/route-detail?id=${route.id}` })
        }, 600)
      })
      .catch((err) => {
        // 错误已由 request 层上报并转成白话文案，这里只需恢复按钮状态
        wx.hideLoading()
        this.setData({ submitting: false })
      })
  },

  onSubmit() {
    const name = this.data.name.trim()
    if (!name) {
      wx.showToast({ title: '请填写路线名称', icon: 'none' })
      return
    }
    if (this.data.points.length < 2) {
      wx.showToast({
        title: this.data.mode === 'search' ? '请先选好起终点' : '至少要点 2 个坐标点',
        icon: 'none'
      })
      return
    }
    if (this.data.submitting) return

    this.setData({ submitting: true })
    wx.showLoading({ title: '检查中…', mask: true })

    const points = this.data.points
    const first = points[0]

    this.resolveRegion(first).then((region) => {
      this.setData({ regionText: region.city || region.province || '' })

      this.checkDuplicate(points, region).then(({ duplicate, similar }) => {
        // 没查到重复，直接传
        if (!duplicate) {
          wx.showLoading({ title: '提交中…', mask: true })
          this.doSubmit(name, points, region, similar)
          return
        }

        wx.hideLoading()

        // 查到高度重合的路线 —— 让用户自己决定
        wx.showModal({
          title: '发现相似路线',
          content: `「${duplicate.name}」与这条路线重合度 ${Math.round(
            duplicate.overlapRatio * 100
          )}%，可能走的是同一条路。仍要上传吗？`,
          confirmText: '仍要上传',
          cancelText: '先看看',
          success: (res) => {
            if (res.confirm) {
              wx.showLoading({ title: '提交中…', mask: true })
              this.doSubmit(name, points, region, similar)
              return
            }

            // 「先看看」跳去已有那条 —— 多半用户就是想去看看
            this.setData({ submitting: false })
            wx.navigateTo({
              url: `/pages/route-detail/route-detail?id=${duplicate.id}`
            })
          }
        })
      })
    })
  }
})
