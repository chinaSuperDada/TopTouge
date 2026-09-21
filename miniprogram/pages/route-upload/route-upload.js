const api = require('../../utils/request')
const amap = require('../../utils/amap')
const { ROAD_WIDTH_OPTIONS, ROAD_WIDTH_LABELS } = require('../../utils/roadWidth')

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
        this.setData({ searching: false, planError: err.message })
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
        this.setData({ planError: err.message })
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

  buildMarkers(points) {
    if (points.length === 0) return []

    const lastIndex = points.length - 1
    return points.map((p, i) => {
      const isFirst = i === 0
      const isLast = i === lastIndex && lastIndex > 0
      const label = isFirst ? '起点' : isLast ? '终点' : `第 ${i + 1} 点`

      return {
        id: i + 1,
        latitude: p.lat,
        longitude: p.lng,
        width: isFirst || isLast ? 26 : 16,
        height: isFirst || isLast ? 26 : 16,
        callout: {
          content: label,
          color: isFirst ? amap.ACCENT_COLOR : isLast ? amap.DANGER_COLOR : amap.MUTED_COLOR,
          fontSize: 12,
          borderRadius: 4,
          padding: 4,
          display: isFirst || isLast ? 'ALWAYS' : 'BYCLICK'
        }
      }
    })
  },

  /* ==================== 表单与提交 ==================== */

  onNameInput(e) {
    this.setData({ name: e.detail.value })
  },

  onRoadWidthChange(e) {
    this.setData({ roadWidthIndex: Number(e.detail.value) })
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
    wx.showLoading({ title: '提交中…', mask: true })

    api
      .post('/api/routes', {
        name,
        roadWidth: ROAD_WIDTH_OPTIONS[this.data.roadWidthIndex].value,
        trackPoints: this.data.points
      })
      .then((route) => {
        wx.hideLoading()
        wx.showToast({ title: '上传成功', icon: 'success' })
        setTimeout(() => {
          wx.redirectTo({ url: `/pages/route-detail/route-detail?id=${route.id}` })
        }, 600)
      })
      .catch(() => {
        wx.hideLoading()
        this.setData({ submitting: false })
      })
  }
})
