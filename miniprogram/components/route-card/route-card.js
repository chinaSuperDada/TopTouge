const { formatDistance, formatElevation, formatRoadWidth } = require('../../utils/format')

Component({
  properties: {
    route: {
      type: Object,
      value: {}
    }
  },

  data: {
    distanceText: '',
    elevationText: '',
    roadWidthText: ''
  },

  observers: {
    route(route) {
      if (!route || !route.id) return
      this.setData({
        distanceText: formatDistance(route.distanceMeters),
        elevationText: formatElevation(route.elevationGainMeters),
        roadWidthText: formatRoadWidth(route.roadWidth)
      })
    }
  },

  methods: {
    onTap() {
      // 事件名不能叫 tap —— 会和原生点击事件重名，
      // 页面上的 bind:tap 收到的是原生事件（detail 里是坐标，不是 id）
      this.triggerEvent('select', { id: this.data.route.id })
    }
  }
})
