const test = require('node:test')
const assert = require('node:assert')

const {
  computeStats,
  computeDistance,
  countCurves,
  computeSharpCurveRatio,
  computeElevationGain
} = require('../src/services/statsService')
const { computeStars } = require('../src/services/difficultyService')

const METERS_PER_DEG_LAT = 111320
const metersToLatDeg = (m) => m / METERS_PER_DEG_LAT
const metersToLngDeg = (m, lat) => m / (METERS_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180))

/**
 * 按一串「航向」生成路径：每次沿给定方位角走 stepMeters。
 * 方位角 0=正北，90=正东。用于构造确定性的转向序列。
 *
 * @param {number} startLat
 * @param {number} startLng
 * @param {number[]} headingsDeg 每一步的航向，长度 = 步数+1
 * @param {number} stepMeters
 */
function buildPath(startLat, startLng, headingsDeg, stepMeters) {
  const pts = [{ lat: startLat, lng: startLng }]
  let lat = startLat
  let lng = startLng

  for (const heading of headingsDeg) {
    const rad = (heading * Math.PI) / 180
    const dNorth = Math.cos(rad) * stepMeters
    const dEast = Math.sin(rad) * stepMeters
    lat += metersToLatDeg(dNorth)
    lng += metersToLngDeg(dEast, lat)
    pts.push({ lat, lng })
  }
  return pts
}

/** 直线：航向恒定 */
const straightPath = (n, stepMeters = 60) => buildPath(30, 120, Array(n).fill(45), stepMeters)

/**
 * 构造「直道 + 弯」的真实山路结构：每个弯之间先直走若干段，
 * 模拟真实山路（弯与弯之间有直道），这样每个弯才会被识别为独立的弯道区间。
 *
 * @param {number} straightSegs 每个弯之前的直道段数
 * @param {number} segLen 每段长度（米）
 * @param {number} corners 弯的数量
 * @param {number} turnDeg 每次转向的角度
 * @param {number} gainPerSeg 每段爬升（米），0 表示无海拔数据
 */
function mountainRoad(straightSegs, segLen, corners, turnDeg, gainPerSeg = 0) {
  const pts = [{ lat: 30, lng: 120, altitude: 0 }]
  let lat = 30
  let lng = 120
  let heading = 90
  let alt = 0

  const advance = () => {
    const rad = (heading * Math.PI) / 180
    lat += metersToLatDeg(Math.cos(rad) * segLen)
    lng += metersToLngDeg(Math.sin(rad) * segLen, lat)
    alt += gainPerSeg
    pts.push({ lat, lng, altitude: alt })
  }

  for (let c = 0; c < corners; c++) {
    for (let i = 0; i < straightSegs; i++) advance()
    heading += turnDeg
    advance()
  }
  return pts
}

test('computeDistance', async (t) => {
  await t.test('少于两点的距离为 0', () => {
    assert.strictEqual(computeDistance([]), 0)
    assert.strictEqual(computeDistance([{ lat: 30, lng: 120 }]), 0)
  })

  await t.test('已知长度：10 段 100m 的直线约 1000m', () => {
    const path = buildPath(30, 120, Array(10).fill(90), 100)
    const d = computeDistance(path)
    assert.ok(Math.abs(d - 1000) < 5, `实际 ${d}m`)
  })

  await t.test('累加的是相邻段，不是首尾直线距离', () => {
    // 往东 100m 再折回 100m，首尾重合但路程 200m
    const path = buildPath(30, 120, [90, 270], 100)
    const d = computeDistance(path)
    assert.ok(Math.abs(d - 200) < 5, `实际 ${d}m`)
  })
})

