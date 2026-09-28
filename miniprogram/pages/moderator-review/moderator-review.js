const mock = require('../../utils/mock')

const ROAD_TYPE_LABEL = { mountain: '山路', track: '赛道', gravel: '非铺装', highway: '公路' }

/** 驳回的常见理由，做成快捷选项，省得每次手打 */
const REJECT_REASONS = [
  '轨迹不完整或明显有误',
  '路线描述与实际不符',
  '与已有路线重复',
  '包含违规或不适宜内容'
]

Page({
  data: {
    items: [],
    loading: true,
    rejectReasons: REJECT_REASONS
  },

  onLoad() {
    this.loadPending()
  },

  loadPending() {
    mock.getPendingRoutes().then((items) => {
      this.setData({
        items: items.map((r) => {
          const km = r.distanceMeters / 1000
          return {
            ...r,
            distanceText: km < 1 ? `${Math.round(r.distanceMeters)}m` : `${km.toFixed(1)}km`,
            roadTypeText: ROAD_TYPE_LABEL[r.roadType] || '山路',
            stars: [1, 2, 3, 4, 5]
          }
        }),
        loading: false
      })
    })
  },

  onViewDetail(e) {
    wx.navigateTo({
      url: `/pages/route-detail/route-detail?id=${e.currentTarget.dataset.id}`
    })
  },

  /** 通过：从待审列表移掉 */
  onApprove(e) {
    const { id, name } = e.currentTarget.dataset

    wx.showModal({
      title: '通过审核',
      content: `「${name}」将对所有人可见。`,
      confirmText: '通过',
      success: (res) => {
        if (!res.confirm) return
        this.removeItem(id)
        wx.showToast({ title: '已通过', icon: 'success' })
      }
    })
  },

  /**
   * 驳回：必须给理由。
   *
   * 不给的话作者不知道为什么被拒，会反复重传同样的东西。
   * 用 ActionSheet 给几个常见理由，比让版主手打快得多。
   */
  onReject(e) {
    const { id, name } = e.currentTarget.dataset

    wx.showActionSheet({
      itemList: REJECT_REASONS,
      success: (res) => {
        this.doReject(id, name, REJECT_REASONS[res.tapIndex])
      },
      fail: () => {}
    })
  },

  doReject(id, name, reason) {
    // 接后端后换成 POST /api/moderator/routes/:id/reject { reason }
    this.removeItem(id)
    wx.showModal({
      title: '已驳回',
      content: `「${name}」已退回给作者，理由：${reason}`,
      showCancel: false,
      confirmText: '知道了'
    })
  },

  removeItem(id) {
    this.setData({ items: this.data.items.filter((r) => r.id !== Number(id)) })
  }
})
