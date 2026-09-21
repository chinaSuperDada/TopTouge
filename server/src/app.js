const express = require('express')
const morgan = require('morgan')

const config = require('./config')
const { userId } = require('./middleware/userId')
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler')
const { asyncHandler } = require('./middleware/asyncHandler')

const routesRouter = require('./routes/routes.router')
const commentsRouter = require('./routes/comments.router')
const roadConditionsRouter = require('./routes/roadConditions.router')

/**
 * 组装 Express 应用。不监听端口 —— 便于测试里用 supertest 直接挂载。
 */
function createApp({ logger = true } = {}) {
  const app = express()

  if (logger) app.use(morgan('dev'))
  app.use(express.json({ limit: '5mb' }))
  app.use(userId)

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', dataSource: config.dataSource })
  })

  /**
   * 云托管 / 容器编排用的存活探针。
   * 数据源是 MySQL 时顺带探一次数据库连接，连不上就让探针失败，
   * 这样编排系统能及时发现而不是等业务请求报错。
   */
  app.get('/api/health/ready', asyncHandler(async (req, res) => {
    if (config.dataSource === 'mysql') {
      const { ping } = require('./db/pool')
      const ok = await ping()
      if (!ok) {
        res.status(503).json({ status: 'unavailable', reason: 'mysql' })
        return
      }
    }
    res.json({ status: 'ready', dataSource: config.dataSource })
  }))

  // 评论与路况挂在路线下面，需要 routeId
  app.use('/api/routes/:id/comments', commentsRouter)
  app.use('/api/routes/:id/road-conditions', roadConditionsRouter)
  app.use('/api/routes', routesRouter)

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}

module.exports = { createApp }
