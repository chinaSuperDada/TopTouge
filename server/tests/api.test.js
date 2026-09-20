const test = require('node:test')
const assert = require('node:assert')
const request = require('supertest')

const { createApp } = require('../src/app')
const store = require('../src/store/memoryStore')
const { seedMockRoutes } = require('../src/store/seed')

const app = createApp({ logger: false })

/** 每个用例前把 store 清空并重新灌入 3 条 mock 路线 */
const resetWithSeed = () => {
  store.reset()
  seedMockRoutes()
}

const sampleTrack = () => [
  { lat: 30.0, lng: 120.0 },
  { lat: 30.001, lng: 120.0 },
  { lat: 30.002, lng: 120.0 },
  { lat: 30.002, lng: 120.002 },
  { lat: 30.002, lng: 120.004 }
]

test('GET /api/health', async () => {
  const res = await request(app).get('/api/health').expect(200)
  assert.strictEqual(res.body.status, 'ok')
  assert.strictEqual(res.body.dataSource, 'memory')
})

test('GET /api/routes 列表', async (t) => {
  t.beforeEach(resetWithSeed)

  await t.test('返回 3 条 mock 路线', async () => {
    const res = await request(app).get('/api/routes').expect(200)
    assert.strictEqual(res.body.routes.length, 3)
  })

  await t.test('列表项只含展示字段，不含轨迹', async () => {
    const res = await request(app).get('/api/routes').expect(200)
    const item = res.body.routes[0]

    assert.ok(item.id && item.name && item.distanceMeters)
    assert.ok(typeof item.difficultyStars === 'number')

    // 轨迹有几百个点，不该出现在列表里
    assert.strictEqual(item.referenceTrack, undefined)
    assert.strictEqual(item.waypoints, undefined)
  })

  await t.test('列表按难度携带星级，可用于展示', async () => {
    const res = await request(app).get('/api/routes').expect(200)
    const stars = res.body.routes.map((r) => r.difficultyStars)
    assert.deepStrictEqual(stars, [2, 3, 5])
  })
})

test('GET /api/routes/:id 详情', async (t) => {
  t.beforeEach(resetWithSeed)

  await t.test('返回完整路线，含轨迹与起终点', async () => {
    const res = await request(app).get('/api/routes/1').expect(200)

    assert.strictEqual(res.body.id, 1)
    assert.ok(Array.isArray(res.body.referenceTrack))
    assert.ok(res.body.referenceTrack.length > 100)
    assert.strictEqual(res.body.startPoint.radiusMeters, 30)
    assert.ok(Array.isArray(res.body.waypoints))
  })

  await t.test('内嵌最近的评论与路况提示（初始为空数组）', async () => {
    const res = await request(app).get('/api/routes/1').expect(200)
    assert.deepStrictEqual(res.body.comments, [])
    assert.deepStrictEqual(res.body.roadConditions, [])
  })

  await t.test('不存在的路线返回 404', async () => {
    const res = await request(app).get('/api/routes/9999').expect(404)
    assert.strictEqual(res.body.error.code, 'NOT_FOUND')
  })

  await t.test('非法 id 返回 400', async () => {
    const res = await request(app).get('/api/routes/abc').expect(400)
    assert.strictEqual(res.body.error.code, 'VALIDATION_FAILED')
  })
})

