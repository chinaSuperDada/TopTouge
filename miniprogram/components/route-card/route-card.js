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
      this.triggerEvent('tap', { id: this.data.route.id })
    }
  }
})