test('countCurves', async (t) => {
  await t.test('直线无弯道', () => {
    assert.strictEqual(countCurves(straightPath(20)).total, 0)
  })

  await t.test('单次 90 度转弯记为 1 个弯道', () => {
    // 向东走两段，转向南走两段
    const path = buildPath(30, 120, [90, 90, 180, 180], 100)
    assert.strictEqual(countCurves(path).total, 1)
  })

  await t.test('一次 180 度调头记为 1 个弯道', () => {
    const path = buildPath(30, 120, [90, 90, 270, 270], 100)
    assert.strictEqual(countCurves(path).total, 1)
  })

  await t.test('两次分开的转弯记为 2 个弯道', () => {
    // 东 → 南 → 东：中间南向段足够长，两个弯道区间不连续
    const path = buildPath(30, 120, [90, 90, 180, 180, 180, 180, 90, 90], 100)
    assert.strictEqual(countCurves(path).total, 2)
  })

  await t.test('连续转向合并为 1 个弯道区间', () => {
    // 每段都转，形成连续过弯
    const path = buildPath(30, 120, [90, 135, 180, 225, 270], 100)
    assert.strictEqual(countCurves(path).total, 1)
  })

  await t.test('三点以下无弯道', () => {
    assert.strictEqual(countCurves([]).total, 0)
    assert.strictEqual(countCurves([{ lat: 30, lng: 120 }]).total, 0)
    assert.strictEqual(countCurves(straightPath(1)).total, 0)
  })

  await t.test('低于阈值的轻微转向不计为弯道', () => {
    // 每段只偏 10 度，低于 30 度阈值
    const path = buildPath(30, 120, [90, 100, 110, 120], 100)
    assert.strictEqual(countCurves(path).total, 0)
  })
})

test('computeSharpCurveRatio', async (t) => {
  await t.test('无弯道时比例为 0', () => {
    assert.strictEqual(computeSharpCurveRatio(straightPath(10)), 0)
  })

  await t.test('缓弯（45 度）不算急弯，比例为 0', () => {
    const path = mountainRoad(4, 100, 1, 45)
    assert.strictEqual(countCurves(path).total, 1)
    assert.strictEqual(computeSharpCurveRatio(path), 0)
  })

  await t.test('发夹弯（90 度）算急弯，比例为 1', () => {
    const path = mountainRoad(4, 100, 1, 90)
    assert.strictEqual(countCurves(path).total, 1)
    assert.strictEqual(computeSharpCurveRatio(path), 1)
  })

  await t.test('180 度调头算急弯，比例为 1', () => {
    const path = buildPath(30, 120, [90, 90, 270, 270], 100)
    assert.strictEqual(computeSharpCurveRatio(path), 1)
  })

  await t.test('一急一缓，比例为 0.5', () => {
    // 第一个弯 180 度（急），第二个弯 45 度（缓）
    const path = buildPath(30, 120, [90, 90, 270, 270, 270, 315, 315, 315, 315], 100)
    const r = computeSharpCurveRatio(path)
    assert.ok(Math.abs(r - 0.5) < 1e-9, `实际 ${r}`)
  })
})

test('computeElevationGain', async (t) => {
  await t.test('无 altitude 字段时爬升为 0', () => {
    assert.strictEqual(computeElevationGain(straightPath(10)), 0)
  })

  await t.test('持续上升累加全部高差', () => {
    const pts = [
      { lat: 30, lng: 120, altitude: 100 },
      { lat: 30.001, lng: 120, altitude: 150 },
      { lat: 30.002, lng: 120, altitude: 220 }
    ]
    assert.strictEqual(computeElevationGain(pts), 120)
  })

  await t.test('只有上升段累加，下降段不计', () => {
    const pts = [
      { lat: 30, lng: 120, altitude: 100 },
      { lat: 30.001, lng: 120, altitude: 200 }, // +100
      { lat: 30.002, lng: 120, altitude: 50 }, // 不提
      { lat: 30.003, lng: 120, altitude: 80 } // +30
    ]
    assert.strictEqual(computeElevationGain(pts), 130)
  })

  await t.test('回到起点净爬升 0，但累计爬升大于 0', () => {
    const pts = [
      { lat: 30, lng: 120, altitude: 0 },
      { lat: 30.001, lng: 120, altitude: 300 },
      { lat: 30.002, lng: 120, altitude: 0 }
    ]
    assert.strictEqual(computeElevationGain(pts), 300)
  })

  await t.test('部分点缺 altitude 时按 0 处理', () => {
    const pts = [
      { lat: 30, lng: 120, altitude: 100 },
      { lat: 30.001, lng: 120 }, // 视为 0，下降
      { lat: 30.002, lng: 120, altitude: 40 } // +40
    ]
    assert.strictEqual(computeElevationGain(pts), 40)
  })
})