test('POST /api/routes 上传路线', async (t) => {
  t.beforeEach(resetWithSeed)

  await t.test('成功创建并返回 201 与全部难度字段', async () => {
    const payload = {
      name: '测试路线',
      roadWidth: 'narrow',
      trackPoints: sampleTrack()
    }

    const res = await request(app).post('/api/routes').send(payload).expect(201)

    assert.ok(res.body.id > 3, '新路线 id 应大于 3 条 mock')
    assert.strictEqual(res.body.name, '测试路线')
    assert.strictEqual(res.body.roadWidth, 'narrow')
    assert.strictEqual(res.body.vehicleType, 'car')
    assert.strictEqual(res.body.uploadedBy, 'test-user-001')

    // 派生字段都算出来了
    assert.ok(res.body.distanceMeters > 0)
    assert.ok(res.body.curveCount >= 1, '带直角弯的轨迹应识别出弯道')
    assert.ok(res.body.sharpCurveRatio >= 0 && res.body.sharpCurveRatio <= 1)
    assert.ok(res.body.difficultyStars >= 1 && res.body.difficultyStars <= 5)
  })

  await t.test('起终点自动取自轨迹首尾点', async () => {
    const track = sampleTrack()
    const res = await request(app)
      .post('/api/routes')
      .send({ name: '起终点测试', roadWidth: 'wide', trackPoints: track })
      .expect(201)

    assert.strictEqual(res.body.startPoint.lat, track[0].lat)
    assert.strictEqual(res.body.startPoint.lng, track[0].lng)
    assert.strictEqual(res.body.endPoint.lat, track[track.length - 1].lat)
  })

  await t.test('缺少 altitude 时按 0 处理，不报错', async () => {
    const res = await request(app)
      .post('/api/routes')
      .send({ name: '无海拔', roadWidth: 'wide', trackPoints: sampleTrack() })
      .expect(201)

    assert.strictEqual(res.body.elevationGainMeters, 0)
  })

  await t.test('创建后能从列表查到', async () => {
    await request(app)
      .post('/api/routes')
      .send({ name: '新路线', roadWidth: 'wide', trackPoints: sampleTrack() })
      .expect(201)

    const list = await request(app).get('/api/routes').expect(200)
    assert.strictEqual(list.body.routes.length, 4)
  })

  await t.test('可用 x-user-id 覆盖上传者', async () => {
    const res = await request(app)
      .post('/api/routes')
      .set('x-user-id', 'someone-else')
      .send({ name: '别人的路线', roadWidth: 'wide', trackPoints: sampleTrack() })
      .expect(201)

    assert.strictEqual(res.body.uploadedBy, 'someone-else')
  })

  await t.test('名称为空返回 400', async () => {
    const res = await request(app)
      .post('/api/routes')
      .send({ name: '   ', roadWidth: 'wide', trackPoints: sampleTrack() })
      .expect(400)
    assert.strictEqual(res.body.error.code, 'VALIDATION_FAILED')
  })

  await t.test('路宽非法返回 400', async () => {
    const res = await request(app)
      .post('/api/routes')
      .send({ name: 'x', roadWidth: '超宽', trackPoints: sampleTrack() })
      .expect(400)
    assert.match(res.body.error.message, /路宽/)
  })

  await t.test('轨迹点少于 2 个返回 400', async () => {
    const res = await request(app)
      .post('/api/routes')
      .send({ name: 'x', roadWidth: 'wide', trackPoints: [{ lat: 30, lng: 120 }] })
      .expect(400)
    assert.match(res.body.error.message, /至少需要 2 个点/)
  })

  await t.test('经纬度非法返回 400', async () => {
    const res = await request(app)
      .post('/api/routes')
      .send({
        name: 'x',
        roadWidth: 'wide',
        trackPoints: [{ lat: 200, lng: 120 }, { lat: 30, lng: 120 }]
      })
      .expect(400)
    assert.match(res.body.error.message, /lat 非法/)
  })

  await t.test('车型非法返回 400', async () => {
    const res = await request(app)
      .post('/api/routes')
      .send({ name: 'x', roadWidth: 'wide', vehicleType: 'motorcycle', trackPoints: sampleTrack() })
      .expect(400)
    assert.match(res.body.error.message, /车型/)
  })
})

