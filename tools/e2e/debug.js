const a = require('miniprogram-automator')

;(async () => {
  const mp = await a.launch({
    projectPath: '/Users/xingwu.wang/workspace/github/TopTouge/miniprogram',
    timeout: 60000
  })

  const page = await mp.reLaunch('/pages/route-detail/route-detail?id=1')
  await page.waitFor(2500)

  // 试不同的参数组合，找出能通过的
  const attempts = [
    { label: 'destination=高德地图', args: { latitude: 30.2935567, longitude: 120.05629107, name: '测试终点', destination: '高德地图' } },
    { label: 'destination=高德', args: { latitude: 30.2935567, longitude: 120.05629107, name: '测试终点', destination: '高德' } },
    { label: 'destination=腾讯地图', args: { latitude: 30.2935567, longitude: 120.05629107, name: '测试终点', destination: '腾讯地图' } }
  ]

  for (const { label, args } of attempts) {
    const r = await mp.evaluate((a) => {
      return new Promise((resolve) => {
        let done = false
        const finish = (o) => { if (!done) { done = true; resolve(o) } }
        try {
          const ctx = wx.createMapContext('routeMap')
          ctx.openMapApp({
            ...a,
            success: () => finish({ ok: true }),
            fail: (err) => finish({ ok: false, err: err.errMsg })
          })
        } catch (e) {
          finish({ ok: false, err: 'throw: ' + e.message })
        }
        setTimeout(() => finish({ ok: null, err: '无回调（可能弹出选择框等待用户）' }), 4000)
      })
    }, args)
    console.log(`  ${label}`)
    console.log(`     → ${JSON.stringify(r)}`)
  }

  await mp.close()
})().catch((e) => {
  console.error('异常:', e.message)
  process.exit(1)
})
