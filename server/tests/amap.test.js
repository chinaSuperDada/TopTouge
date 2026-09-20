const test = require('node:test')
const assert = require('node:assert')

const amap = require('../../miniprogram/utils/amap')

// 这些函数不碰 wx.* API，可以在 Node 里直接测。
// require SDK 文件的部分（createAMapInstance）依赖小程序环境，不在这里覆盖。

test('buildPolyline', async (t) => {
  await t.test('空轨迹或单点返回空数组', () => {
    assert.deepStrictEqual(amap.buildPolyline([]), [])
    assert.deepStrictEqual(amap.buildPolyline([{ lat: 30, lng: 120 }]), [])
    assert.deepStrictEqual(amap.buildPolyline(null), [])
  })

  await t.test('转成 map 组件要求的 latitude/longitude 字段', () => {
    const track = [
      { lat: 30.0, lng: 120.0 },
      { lat: 30.1, lng: 120.1 }
    ]
    const poly = amap.buildPolyline(track)

    assert.strictEqual(poly.length, 1)
    assert.strictEqual(poly[0].points.length, 2)
    // 关键：字段名必须是 latitude/longitude，不是 lat/lng
    assert.deepStrictEqual(poly[0].points[0], { latitude: 30.0, longitude: 120.0 })
  })

  await t.test('保留全部轨迹点', () => {
    const track = Array.from({ length: 457 }, (_, i) => ({ lat: 30 + i * 1e-5, lng: 120 }))
    assert.strictEqual(amap.buildPolyline(track)[0].points.length, 457)
  })
})

test('buildMarkers', async (t) => {
  await t.test('闭环路线合并为一个「起终点」标记', () => {
    const route = {
      startPoint: { lat: 30.0, lng: 120.0, radiusMeters: 30 },
      endPoint: { lat: 30.0, lng: 120.0, radiusMeters: 30 },
      waypoints: []
    }
    const markers = amap.buildMarkers(route)
    assert.strictEqual(markers.length, 1)
    assert.strictEqual(markers[0].callout.content, '起终点')
  })

  await t.test('相距在一个起点半径内也算闭环', () => {
    const route = {
      startPoint: { lat: 30.0, lng: 120.0, radiusMeters: 30 },
      // 约 11m 外，落在 30m 半径内
      endPoint: { lat: 30.0001, lng: 120.0, radiusMeters: 30 },
      waypoints: []
    }
    assert.strictEqual(amap.buildMarkers(route).length, 1)
  })

  await t.test('非闭环路线起终点分开标注', () => {
    const route = {
      startPoint: { lat: 30.0, lng: 120.0, radiusMeters: 30 },
      endPoint: { lat: 30.05, lng: 120.05, radiusMeters: 30 },
      waypoints: []
    }
    const markers = amap.buildMarkers(route)
    assert.strictEqual(markers.length, 2)
    assert.strictEqual(markers[0].callout.content, '起点')
    assert.strictEqual(markers[1].callout.content, '终点')
  })

  await t.test('途经点追加在后面，id 不重复', () => {
    const route = {
      startPoint: { lat: 30.0, lng: 120.0, radiusMeters: 30 },
      endPoint: { lat: 30.0, lng: 120.0, radiusMeters: 30 },
      waypoints: [
        { name: '观景台', lat: 30.001, lng: 120.001 },
        { name: '垭口', lat: 30.002, lng: 120.002 }
      ]
    }
    const markers = amap.buildMarkers(route)

    assert.strictEqual(markers.length, 3)
    assert.strictEqual(markers[0].callout.content, '起终点')
    assert.strictEqual(markers[1].callout.content, '观景台')
    assert.strictEqual(markers[2].callout.content, '垭口')

    const ids = markers.map((m) => m.id)
    assert.strictEqual(new Set(ids).size, ids.length, 'id 应互不相同')
  })

  await t.test('缺字段时返回空数组不抛错', () => {
    assert.deepStrictEqual(amap.buildMarkers({}), [])
    assert.deepStrictEqual(amap.buildMarkers({ startPoint: null, endPoint: null }), [])
  })
})

test('fitView', async (t) => {
  await t.test('空轨迹返回默认中心', () => {
    const v = amap.fitView([])
    assert.ok(v.latitude && v.longitude && v.scale)
  })

  await t.test('中心点是包围盒中心', () => {
    const v = amap.fitView([
      { lat: 30.0, lng: 120.0 },
      { lat: 30.2, lng: 120.4 }
    ])
    assert.ok(Math.abs(v.latitude - 30.1) < 1e-9)
    assert.ok(Math.abs(v.longitude - 120.2) < 1e-9)
  })

  await t.test('跨度越大 scale 越小（视野越广）', () => {
    const span = (meters) => {
      const dLat = meters / 111320
      return amap.fitView([
        { lat: 30, lng: 120 },
        { lat: 30 + dLat, lng: 120 }
      ]).scale
    }

    const s250 = span(250)
    const s2km = span(2000)
    const s8km = span(8000)

    assert.ok(s250 > s2km, `${s250} 应大于 ${s2km}`)
    assert.ok(s2km > s8km, `${s2km} 应大于 ${s8km}`)
  })

  await t.test('scale 落在小程序合法范围 3-20', () => {
    for (const meters of [10, 100, 1000, 10000, 100000]) {
      const dLat = meters / 111320
      const s = amap.fitView([{ lat: 30, lng: 120 }, { lat: 30 + dLat, lng: 120 }]).scale
      assert.ok(s >= 3 && s <= 20, `跨度 ${meters}m 得到 scale ${s}`)
    }
  })
})

test('Key 与 SDK 状态', async (t) => {
  await t.test('Key 已配置', () => {
    assert.strictEqual(amap.isConfigured(), true)
    // 32 位十六进制，高德的 Key 格式
    assert.match(amap.AMAP_KEY, /^[0-9a-f]{32}$/)
  })

  await t.test('SDK 文件已就位，isSdkAvailable 为 true', () => {
    // miniprogram/libs/amap-wx.130.js 由高德控制台下载
    assert.strictEqual(amap.isSdkAvailable(), true)
  })

  await t.test('createAMapInstance 能实例化 SDK', () => {
    // SDK 内部只在调用具体方法时才用 wx.*，实例化本身不依赖小程序环境
    const instance = amap.createAMapInstance()
    assert.ok(instance, '应返回实例而不是 null')
    assert.strictEqual(instance.key, amap.AMAP_KEY)
  })
})

test('地图元素配色常量已导出', async (t) => {
  await t.test('所有颜色常量都是合法十六进制色值', () => {
    const colors = ['ACCENT_COLOR', 'ALT_COLOR', 'DANGER_COLOR', 'MUTED_COLOR']
    for (const name of colors) {
      assert.match(amap[name], /^#[0-9a-f]{6}$/, `${name} 应为 #rrggbb 格式`)
    }
  })

  await t.test('polyline 使用强调色', () => {
    const poly = amap.buildPolyline([
      { lat: 30, lng: 120 },
      { lat: 30.01, lng: 120 }
    ])
    assert.strictEqual(poly[0].color, amap.ACCENT_COLOR)
  })
})
