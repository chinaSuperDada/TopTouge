const test = require('node:test')
const assert = require('node:assert')

const { userId, WX_OPENID_HEADER } = require('../src/middleware/userId')

/** 造一个最小的 req 对象，只需支持 get() */
function fakeReq(headers = {}) {
  return {
    get(name) {
      return headers[name.toLowerCase()]
    }
  }
}

function run(headers) {
  const req = fakeReq(headers)
  let called = false
  userId(req, {}, () => {
    called = true
  })
  assert.ok(called, 'next() 应被调用')
  return req
}

test('用户身份解析', async (t) => {
  await t.test('优先用微信云托管注入的 openid', () => {
    const req = run({ [WX_OPENID_HEADER]: 'oABC123' })
    assert.strictEqual(req.userId, 'wx_oABC123')
    assert.strictEqual(req.userSource, 'wechat')
  })

  await t.test('openid 优先级高于手动的 x-user-id', () => {
    const req = run({
      [WX_OPENID_HEADER]: 'oReal',
      'x-user-id': 'someone-else'
    })
    assert.strictEqual(req.userId, 'wx_oReal')
    assert.strictEqual(req.userSource, 'wechat')
  })

  await t.test('没有 openid 时用 x-user-id', () => {
    const req = run({ 'x-user-id': 'test-user-002' })
    assert.strictEqual(req.userId, 'test-user-002')
    assert.strictEqual(req.userSource, 'manual')
  })

  await t.test('两者都没有时回落到固定测试用户', () => {
    const req = run({})
    assert.ok(req.userId)
    assert.strictEqual(req.userSource, 'fallback')
  })

  await t.test('空白的请求头被忽略', () => {
    const req = run({ [WX_OPENID_HEADER]: '   ', 'x-user-id': '' })
    assert.strictEqual(req.userSource, 'fallback')
  })

  await t.test('空白 openid 不会覆盖有效的 x-user-id', () => {
    const req = run({ [WX_OPENID_HEADER]: '  ', 'x-user-id': 'manual-user' })
    assert.strictEqual(req.userId, 'manual-user')
    assert.strictEqual(req.userSource, 'manual')
  })

  await t.test('不同 openid 得到不同身份', () => {
    const a = run({ [WX_OPENID_HEADER]: 'oAAA' })
    const b = run({ [WX_OPENID_HEADER]: 'oBBB' })
    assert.notStrictEqual(a.userId, b.userId)
  })

  await t.test('加 wx_ 前缀避免与手动 id 撞车', () => {
    const req = run({ [WX_OPENID_HEADER]: 'test-user-001' })
    // 不加前缀的话就会和本地测试用户混淆
    assert.strictEqual(req.userId, 'wx_test-user-001')
    assert.notStrictEqual(req.userId, 'test-user-001')
  })
})
