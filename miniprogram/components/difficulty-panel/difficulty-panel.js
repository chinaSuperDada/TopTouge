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

      // 底部补充信息。
      //
      // 三条规则：
      //   1. **不显示「轨迹点数」**。详情接口为了省流量默认不返回
      //      referenceTrack，这个值永远是 0；而且它是实现细节，
      //      用户看到「轨迹点数 0 个」只会困惑。之前是个真 bug。
      //   2. **途经点只在有途经点时才显示**。0 个途经点是常态，
      //      列出来是噪音。
      //   3. 上传者显示昵称，没有才退回标识。系统路线写「官方路线」。
      const meta = []

      meta.push({
        label: '上传者',
        value: route.uploadedBy === 'system'
          ? '官方路线'
          : route.uploaderName || '车友'
      })

      const waypointCount = (route.waypoints || []).length
      if (waypointCount > 0) {
        meta.push({ label: '途经点', value: `${waypointCount} 个` })
      }

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
        meta
      })
    }
  }
})
