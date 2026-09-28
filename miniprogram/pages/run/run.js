const mock = require('../../utils/mock')
const runGeo = require('../../utils/runGeo')
const amap = require('../../utils/amap')
const navigation = require('../../utils/navigation')

// 位移小于这个距离不记点 —— 等红灯时 GPS 会回一堆同一个位置
const MIN_MOVE_METERS = 8

// 单次录制的点数上限，防止定位漂移导致无限累积
const MAX_POINTS = 10000

// 距终点多远开始提示
const NEAR_END_METERS = 300

Page({
  data: {
    routeId: null,
    routeName: '',

    // idle | running | paused | finished
    status: 'idle',

    // 实时统计
    elapsedText: '00:00',
    distanceText: '0m',
    pointCount: 0,

    // 距终点提示
    nearEnd: false,
    remainingText: '',

    // 地图
    latitude: 30.2741,
    longitude: 120.1551,
    scale: 15,
    polyline: [],
    markers: []
  },

  onLoad(query) {
    const routeId = Number(query.id)
    const routeName = query.name ? decodeURIComponent(query.name) : ''

    this.points = []
    this.startedAt = null
    this.pausedTotal = 0
    this.pausedAt = null
    this.timer = null
    this._locationHandler = null
    this._route = null

    this.setData({ routeId, routeName })

    // 先把路线数据拿到 —— 跑山时要用终点坐标判断是否到达，
    // 同时把参考路线画到地图上，让用户知道要往哪跑
    mock.getRoute(routeId).then((route) => {
      this._route = route
      this.refreshMap()
    })
  },

  onUnload() {
    this.stopLocationListening()
    this.stopTimer()
  },

  /* ==================== 开始前的模式选择 ==================== */

  /**
   * 点「开始跑山」先选数据模式。
   *
   * 默认「参与算分」—— 多数人想要成绩和排名。
   * 隐私敏感的用户可以选「仅本机」，轨迹不上传、不算分。
   */
  onStartTap() {
    if (this.data.status === 'idle') {
      wx.showActionSheet({
        itemList: [
          '参与算分（原始轨迹 72 小时后自动清除）',
          '仅本机记录（不参与算分）'
        ],
        success: (res) => {
          this.dataMode = res.tapIndex === 0 ? 'ranked' : 'local_only'
          this.startRun()
        },
        fail: () => {}
      })
      return
    }

    if (this.data.status === 'running') this.onPause()
    else if (this.data.status === 'paused') this.onResume()
  },

  /* ==================== 开始 / 暂停 / 结束 ==================== */

  startRun() {
    this.points = []
    this.totalDistance = 0
    this.startedAt = Date.now()
    this.pausedTotal = 0
    this.pausedAt = null

    this.setData({
      status: 'running',
      elapsedText: '00:00',
      distanceText: '0m',
      pointCount: 0,
      nearEnd: false
    })

    this.startTimer()
    this.startLocationListening()
  },

  startTimer() {
    this.stopTimer()
    this.timer = setInterval(() => {
      this.setData({
        elapsedText: runGeo.formatDuration(this.computeElapsed()),
        distanceText: runGeo.formatDistance(this.totalDistance || 0)
      })
    }, 1000)
  },

  stopTimer() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  },

  /** 已用时长 = 现在 - 开始 - 累计暂停 */
  computeElapsed() {
    if (!this.startedAt) return 0
    const now = Date.now()
    const pausedSoFar = this.pausedTotal + (this.pausedAt ? now - this.pausedAt : 0)
    return (now - this.startedAt - pausedSoFar) / 1000
  },

  onPause() {
    if (this.data.status !== 'running') return
    this.pausedAt = Date.now()
    this.stopLocationListening()
    this.setData({ status: 'paused' })
  },

  onResume() {
    if (this.data.status !== 'paused') return
    if (this.pausedAt) {
      this.pausedTotal += Date.now() - this.pausedAt
      this.pausedAt = null
    }
    this.setData({ status: 'running' })
    this.startLocationListening()
  },

  /**
   * 结束跑山。
   *
   * 收尾时结算未计入的暂停时长，再进结果页。
   */
  onFinish() {
    if (this.data.status !== 'running' && this.data.status !== 'paused') return

    if (this.points.length < 2) {
      this.stopLocationListening()
      this.stopTimer()
      wx.showModal({
        title: '轨迹太短',
        content: '还没采到足够的轨迹点，无法计入成绩。',
        confirmText: '结束',
        cancelText: '继续跑',
        success: (res) => {
          if (res.confirm) wx.navigateBack()
          else this.onResume()
        }
      })
      return
    }

    if (this.pausedAt) {
      this.pausedTotal += Date.now() - this.pausedAt
      this.pausedAt = null
    }

    this.stopLocationListening()
    this.stopTimer()

    const elapsed = this.computeElapsed()
    this.setData({ status: 'finished', elapsedText: runGeo.formatDuration(elapsed) })

    this.submitRun(elapsed)
  },

  /* ==================== 定位采集 ==================== */

  startLocationListening() {
    this._locationHandler = (res) => this.onLocationPoint(res)

    wx.startLocationUpdate({
      type: 'gcj02',
      success: () => {
        this._watching = true
        wx.onLocationChange(this._locationHandler)
      },
      fail: (err) => {
        this.setData({ status: 'idle' })
        this.stopTimer()
        wx.showModal({
          title: '无法开始记录',
          content: `需要定位权限才能记录轨迹。${(err && err.errMsg) || ''}`,
          confirmText: '去设置',
          success: (res) => {
            if (res.confirm) wx.openSetting({ fail: () => {} })
          }
        })
      }
    })
  },

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

  /** 收到一个定位点 */
  onLocationPoint(res) {
    if (this.data.status !== 'running') return

    const point = {
      lat: res.latitude,
      lng: res.longitude,
      altitude: res.altitude || 0,
      speed: res.speed || 0,
      timestamp: Date.now()
    }

    // 位移太小不记，避免堆一堆重复点
    const last = this.points[this.points.length - 1]
    if (last) {
      const moved = runGeo.distanceMeters(last, point)
      if (moved < MIN_MOVE_METERS) return
      this.totalDistance = (this.totalDistance || 0) + moved
    }

    if (this.points.length >= MAX_POINTS) return

    this.points.push(point)
    this.refreshMap()
    this.checkArrival(point)
  },

  /**
   * 判断是否到达终点。
   *
   * 进了终点区域就自动结束 —— 用户不用自己判断什么时候停。
   * 提前 300 米给个提示，让他知道快到了。
   */
  checkArrival(point) {
    const route = this._route
    if (!route || !route.endPoint) return

    const radius = route.endPoint.radiusMeters || 30
    const remaining = runGeo.distanceMeters(point, route.endPoint)

    if (runGeo.inRadius(point, route.endPoint, radius)) {
      wx.vibrateShort({ fail: () => {} })
      wx.showToast({ title: '已到达终点', icon: 'success', duration: 1500 })
      this.onFinish()
      return
    }

    const nearEnd = remaining <= NEAR_END_METERS
    if (nearEnd !== this.data.nearEnd) {
      this.setData({
        nearEnd,
        remainingText: nearEnd ? `距终点 ${Math.round(remaining)}m` : ''
      })
    }
  },

  /* ==================== 地图 ==================== */

  /**
   * 刷新地图。
   *
   * 同时画两条线：
   *   - 参考路线（要跑的目标）—— 进页面就该看到，不能等采到点才画
   *   - 实际轨迹（已经跑的）—— 开始后才逐渐出现
   *
   * 之前只画实际轨迹，所以没开始跑时地图是空的，
   * 用户不知道自己要往哪跑。
   */
  refreshMap() {
    const route = this._route
    const track = this.points
    const last = track[track.length - 1]

    const referenceTrack = route && route.track ? route.track : []

    const markers = []
    if (route && route.endPoint) {
      markers.push({
        id: 1,
        latitude: route.endPoint.lat,
        longitude: route.endPoint.lng,
        width: 24,
        height: 24,
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

    const patch = {
      pointCount: track.length,
      polyline: amap.buildDualPolyline(referenceTrack, track),
      markers
    }

    // 视野：优先跟随当前位置；还没有位置就展示整条参考路线
    if (last) {
      if (track.length <= 2) {
        patch.latitude = last.lat
        patch.longitude = last.lng
      } else {
        const view = amap.fitView(track)
        patch.latitude = view.latitude
        patch.longitude = view.longitude
        patch.scale = view.scale
      }
    } else if (referenceTrack.length >= 2) {
      const view = amap.fitView(referenceTrack)
      patch.latitude = view.latitude
      patch.longitude = view.longitude
      patch.scale = view.scale
    }

    this.setData(patch)
  },

  /* ==================== 外部导航 ==================== */

  /**
   * 用高德导航。
   *
   * ⚠️ 这条路**不能记录成绩** —— 小程序一旦切到后台，
   * wx.onLocationChange 就停止回调，轨迹断了。这是微信的平台限制，
   * 绕不过去。所以要在按钮上明确标出来，避免用户以为能算分。
   *
   * 跑山途中点它会更严重：已经跑的一段白费。所以额外拦一道，
   * 让用户确认确实要放弃记录。
   */
  onExternalNav() {
    const route = this._route
    if (!route) {
      wx.showToast({ title: '路线还没加载完', icon: 'none' })
      return
    }

    const recording = this.data.status === 'running' || this.data.status === 'paused'

    const doNavigate = () => {
      if (recording) {
        // 跳走就没有成绩了，先把记录停掉，免得留下半截数据
        this.stopLocationListening()
        this.stopTimer()
        this.setData({ status: 'idle' })
      }

      navigation
        .copyAmapShareLink({
          name: route.name,
          startPoint: route.startPoint,
          endPoint: route.endPoint,
          waypoints: route.waypoints || []
        })
        .then(() => {
          wx.showModal({
            title: '路线链接已复制',
            content: '粘贴到微信发送，或直接在浏览器打开即可用高德导航。',
            showCancel: false,
            confirmText: '知道了'
          })
        })
        .catch((err) => {
          wx.showToast({ title: err.message || '生成链接失败', icon: 'none' })
        })
    }

    if (recording) {
      wx.showModal({
        title: '将放弃本次记录',
        content: '跳转到高德后小程序进入后台，定位采集会中断，这段轨迹无法计入成绩。确认切换吗？',
        confirmText: '放弃并跳转',
        cancelText: '继续跑',
        success: (res) => {
          if (res.confirm) doNavigate()
        }
      })
      return
    }

    doNavigate()
  },

  /* ==================== 提交 ==================== */

  /**
   * 提交本次跑山。
   *
   * local_only 不发请求，只在本机看统计。
   * ranked 提交后端算分 —— 后端接口还没实现，先用 mock。
   */
  submitRun(elapsedSeconds) {
    if (this.dataMode === 'local_only') {
      wx.redirectTo({
        url:
          `/pages/run-result/run-result?mode=local` +
          `&elapsed=${Math.round(elapsedSeconds)}` +
          `&distance=${Math.round(this.totalDistance || 0)}`
      })
      return
    }

    wx.showLoading({ title: '计算成绩…', mask: true })

    // 接后端后换成 POST /api/runs { routeId, vehicleType, trackPoints, dataMode }
    mock
      .submitRun({ routeId: this.data.routeId, elapsedSeconds })
      .then((result) => {
        wx.hideLoading()
        wx.redirectTo({
          url:
            `/pages/run-result/run-result?mode=ranked` +
            `&score=${result.score}` +
            `&rank=${result.rank}` +
            `&total=${result.total}`
        })
      })
      .catch(() => {
        wx.hideLoading()
        wx.showToast({ title: '提交失败，请重试', icon: 'none' })
      })
  }
})
