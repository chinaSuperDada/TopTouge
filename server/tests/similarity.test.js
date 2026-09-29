const test = require('node:test')
const assert = require('node:assert')

const {
  overlapRatio,
  similarityLevel,
  sampleAlong,
  coverageRatio,
  pointToPolylineDistance,
  DEFAULT_THRESHOLD_METERS
} = require('../src/geo/similarity')

/**
 * 造一条从 (lat,lng) 出发、向正东延伸的直线轨迹。
 * 每点间隔 stepMeters，共 count 个点。
 */
function eastLine(lat, lng, count, stepMeters = 50) {
  // 该纬度上 1 度经度对应的米数
  const metersPerDegLng = 111320 * Math.cos((lat * Math.PI) / 180)
  const dLng = stepMeters / metersPerDegLng

  const points = []
  for (let i = 0; i < count; i++) {
    points.push({ lat, lng: lng + dLng * i })
  }
  return points
}

/** 整条轨迹向北平移 meters 米 */
function offsetNorth(track, meters) {
  const dLat = meters / 111320
  return track.map((p) => ({ lat: p.lat + dLat, lng: p.lng }))
}

test('sampleAlong', async (t) => {
  await t.test('采样点数量符合请求', () => {
    const track = eastLine(30, 120, 100)
    assert.strictEqual(sampleAlong(track, 20).length, 20)
    assert.strictEqual(sampleAlong(track, 50).length, 50)
  })

  await t.test('首尾点与轨迹首尾重合', () => {
    const track = eastLine(30, 120, 100)
    const samples = sampleAlong(track, 10)

    assert.ok(Math.abs(samples[0].lat - track[0].lat) < 1e-9)
    assert.ok(Math.abs(samples[0].lng - track[0].lng) < 1e-9)

    const last = track[track.length - 1]
    const lastSample = samples[samples.length - 1]
    assert.ok(Math.abs(lastSample.lat - last.lat) < 1e-9)
    assert.ok(Math.abs(lastSample.lng - last.lng) < 1e-9)
  })

  await t.test('采样点按等距分布', () => {
    const track = eastLine(30, 120, 100, 50)
    const samples = sampleAlong(track, 11) // 10 段

    // 相邻采样点的间距应大致相等
    const gaps = []
    for (let i = 1; i < samples.length; i++) {
      gaps.push(pointToPolylineDistance(samples[i], [samples[i - 1], samples[i]]) )
    }

    // 用经度差直接算更直接
    const lngGaps = []
    for (let i = 1; i < samples.length; i++) {
      lngGaps.push(samples[i].lng - samples[i - 1].lng)
    }

    const first = lngGaps[0]
    lngGaps.forEach((g) => {
      assert.ok(Math.abs(g - first) < 1e-9, '等距采样应产出等间隔的点')
    })
  })

  await t.test('轨迹点少于采样数时原样返回', () => {
    const track = eastLine(30, 120, 5)
    assert.strictEqual(sampleAlong(track, 50).length, 5)
  })

  await t.test('空轨迹返回空数组', () => {
    assert.deepStrictEqual(sampleAlong([], 10), [])
    assert.deepStrictEqual(sampleAlong(null, 10), [])
  })

  await t.test('所有点重合时不除零', () => {
    const same = [
      { lat: 30, lng: 120 },
      { lat: 30, lng: 120 },
      { lat: 30, lng: 120 }
    ]
    const samples = sampleAlong(same, 5)
    assert.ok(samples.length > 0)
    samples.forEach((p) => {
      assert.ok(Number.isFinite(p.lat) && Number.isFinite(p.lng))
    })
  })
})

