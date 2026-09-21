const test = require('node:test')
const assert = require('node:assert')

const { buildAmapUrl, formatViaAddr, formatPoint } = require('../../miniprogram/utils/amapShare')

/**
 * 下面这组数据直接取自高德 App 真实分享出来的链接，
 * 用来锁定格式 —— 高德改格式时这个测试会失败，能及时发现。
 */
const REAL_ROUTE = {
  name: '万科西庐',
  startName: '万科西庐西溪正庐',
  startPoint: { lat: 30.29165068979639, lng: 120.05523025989534 },
  endPoint: { lat: 30.293556742982357, lng: 120.05629107356074 },
  waypoints: [
    { name: '青化山下', lat: 30.07774485593786, lng: 120.32005950808524 },
    { name: '诸坞林道青化书屋', lat: 30.04589507310756, lng: 120.30202031135562 },
    { name: '白风岭', lat: 30.040764953779377, lng: 120.30034258961678 }
  ]
}

/** 从生成的 URL 里取参数 */
function paramsOf(url) {
  const raw = url.split('__r=')[1].replace(/^&/, '')
  const out = {}
  for (const pair of raw.split('&')) {
    const i = pair.indexOf('=')
    if (i > 0) out[pair.slice(0, i)] = decodeURIComponent(pair.slice(i + 1))
  }
  return out
}

test('formatPoint', async (t) => {
  await t.test('输出 经度,纬度,名称', () => {
    assert.strictEqual(
      formatPoint({ lat: 30.29, lng: 120.05 }, '某地'),
      '120.05,30.29,某地'
    )
  })

  await t.test('保留全精度，不做四舍五入', () => {
    const p = formatPoint({ lat: 30.29165068979639, lng: 120.05523025989534 }, 'x')
    assert.ok(p.includes('120.05523025989534'), '经度应保持原值')
    assert.ok(p.includes('30.29165068979639'), '纬度应保持原值')
  })

  await t.test('名称里的逗号被替换（否则破坏结构）', () => {
    const p = formatPoint({ lat: 1, lng: 2 }, '甲,乙')
    assert.strictEqual(p.split(',').length, 3, '逗号数量应为 2 个（两个分隔符）')
  })

  await t.test('名称为空不报错', () => {
    assert.strictEqual(formatPoint({ lat: 1, lng: 2 }), '2,1,')
  })
})

test('formatViaAddr 的字段分组', async (t) => {
  await t.test('空数组返回空串', () => {
    assert.strictEqual(formatViaAddr([]), '')
    assert.strictEqual(formatViaAddr(null), '')
  })

  await t.test('按 经度组,纬度组,名称组 排列，组内用 | 分隔', () => {
    const result = formatViaAddr([
      { name: 'A', lat: 30.1, lng: 120.1 },
      { name: 'B', lat: 30.2, lng: 120.2 }
    ])
    assert.strictEqual(result, '120.1|120.2,30.1|30.2,A|B')
  })

  await t.test('名称里的 | 和 , 被替换（否则破坏分组）', () => {
    const result = formatViaAddr([{ name: '甲|乙,丙', lat: 1, lng: 2 }])
    const groups = result.split(',')
    assert.strictEqual(groups.length, 3, '应仍是三组')
    assert.ok(!groups[2].includes('|'), '名称组内不应再有分隔符')
  })

  await t.test('三个组的元素个数始终一致', () => {
    for (const n of [1, 2, 3, 5]) {
      const wps = Array.from({ length: n }, (_, i) => ({ name: `p${i}`, lat: 30 + i * 0.01, lng: 120 + i * 0.01 }))
      const groups = formatViaAddr(wps).split(',')
      const counts = groups.map((g) => g.split('|').length)
      assert.deepStrictEqual(counts, [n, n, n], `${n} 个途经点时分组数不对`)
    }
  })
})

test('buildAmapUrl', async (t) => {
  await t.test('与高德真实分享链接逐字段一致', () => {
    const p = paramsOf(buildAmapUrl(REAL_ROUTE))

    assert.strictEqual(p.saddr, '120.05523025989534,30.29165068979639,万科西庐西溪正庐')
    assert.strictEqual(p.daddr, '120.05629107356074,30.293556742982357,万科西庐')
    assert.strictEqual(
      p.viaaddr,
      '120.32005950808524|120.30202031135562|120.30034258961678,' +
        '30.07774485593786|30.04589507310756|30.040764953779377,' +
        '青化山下|诸坞林道青化书屋|白风岭'
    )
  })

  await t.test('域名与路径正确', () => {
    const url = buildAmapUrl(REAL_ROUTE)
    assert.ok(url.startsWith('https://m.amap.com/navigation/carmap/__r='))
  })

  await t.test('无途经点时不含 viaaddr', () => {
    const url = buildAmapUrl({ ...REAL_ROUTE, waypoints: [] })
    assert.ok(!url.includes('viaaddr'), '空途经点不应生成 viaaddr 参数')
  })

  await t.test('缺起终点返回 null', () => {
    assert.strictEqual(buildAmapUrl(null), null)
    assert.strictEqual(buildAmapUrl({}), null)
    assert.strictEqual(buildAmapUrl({ startPoint: REAL_ROUTE.startPoint }), null)
  })

  await t.test('中文名称做了 URL 编码', () => {
    const url = buildAmapUrl(REAL_ROUTE)
    assert.ok(!/[一-龥]/.test(url.split('__r=')[1]), '参数部分不应有未编码的中文')
    assert.ok(url.includes('%E4%B8%87'), '「万」应被编码')
  })

  await t.test('多个途经点都带上（不像高德的 via 只支持一个）', () => {
    const p = paramsOf(buildAmapUrl(REAL_ROUTE))
    assert.strictEqual(p.viaaddr.split(',')[0].split('|').length, 3)
  })
})