test('computeStats 组合', async (t) => {
  await t.test('返回全部四个字段且类型正确', () => {
    const path = buildPath(30, 120, [90, 90, 180, 180], 100)
    const s = computeStats(path)
    assert.strictEqual(typeof s.distanceMeters, 'number')
    assert.strictEqual(typeof s.curveCount, 'number')
    assert.strictEqual(typeof s.sharpCurveRatio, 'number')
    assert.strictEqual(typeof s.elevationGainMeters, 'number')
    assert.strictEqual(s.curveCount, 1)
  })

  await t.test('空数组或非数组输入不抛错', () => {
    const empty = computeStats([])
    assert.strictEqual(empty.distanceMeters, 0)
    assert.strictEqual(empty.curveCount, 0)
    assert.strictEqual(empty.sharpCurveRatio, 0)
    assert.strictEqual(empty.elevationGainMeters, 0)

    const bad = computeStats(null)
    assert.strictEqual(bad.distanceMeters, 0)
  })
})

test('computeStars', async (t) => {
  await t.test('距离为 0 时取下限 1 星', () => {
    assert.strictEqual(computeStars({ curveCount: 0, distanceMeters: 0, elevationGainMeters: 0 }), 1)
    assert.strictEqual(computeStars({ curveCount: 99, distanceMeters: 0, elevationGainMeters: 500 }), 1)
  })

  await t.test('平坦直线取最低星', () => {
    const stats = computeStats(straightPath(40, 200))
    assert.strictEqual(stats.curveCount, 0)
    assert.strictEqual(computeStars(stats), 1)
  })

  await t.test('弯道密集时星级显著高于直线', () => {
    const straight = computeStats(straightPath(40, 200))
    const curvy = computeStats(mountainRoad(2, 60, 20, 90)) // 约 5.6 弯/km
    const flatStars = computeStars(straight)
    const curvyStars = computeStars(curvy)
    assert.ok(curvyStars > flatStars, `弯道 ${curvyStars} 星应高于直线 ${flatStars} 星`)
    assert.ok(curvyStars >= 4, `急弯密集路线应达 4 星以上，实际 ${curvyStars}`)
  })

  await t.test('无海拔时星级只由弯道决定，不被"平坦"拉低', () => {
    // 同样是 4 弯/km，加不加爬升都应取到 3 星；爬升为 0 不应被当成平坦维度参与平均
    const noAltitude = computeStats(mountainRoad(3, 80, 8, 90, 0))
    assert.strictEqual(noAltitude.elevationGainMeters, 0)
    assert.strictEqual(computeStars(noAltitude), 3)
  })

  await t.test('有爬升时爬升维度参与，陡坡抬升星级', () => {
    const flat = computeStats(mountainRoad(3, 80, 8, 90, 0))
    const steep = computeStats(mountainRoad(3, 80, 8, 90, 8)) // 8m/段 ≈ 100m/km
    assert.ok(steep.elevationGainMeters > 0)
    assert.ok(computeStars(steep) > computeStars(flat), `陡坡 ${computeStars(steep)} 应高于 平坦 ${computeStars(flat)}`)
  })

  await t.test('结果始终落在 1-5', () => {
    const cases = [
      { curveCount: 0, distanceMeters: 1000, elevationGainMeters: 0 },
      { curveCount: 1000, distanceMeters: 1000, elevationGainMeters: 100000 },
      { curveCount: 5, distanceMeters: 10000, elevationGainMeters: 200 },
      { curveCount: 3, distanceMeters: 500, elevationGainMeters: 5 }
    ]
    for (const c of cases) {
      const s = computeStars(c)
      assert.ok(Number.isInteger(s) && s >= 1 && s <= 5, `实际 ${s} for ${JSON.stringify(c)}`)
    }
  })

  await t.test('爬升为 0 时只由弯道维度决定', () => {
    const low = computeStars({ curveCount: 1, distanceMeters: 10000, elevationGainMeters: 0 })
    const high = computeStars({ curveCount: 60, distanceMeters: 10000, elevationGainMeters: 0 })
    assert.ok(high > low, `多弯 ${high} 应大于 少弯 ${low}`)
  })
})