test('pointToPolylineDistance', async (t) => {
  await t.test('点在折线上时距离为 0', () => {
    const line = eastLine(30, 120, 10, 50)
    assert.ok(pointToPolylineDistance(line[4], line) < 1e-6)
  })

  await t.test('点到直线的垂直距离正确', () => {
    const line = [
      { lat: 30, lng: 120 },
      { lat: 30, lng: 120.01 }
    ]
    // 正北偏移 100m
    const p = { lat: 30 + 100 / 111320, lng: 120.005 }
    const d = pointToPolylineDistance(p, line)
    assert.ok(Math.abs(d - 100) < 1, `期望约 100m，实际 ${d}`)
  })

  await t.test('超出线段端点时算到端点的距离', () => {
    const line = [
      { lat: 30, lng: 120 },
      { lat: 30, lng: 120.01 }
    ]
    // 在起点正西 200m 处
    const p = { lat: 30, lng: 120 - 200 / (111320 * Math.cos((30 * Math.PI) / 180)) }
    const d = pointToPolylineDistance(p, line)
    assert.ok(Math.abs(d - 200) < 2, `期望约 200m，实际 ${d}`)
  })

  await t.test('空折线返回 Infinity', () => {
    assert.strictEqual(pointToPolylineDistance({ lat: 30, lng: 120 }, []), Infinity)
  })
})

test('overlapRatio', async (t) => {
  await t.test('同一条轨迹与自身完全重合', () => {
    const track = eastLine(30, 120, 200)
    assert.strictEqual(overlapRatio(track, track), 1)
  })

  await t.test('平移 10m 仍判定为完全重合', () => {
    const track = eastLine(30, 120, 200)
    const shifted = offsetNorth(track, 10)
    // 10m 远小于 50m 阈值
    assert.ok(overlapRatio(track, shifted) > 0.99)
  })

  await t.test('平移 200m 判定为不重合', () => {
    const track = eastLine(30, 120, 200)
    const shifted = offsetNorth(track, 200)
    assert.strictEqual(overlapRatio(track, shifted), 0)
  })

  await t.test('完全不同的两条路线重合度为 0', () => {
    const a = eastLine(30, 120, 100)
    const b = eastLine(35, 130, 100) // 另一个城市
    assert.strictEqual(overlapRatio(a, b), 0)
  })

  await t.test('短路线被长路线完全包含时判为不重合', () => {
    // 长路线 500 个点，短路线取它的前 50 个点（约 1/10 长度）
    const long = eastLine(30, 120, 500, 50)
    const short = long.slice(0, 50)

    // 短→长 覆盖率 1，长→短 覆盖率约 0.1，取 min 得到约 0.1
    const ratio = overlapRatio(short, long)
    assert.ok(ratio < 0.2, `短路线被包含时不应判为重合，实际 ${ratio}`)
  })

  await t.test('方向相反的同一条路仍判为重合', () => {
    const track = eastLine(30, 120, 200)
    const reversed = track.slice().reverse()

    // 采样点落在同一条折线上，方向不影响距离
    assert.ok(overlapRatio(track, reversed) > 0.99)
  })

  await t.test('环形路线的重合判定不受重心影响', () => {
    // 造一个正方形环线，边长约 1km
    const dLat = 1000 / 111320
    const dLng = 1000 / (111320 * Math.cos((30 * Math.PI) / 180))

    const ring = [
      { lat: 30, lng: 120 },
      { lat: 30 + dLat, lng: 120 },
      { lat: 30 + dLat, lng: 120 + dLng },
      { lat: 30, lng: 120 + dLng },
      { lat: 30, lng: 120 }
    ]

    // 与自己重合
    assert.ok(overlapRatio(ring, ring) > 0.99)

    // 环线的重心在 (30+dLat/2, 120+dLng/2)，离边线约 500m。
    // 若按重心判定，环线和「重心附近的一条短路」会被误判成重合 —— 这里应当不重合
    const centerRoad = [
      { lat: 30 + dLat / 2, lng: 120 + dLng * 0.2 },
      { lat: 30 + dLat / 2, lng: 120 + dLng * 0.4 }
    ]
    assert.ok(overlapRatio(centerRoad, ring) < 0.5)
  })

  await t.test('阈值可调', () => {
    const track = eastLine(30, 120, 200)
    const shifted = offsetNorth(track, 80)

    // 默认 50m 阈值下不重合
    assert.strictEqual(overlapRatio(track, shifted), 0)
    // 放宽到 100m 就重合
    assert.strictEqual(overlapRatio(track, shifted, { thresholdMeters: 100 }), 1)
  })

  await t.test('阈值非法时回落到默认值', () => {
    const track = eastLine(30, 120, 200)
    // 传 0 / 负数 / 非数字都不该让函数崩或退化成"全部命中"
    assert.strictEqual(overlapRatio(track, offsetNorth(track, 200), { thresholdMeters: 0 }), 0)
    assert.strictEqual(overlapRatio(track, offsetNorth(track, 200), { thresholdMeters: -5 }), 0)
    assert.strictEqual(
      overlapRatio(track, offsetNorth(track, 200), { thresholdMeters: NaN }),
      0
    )
  })

  await t.test('轨迹点不足时返回 0', () => {
    const ok = eastLine(30, 120, 50)
    assert.strictEqual(overlapRatio([], ok), 0)
    assert.strictEqual(overlapRatio(ok, []), 0)
    assert.strictEqual(overlapRatio([{ lat: 30, lng: 120 }], ok), 0)
    assert.strictEqual(overlapRatio(null, ok), 0)
  })

  await t.test('重合度是对称的', () => {
    const a = eastLine(30, 120, 150)
    const b = offsetNorth(eastLine(30, 120, 150), 30)
    assert.strictEqual(overlapRatio(a, b), overlapRatio(b, a))
  })

  await t.test('部分重合落在中间档', () => {
    // A 是长线，B 是 A 的前半段略微偏移 —— 前一半贴合，后一半分开
    const a = eastLine(30, 120, 200, 50)
    const half = a.slice(0, 100)
    const b = half.concat(offsetNorth(a.slice(100), 500))

    const ratio = overlapRatio(a, b)
    assert.ok(ratio > 0.3 && ratio < 0.9, `部分重合应落在中间，实际 ${ratio}`)
  })
})

