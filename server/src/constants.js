/**
 * 全局常量与可调参数。
 * 难度计算的阈值集中在这里，便于调参而不用改逻辑。
 */

// 转向角超过此值记为一次转向
const TURN_THRESHOLD_DEG = 30

// 弯道区间内峰值角超过此值记为急弯
const SHARP_TURN_DEG = 60

// 起终点区域默认半径（米）
const DEFAULT_RADIUS_METERS = 30

// 星级归一化的参考上限：每公里弯道数达到此值即视为该维度最难。
// 按真实山路标定（4-6 弯/km 已是急弯密集的盘山道）
const CURVES_PER_KM_MAX = 6

// 星级归一化的参考上限：每公里爬升达到此值（米）即视为该维度最难。
// 100m/km 相当于 10% 的持续陡坡
const GAIN_PER_KM_MAX = 100

// 只需支持汽车，预留扩展
const VEHICLE_TYPES = ['car']
const DEFAULT_VEHICLE_TYPE = 'car'

// 路宽，上传时手动填
const ROAD_WIDTHS = ['narrow', 'medium', 'wide']

// 列表默认返回条数
const DEFAULT_COMMENT_LIMIT = 20
const DEFAULT_ROAD_CONDITION_LIMIT = 10
const DETAIL_EMBED_LIMIT = 10

module.exports = {
  TURN_THRESHOLD_DEG,
  SHARP_TURN_DEG,
  DEFAULT_RADIUS_METERS,
  CURVES_PER_KM_MAX,
  GAIN_PER_KM_MAX,
  VEHICLE_TYPES,
  DEFAULT_VEHICLE_TYPE,
  ROAD_WIDTHS,
  DEFAULT_COMMENT_LIMIT,
  DEFAULT_ROAD_CONDITION_LIMIT,
  DETAIL_EMBED_LIMIT
}
