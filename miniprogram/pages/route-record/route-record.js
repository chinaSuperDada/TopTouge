const api = require('../../utils/request')
const amap = require('../../utils/amap')
const { ROAD_WIDTH_OPTIONS, ROAD_WIDTH_LABELS } = require('../../utils/roadWidth')

// 采点节流：GPS 每 2 秒回一次，但停车等红灯时点会扎堆，
// 位移小于这个距离就不记，避免轨迹里全是同一个位置。
const MIN_MOVE_METERS = 8

// 单次录制的点数上限。按每 10 米一个点算，10000 点足够 100km，
// 超过说明定位异常（漂移），不再累积。
const MAX_RECORD_POINTS = 10000

const METERS_PER_DEG_LAT = 111320

function distanceMeters(a, b) {
  const dLat = (b.lat - a.lat) * METERS_PER_DEG_LAT
  const dLng = (b.lng - a.lng) * METERS_PER_DEG_LAT * Math.cos((a.lat * Math.PI) / 180)
  return Math.sqrt(dLat * dLat + dLng * dLng)
}

/** 秒数转 mm:ss 或 hh:mm:ss */
function formatDuration(seconds) {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`
}

Page({
  data: {
    // idle | recording | paused | finished
    status: 'idle',

    // 实时统计
    elapsedText: '00:00',
    pointCount: 0,
    distanceText: '0m',

    // 地图
    latitude: 39.9042,
    longitude: 116.4074,
    scale: 16,
    polyline: [],
    markers: [],

    // 表单
    name: '',
    roadWidthIndex: 1,
    roadWidthLabels: ROAD_WIDTH_LABELS,

    submitting: false,
    error: ''
  },

  onLoad() {
    this.points = []
    this.startedAt = null
    this.pausedTotal = 0
    this.pausedAt = null
    this.timer = null
    this._locationHandler = null
  },

  onUnload() {
    this.stopLocationListening()
    this.stopTimer()
  },

  /* ==================== 定位 ==================== */

  stopLocationListening() {
    if (this._locationHandler) {
      wx.offLocationChange(this._locationHandler)
      this._locationHandler = null
    }
    if (this._watching) {
      wx.stopLocationUpdate({ fail: () => {} })
      this._watching = false
    }
  },

  stopTimer() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  },

  /** 已用时长 = 现在 - 开始 - 累计暂停时长 */
  computeElapsed() {
    if (!this.startedAt) return 0
    const now = Date.now()
    const pausedSoFar = this.pausedTotal + (this.pausedAt ? now - this.pausedAt : 0)
    return (now - this.startedAt - pausedSoFar) / 1000
  },

  startTimer() {
    this.stopTimer()
    this.timer = setInterval(() => {
      const elapsed = this.computeElapsed()
      const distance = this.totalDistance || 0
      this.setData({
        elapsedText: formatDuration(elapsed),
        distanceText: distance < 1000 ? `${Math.round(distance)}m` : `${(distance / 1000).toFixed(2)}km`
      })
    }, 1000)
  },

  /* ==================== 录制控制 ==================== */

  onStart() {
    if (this.data.status !== 'idle') return

    this.setData({ error: '', status: 'recording' })
    this.points = []
    this.totalDistance = 0
    this.startedAt = Date.now()
    this.pausedTotal = 0
    this.pausedAt = null

    this.startTimer()
    this.startLocationListening()
  },

  startLocationListening() {
    this._locationHandler = (res) => this.onLocationPoint(res)

    wx.startLocationUpdate({
      type: 'gcj02',
      success: () => {
        this._watching = true
        wx.onLocationChange(this._locationHandler)
      },
      fail: (err) => {
        this.setData({
          status: 'idle',
          error: `无法开启定位：${(err && err.errMsg) || '未知错误'}。请检查是否授予了位置权限。`
        })
        this.stopTimer()
      }
    })
  },

  onLocationPoint(res) {
    if (this.data.status !== 'recording') return

    const point = { lat: res.latitude, lng: res.longitude, altitude: res.altitude || 0 }

    // 位移太小就不记，避免等红灯时堆一堆重复点
    const last = this.points[this.points.length - 1]
    if (last) {
      const moved = distanceMeters(last, point)
      if (moved < MIN_MOVE_METERS) return
      this.totalDistance = (this.totalDistance || 0) + moved
    }

    if (this.points.length >= MAX_RECORD_POINTS) return

    this.points.push(point)
    this.refreshMap()
  },

  onPause() {
    if (this.data.status === 'recording') {
      this.pausedAt = Date.now()
      this.stopLocationListening()
      this.setData({ status: 'paused' })
    } else if (this.data.status === 'paused') {
      if (this.pausedAt) {
        this.pausedTotal += Date.now() - this.pausedAt
        this.pausedAt = null
      }
      this.setData({ status: 'recording' })
      this.startLocationListening()
    }
  },

  onFinish() {
    if (this.data.status !== 'recording' && this.data.status !== 'paused') return

    if (this.points.length < 2) {
      wx.showModal({
        title: '轨迹太短',
        content: '至少需要记录 2 个点才能生成路线。是否放弃本次录制？',
        confirmText: '放弃',
        success: (res) => {
          if (res.confirm) this.onReset()
        }
      })
      return
    }

    // 收尾时结算未计入的暂停时长
    if (this.pausedAt) {
      this.pausedTotal += Date.now() - this.pausedAt
      this.pausedAt = null
    }

    this.stopLocationListening()
    this.stopTimer()

    const elapsed = this.computeElapsed()
    this.setData({
      status: 'finished',
      elapsedText: formatDuration(elapsed),
      pointCount: this.points.length
    })

    wx.showToast({ title: '录制完成', icon: 'success' })
  },

  onReset() {
    this.stopLocationListening()
    this.stopTimer()
    this.points = []
    this.totalDistance = 0
    this.startedAt = null
    this.pausedTotal = 0
    this.pausedAt = null

    this.setData({
      status: 'idle',
      elapsedText: '00:00',
      pointCount: 0,
      distanceText: '0m',
      polyline: [],
      markers: [],
      error: ''
    })
  },

  /* ==================== 地图 ==================== */

  refreshMap() {
    const track = this.points
    const last = track[track.length - 1]
    if (!last) return

    const patch = {
      pointCount: track.length,
      polyline: amap.buildPolyline(track),
      // 录制中只标当前点，不需要起点终点
      markers: [
        {
          id: 1,
          latitude: last.lat,
          longitude: last.lng,
          width: 20,
          height: 20,
          callout: {
            content: '当前位置',
            color: amap.ACCENT_COLOR,
            fontSize: 11,
            borderRadius: 4,
            padding: 3,
            display: 'ALWAYS'
          }
        }
      ]
    }

    // 录制中跟随当前位置；已有多个点时保持全览
    if (track.length <= 2) {
      patch.latitude = last.lat
      patch.longitude = last.lng
    } else {
      const view = amap.fitView(track)
      patch.latitude = view.latitude
      patch.longitude = view.longitude
      patch.scale = view.scale
    }

    this.setData(patch)
  },

  /* ==================== 提交 ==================== */

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
    if (this.points.length < 2) {
      wx.showToast({ title: '没有可提交的轨迹', icon: 'none' })
      return
    }
    if (this.data.submitting) return

    this.setData({ submitting: true })
    wx.showLoading({ title: '提交中…', mask: true })

    api
      .post('/api/routes', {
        name,
        roadWidth: ROAD_WIDTH_OPTIONS[this.data.roadWidthIndex].value,
        trackPoints: this.points
      })
      .then((route) => {
        wx.hideLoading()
        wx.showToast({ title: '已保存为路线', icon: 'success' })
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
