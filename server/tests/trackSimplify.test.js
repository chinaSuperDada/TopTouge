const test = require('node:test')
const assert = require('node:assert')

const {
  simplifyTrack,
  buildNavigationUrl,
  isLoopTrack,
  KEEP_ANGLE_DEG
} = require('../../miniprogram/utils/trackSimplify')
const amap = require('../../miniprogram/utils/amap')

const METERS_PER_DEG_LAT = 111320
const mToLat = (m) => m / METERS_PER_DEG_LAT
const mToLng = (m, lat) => m / (METERS_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180))

/** 直线轨迹 */
const straight = (n, stepMeters = 100) =>
  Array.from({ length: n }, (_, i) => ({ lat: 30 + mToLat(i * stepMeters), lng: 120 }))

/**
 * 「直道 + 弯」的折线，与 mock 路线同构。
 * 弯与弯之间留直道，否则连续转向会被合并。
 */
function zigzag(corners, segMeters = 200) {
  const pts = [{ lat: 30, lng: 120 }]
  let lat = 30
  let lng = 120
  let heading = 90
  const advance = () => {
    const rad = (heading * Math.PI) / 180
    lat += mToLat(Math.cos(rad) * segMeters)
    lng += mToLng(Math.sin(rad) * segMeters, lat)
    pts.push({ lat, lng })
  }
  for (let c = 0; c < corners; c++) {
    advance()
    advance()
    heading += 90
    advance()
  }
  return pts
}

/** 闭环：出去再原路回来 */
const loop = (n, stepMeters = 100) => {
  const out = Array.from({ length: n }, (_, i) => ({ lat: 30 + mToLat(i * stepMeters), lng: 120 }))
  return out.concat(out.slice().reverse())
}

test('simplifyTrack', async (t) => {
  await t.test('少于等于 2 点原样返回', () => {
    assert.deepStrictEqual(simplifyTrack([]), [])
    assert.strictEqual(simplifyTrack([{ lat: 1, lng: 1 }]).length, 1)
  })

  await t.test('首尾点永远保留', () => {
    const track = zigzag(6)
    const s = simplifyTrack(track, 8)
    assert.deepStrictEqual(s[0], track[0])
    assert.deepStrictEqual(s[s.length - 1], track[track.length - 1])
  })

  await t.test('不超过 maxPoints', () => {
    for (const max of [3, 5, 8, 10]) {
      const s = simplifyTrack(zigzag(30), max)
      assert.ok(s.length <= max, `max=${max} 时返回 ${s.length} 个点`)
    }
  })

  await t.test('保留顺序与原轨迹一致', () => {
    const track = zigzag(10)
    const s = simplifyTrack(track, 8)

    // 每个保留点在原轨迹里的下标应严格递增
    const indices = s.map((p) => track.findIndex((q) => q.lat === p.lat && q.lng === p.lng))
    for (let i = 1; i < indices.length; i++) {
      assert.ok(indices[i] > indices[i - 1], `第 ${i} 个点顺序错乱`)
    }
  })

  await t.test('无重复点', () => {
    const s = simplifyTrack(zigzag(20), 10)
    for (let i = 1; i < s.length; i++) {
      const same = s[i].lat === s[i - 1].lat && s[i].lng === s[i - 1].lng
      assert.ok(!same, `第 ${i} 个点与上一个重复`)
    }
  })

  await t.test('直线轨迹也能返回足够多的点', () => {
    // 直线没有弯道，走「等距补点」分支
    const s = simplifyTrack(straight(50, 200), 8)
    assert.ok(s.length >= 3, `直线应补出多个点，实际 ${s.length}`)
  })

  await t.test('紧凑盘山路（总长很大但占地很小）不会只剩首尾', () => {
    // 这就是 mock 路线的形态：10km 路程蜷在几百米范围内
    const track = zigzag(30, 30)
    const s = simplifyTrack(track, 8)
    assert.ok(s.length >= 3, `实际 ${s.length} 个点`)
  })
})

test('isLoopTrack', async (t) => {
  await t.test('起终点重合判定为闭环', () => {
    assert.strictEqual(isLoopTrack(loop(10)), true)
  })

  await t.test('起终点相距较远不是闭环', () => {
    assert.strictEqual(isLoopTrack(straight(10, 200)), false)
  })

  await t.test('点数不足返回 false', () => {
    assert.strictEqual(isLoopTrack([]), false)
    assert.strictEqual(isLoopTrack([{ lat: 1, lng: 1 }]), false)
  })

  await t.test('相距 50m 内算闭环', () => {
    const track = [
      { lat: 30, lng: 120 },
      { lat: 30.001, lng: 120 },
      { lat: 30 + mToLat(30), lng: 120 }
    ]
    assert.strictEqual(isLoopTrack(track), true)
  })
})

