const mock = require('../../utils/mock')

/**
 * 自己传的路线，卡片上要给的标记。
 *
 * 首页会列出自己的私有路线和待审路线（别人看不到）。不标出来的话
 * 用户会以为「私有」没生效 —— 明明说了别人看不到，却在首页看到了。
 *
 * 公开且已通过的自己的路线不标记：它和别人的路线没区别，标了是噪音。
 *
 * @returns {{text, cls}|null} null 表示不需要标记
 */
function describeMyRoute(route) {
  if (!route.isMine) return null

  if (route.visibility === 'private') {
    return { text: '私有 · 仅自己可见', cls: 'badge-private' }
  }
  if (route.reviewStatus === 'pending') {
    return { text: '审核中', cls: 'badge-pending' }
  }
  if (route.reviewStatus === 'rejected') {
    return { text: '已下架', cls: 'badge-rejected' }
  }
  return null
}

Page({
  data: {
    // 活动位轮播
    banners: [],
    bannerIndex: 0,

    // 当前位置
    location: { province: '', city: '' },

    // 筛选条件
    province: 'all',
    city: 'all',
    difficulty: 'all',
    roadType: 'all',
    sort: 'hot',

    // 筛选器的选项与当前显示文案
    provinceIndex: 0,   // 0 表示「全部省份」
    cityIndex: 0,
    difficultyIndex: 0,
    roadTypeIndex: 0,
    sortIndex: 0,

    provinceLabels: [],
    cityLabels: [],
    difficultyLabels: [],
    roadTypeLabels: [],
    sortLabels: [],

    // 列表
    routes: [],
    loading: true
  },

  onLoad() {
    this.initOptions()
    // 定位只是为了「离我最近」排序，拿不到也不影响 —— 所以不 await
    this.loadLocation()
    this.loadRoutes()
    this.loadBanners()
  },

  onShow() {
    // 切 tab 回来时同步底部选中态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 })
    }
  },

  onPullDownRefresh() {
    this.loadRoutes().finally(() => wx.stopPullDownRefresh())
  },

  /** 把选项转成 picker 需要的格式 */
  initOptions() {
    const { REGIONS, DIFFICULTY_OPTIONS, ROAD_TYPE_OPTIONS, SORT_OPTIONS } = mock

    this.setData({
      // picker 的 range 是纯字符串数组
      provinceLabels: ['全部省份', ...REGIONS.map((r) => r.province)],
      difficultyLabels: DIFFICULTY_OPTIONS.map((o) => o.label),
      roadTypeLabels: ROAD_TYPE_OPTIONS.map((o) => o.label),
      sortLabels: SORT_OPTIONS.map((o) => o.label),
      cityLabels: ['全部城市']
    })
  },

  /**
   * 拉活动位。
   *
   * 后端会把「人工活动」和「算法位」合并后返回 ——
   * 算法位（本周最热、新路线、高难度）是动态算的，不落库。
   * 所以活动位必须等区域确定后再拉，不能写死在 initOptions 里。
   */
  loadBanners() {
    return mock
      .getBanners({ province: this.data.province, city: this.data.city })
      .then((banners) => {
        this.setData({ banners, bannerIndex: 0 })
      })
      .catch(() => {
        // 活动位拉不到不影响看路线
        this.setData({ banners: [] })
      })
  },

  /**
   * 定位当前城市。
   *
   * 失败不弹错误 —— 用户可能只是没给权限，不影响浏览，
   * 只是「离我最近」排序和城市筛选用不了默认值。
   */
  loadLocation() {
    return mock
      .getCurrentLocation()
      .then((loc) => {
        // 真实定位只给坐标，不给省市 —— 要拿到城市得调高德的逆地理编码，
        // 那需要额外配置。所以这里只记录坐标（「离我最近」排序要用），
        // 省市筛选保持「全部」，用户自己选。
        this.setData({ location: loc })
      })
      .catch(() => {
        // 定位失败不影响浏览，保持默认
      })
  },

  /* ==================== 筛选 ==================== */

  onProvinceChange(e) {
    const index = Number(e.detail.value)
    const province = index === 0 ? 'all' : mock.REGIONS[index - 1].province
    // 省份一变，城市列表跟着换，并重置为「全部城市」
    const cityLabels = index === 0 ? ['全部城市'] : ['全部城市', ...mock.REGIONS[index - 1].cities]

    this.setData({ provinceIndex: index, province, cityLabels, cityIndex: 0, city: 'all' })
    this.loadRoutes()
  },

  onCityChange(e) {
    const index = Number(e.detail.value)
    this.setData({ cityIndex: index, city: index === 0 ? 'all' : this.data.cityLabels[index] })
    this.loadRoutes()
  },

  onDifficultyChange(e) {
    const index = Number(e.detail.value)
    this.setData({
      difficultyIndex: index,
      difficulty: mock.DIFFICULTY_OPTIONS[index].value
    })
    this.loadRoutes()
  },

  onRoadTypeChange(e) {
    const index = Number(e.detail.value)
    this.setData({
      roadTypeIndex: index,
      roadType: mock.ROAD_TYPE_OPTIONS[index].value
    })
    this.loadRoutes()
  },

  onSortChange(e) {
    const index = Number(e.detail.value)
    this.setData({ sortIndex: index, sort: mock.SORT_OPTIONS[index].value })
    this.loadRoutes()
  },

  onResetFilters() {
    this.setData({
      provinceIndex: 0, cityIndex: 0, difficultyIndex: 0, roadTypeIndex: 0, sortIndex: 0,
      province: 'all', city: 'all', difficulty: 'all', roadType: 'all', sort: 'hot'
    })
    this.loadRoutes()
  },

  /* ==================== 数据 ==================== */

  loadRoutes() {
    this.setData({ loading: true })

    return mock
      .queryRoutes({
        province: this.data.province,
        city: this.data.city,
        difficulty: this.data.difficulty,
        roadType: this.data.roadType,
        sort: this.data.sort,
        // 「离我最近」要在服务端按起点算距离，必须把坐标传过去。
        // 定位失败时 location 里没有坐标，传 undefined 让后端回落到热度排序
        lat: this.data.location.lat,
        lng: this.data.location.lng
      })
      .then((routes) => {
        this.setData({ routes: routes.map(this.decorate), loading: false })
      })
      .catch(() => {
        this.setData({ loading: false })
      })
  },

  /**
   * 把原始数据转成卡片需要的展示文案。
   *
   * 缩略图用 CSS 渐变画，不引图片资源 —— 省包体积，也不用维护素材。
   * 配色按 id 取模分配，保证相邻路线颜色不同，视觉上能区分。
   */
  decorate(route) {
    const km = route.distanceMeters / 1000
    const distanceText = km < 1 ? `${Math.round(route.distanceMeters)}m` : `${km.toFixed(1)}km`

    const ROAD_TYPE_LABEL = { mountain: '山路', track: '赛道', gravel: '非铺装', highway: '公路' }
    const roadTypeText = ROAD_TYPE_LABEL[route.roadType] || '山路'

    return {
      ...route,
      distanceText,
      roadTypeText,
      // 「离我最近」排序时展示，方便用户判断远近
      fromMeText: route.distanceFromMeMeters < 1000
        ? '附近'
        : `${Math.round(route.distanceFromMeMeters / 1000)}km`,
      // 缩略图配色：从固定色板里按 id 取
      thumbClass: `thumb-${route.id % 6}`,
      // 星级用小方块画，比字符整齐
      stars: [1, 2, 3, 4, 5],
      // 自己传的路线要标出来，见 myBadge
      myBadge: describeMyRoute(route)
    }
  },

  onRouteTap(e) {
    wx.navigateTo({ url: `/pages/route-detail/route-detail?id=${e.currentTarget.dataset.id}` })
  },

  /**
   * 活动位点击。
   *
   * 后端已经算好跳转目标放在 link 里（算法位指向具体路线，
   * 平台活动可能指向外链或没有目标），这里照做就行。
   */
  onBannerTap(e) {
    const { title, link } = e.currentTarget.dataset

    if (!link) {
      // 平台活动可能只是通知，没有跳转目标
      wx.showToast({ title, icon: 'none' })
      return
    }

    // 只认小程序内部路径 —— 后端算出来的 link 都是 /pages/... 形式。
    // 万一将来配了外链，navigateTo 会直接报错，不如提前挡掉
    if (!link.startsWith('/pages/')) {
      wx.showToast({ title: '暂不支持该活动跳转', icon: 'none' })
      return
    }

    wx.navigateTo({
      url: link,
      fail: () => wx.showToast({ title: '活动目标暂不可用', icon: 'none' })
    })
  },

  /** 轮播切换时记下当前页，用于底部指示点 */
  onBannerChange(e) {
    this.setData({ bannerIndex: e.detail.current })
  }
})
