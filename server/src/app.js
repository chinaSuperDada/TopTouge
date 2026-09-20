const express = require('express')
const morgan = require('morgan')

const { userId } = require('./middleware/userId')
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler')

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
    res.json({ status: 'ok', dataSource: require('./config').dataSource })
  })

  // 评论与路况挂在路线下面，需要 routeId
  app.use('/api/routes/:id/comments', commentsRouter)
  app.use('/api/routes/:id/road-conditions', roadConditionsRouter)
  app.use('/api/routes', routesRouter)

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}

module.exports = { createApp }
