const test = require('node:test')
const assert = require('node:assert')

const {
  douglasPeucker,
  simplifyToMaxPoints,
  planarDistance,
  pointToSegmentDistance
} = require('../src/geo/simplify')

const METERS_PER_DEG_LAT = 111320
const mToLat = (m) => m / METERS_PER_DEG_LAT
const mToLng = (m, lat) => m / (METERS_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180))

/** 直线，可指定每段长度 */
const straight = (n, stepMeters = 100) =>
  Array.from({ length: n }, (_, i) => ({ lat: 30 + mToLat(i * stepMeters), lng: 120 }))

test('planarDistance', async (t) => {
  await t.test('同一点距离为 0', () => {
    assert.strictEqual(planarDistance({ lat: 30, lng: 120 }, { lat: 30, lng: 120 }), 0)
  })

  await t.test('已知距离：向北 1000m', () => {
    const d = planarDistance({ lat: 30, lng: 120 }, { lat: 30 + mToLat(1000), lng: 120 })
    assert.ok(Math.abs(d - 1000) < 1, `实际 ${d.toFixed(1)}m`)
  })

  await t.test('已知距离：向东 1000m', () => {
    const d = planarDistance({ lat: 30, lng: 120 }, { lat: 30, lng: 120 + mToLng(1000, 30) })
    assert.ok(Math.abs(d - 1000) < 1, `实际 ${d.toFixed(1)}m`)
  })
})

test('pointToSegmentDistance', async (t) => {
  await t.test('点在线上距离为 0', () => {
    const d = pointToSegmentDistance(
      { lat: 30, lng: 120 },
      { lat: 30, lng: 119 },
      { lat: 30, lng: 121 }
    )
    assert.ok(d < 1, `实际 ${d}`)
  })

  await t.test('点到线段的垂距', () => {
    // 线段沿经度方向，点在其北方 500m
    const d = pointToSegmentDistance(
      { lat: 30 + mToLat(500), lng: 120 },
      { lat: 30, lng: 119 },
      { lat: 30, lng: 121 }
    )
    assert.ok(Math.abs(d - 500) < 2, `实际 ${d.toFixed(1)}m`)
  })

  await t.test('投影落在线段外时取端点距离', () => {
    // 线段从 (30,119) 到 (30,119.5)，点在其西侧远处
    const d = pointToSegmentDistance(
      { lat: 30, lng: 118 },
      { lat: 30, lng: 119 },
      { lat: 30, lng: 119.5 }
    )
    // 应取到最近端点 (30,119) 的距离，约 96km
    const expected = planarDistance({ lat: 30, lng: 118 }, { lat: 30, lng: 119 })
    assert.ok(Math.abs(d - expected) < 2, `实际 ${d.toFixed(0)}m，期望 ${expected.toFixed(0)}m`)
  })

  await t.test('线段退化为点时取点距', () => {
    const d = pointToSegmentDistance(
      { lat: 30 + mToLat(300), lng: 120 },
      { lat: 30, lng: 120 },
      { lat: 30, lng: 120 }
    )
    assert.ok(Math.abs(d - 300) < 1, `实际 ${d.toFixed(1)}m`)
  })
})

