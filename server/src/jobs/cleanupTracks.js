const cron = require('node-cron')
const runRepo = require('../repositories/runRepo')
const config = require('../config')

/**
 * 清理过期的原始轨迹。
 *
 * 任务书要求：每小时执行一次，把 expiresAt < now 的记录的
 * rawTrackPoints 字段清空 —— **但不删整条记录**，score 和 rank 要保留。
 * 这是隐私承诺的一部分：用户跑完 72 小时后，原始轨迹就没了，
 * 但成绩还在榜上。
 */
async function cleanupOnce() {
  if (config.dataSource !== 'mysql') {
    // 内存模式本来重启就没了，不需要清理
    return 0
  }

  const cleared = await runRepo.clearExpiredTracks()
  if (cleared > 0) {
    console.log(`[cleanup] 已清空 ${cleared} 条过期轨迹（成绩保留）`)
  }
  return cleared
}

/**
 * 启动定时任务。
 *
 * 每小时的第 7 分钟跑 —— 错开整点，避免和其他定时任务撞在一起。
 */
function startCleanupJob() {
  // 每分钟 "7 * * * *" 是整点后第 7 分钟
  cron.schedule('7 * * * *', () => {
    cleanupOnce().catch((err) => {
      console.error('[cleanup] 执行失败:', err.message)
    })
  })
  console.log('[TopTouge] 轨迹清理任务已启动（每小时第 7 分钟）')
}

module.exports = { cleanupOnce, startCleanupJob }
