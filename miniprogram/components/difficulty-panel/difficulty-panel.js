const { formatDistance, formatElevation, formatRatio, formatRoadWidth } = require('../../utils/format')

/** 星级对应的文字描述，让用户不用猜几星算难 */
const DIFFICULTY_LABEL = {
  1: '轻松',
  2: '较易',
  3: '中等',
  4: '较难',
  5: '挑战'
}

Component({
  properties: {
    route: {
      type: Object,
      value: {}
    }
  },

  data: {
    // 数值型指标，用大号数字展示
    metrics: [],
    // 文字型属性，小号辅助信息
    meta: [],
    // 星级对应的文字，如「中等」
    difficultyLabel: ''
  },

  observers: {
    route(route) {
      if (!route || !route.id) return

      this.setData({
        difficultyLabel: DIFFICULTY_LABEL[route.difficultyStars] || '',
        metrics: [
          { label: '距离', value: formatDistance(route.distanceMeters) },
          { label: '弯道数', value: `${route.curveCount} 个` },
          { label: '急弯占比', value: formatRatio(route.sharpCurveRatio) },
          { label: '爬升高度', value: formatElevation(route.elevationGainMeters) },
          { label: '路宽', value: formatRoadWidth(route.roadWidth) },
          { label: '车型', value: route.vehicleType === 'car' ? '汽车' : route.vehicleType }
        ],
        meta: [
          { label: '上传者', value: route.uploadedBy === 'system' ? '官方路线' : route.uploadedBy },
          { label: '轨迹点数', value: `${(route.referenceTrack || []).length} 个` },
          { label: '途经点', value: `${(route.waypoints || []).length} 个` }
        ]
      })
    }
  }
})