test('buildNavigationUrl', async (t) => {
  await t.test('点数不足返回 null', () => {
    assert.strictEqual(buildNavigationUrl([]), null)
    assert.strictEqual(buildNavigationUrl([{ lat: 30, lng: 120 }]), null)
  })

  await t.test('生成高德导航域名与必需参数', () => {
    const url = buildNavigationUrl(straight(20, 200), { destination: '测试路线' })
    assert.ok(url.startsWith('https://uri.amap.com/navigation?'))

    const u = new URL(url)
    assert.ok(u.searchParams.get('from'))
    assert.ok(u.searchParams.get('to'))
    assert.strictEqual(u.searchParams.get('mode'), 'car')
    assert.strictEqual(u.searchParams.get('coordinate'), 'gaode')
    assert.strictEqual(u.searchParams.get('toname'), '测试路线')
  })

  await t.test('坐标是 lng,lat 顺序（不是 lat,lng）', () => {
    const url = buildNavigationUrl(straight(10, 200))
    const u = new URL(url)
    const [lng, lat] = u.searchParams.get('from').split(',').map(Number)

    // 构造数据是 lat=30, lng=120
    assert.ok(Math.abs(lat - 30) < 0.01, `lat 应为 30，实际 ${lat}`)
    assert.ok(Math.abs(lng - 120) < 0.01, `lng 应为 120，实际 ${lng}`)
  })

  await t.test('闭环路线起终点不相同（否则导航无意义）', () => {
    const url = buildNavigationUrl(loop(20, 100))
    const u = new URL(url)
    assert.notStrictEqual(u.searchParams.get('from'), u.searchParams.get('to'))
  })

  await t.test('闭环时截取前半程，终点在离起点最远处附近', () => {
    const track = loop(20, 100)
    const url = buildNavigationUrl(track)
    const u = new URL(url)
    const [toLng, toLat] = u.searchParams.get('to').split(',').map(Number)
    const [fromLng, fromLat] = u.searchParams.get('from').split(',').map(Number)

    const dist = Math.hypot(toLat - fromLat, toLng - fromLng)
    assert.ok(dist > mToLat(100), `终点应离起点有距离，实际 ${dist}`)
  })

  await t.test('URL 长度可控（不会被截断）', () => {
    const url = buildNavigationUrl(zigzag(50), { source: '起点名称', destination: '终点名称' })
    assert.ok(url.length < 1500, `URL 长 ${url.length} 字符，可能超长`)
  })

  await t.test('名称做了 URL 编码', () => {
    const url = buildNavigationUrl(straight(10, 200), { destination: '九曲发夹弯 & 测试' })
    assert.ok(url.includes('%26') || !url.includes(' & '), '特殊字符应被编码')
  })
})

test('parsePolyline', async (t) => {
  await t.test('解析 steps 里的 polyline 字符串', () => {
    const steps = [{ polyline: '120.1,30.1;120.2,30.2' }, { polyline: '120.3,30.3' }]
    const track = amap.parsePolyline(steps)

    assert.strictEqual(track.length, 3)
    assert.deepStrictEqual(track[0], { lat: 30.1, lng: 120.1, altitude: 0 })
    assert.deepStrictEqual(track[2], { lat: 30.3, lng: 120.3, altitude: 0 })
  })

  await t.test('相邻步骤的重复点被去掉', () => {
    const steps = [{ polyline: '120.1,30.1;120.2,30.2' }, { polyline: '120.2,30.2;120.3,30.3' }]
    assert.strictEqual(amap.parsePolyline(steps).length, 3)
  })

  await t.test('异常输入不抛错', () => {
    assert.deepStrictEqual(amap.parsePolyline(null), [])
    assert.deepStrictEqual(amap.parsePolyline([]), [])
    assert.deepStrictEqual(amap.parsePolyline([{}, { polyline: '' }]), [])
    assert.deepStrictEqual(amap.parsePolyline([{ polyline: 'bogus' }]), [])
  })

  await t.test('海拔统一为 0（规划结果不含海拔）', () => {
    const track = amap.parsePolyline([{ polyline: '120.1,30.1;120.2,30.2' }])
    for (const p of track) assert.strictEqual(p.altitude, 0)
  })
})

test('KEEP_ANGLE_DEG 与难度计算的阈值语义一致', async (t) => {
  await t.test('是正数且在合理区间', () => {
    assert.ok(KEEP_ANGLE_DEG > 0 && KEEP_ANGLE_DEG <= 90)
  })
})