test('评论接口', async (t) => {
  t.beforeEach(resetWithSeed)

  await t.test('初始为空', async () => {
    const res = await request(app).get('/api/routes/1/comments').expect(200)
    assert.deepStrictEqual(res.body.comments, [])
  })

  await t.test('提交后能查到', async () => {
    const created = await request(app)
      .post('/api/routes/1/comments')
      .send({ content: '这条路弯道很爽' })
      .expect(201)

    assert.strictEqual(created.body.content, '这条路弯道很爽')
    assert.strictEqual(created.body.routeId, 1)
    assert.strictEqual(created.body.userId, 'test-user-001')

    const list = await request(app).get('/api/routes/1/comments').expect(200)
    assert.strictEqual(list.body.comments.length, 1)
  })

  await t.test('按时间倒序，最新的在前', async () => {
    for (const content of ['第一条', '第二条', '第三条']) {
      await request(app).post('/api/routes/1/comments').send({ content }).expect(201)
      // 保证 createdAt 有区分度
      await new Promise((r) => setTimeout(r, 5))
    }

    const res = await request(app).get('/api/routes/1/comments').expect(200)
    assert.strictEqual(res.body.comments[0].content, '第三条')
  })

  await t.test('评论挂在各自的路线下，互不串台', async () => {
    await request(app).post('/api/routes/1/comments').send({ content: '路线1的评论' }).expect(201)

    const other = await request(app).get('/api/routes/2/comments').expect(200)
    assert.strictEqual(other.body.comments.length, 0)
  })

  await t.test('limit 生效', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/routes/1/comments').send({ content: `c${i}` }).expect(201)
    }
    const res = await request(app).get('/api/routes/1/comments?limit=2').expect(200)
    assert.strictEqual(res.body.comments.length, 2)
  })

  await t.test('内容为空返回 400', async () => {
    const res = await request(app).post('/api/routes/1/comments').send({ content: '  ' }).expect(400)
    assert.strictEqual(res.body.error.code, 'VALIDATION_FAILED')
  })

  await t.test('路线不存在时返回 404', async () => {
    await request(app).post('/api/routes/9999/comments').send({ content: 'x' }).expect(404)
    await request(app).get('/api/routes/9999/comments').expect(404)
  })

  await t.test('评论出现在详情页的 comments 里', async () => {
    await request(app).post('/api/routes/1/comments').send({ content: '详情页可见' }).expect(201)
    const detail = await request(app).get('/api/routes/1').expect(200)
    assert.strictEqual(detail.body.comments.length, 1)
    assert.strictEqual(detail.body.comments[0].content, '详情页可见')
  })
})

test('路况提示接口', async (t) => {
  t.beforeEach(resetWithSeed)

  await t.test('提交后能查到', async () => {
    const created = await request(app)
      .post('/api/routes/1/road-conditions')
      .send({ content: '路面有落石，注意避让' })
      .expect(201)

    assert.strictEqual(created.body.content, '路面有落石，注意避让')
    assert.strictEqual(created.body.routeId, 1)

    const list = await request(app).get('/api/routes/1/road-conditions').expect(200)
    assert.strictEqual(list.body.roadConditions.length, 1)
  })

  await t.test('默认只返回最近 10 条', async () => {
    for (let i = 0; i < 12; i++) {
      await request(app).post('/api/routes/1/road-conditions').send({ content: `r${i}` }).expect(201)
      await new Promise((r) => setTimeout(r, 3))
    }
    const res = await request(app).get('/api/routes/1/road-conditions').expect(200)
    assert.strictEqual(res.body.roadConditions.length, 10)
  })

  await t.test('内容为空返回 400', async () => {
    await request(app).post('/api/routes/1/road-conditions').send({ content: '' }).expect(400)
  })

  await t.test('路况出现在详情页的 roadConditions 里', async () => {
    await request(app).post('/api/routes/1/road-conditions').send({ content: '落石' }).expect(201)
    const detail = await request(app).get('/api/routes/1').expect(200)
    assert.strictEqual(detail.body.roadConditions.length, 1)
  })
})

test('错误处理', async (t) => {
  await t.test('未知路由返回 404 且结构统一', async () => {
    const res = await request(app).get('/api/nonexistent').expect(404)
    assert.ok(res.body.error.code)
    assert.ok(res.body.error.message)
  })

  await t.test('非法 JSON 体返回 400', async () => {
    const res = await request(app)
      .post('/api/routes')
      .set('Content-Type', 'application/json')
      .send('{ 坏掉的 json')
      .expect(400)
    assert.ok(res.body.error)
  })
})
