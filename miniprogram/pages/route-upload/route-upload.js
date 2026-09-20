const api = require('../../utils/request')
const amap = require('../../utils/amap')

const ROAD_WIDTH_OPTIONS = [
  { value: 'narrow', label: '窄' },
  { value: 'medium', label: '中' },
  { value: 'wide', label: '宽' }
]

Page({
  data: {
    // 地图
    latitude: 39.9042,
    longitude: 116.4074,
    scale: 14,
    polyline: [],
    markers: [],

    // 表单
    name: '',
    roadWidthIndex: 1,
    roadWidthOptions: ROAD_WIDTH_OPTIONS,
    roadWidthLabels: ROAD_WIDTH_OPTIONS.map((o) => o.label),

    // 采集状态
    points: [],
    submitting: false
  },

  /**
   * 地图点击采集坐标。
   *
   * 依赖 map 组件的 tap 事件在 detail 里带 latitude/longitude。
   * 若点击无反应，多半是基础库版本过低 —— 见 README 的说明。
   */
  onMapTap(e) {
    const { latitude, longitude } = e.detail || {}
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      wx.showToast({ title: '当前基础库不支持地图取点', icon: 'none', duration: 2500 })
      return
    }

    const points = this.data.points.concat([{ lat: latitude, lng: longitude }])
    this.refreshMap(points, { latitude, longitude })
  },

  /** 撤销最后一个点 */
  onUndo() {
    if (this.data.points.length === 0) return
    const points = this.data.points.slice(0, -1)
    this.refreshMap(points)
  },

  onClear() {
    if (this.data.points.length === 0) return
    wx.showModal({
      title: '清空所有点',
      content: `已采集 ${this.data.points.length} 个点，确认全部清空？`,
      success: (res) => {
        if (res.confirm) this.refreshMap([])
      }
    })
  },

  /** 根据当前点集刷新地图上的轨迹线与标记 */
  refreshMap(points, center) {
    const track = points.map((p) => ({ lat: p.lat, lng: p.lng }))
    const patch = {
      points,
      polyline: amap.buildPolyline(track.length >= 2 ? track : []),
      markers: this.buildPointMarkers(points)
    }

    if (center) {
      patch.latitude = center.latitude
      patch.longitude = center.longitude
    } else if (points.length > 0) {
      const view = amap.fitView(track)
      patch.latitude = view.latitude
      patch.longitude = view.longitude
      if (view.scale > this.data.scale) patch.scale = view.scale
    }

    this.setData(patch)
  },

  buildPointMarkers(points) {
    if (points.length === 0) return []

    const markers = []
    const lastIndex = points.length - 1

    points.forEach((p, i) => {
      const isLast = i === lastIndex
      markers.push({
        id: i + 1,
        latitude: p.lat,
        longitude: p.lng,
        width: isLast ? 26 : 16,
        height: isLast ? 26 : 16,
        callout: isLast
          ? {
              content: `第 ${i + 1} 点`,
              // 与设计系统的 --accent 保持一致
              color: amap.ACCENT_COLOR,
              fontSize: 12,
              borderRadius: 4,
              padding: 4,
              display: 'ALWAYS'
            }
          : undefined
      })
    })

    return markers
  },

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
      wx.showToast({ title: '至少要点 2 个坐标点', icon: 'none' })
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
        // 直接进详情页看后端算出来的难度
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