test('douglasPeucker', async (t) => {
  await t.test('少于等于 2 点原样返回', () => {
    assert.deepStrictEqual(douglasPeucker([], 10), [])
    assert.strictEqual(douglasPeucker([{ lat: 1, lng: 1 }], 10).length, 1)
    assert.strictEqual(douglasPeucker([{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }], 10).length, 2)
  })

  await t.test('直线抽成两个端点', () => {
    const result = douglasPeucker(straight(50, 100), 10)
    assert.strictEqual(result.length, 2)
  })

  await t.test('首尾点永远保留', () => {
    const track = straight(20, 100)
    const result = douglasPeucker(track, 50)
    assert.deepStrictEqual(result[0], track[0])
    assert.deepStrictEqual(result[result.length - 1], track[track.length - 1])
  })

  await t.test('容差越大保留点越少', () => {
    // 锯齿形，每个点都有偏移
    const zig = Array.from({ length: 40 }, (_, i) => ({
      lat: 30 + mToLat(i * 100),
      lng: 120 + (i % 2 === 0 ? 0 : mToLng(30, 30))
    }))

    const tight = douglasPeucker(zig, 5)
    const loose = douglasPeucker(zig, 100)

    assert.ok(loose.length <= tight.length, `松容差 ${loose.length} 应不多于紧容差 ${tight.length}`)
  })

  await t.test('保留的点保持原有顺序', () => {
    const zig = Array.from({ length: 40 }, (_, i) => ({
      lat: 30 + mToLat(i * 100),
      lng: 120 + (i % 2 === 0 ? 0 : mToLng(30, 30))
    }))

    const result = douglasPeucker(zig, 20)
    const indices = result.map((p) => zig.findIndex((q) => q.lat === p.lat && q.lng === p.lng))
    for (let i = 1; i < indices.length; i++) {
      assert.ok(indices[i] > indices[i - 1], '顺序应递增')
    }
  })

  await t.test('结果是原数组的子集（引用相等）', () => {
    const track = straight(10, 100)
    const result = douglasPeucker(track, 10)
    for (const p of result) {
      assert.ok(track.includes(p), '应为原数组中的对象引用，而非拷贝')
    }
  })

  await t.test('容差为 0 时不丢点', () => {
    const track = straight(10, 100)
    assert.strictEqual(douglasPeucker(track, 0).length, 10)
  })

  await t.test('保留的点距原折线不超过容差', () => {
    const zig = Array.from({ length: 60 }, (_, i) => ({
      lat: 30 + mToLat(i * 80),
      lng: 120 + mToLng(Math.sin(i / 3) * 50, 30)
    }))

    const tolerance = 30
    const result = douglasPeucker(zig, tolerance)

    // 对每个被丢弃的点，检查它到结果折线的距离是否在容差内
    const dropped = zig.filter((p) => !result.includes(p))
    for (const p of dropped) {
      let minDist = Infinity
      for (let i = 1; i < result.length; i++) {
        minDist = Math.min(minDist, pointToSegmentDistance(p, result[i - 1], result[i]))
      }
      assert.ok(minDist <= tolerance + 1, `丢弃点距折线 ${minDist.toFixed(1)}m，超过容差 ${tolerance}m`)
    }
  })
})

test('simplifyToMaxPoints', async (t) => {
  await t.test('本来就不超限时原样返回', () => {
    const track = straight(50, 100)
    assert.strictEqual(simplifyToMaxPoints(track, 100).length, 50)
  })

  await t.test('能把长轨迹压到上限以内', () => {
    const track = straight(500, 100)
    const result = simplifyToMaxPoints(track, 100)
    assert.ok(result.length <= 100, `实际 ${result.length}`)
  })

  await t.test('弯曲轨迹也能压到上限内', () => {
    const zig = Array.from({ length: 600 }, (_, i) => ({
      lat: 30 + mToLat(i * 60),
      lng: 120 + mToLng(Math.sin(i / 4) * 80, 30)
    }))

    const result = simplifyToMaxPoints(zig, 100)
    assert.ok(result.length <= 100, `实际 ${result.length}`)
    assert.ok(result.length >= 10, `不应过度抽稀，实际 ${result.length}`)
  })

  await t.test('首尾点保留', () => {
    const track = straight(500, 100)
    const result = simplifyToMaxPoints(track, 50)
    assert.deepStrictEqual(result[0], track[0])
    assert.deepStrictEqual(result[result.length - 1], track[track.length - 1])
  })

  await t.test('空数组或非法输入不抛错', () => {
    assert.deepStrictEqual(simplifyToMaxPoints([], 100), [])
    assert.deepStrictEqual(simplifyToMaxPoints(null, 100), [])
  })

  await t.test('抽稀后仍能覆盖整条轨迹（不丢尾部）', () => {
    // 前段平直后段弯曲：如果实现是「先抽再截断」，尾部会被整段丢掉
    const flat = straight(300, 100)
    const last = flat[flat.length - 1]
    const curve = Array.from({ length: 300 }, (_, i) => ({
      lat: last.lat + mToLat(i * 40),
      lng: last.lng + mToLng(Math.sin(i / 2) * 60, 30)
    }))

    const track = flat.concat(curve)
    const result = simplifyToMaxPoints(track, 100)

    const end = result[result.length - 1]
    const expectedEnd = track[track.length - 1]
    assert.ok(
      Math.abs(end.lat - expectedEnd.lat) < 1e-9 && Math.abs(end.lng - expectedEnd.lng) < 1e-9,
      '终点应为原轨迹终点'
    )
  })
})
