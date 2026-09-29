const test = require('node:test')
const assert = require('node:assert')

/**
 * placeHistory 依赖 wx 的本地存储。这里用一个内存 Map 模拟，
 * 并支持「写入抛错」来测降级路径。
 */
let storage = new Map()
let throwOnSet = false

global.wx = {
  getStorageSync(key) {
    return storage.has(key) ? storage.get(key) : ''
  },
  setStorageSync(key, value) {
    if (throwOnSet) throw new Error('存储写满')
    storage.set(key, value)
  },
  removeStorageSync(key) {
    storage.delete(key)
  }
}

// 必须在挂上 global.wx 之后再引入
const placeHistory = require('../../miniprogram/utils/placeHistory')

const KEY = 'toptouge_place_history'
const place = (name, lat = 30, lng = 120) => ({ name, lat, lng })

test.beforeEach(() => {
  storage = new Map()
  throwOnSet = false
})

test('placeHistory', async (t) => {
  await t.test('初始为空', () => {
    assert.deepStrictEqual(placeHistory.list(), [])
  })

  await t.test('添加后能读到，且带上坐标', () => {
    placeHistory.add(place('西山公园', 30.25, 120.15))

    const list = placeHistory.list()
    assert.strictEqual(list.length, 1)
    assert.strictEqual(list[0].name, '西山公园')
    assert.strictEqual(list[0].lat, 30.25)
    assert.strictEqual(list[0].lng, 120.15)
    // location 是高德 SDK 要的 "lng,lat" 格式
    assert.strictEqual(list[0].location, '120.15,30.25')
  })

  await t.test('最新的排在最前', () => {
    placeHistory.add(place('第一个'))
    placeHistory.add(place('第二个'))

    const names = placeHistory.list().map((p) => p.name)
    assert.deepStrictEqual(names, ['第二个', '第一个'])
  })

  await t.test('同名地点不重复，而是提到最前', () => {
    placeHistory.add(place('西山公园'))
    placeHistory.add(place('龙泉寺'))
    placeHistory.add(place('西山公园'))

    const list = placeHistory.list()
    assert.strictEqual(list.length, 2, '同名不该产生第二条')
    assert.strictEqual(list[0].name, '西山公园', '应被提到最前')
  })

  await t.test('同名但坐标略有差异时，保留最新那条', () => {
    // 同一地方用不同关键词搜出来，高德给的坐标会差几十米
    placeHistory.add(place('西山公园', 30.25, 120.15))
    placeHistory.add(place('西山公园', 30.2501, 120.1501))

    const list = placeHistory.list()
    assert.strictEqual(list.length, 1)
    assert.strictEqual(list[0].lat, 30.2501, '应保留最新一次选的坐标')
  })

  await t.test('超过上限时丢弃最旧的', () => {
    for (let i = 1; i <= 15; i++) {
      placeHistory.add(place(`地点${i}`))
    }

    const list = placeHistory.list()
    assert.strictEqual(list.length, placeHistory.MAX_ITEMS)
    assert.strictEqual(list[0].name, '地点15', '最新的保留')
    assert.ok(
      !list.some((p) => p.name === '地点1'),
      '最旧的应被丢弃'
    )
  })

  await t.test('缺少名称或坐标的条目被忽略', () => {
    placeHistory.add(null)
    placeHistory.add({})
    placeHistory.add({ name: '没有坐标' })
    placeHistory.add({ name: '坐标非法', lat: NaN, lng: 120 })
    placeHistory.add({ lat: 30, lng: 120 })

    assert.deepStrictEqual(placeHistory.list(), [])
  })

  await t.test('存储里是脏数据时返回空数组，不抛错', () => {
    storage.set(KEY, '不是数组')
    assert.deepStrictEqual(placeHistory.list(), [])

    storage.set(KEY, [{ name: '缺坐标' }, null, { name: '正常', lat: 30, lng: 120 }])
    const list = placeHistory.list()
    assert.strictEqual(list.length, 1, '脏数据应被过滤掉')
    assert.strictEqual(list[0].name, '正常')
  })

  await t.test('写入失败时不抛错，也不影响已有历史', () => {
    placeHistory.add(place('先存一个'))

    throwOnSet = true
    // 不该抛错 —— 存储写不进去不能把选地点这个主流程带崩
    assert.doesNotThrow(() => placeHistory.add(place('存不进去的')))

    throwOnSet = false
    const list = placeHistory.list()
    assert.strictEqual(list.length, 1)
    assert.strictEqual(list[0].name, '先存一个')
  })

  await t.test('clear 清空历史', () => {
    placeHistory.add(place('西山公园'))
    assert.strictEqual(placeHistory.list().length, 1)

    placeHistory.clear()
    assert.deepStrictEqual(placeHistory.list(), [])
  })
})
