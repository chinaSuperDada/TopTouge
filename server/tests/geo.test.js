const test = require('node:test')
const assert = require('node:assert')

const { haversineMeters } = require('../src/geo/haversine')
const { bearingDeg } = require('../src/geo/bearing')
const { turnAngleDeg } = require('../src/geo/turnAngle')
const { inRadius } = require('../src/geo/radius')

// 便于构造「往正东多少米」的点
const metersToLngDeg = (m, lat) => m / (111320 * Math.cos((lat * Math.PI) / 180))
const metersToLatDeg = (m) => m / 111320

test('haversine', async (t) => {
  await t.test('同一点距离为 0', () => {
    assert.strictEqual(haversineMeters({ lat: 39.9, lng: 116.4 }, { lat: 39.9, lng: 116.4 }), 0)
  })

  await t.test('北京到上海约 1067km，误差 <1%', () => {
    const d = haversineMeters({ lat: 39.9042, lng: 116.4074 }, { lat: 31.2304, lng: 121.4737 })
    assert.ok(Math.abs(d - 1067000) / 1067000 < 0.01, `实际 ${Math.round(d)}m`)
  })

  await t.test('赤道上 1 经度约 111.3km', () => {
    const d = haversineMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })
    assert.ok(Math.abs(d - 111319) < 500, `实际 ${Math.round(d)}m`)
  })

  await t.test('对称性：a→b 等于 b→a', () => {
    const a = { lat: 30.5, lng: 114.3 }
    const b = { lat: 30.6, lng: 114.4 }
    assert.strictEqual(haversineMeters(a, b), haversineMeters(b, a))
  })
})

test('bearing', async (t) => {
  await t.test('正北 0 度', () => {
    assert.ok(Math.abs(bearingDeg({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })) < 0.01)
  })

  await t.test('正东 90 度', () => {
    const b = bearingDeg({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })
    assert.ok(Math.abs(b - 90) < 0.01, `实际 ${b}`)
  })

  await t.test('正南 180 度', () => {
    const b = bearingDeg({ lat: 0, lng: 0 }, { lat: -1, lng: 0 })
    assert.ok(Math.abs(b - 180) < 0.01, `实际 ${b}`)
  })

  await t.test('正西 270 度', () => {
    const b = bearingDeg({ lat: 0, lng: 0 }, { lat: 0, lng: -1 })
    assert.ok(Math.abs(b - 270) < 0.01, `实际 ${b}`)
  })

  await t.test('结果落在 [0, 360)', () => {
    const b = bearingDeg({ lat: 30, lng: 120 }, { lat: 30.01, lng: 119.99 })
    assert.ok(b >= 0 && b < 360, `实际 ${b}`)
  })
})

test('turnAngle', async (t) => {
  const lat = 30
  const step = metersToLngDeg(100, lat)
  const east = (n) => ({ lat, lng: n * step })

  await t.test('三点共线（向东直行）转向角为 0', () => {
    const a = turnAngleDeg(east(0), east(1), east(2))
    assert.ok(Math.abs(a) < 0.01, `实际 ${a}`)
  })

  await t.test('右转 90 度为 +90', () => {
    // 向东 → 向南
    const p0 = { lat, lng: 0 }
    const p1 = { lat, lng: step }
    const p2 = { lat: lat - metersToLatDeg(100), lng: step }
    const a = turnAngleDeg(p0, p1, p2)
    assert.ok(Math.abs(a - 90) < 0.5, `实际 ${a}`)
  })

  await t.test('左转 90 度为 -90', () => {
    // 向东 → 向北
    const p0 = { lat, lng: 0 }
    const p1 = { lat, lng: step }
    const p2 = { lat: lat + metersToLatDeg(100), lng: step }
    const a = turnAngleDeg(p0, p1, p2)
    assert.ok(Math.abs(a + 90) < 0.5, `实际 ${a}`)
  })

  await t.test('沿来路折返为 180（归一化上界）', () => {
    const p0 = { lat, lng: 0 }
    const p1 = { lat, lng: step }
    const p2 = { lat, lng: 0 }
    const a = turnAngleDeg(p0, p1, p2)
    assert.ok(Math.abs(Math.abs(a) - 180) < 0.01, `实际 ${a}`)
  })

  await t.test('结果始终落在 (-180, 180]', () => {
    const pts = [
      { lat: 30, lng: 120 },
      { lat: 30.01, lng: 120.01 },
      { lat: 30.005, lng: 120.02 },
      { lat: 30.02, lng: 120.015 }
    ]
    for (let i = 0; i + 2 < pts.length; i++) {
      const a = turnAngleDeg(pts[i], pts[i + 1], pts[i + 2])
      assert.ok(a > -180 && a <= 180, `实际 ${a}`)
    }
  })
})

test('inRadius', async (t) => {
  const center = { lat: 30, lng: 120 }

  await t.test('圆心本身在范围内', () => {
    assert.strictEqual(inRadius(center, center, 30), true)
  })

  await t.test('向北 10m 在 30m 范围内', () => {
    const p = { lat: center.lat + metersToLatDeg(10), lng: center.lng }
    assert.strictEqual(inRadius(p, center, 30), true)
  })

  await t.test('向东 50m 超出 30m 范围', () => {
    const p = { lat: center.lat, lng: center.lng + metersToLngDeg(50, center.lat) }
    assert.strictEqual(inRadius(p, center, 30), false)
  })

  await t.test('恰好 30m 处视为在范围内（边界包含）', () => {
    const p = { lat: center.lat, lng: center.lng + metersToLngDeg(30, center.lat) }
    assert.strictEqual(inRadius(p, center, 30), true)
  })

  await t.test('半径随参数放大后可达', () => {
    const p = { lat: center.lat, lng: center.lng + metersToLngDeg(50, center.lat) }
    assert.strictEqual(inRadius(p, center, 60), true)
  })
})
