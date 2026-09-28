/**
 * 定位工具。
 *
 * 三个要点：
 *
 * 1. show-location 只负责「已授权时显示蓝点」，它不会主动申请权限。
 *    要先调 wx.getLocation（或 startLocationUpdate）触发授权弹窗，
 *    用户同意之后地图上才会出现蓝点。
 *
 * 2. 用户拒绝过之后，再调 API 不会弹窗，会直接走 fail。
 *    这时要引导他去「设置」里手动开 —— 只有 wx.openSetting 能改这个开关。
 *
 * 3. 定位失败不该阻塞任何功能。用户可能只是不想给权限，
 *    浏览路线、看地图都不该受影响，所以失败一律 resolve 而不是 reject。
 */

/**
 * 申请并获取当前位置。
 *
 * @param {{silent?: boolean}} options silent=true 时不弹「去设置」的引导
 * @returns {Promise<{lat, lng} | null>} 拿不到就返回 null，不抛错
 */
function getLocation(options = {}) {
  const { silent = false } = options

  return new Promise((resolve) => {
    wx.getLocation({
      type: 'gcj02',
      success: (res) => resolve({ lat: res.latitude, lng: res.longitude }),
      fail: (err) => {
        const msg = (err && err.errMsg) || ''
        // 用户明确拒绝过，且非静默模式 → 引导去设置页
        if (!silent && msg.includes('auth deny')) {
          promptOpenSetting()
        }
        resolve(null)
      }
    })
  })
}

/** 弹一个引导，让用户去设置页打开定位 */
function promptOpenSetting() {
  wx.showModal({
    title: '需要定位权限',
    content: '开启后才能在地图上看到你的位置、使用「离我最近」排序。',
    confirmText: '去设置',
    cancelText: '暂不',
    success: (res) => {
      if (res.confirm) {
        wx.openSetting({
          // 用户从设置页回来时不自动重试，由调用方决定何时再取
          fail: () => {}
        })
      }
    }
  })
}

/**
 * 确保已有定位权限。
 *
 * 用 wx.getSetting 查权限状态，比直接调 getLocation 更可控 ——
 * 能从返回值区分「从没问过」「拒绝过」「已同意」三种情况，
 * 已同意时不必再走一次 API。
 *
 * @returns {Promise<boolean>}
 */
function hasLocationAuth() {
  return new Promise((resolve) => {
    wx.getSetting({
      success: (res) => resolve(Boolean(res.authSetting['scope.userLocation'])),
      fail: () => resolve(false)
    })
  })
}

module.exports = { getLocation, hasLocationAuth, promptOpenSetting }
