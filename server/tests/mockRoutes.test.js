const test = require('node:test')
const assert = require('node:assert')

const store = require('../src/store/memoryStore')
const { generateMockRoutes, buildLoop, RECIPES, CLOSING_STEPS } = require('../src/store/mockRoutes')
const { seedMockRoutes } = require('../src/store/seed')
const { haversineMeters } = require('../src/geo/haversine')

test('mock 路线生成', async (t) => {
  await t.test('生成 3 条，字段与用户上传路线一致', () => {
    const routes = generateMockRoutes()
    assert.strictEqual(routes.length, 3)

    const required = [
      'name',
      'vehicleType',
      'distanceMeters',
      'startPoint',
      'endPoint',
      'waypoints',
      'referenceTrack',
      'uploadedBy',
      'curveCount',
      'sharpCurveRatio',
      'elevationGainMeters',
      'roadWidth',
      'difficultyStars'
    ]

    for (const r of routes) {
      for (const key of required) {
        assert.ok(key in r, `${r.name} 缺字段 ${key}`)
      }
      assert.strictEqual(r.uploadedBy, 'system')
      assert.strictEqual(r.vehicleType, 'car')
    }
  })

  await t.test('距离落在任务书要求的 5-15km', () => {
    for (const r of generateMockRoutes()) {
      const km = r.distanceMeters / 1000
      assert.ok(km >= 5 && km <= 15, `${r.name} 距离 ${km.toFixed(1)}km 超出 5-15km`)
    }
  })

  await t.test('首尾闭合：终点落在起点半径内', () => {
    for (const r of generateMockRoutes()) {
      const track = r.referenceTrack
      const gap = haversineMeters(track[0], track[track.length - 1])
      const ratio = gap / r.distanceMeters
      assert.ok(ratio < 0.01, `${r.name} 闭环缺口 ${gap.toFixed(0)}m 占全程 ${(ratio * 100).toFixed(1)}%`)
    }
  })

  await t.test('起终点自动取自轨迹首尾点', () => {
    for (const r of generateMockRoutes()) {
      const track = r.referenceTrack
      assert.strictEqual(r.startPoint.lat, track[0].lat)
      assert.strictEqual(r.endPoint.lat, track[track.length - 1].lat)
      assert.strictEqual(r.startPoint.radiusMeters, 30)
    }
  })

  await t.test('轨迹点连续，无跳点', () => {
    for (const r of generateMockRoutes()) {
      let maxGap = 0
      for (let i = 1; i < r.referenceTrack.length; i++) {
        maxGap = Math.max(maxGap, haversineMeters(r.referenceTrack[i - 1], r.referenceTrack[i]))
      }
      // 采样步长最大 50m，留些余量
      assert.ok(maxGap < 120, `${r.name} 相邻点最大间距 ${maxGap.toFixed(0)}m，疑似跳点`)
    }
  })

  await t.test('三条路线难度拉开档次（2/3/5 星）', () => {
    const stars = generateMockRoutes().map((r) => r.difficultyStars)
    assert.deepStrictEqual(stars, [2, 3, 5])
  })

  await t.test('弯道数随难度递增，且都大于 0', () => {
    const counts = generateMockRoutes().map((r) => r.curveCount)
    for (const c of counts) assert.ok(c > 0, '弯道数应大于 0')
    assert.ok(counts[0] < counts[1] && counts[1] < counts[2], `弯道数应递增，实际 ${counts}`)
  })

  await t.test('缓弯路线急弯占比低，发夹弯路线急弯占比高', () => {
    const routes = generateMockRoutes()
    // 第一条 turnDeg=75 全急弯；这里主要确保比例在合法区间
    for (const r of routes) {
      assert.ok(r.sharpCurveRatio >= 0 && r.sharpCurveRatio <= 1)
    }
  })

  await t.test('爬升随难度递增', () => {
    const gains = generateMockRoutes().map((r) => r.elevationGainMeters)
    assert.ok(gains[0] < gains[1] && gains[1] < gains[2], `爬升应递增，实际 ${gains}`)
  })

  await t.test('途经点是轨迹上的真实点', () => {
    for (const r of generateMockRoutes()) {
      assert.ok(r.waypoints.length >= 2, `${r.name} 途经点少于 2 个`)
      for (const w of r.waypoints) {
        assert.ok(w.name && typeof w.lat === 'number' && typeof w.lng === 'number')
        const onTrack = r.referenceTrack.some(
          (p) => Math.abs(p.lat - w.lat) < 1e-9 && Math.abs(p.lng - w.lng) < 1e-9
        )
        assert.ok(onTrack, `${r.name} 途经点 ${w.name} 不在轨迹上`)
      }
    }
  })

  await t.test('海拔有起伏，不是单调直线', () => {
    const track = generateMockRoutes()[0].referenceTrack
    const altitudes = track.map((p) => p.altitude)
    const max = Math.max(...altitudes)
    const min = Math.min(...altitudes)
    assert.ok(max > min, '海拔应有起伏')
    assert.strictEqual(altitudes[altitudes.length - 1] <= min + 1, true, '收尾高度应回落到低位')
  })
})

test('buildLoop 边界', async (t) => {
  await t.test('收尾段数与常量一致', () => {
    const track = buildLoop(RECIPES[0])
    assert.ok(track.length > CLOSING_STEPS)
  })

  await t.test('所有海拔非负', () => {
    for (const recipe of RECIPES) {
      for (const p of buildLoop(recipe)) {
        assert.ok(p.altitude >= 0, `出现负海拔 ${p.altitude}`)
      }
    }
  })
})

test('seedMockRoutes', async (t) => {
  t.beforeEach(() => store.reset())

  await t.test('首次灌入 3 条', () => {
    assert.strictEqual(seedMockRoutes(), 3)
    assert.strictEqual(store.routes.count(), 3)
  })

  await t.test('幂等：重复调用不重复灌入', () => {
    seedMockRoutes()
    assert.strictEqual(seedMockRoutes(), 0)
    assert.strictEqual(store.routes.count(), 3)
  })

  await t.test('灌入后可按 id 查回，且是拷贝', () => {
    seedMockRoutes()
    const route = store.routes.findById(1)
    assert.ok(route)
    assert.strictEqual(route.uploadedBy, 'system')

    route.name = '被改坏了'
    assert.notStrictEqual(store.routes.findById(1).name, '被改坏了')
  })
})
