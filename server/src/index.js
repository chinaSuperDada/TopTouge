const config = require('./config')
const { createApp } = require('./app')
const { seedMockRoutes } = require('./store/seed')

const inserted = seedMockRoutes()
if (inserted > 0) {
  console.log(`[TopTouge] 已灌入 ${inserted} 条 mock 路线（数据源: ${config.dataSource}）`)
}

const app = createApp()
app.listen(config.port, () => {
  console.log(`[TopTouge] 服务已启动 http://localhost:${config.port}`)
  console.log(`[TopTouge] 固定测试用户: ${config.testUserId}`)
})
