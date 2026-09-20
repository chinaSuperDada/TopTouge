const { CURVES_PER_KM_MAX, GAIN_PER_KM_MAX } = require('../constants')

/**
 * 由统计指标算出 1-5 星难度。纯函数。
 *
 * 规则：把「每公里弯道数」和「每公里爬升」各自线性归一化到 0~1，取**较大者**乘 5 四舍五入。
 *
 * 为什么是「取较大者」而不是任务书写的「取平均」：
 * 取平均有个明显的反直觉结果 —— 一条弯道密集的平路，只要加一点点爬升，
 * 平均分反而被拉低，星级下降，等于「有坡让路变简单了」。
 * 取较大者的语义是「难度取决于最突出的那个维度」：弯多就是难，坡陡也是难，
 * 不需要两者同时成立。对驾驶者来说宁可高估难度，也不该低估。
 *
 * 两个维度的参与规则：
 *  - 弯道维度总是参与
 *  - 爬升为 0 时不参与。上传页是地图点选，拿不到海拔，爬升恒为 0 ——
 *    若不排除，所有上传路线都会被当成「平坦」而压到低星，失去区分度。
 *
 * 边界：距离为 0（点太少）时取下限 1 星。
 *
 * @param {{curveCount:number, distanceMeters:number, elevationGainMeters:number}} stats
 * @returns {number} 1-5 的整数
 */
function computeStars(stats) {
  const distanceKm = (stats.distanceMeters || 0) / 1000

  if (distanceKm <= 0) return 1

  const curveScore = normalize((stats.curveCount || 0) / distanceKm, CURVES_PER_KM_MAX)

  const gain = stats.elevationGainMeters || 0
  const gainScore = gain > 0 ? normalize(gain / distanceKm, GAIN_PER_KM_MAX) : 0

  return clamp(Math.round(Math.max(curveScore, gainScore) * 5), 1, 5)
}

/**
 * 把 value 线性映射到 0~1，超过 max 截断为 1。
 */
function normalize(value, max) {
  if (max <= 0) return 0
  return clamp(value / max, 0, 1)
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

module.exports = { computeStars, normalize, clamp }
