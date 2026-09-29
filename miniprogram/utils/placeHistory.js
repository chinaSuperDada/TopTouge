/**
 * 地点搜索历史。
 *
 * 用户选过的地点存本地，下次点搜索框时直接列出来 —— 跑山的人经常
 * 反复搜同一批地方（常跑的那几座山），每次都要重新敲一遍很烦。
 *
 * 存本地而不是服务端：这是纯个人的使用习惯，没必要同步，
 * 也不该为了这点小事多发一次请求。
 *
 * 去重按**名称**而不是坐标 —— 同一个地方从不同关键词搜出来，
 * 高德的坐标会差几十米，按坐标去重会留下好几条看起来一样的记录。
 */

const STORAGE_KEY = 'toptouge_place_history'

/** 最多保留几条。太多了列表要滚动，反而不好找 */
const MAX_ITEMS = 10

/**
 * 读取历史。
 *
 * 任何异常（存储损坏、格式不对）都返回空数组 —— 历史记录丢了无所谓，
 * 不能让它把搜索功能带崩。
 */
function list() {
  try {
    const saved = wx.getStorageSync(STORAGE_KEY)
    if (!Array.isArray(saved)) return []

    // 过滤掉结构不完整的脏数据
    return saved.filter(
      (p) => p && typeof p.name === 'string' && Number.isFinite(p.lat) && Number.isFinite(p.lng)
    )
  } catch (err) {
    return []
  }
}

/**
 * 记一条。已存在的同名地点会被提到最前，而不是重复添加。
 *
 * @param {{name, lat, lng, district?, address?, location?}} place
 */
function add(place) {
  if (!place || !place.name) return
  if (!Number.isFinite(place.lat) || !Number.isFinite(place.lng)) return

  const item = {
    name: place.name,
    lat: place.lat,
    lng: place.lng,
    district: place.district || '',
    address: place.address || '',
    // 高德 SDK 要的是 "lng,lat" 字符串，存下来免得每次重新拼
    location: place.location || `${place.lng},${place.lat}`
  }

  const rest = list().filter((p) => p.name !== item.name)

  try {
    wx.setStorageSync(STORAGE_KEY, [item, ...rest].slice(0, MAX_ITEMS))
  } catch (err) {
    // 存储写不进去就算了，不影响选地点
  }
}

/** 清空历史 */
function clear() {
  try {
    wx.removeStorageSync(STORAGE_KEY)
  } catch (err) {
    // 同上
  }
}

module.exports = { list, add, clear, MAX_ITEMS }
