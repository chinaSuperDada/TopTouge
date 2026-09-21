const a = require('miniprogram-automator')

/**
 * 探针：验证「跳小程序带完整路线」是否可行。
 *
 * 用途：拿到候选 appId 后，用它试跳，看落在哪个页面、参数有没有生效。
 *
 * 用法：把候选填进 CANDIDATES，真机运行本脚本（开发者工具跳不了）。
 *   node probe.js
 */

// 候选：{ appId, path, 说明 }
const CANDIDATES = [
  {
    label: '高德地图（待验证 appId）',
    appId: '', // 待填
    path: 'pages/navigation/carmap/carmap'
  }
]

const ROUTE = {
  name: '万科西庐',
  startPoint: { lat: 30.29165068979639, lng: 120.05523025989534 },
  endPoint: { lat: 30.293556742982357, lng: 120.05629107356074 },
  waypoints: [
    { name: '青化山下', lat: 30.07774485593786, lng: 120.32005950808524 }
  ]
}

;(async () => {
  const mp = await a.launch({
    projectPath: '/Users/xingwu.wang/workspace/github/TopTouge/miniprogram',
    timeout: 60000
  })

  const page = await mp.reLaunch('/pages/route-detail/route-detail?id=1')
  await page.waitFor(2500)

  for (const c of CANDIDATES) {
    if (!c.appId) {
      console.log(`跳过 ${c.label}：appId 未填`)
      continue
    }

    console.log(`\n=== 试 ${c.label} ===`)
    console.log(`  appId: ${c.appId}`)
    console.log(`  path : ${c.path}`)

    const r = await mp.evaluate(
      ({ appId, path, route }) => {
        return new Promise((resolve) => {
          let done = false
          const finish = (o) => {
            if (!done) {
              done = true
              resolve(o)
            }
          }
          try {
            wx.navigateToMiniProgram({
              appId,
              path,
              envVersion: 'release',
              success: () => finish({ ok: true }),
              fail: (err) => finish({ ok: false, err: err.errMsg })
            })
          } catch (e) {
            finish({ ok: false, err: 'throw: ' + e.message })
          }
          setTimeout(() => finish({ ok: null, err: '无回调' }), 5000)
        })
      },
      { appId: c.appId, path: c.path, route: ROUTE }
    )

    console.log(`  结果: ${JSON.stringify(r)}`)
  }

  await mp.close()
})().catch((e) => {
  console.error('异常:', e.message)
  process.exit(1)
})
