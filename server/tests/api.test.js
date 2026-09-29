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

  await t.test('返回完整路线，含抽稀轨迹与起终点', async () => {
    const res = await request(app).get('/api/routes/1').expect(200)

    assert.strictEqual(res.body.id, 1)
    assert.ok(Array.isArray(res.body.track), 'track 应为数组')
    assert.ok(res.body.track.length > 10, '抽稀轨迹仍应足够画线')
    assert.strictEqual(res.body.startPoint.radiusMeters, 30)
    assert.ok(Array.isArray(res.body.waypoints))
  })

  await t.test('默认不返回全量 referenceTrack（体量大）', async () => {
    const res = await request(app).get('/api/routes/1').expect(200)
    assert.strictEqual(res.body.referenceTrack, undefined)

    // 抽稀轨迹应明显短于全量
    const full = await request(app).get('/api/routes/1?fullTrack=1').expect(200)
    assert.ok(Array.isArray(full.body.referenceTrack))
    assert.ok(
      res.body.track.length < full.body.referenceTrack.length,
      `抽稀 ${res.body.track.length} 应少于全量 ${full.body.referenceTrack.length}`
    )
  })

  await t.test('?fullTrack=1 返回全量轨迹', async () => {
    const res = await request(app).get('/api/routes/1?fullTrack=1').expect(200)
    assert.ok(res.body.referenceTrack.length > 100, '全量轨迹应有几百个点')
    assert.ok(Array.isArray(res.body.track))
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

  await t.test('公开路线待审，不进公开列表；私有路线才直接可见', async () => {
    // 公开：一律 pending，审核通过前不出现在列表
    const publicRoute = await request(app)
      .post('/api/routes')
      .send({ name: '公开路线', roadWidth: 'wide', trackPoints: sampleTrack() })
      .expect(201)

    assert.strictEqual(publicRoute.body.reviewStatus, 'pending')
    assert.strictEqual(publicRoute.body.visibility, 'public')

    let list = await request(app).get('/api/routes').expect(200)
    assert.strictEqual(list.body.routes.length, 3, '待审的公开路线不该出现在列表里')

    // 私有：不审核，直接 approved，但同样不进公开列表
    const privateRoute = await request(app)
      .post('/api/routes')
      .send({
        name: '我的私藏路线',
        roadWidth: 'wide',
        visibility: 'private',
        trackPoints: sampleTrack()
      })
      .expect(201)

    assert.strictEqual(privateRoute.body.reviewStatus, 'approved', '私有路线不审核')
    assert.strictEqual(privateRoute.body.visibility, 'private')

    list = await request(app).get('/api/routes').expect(200)
    assert.strictEqual(list.body.routes.length, 3, '私有路线不该出现在公开列表里')

    // 但作者在「我的路线」能看到自己那条私有路线
    const mine = await request(app)
      .get('/api/me/routes')
      .set('x-user-id', 'test-user-001')
      .expect(200)

    assert.ok(
      mine.body.routes.some((r) => r.name === '我的私藏路线'),
      '作者应能在「我的路线」看到自己上传的'
    )
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

  await t.test('途经点会被保存', async () => {
    const res = await request(app)
      .post('/api/routes')
      .send({
        name: '带途经点',
        roadWidth: 'wide',
        trackPoints: sampleTrack(),
        waypoints: [
          { lat: 30.1, lng: 120.1, name: '观景台' },
          { lat: 30.2, lng: 120.2, name: '补给点' }
        ]
      })
      .expect(201)

    assert.strictEqual(res.body.waypoints.length, 2)
    assert.strictEqual(res.body.waypoints[0].name, '观景台')
    assert.strictEqual(res.body.waypoints[1].lat, 30.2)
  })

  await t.test('途经点缺坐标时被丢弃，不影响提交', async () => {
    const res = await request(app)
      .post('/api/routes')
      .send({
        name: '坏途经点',
        roadWidth: 'wide',
        trackPoints: sampleTrack(),
        waypoints: [{ lat: 30.1, lng: 120.1, name: '好的' }, { name: '没有坐标' }, null]
      })
      .expect(201)

    // 只留下合法的那一个 —— 途经点缺失不该让整条路线提交失败
    assert.strictEqual(res.body.waypoints.length, 1)
    assert.strictEqual(res.body.waypoints[0].name, '好的')
  })

  await t.test('不传途经点时为空数组', async () => {
    const res = await request(app)
      .post('/api/routes')
      .send({ name: '无途经点', roadWidth: 'wide', trackPoints: sampleTrack() })
      .expect(201)

    assert.deepStrictEqual(res.body.waypoints, [])
  })

  await t.test('省市与路型会被保存，用于筛选和辖区判断', async () => {
    const res = await request(app)
      .post('/api/routes')
      .send({
        name: '杭州路线',
        roadWidth: 'wide',
        roadType: 'gravel',
        province: '浙江省',
        city: '杭州市',
        trackPoints: sampleTrack()
      })
      .expect(201)

    assert.strictEqual(res.body.province, '浙江省')
    assert.strictEqual(res.body.city, '杭州市')
    assert.strictEqual(res.body.roadType, 'gravel')
  })

  await t.test('路型非法时回落到默认山路', async () => {
    const res = await request(app)
      .post('/api/routes')
      .send({ name: 'x', roadWidth: 'wide', roadType: '不存在的路型', trackPoints: sampleTrack() })
      .expect(201)

    assert.strictEqual(res.body.roadType, 'mountain')
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

test('POST /api/routes/check-duplicate 上传查重', async (t) => {
  t.beforeEach(resetWithSeed)

  await t.test('能查到同一条轨迹', async () => {
    const track = sampleTrack()

    await request(app)
      .post('/api/routes')
      .send({ name: '第一条', roadWidth: 'wide', trackPoints: track })
      .expect(201)

    const res = await request(app)
      .post('/api/routes/check-duplicate')
      .send({ trackPoints: track })
      .expect(200)

    assert.ok(Array.isArray(res.body.similar))
    // 完全相同的轨迹，重合度应该是 1，判为 duplicate
    const hit = res.body.similar.find((s) => s.name === '第一条')
    assert.ok(hit, '应能查到刚上传的那条')
    assert.strictEqual(hit.overlapRatio, 1)
    assert.strictEqual(hit.level, 'duplicate')
  })

  await t.test('轨迹少于 2 个点返回 400', async () => {
    const res = await request(app)
      .post('/api/routes/check-duplicate')
      .send({ trackPoints: [{ lat: 30, lng: 120 }] })
      .expect(400)

    assert.match(res.body.error.message, /至少需要 2 个点/)
  })

  await t.test('缺少 trackPoints 返回 400', async () => {
    const res = await request(app)
      .post('/api/routes/check-duplicate')
      .send({})
      .expect(400)

    assert.strictEqual(res.body.error.code, 'VALIDATION_FAILED')
  })

  await t.test('坐标全是 null 时被拒绝，不会当成 (0,0)', async () => {
    const res = await request(app)
      .post('/api/routes/check-duplicate')
      .send({ trackPoints: [{ lat: null, lng: null }, { lat: null, lng: null }] })
      .expect(400)

    assert.match(res.body.error.message, /lat 非法/)
  })
})

test('GET /api/routes/:id/similar 相似路线', async (t) => {
  t.beforeEach(resetWithSeed)

  await t.test('不存在的路线返回 404', async () => {
    await request(app).get('/api/routes/99999/similar').expect(404)
  })

  await t.test('结果里不含自己', async () => {
    const res = await request(app).get('/api/routes/1/similar').expect(200)

    assert.ok(Array.isArray(res.body.similar))
    res.body.similar.forEach((s) => {
      assert.notStrictEqual(s.id, 1, '相似路线不应包含自己')
    })
  })
})

test('POST /api/client-errors 客户端错误上报', async (t) => {
  t.beforeEach(resetWithSeed)

  await t.test('单条上报返回接收数', async () => {
    const res = await request(app)
      .post('/api/client-errors')
      .set('x-user-id', 'reporter-1')
      .send({
        code: 'REQUEST_FAILED',
        message: '请求 /api/routes 失败',
        detail: 'request:fail timeout',
        page: 'pages/route-list/route-list',
        url: '/api/routes',
        method: 'GET'
      })
      .expect(200)

    assert.strictEqual(res.body.received, 1)
  })

  await t.test('支持批量上报（客户端断网恢复后补报）', async () => {
    const res = await request(app)
      .post('/api/client-errors')
      .send([
        { code: 'A', message: '第一条' },
        { code: 'B', message: '第二条' },
        { code: 'C', message: '第三条' }
      ])
      .expect(200)

    assert.strictEqual(res.body.received, 3)
  })

  await t.test('缺少 message 的条目被丢弃，不影响其他条目', async () => {
    const res = await request(app)
      .post('/api/client-errors')
      .send([{ code: 'A', message: '有效' }, { code: 'B' }, null, { message: '' }])
      .expect(200)

    assert.strictEqual(res.body.received, 1)
  })

  await t.test('超长字段被截断，不会写爆数据库', async () => {
    const res = await request(app)
      .post('/api/client-errors')
      .send({
        code: 'LONG',
        message: 'x'.repeat(5000),
        detail: 'y'.repeat(10000)
      })
      .expect(200)

    assert.strictEqual(res.body.received, 1)

    const { listClientErrors } = require('../src/repositories/clientErrorRepo')
    const rows = await listClientErrors(10)
    const saved = rows.find((r) => r.code === 'LONG')

    assert.ok(saved, '应能查到刚上报的记录')
    assert.ok(saved.message.length <= 510, 'message 应被截断')
    assert.ok(saved.detail.length <= 2010, 'detail 应被截断')
  })

  await t.test('一次请求最多接收 20 条', async () => {
    const many = Array.from({ length: 50 }, (_, i) => ({
      code: 'BULK',
      message: `第 ${i} 条`
    }))

    const res = await request(app).post('/api/client-errors').send(many).expect(200)

    assert.strictEqual(res.body.received, 20, '超出部分应被丢弃')
  })

  await t.test('上报失败也不该抛错给客户端', async () => {
    // 空对象没有 message，全部被过滤，但接口仍应正常返回
    const res = await request(app).post('/api/client-errors').send({}).expect(200)
    assert.strictEqual(res.body.received, 0)
  })
})

test('版主申请', async (t) => {
  t.beforeEach(resetWithSeed)

  await t.test('条件不满足时返回进度，eligible 为 false', async () => {
    const res = await request(app)
      .get('/api/moderator/apply/eligibility')
      .set('x-user-id', 'newbie')
      .expect(200)

    // 新用户没传过路线也没跑过山
    assert.strictEqual(res.body.eligible, false)
    assert.strictEqual(res.body.routeCount, 0)
    assert.strictEqual(res.body.runCount, 0)
    assert.ok(res.body.minRoutes > 0)
    assert.ok(res.body.minRuns > 0)
  })

  await t.test('条件不满足时不能提交申请', async () => {
    const res = await request(app)
      .post('/api/moderator/apply')
      .set('x-user-id', 'newbie')
      .send({ province: '浙江省', city: '杭州市' })
      .expect(400)

    assert.strictEqual(res.body.error.code, 'NOT_ELIGIBLE')
  })

  await t.test('不选区域返回 400', async () => {
    const res = await request(app)
      .post('/api/moderator/apply')
      .set('x-user-id', 'newbie')
      .send({ province: '', city: '' })
      .expect(400)

    assert.strictEqual(res.body.error.code, 'REGION_REQUIRED')
  })

  await t.test('非管理员不能看待审申请列表', async () => {
    const res = await request(app)
      .get('/api/moderator/applications')
      .set('x-user-id', 'random-user')
      .expect(400)

    assert.strictEqual(res.body.error.code, 'NOT_ADMIN')
  })

  await t.test('非管理员不能审批', async () => {
    const res = await request(app)
      .post('/api/moderator/applications/1/review')
      .set('x-user-id', 'random-user')
      .send({ status: 'approved' })
      .expect(400)

    assert.strictEqual(res.body.error.code, 'NOT_ADMIN')
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
