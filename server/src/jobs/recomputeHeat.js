const cron = require('node-cron')
const routeRepo = require('../repositories/routeRepo')
const config = require('../config')

/**
 * 热度。
 *
 * 「热度最高」排序需要这个值，但按每次浏览实时累加会很糟 ——
 * 列表页刷一次就要写一次库，而且用户狂点刷新就能把自己的路线刷上榜首。
 *
 * 改成定时重算：热度不是业务数据，是推荐排序用的派生指标，
 * 延迟一小时没人会察觉，换来的是可以随时调权重、随时重来。
 *
 * 权重是拍脑袋定的，等有真实数据再调：
 *   跑一次 10 分 —— 最难伪造，最贵
 *   收藏一次 3 分
 *   评论一次 2 分
 *
 * 时间衰减：只算最近 30 天的行为。否则一条三年前火过的路线会
 * 永远压在榜首，新路线再也没机会露头。
 */

/** 参与计算的时间窗口（天） */
const WINDOW_DAYS = 30

const WEIGHTS = {
  run: 10,
  favorite: 3,
  comment: 2
}

/**
 * 重算全部路线的热度。
 *
 * 用一条 UPDATE ... JOIN 子查询在库里算完，不把数据拉到 Node 里 ——
 * 路线多起来之后拉全量再逐条更新会非常慢。
 *
 * @returns {Promise<number>} 受影响的行数
 */
async function recomputeHeat() {
  if (config.dataSource !== 'mysql') return 0

  const { getPool } = require('../db/pool')

  // 三个子查询各自独立聚合再 LEFT JOIN。
  // 不能在一个子查询里 JOIN 三张表 —— 会变成笛卡尔积，
  // 一条路线有 2 个收藏、3 条评论就会数出 6 行
  const [res] = await getPool().query(
    `UPDATE routes r
        LEFT JOIN (
          SELECT route_id, COUNT(*) AS n
            FROM run_records
           WHERE status = 'completed'
             AND created_at > DATE_SUB(NOW(), INTERVAL ${WINDOW_DAYS} DAY)
           GROUP BY route_id
        ) runs ON runs.route_id = r.id
        LEFT JOIN (
          SELECT route_id, COUNT(*) AS n
            FROM favorites
           WHERE created_at > DATE_SUB(NOW(), INTERVAL ${WINDOW_DAYS} DAY)
           GROUP BY route_id
        ) favs ON favs.route_id = r.id
        LEFT JOIN (
          SELECT route_id, COUNT(*) AS n
            FROM comments
           WHERE created_at > DATE_SUB(NOW(), INTERVAL ${WINDOW_DAYS} DAY)
           GROUP BY route_id
        ) cmts ON cmts.route_id = r.id
         SET r.heat = COALESCE(runs.n, 0) * ${WEIGHTS.run}
                    + COALESCE(favs.n, 0) * ${WEIGHTS.favorite}
                    + COALESCE(cmts.n, 0) * ${WEIGHTS.comment}`
  )

  return res.affectedRows
}

/**
 * 重算一次并打日志。
 */
async function recomputeHeatOnce() {
  const affected = await recomputeHeat()
  if (affected > 0) {
    console.log(`[heat] 已重算 ${affected} 条路线的热度`)
  }
  return affected
}

/**
 * 启动热度重算任务。
 *
 * 每小时第 37 分钟 —— 和轨迹清理（第 7 分钟）错开，
 * 两个任务都要扫表，撞在一起会互相拖慢。
 */
function startHeatJob() {
  cron.schedule('37 * * * *', () => {
    recomputeHeatOnce().catch((err) => {
      console.error('[heat] 重算失败:', err.message)
    })
  })
  console.log('[TopTouge] 热度重算任务已启动（每小时第 37 分钟）')
}

module.exports = { recomputeHeat, recomputeHeatOnce, startHeatJob, WEIGHTS, WINDOW_DAYS }