test('coverageRatio', async (t) => {
  await t.test('采样点全部命中时为 1', () => {
    const track = eastLine(30, 120, 200)
    assert.strictEqual(coverageRatio(track, track, DEFAULT_THRESHOLD_METERS), 1)
  })

  await t.test('采样点全部落空时为 0', () => {
    const track = eastLine(30, 120, 200)
    const far = offsetNorth(track, 1000)
    assert.strictEqual(coverageRatio(track, far, DEFAULT_THRESHOLD_METERS), 0)
  })
})

test('similarityLevel', async (t) => {
  await t.test('按档位划分', () => {
    assert.strictEqual(similarityLevel(1), 'duplicate')
    assert.strictEqual(similarityLevel(0.85), 'duplicate')
    assert.strictEqual(similarityLevel(0.84), 'similar')
    assert.strictEqual(similarityLevel(0.6), 'similar')
    assert.strictEqual(similarityLevel(0.59), 'partial')
    assert.strictEqual(similarityLevel(0.3), 'partial')
    assert.strictEqual(similarityLevel(0.29), 'distinct')
    assert.strictEqual(similarityLevel(0), 'distinct')
  })
})

test('端到端：模拟真实查重场景', async (t) => {
  await t.test('同一条山路两次独立采集判为重复', () => {
    // 基础轨迹：带弯的路线
    const base = []
    for (let i = 0; i < 100; i++) {
      base.push({
        lat: 30 + i * 0.0005 + Math.sin(i / 5) * 0.0003,
        lng: 120 + i * 0.0006
      })
    }

    // 第二次采集：整体偏移约 12m（GPS 误差 + 车道差异），个别点抖动
    const second = base.map((p, i) => ({
      lat: p.lat + 12 / 111320 + Math.sin(i) * 0.00002,
      lng: p.lng + 8 / (111320 * Math.cos((30 * Math.PI) / 180))
    }))

    const ratio = overlapRatio(base, second)
    assert.ok(ratio > 0.85, `同路两次采集应判为重复，实际 ${ratio}`)
    assert.strictEqual(similarityLevel(ratio), 'duplicate')
  })

  await t.test('同一起点走了不同岔路判为不重复', () => {
    const start = { lat: 30, lng: 120 }

    // 两条路都从同一点出发，但一条向东北、一条向东南
    const northeast = []
    const southeast = []
    for (let i = 0; i < 100; i++) {
      northeast.push({ lat: start.lat + i * 0.0008, lng: start.lng + i * 0.0008 })
      southeast.push({ lat: start.lat - i * 0.0008, lng: start.lng + i * 0.0008 })
    }

    const ratio = overlapRatio(northeast, southeast)
    // 起点重合但很快分开，重合度应该很低
    assert.ok(ratio < 0.3, `不同岔路不应判为重合，实际 ${ratio}`)
  })
})
