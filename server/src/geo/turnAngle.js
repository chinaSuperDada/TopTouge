const { bearingDeg } = require('./bearing')

/**
 * 相邻三点构成的转向角，归一化到 (-180, 180]。
 * 正值表示右转（顺时针），负值表示左转，0 表示直行。
 *
 * @param {{lat:number, lng:number}} p0
 * @param {{lat:number, lng:number}} p1 转向顶点
 * @param {{lat:number, lng:number}} p2
 * @returns {number}
 */
function turnAngleDeg(p0, p1, p2) {
  const incoming = bearingDeg(p0, p1)
  const outgoing = bearingDeg(p1, p2)

  let delta = outgoing - incoming
  // 归一化到 (-180, 180]
  delta = ((delta + 180) % 360 + 360) % 360 - 180
  if (delta === -180) delta = 180

  // 180 度调头落在区间边界上，浮点累加会算出 -179.999 之类，
  // 导致「急弯」判定漏掉。把贴近边界的值吸附回 ±180。
  if (delta < -179.9) delta = -180
  else if (delta > 179.9) delta = 180

  return delta
}

module.exports = { turnAngleDeg }
