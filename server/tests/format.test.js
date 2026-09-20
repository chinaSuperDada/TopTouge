const test = require('node:test')
const assert = require('node:assert')

const {
  formatDistance,
  formatElevation,
  formatRatio,
  formatRoadWidth,
  formatStars,
  formatTime
} = require('../../miniprogram/utils/format')

test('formatDistance', async (t) => {
  await t.test('小于 1km 显示米并取整', () => {
    assert.strictEqual(formatDistance(0), '0m')
    assert.strictEqual(formatDistance(450.7), '451m')
    assert.strictEqual(formatDistance(999), '999m')
  })

  await t.test('1km 及以上显示公里一位小数', () => {
    assert.strictEqual(formatDistance(1000), '1.0km')
    assert.strictEqual(formatDistance(10700), '10.7km')
    assert.strictEqual(formatDistance(14500), '14.5km')
  })

  await t.test('非法输入不抛错', () => {
    assert.strictEqual(formatDistance(undefined), '0m')
    assert.strictEqual(formatDistance(null), '0m')
    assert.strictEqual(formatDistance('abc'), '0m')
  })
})

test('formatElevation', async (t) => {
  await t.test('转成米并取整', () => {
    assert.strictEqual(formatElevation(1300), '1300m')
    assert.strictEqual(formatElevation(0), '0m')
    assert.strictEqual(formatElevation(299.6), '300m')
  })

  await t.test('非法输入为 0m', () => {
    assert.strictEqual(formatElevation(undefined), '0m')
  })
})

test('formatRatio', async (t) => {
  await t.test('比例转百分比', () => {
    assert.strictEqual(formatRatio(0), '0%')
    assert.strictEqual(formatRatio(0.25), '25%')
    assert.strictEqual(formatRatio(1), '100%')
  })

  await t.test('非法输入为 0%', () => {
    assert.strictEqual(formatRatio(undefined), '0%')
  })
})

test('formatRoadWidth', async (t) => {
  await t.test('枚举转中文', () => {
    assert.strictEqual(formatRoadWidth('narrow'), '窄')
    assert.strictEqual(formatRoadWidth('medium'), '中')
    assert.strictEqual(formatRoadWidth('wide'), '宽')
  })

  await t.test('未知值原样返回，空值给占位符', () => {
    assert.strictEqual(formatRoadWidth('unknown'), 'unknown')
    assert.strictEqual(formatRoadWidth(''), '-')
    assert.strictEqual(formatRoadWidth(undefined), '-')
  })
})

test('formatStars', async (t) => {
  await t.test('星级转五格字符', () => {
    assert.strictEqual(formatStars(1), '★☆☆☆☆')
    assert.strictEqual(formatStars(3), '★★★☆☆')
    assert.strictEqual(formatStars(5), '★★★★★')
  })

  await t.test('越界值被夹到 1-5', () => {
    assert.strictEqual(formatStars(0), '★☆☆☆☆')
    assert.strictEqual(formatStars(99), '★★★★★')
    assert.strictEqual(formatStars(-3), '★☆☆☆☆')
  })

  await t.test('始终是 5 个字符', () => {
    for (const n of [0, 1, 2, 3, 4, 5, 6]) {
      assert.strictEqual(formatStars(n).length, 5, `stars=${n}`)
    }
  })

  await t.test('非法输入落到 1 星', () => {
    assert.strictEqual(formatStars(undefined), '★☆☆☆☆')
  })
})

test('formatTime', async (t) => {
  await t.test('空值返回空串', () => {
    assert.strictEqual(formatTime(''), '')
    assert.strictEqual(formatTime(undefined), '')
  })

  await t.test('非法时间返回空串', () => {
    assert.strictEqual(formatTime('not-a-date'), '')
  })

  await t.test('刚刚 / 分钟 / 小时 / 天', () => {
    const now = Date.now()
    assert.strictEqual(formatTime(new Date(now - 5 * 1000).toISOString()), '刚刚')
    assert.strictEqual(formatTime(new Date(now - 5 * 60 * 1000).toISOString()), '5分钟前')
    assert.strictEqual(formatTime(new Date(now - 3 * 3600 * 1000).toISOString()), '3小时前')
    assert.strictEqual(formatTime(new Date(now - 2 * 86400 * 1000).toISOString()), '2天前')
  })

  await t.test('超过 30 天显示日期', () => {
    const old = new Date(Date.now() - 60 * 86400 * 1000)
    const result = formatTime(old.toISOString())
    assert.match(result, /^\d{4}-\d{2}-\d{2}$/)
  })
})
