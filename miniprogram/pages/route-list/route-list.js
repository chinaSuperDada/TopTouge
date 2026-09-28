const mock = require('../../utils/mock')

Page({
  data: {
    // 活动位
    banners: [],

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
    this.loadLocation()
    this.loadRoutes()
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

  /** 把 mock 里的选项转成 picker 需要的格式 */
  initOptions() {
    const { REGIONS, DIFFICULTY_OPTIONS, ROAD_TYPE_OPTIONS, SORT_OPTIONS, BANNERS } = mock

    this.setData({
      banners: BANNERS,
      // picker 的 range 是纯字符串数组
      provinceLabels: ['全部省份', ...REGIONS.map((r) => r.province)],
      difficultyLabels: DIFFICULTY_OPTIONS.map((o) => o.label),
      roadTypeLabels: ROAD_TYPE_OPTIONS.map((o) => o.label),
      sortLabels: SORT_OPTIONS.map((o) => o.label),
      cityLabels: ['全部城市']
    })
  },

  /**
   * 定位当前城市。
   *
   * 失败不弹错误 —— 用户可能只是没给权限，不影响浏览，
   * 只是「离我最近」排序和城市筛选用不了默认值。
   */
  loadLocation() {
    mock
      .getCurrentLocation()
      .then((loc) => {
        const { REGIONS } = mock
        const provinceIndex = REGIONS.findIndex((r) => r.province === loc.province)

        if (provinceIndex < 0) {
          this.setData({ location: loc })
          return
        }

        // 定位到的省份默认选中，城市也一并选中
        const cityLabels = ['全部城市', ...REGIONS[provinceIndex].cities]
        const cityIndex = cityLabels.indexOf(loc.city)

        this.setData({
          location: loc,
          provinceIndex: provinceIndex + 1,
          province: loc.province,
          cityLabels,
          cityIndex: cityIndex > 0 ? cityIndex : 0,
          city: cityIndex > 0 ? loc.city : 'all'
        })
        this.loadRoutes()
      })
      .catch(() => {
        // 定位失败就保持「全部」，不影响使用
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
        sort: this.data.sort
      })
      .then((routes) => {
        this.setData({ routes: routes.map(this.decorate), loading: false })
      })
      .catch(() => {
        this.setData({ loading: false })
      })
  },

  /** 把原始数据转成卡片需要的展示文案 */
  decorate(route) {
    const km = route.distanceMeters / 1000
    const distanceText = km < 1 ? `${Math.round(route.distanceMeters)}m` : `${km.toFixed(1)}km`

    const ROAD_TYPE_LABEL = { mountain: '山路', track: '赛道', gravel: '非铺装', highway: '公路' }

    return {
      ...route,
      distanceText,
      roadTypeText: ROAD_TYPE_LABEL[route.roadType] || '山路',
      // 「离我最近」排序时展示，方便用户判断远近
      fromMeText: route.distanceFromMeMeters < 1000
        ? '附近'
        : `${Math.round(route.distanceFromMeMeters / 1000)}km`
    }
  },

  onRouteTap(e) {
    wx.navigateTo({ url: `/pages/route-detail/route-detail?id=${e.currentTarget.dataset.id}` })
  },

  onBannerTap(e) {
    // 活动详情页还没做，先给个提示
    const { title } = e.currentTarget.dataset
    wx.showToast({ title: `${title}（开发中）`, icon: 'none' })
  },

  onLocationTap() {
    wx.showToast({ title: '手动切换城市开发中', icon: 'none' })
  }
})
