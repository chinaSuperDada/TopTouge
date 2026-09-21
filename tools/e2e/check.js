/**
 * TopTouge 小程序端到端验证。
 *
 * 让「前端能不能用」变成可自动检查的，而不是只能靠人点。
 *
 * 运行前提：
 *   1. 微信开发者工具已打开本项目，且「设置 → 安全设置 → 服务端口」已开启
 *   2. 后端在跑：cd server && npm run dev
 *   3. npm install（在 tools/e2e 下）
 *
 * 运行：npm run check
 *
 * 选择器注意事项：
 *   自定义组件内部的 class 会被编译器加前缀（.route-card → .card--route-card），
 *   所以从页面侧查组件内部元素要用**组件标签名**（route-card），
 *   或者先拿到组件元素再在其内部查。
 *
 * 能验证：页面渲染、元素存在、文字内容、跳转、数据链路、控制台报错。
 * 不能验证：好不好看。
 */

const path = require('path')
const automator = require('miniprogram-automator')

const PROJECT_PATH = path.resolve(__dirname, '../../miniprogram')

const results = []
let failures = 0

function record(name, ok, detail = '') {
  results.push({ name, ok, detail })
  if (!ok) failures++
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`)
}

async function check(name, fn) {
  try {
    await fn()
  } catch (err) {
    record(name, false, err.message.split('\n')[0].slice(0, 100))
  }
}

/** 等条件成立，超时返回 false */
async function waitFor(fn, timeout = 8000, interval = 250) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try {
      if (await fn()) return true
    } catch (_) {
      /* 元素还没出现，继续等 */
    }
    await new Promise((r) => setTimeout(r, interval))
  }
  return false
}

/** 取某个元素/组件的文字，压掉空白 */
async function textOf(el) {
  if (!el) return ''
  return (await el.text()).replace(/\s+/g, ' ').trim()
}

/**
 * 在组件内部按 class 名查找元素。
 *
 * 不能直接写 `.send` —— 组件内的 class 会被编译器加上前缀，
 * 而前缀规则不固定：
 *   route-card 里的 .route-card  →  .card--route-card
 *   comment-list 里的 .send      →  .comment-list--send
 * 只能按后缀匹配，不要去猜前缀。
 */
async function findByClassSuffix(root, tag, suffix) {
  const els = await root.$$(tag)
  for (const el of els) {
    const cls = (await el.attribute('class')) || ''
    if (cls.split(/\s+/).some((c) => c === suffix || c.endsWith('--' + suffix))) {
      return el
    }
  }
  return null
}

async function main() {
  console.log('连接微信开发者工具…')

  let mini
  try {
    mini = await automator.launch({ projectPath: PROJECT_PATH, timeout: 60000 })
  } catch (err) {
    console.error('\n连接失败:', err.message)
    console.error('\n请确认：')
    console.error('  1. 开发者工具已打开本项目')
    console.error('  2. 「设置 → 安全设置 → 服务端口」已开启（改动后需重启工具）')
    process.exit(1)
  }

  console.log('已连接\n')

  const consoleErrors = []
  mini.on('console', (msg) => {
    if (msg.type === 'error') consoleErrors.push(String(msg.args.join(' ')))
  })

  try {
    /* ==================== 列表页 ==================== */
    console.log('【路线列表页】')
    const listPage = await mini.reLaunch('/pages/route-list/route-list')
    await listPage.waitFor(2000)

    await check('从后端加载到路线', async () => {
      const ok = await waitFor(async () => {
        const d = await listPage.data()
        return Array.isArray(d.routes) && d.routes.length > 0
      })
      const d = await listPage.data()
      record('从后端加载到路线', ok, ok ? `${d.routes.length} 条` : '超时（后端起了吗？）')
    })

    await check('页面标题渲染', async () => {
      const t = await textOf(await listPage.$('.header-title'))
      record('页面标题渲染', t === '跑山路线', `"${t}"`)
    })

    await check('路线卡片数量与数据一致', async () => {
      const d = await listPage.data()
      const cards = await listPage.$$('route-card')
      record('路线卡片数量与数据一致', cards.length === d.routes.length, `${cards.length} 个 = ${d.routes.length} 条`)
    })

    await check('卡片显示名称、距离、难度', async () => {
      const card = await listPage.$('route-card')
      const t = await textOf(card)
      const d = await listPage.data()
      const first = d.routes[0]

      const hasName = t.includes(first.name)
      const hasCurve = t.includes(String(first.curveCount))
      const hasStar = t.includes(String(first.difficultyStars))

      record(
        '卡片显示名称、距离、难度',
        hasName && hasCurve && hasStar,
        hasName && hasCurve && hasStar ? t.slice(0, 40) : `缺字段: ${t.slice(0, 40)}`
      )
    })

    await check('两个操作入口都在', async () => {
      const a = await textOf(await listPage.$('.fab-ghost'))
      const b = await textOf(await listPage.$('.fab-primary'))
      record('两个操作入口都在', Boolean(a && b), `${a} / ${b}`)
    })

    /* ==================== 详情页 ==================== */
    console.log('\n【路线详情页】')

    await check('点击卡片能进详情页', async () => {
      // 必须点组件内部真正渲染的 view，不能点 <route-card> 宿主元素 ——
      // 宿主上没有 tap 处理器，点击不会触发组件内的 bindtap
      const card = await findByClassSuffix(listPage, 'view', 'route-card')
      if (!card) throw new Error('找不到可点击的卡片元素')

      await card.tap()
      const ok = await waitFor(async () => (await mini.currentPage()).path.includes('route-detail'), 6000)
      record('点击卡片能进详情页', ok)
    })

    const detailPage = await mini.currentPage()
    await detailPage.waitFor(2000)

    await check('详情页加载到路线数据', async () => {
      const ok = await waitFor(async () => {
        const d = await detailPage.data()
        return d.route && d.route.id
      })
      const d = await detailPage.data()
      record('详情页加载到路线数据', ok, ok ? d.route.name : '超时')
    })

    await check('地图绑定了抽稀轨迹', async () => {
      const d = await detailPage.data()
      const n = d.polyline && d.polyline.length ? d.polyline[0].points.length : 0
      record('地图绑定了抽稀轨迹', n > 0, `${n} 个点`)
    })

    await check('起终点标记已生成', async () => {
      const d = await detailPage.data()
      const n = (d.markers || []).length
      record('起终点标记已生成', n > 0, `${n} 个`)
    })

    await check('难度面板渲染出指标', async () => {
      const panel = await detailPage.$('difficulty-panel')
      if (!panel) throw new Error('难度面板不存在')

      const t = await textOf(panel)
      const d = await detailPage.data()
      const hasCurve = t.includes(String(d.route.curveCount))
      record('难度面板渲染出指标', hasCurve, t.slice(0, 50))
    })

    await check('评论区块渲染', async () => {
      const el = await detailPage.$('comment-list')
      if (!el) throw new Error('评论区块不存在')
      const t = await textOf(el)
      record('评论区块渲染', t.includes('车友评论'), t.slice(0, 40))
    })

    await check('路况区块渲染', async () => {
      const el = await detailPage.$('road-condition-list')
      if (!el) throw new Error('路况区块不存在')
      const t = await textOf(el)
      record('路况区块渲染', t.includes('路况提示'), t.slice(0, 40))
    })

    await check('导航按钮存在', async () => {
      const t = await textOf(await detailPage.$('.navigate-btn'))
      record('导航按钮存在', t.includes('导航'), `"${t}"`)
    })

    await check('开始跑山按钮存在', async () => {
      const t = await textOf(await detailPage.$('.btn-primary'))
      record('开始跑山按钮存在', t.includes('开始跑山'), `"${t}"`)
    })

    /* ==================== 评论提交 ==================== */
    console.log('\n【评论提交（打通写链路）】')

    await check('能提交评论并刷新列表', async () => {
      const before = (await detailPage.data()).route.comments.length

      const input = await detailPage.$('comment-list input')
      if (!input) throw new Error('找不到评论输入框')

      await input.input('e2e 自动测试评论')

      const send = await findByClassSuffix(detailPage, 'view', 'send')
      if (!send) throw new Error('找不到发送按钮')

      await send.tap()

      const ok = await waitFor(async () => {
        const d = await detailPage.data()
        return d.route.comments.length > before
      })

      const after = (await detailPage.data()).route.comments.length
      record('能提交评论并刷新列表', ok, `${before} → ${after}`)
    })

    /* ==================== 上传页 ==================== */
    console.log('\n【上传页】')

    const uploadPage = await mini.navigateTo('/pages/route-upload/route-upload')
    await uploadPage.waitFor(1500)

    await check('默认是搜索模式', async () => {
      const d = await uploadPage.data()
      record('默认是搜索模式', d.mode === 'search', `mode=${d.mode}`)
    })

    await check('三个地点输入框都在', async () => {
      const texts = []
      for (const f of ['source', 'destination', 'waypoint']) {
        const el = await uploadPage.$(`input[data-field="${f}"]`)
        if (el) texts.push(f)
      }
      record('三个地点输入框都在', texts.length === 3, `${texts.length}/3`)
    })

    await check('能切到地图点选模式', async () => {
      const tabs = await uploadPage.$$('.tab')
      if (tabs.length < 2) throw new Error(`只找到 ${tabs.length} 个 Tab`)

      await tabs[1].tap()
      await uploadPage.waitFor(600)

      const d = await uploadPage.data()
      record('能切到地图点选模式', d.mode === 'manual', `mode=${d.mode}`)
    })

    /* ==================== 录制页 ==================== */
    console.log('\n【录制页】')

    const recordPage = await mini.navigateTo('/pages/route-record/route-record')
    await recordPage.waitFor(1500)

    await check('初始状态是 idle', async () => {
      const d = await recordPage.data()
      record('初始状态是 idle', d.status === 'idle', `status=${d.status}`)
    })

    await check('显示开始录制按钮', async () => {
      const t = await textOf(await recordPage.$('.btn-primary'))
      record('显示开始录制按钮', t.includes('开始录制'), `"${t}"`)
    })

    await check('初始计时为 00:00', async () => {
      const d = await recordPage.data()
      record('初始计时为 00:00', d.elapsedText === '00:00', `"${d.elapsedText}"`)
    })

    /* ==================== 控制台 ==================== */
    console.log('\n【控制台】')

    const ignorable = [/Failed to load resource/i, /net::ERR/i, /favicon/i, /请求失败/i]
    const realErrors = consoleErrors.filter((e) => !ignorable.some((r) => r.test(e)))

    record('无 JS 报错', realErrors.length === 0, realErrors.slice(0, 2).join(' | '))
  } finally {
    await mini.close()
  }

  console.log('\n' + '='.repeat(52))
  console.log(`共 ${results.length} 项｜通过 ${results.length - failures}｜失败 ${failures}`)

  if (failures > 0) {
    console.log('\n失败项：')
    results
      .filter((r) => !r.ok)
      .forEach((r) => console.log(`  ✗ ${r.name}${r.detail ? ' — ' + r.detail : ''}`))
  }

  process.exit(failures > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error('\n脚本异常:', err)
  process.exit(1)
})
