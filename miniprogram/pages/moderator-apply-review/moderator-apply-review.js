const mock = require('../../utils/mock')
const reporter = require('../../utils/errorReporter')

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

Page({
  data: {
    items: [],
    loading: true,
    empty: false
  },

  onLoad() {
    this.load()
  },

  onShow() {
    if (!this.data.loading) this.load()
  },

  load() {
    return mock
      .getPendingApplications()
      .then((list) => {
        this.setData({
          items: list.map((a) => ({
            ...a,
            createdAtText: formatDate(a.createdAt)
          })),
          loading: false,
          empty: list.length === 0
        })
      })
      .catch((err) => {
        reporter.report({
          code: 'ADMIN_APPLY_LIST_FAILED',
          message: '加载版主申请列表失败',
          detail: (err && err.detail) || (err && err.message) || ''
        })
        this.setData({ loading: false, empty: true })
      })
  },

  /**
   * 通过。
   *
   * 后端在审批通过时会**同时授予版主身份** —— 不需要管理员再点一次
   * 「授予权限」，审批通过的含义本来就是要给他权限。
   */
  onApprove(e) {
    const { id, userId } = e.currentTarget.dataset

    wx.showModal({
      title: '通过申请',
      content: `将通过该申请，并授予对方版主权限。`,
      confirmText: '通过',
      success: (res) => {
        if (!res.confirm) return
        this.review(id, 'approved', '')
      }
    })
  },

  onReject(e) {
    const { id } = e.currentTarget.dataset

    // 驳回要写理由 —— 不写的话申请人不知道差在哪，只会重复提交
    wx.showModal({
      title: '驳回申请',
      editable: true,
      placeholderText: '说明驳回原因，会展示给申请人',
      confirmText: '驳回',
      confirmColor: '#e5484d',
      success: (res) => {
        if (!res.confirm) return
        this.review(id, 'rejected', (res.content || '').trim() || '不符合版主条件')
      }
    })
  },

  review(id, status, reason) {
    wx.showLoading({ title: '处理中…', mask: true })

    mock
      .reviewApplication(id, status, reason)
      .then(() => {
        wx.hideLoading()
        wx.showToast({ title: status === 'approved' ? '已通过' : '已驳回', icon: 'none' })
        this.setData({ items: this.data.items.filter((a) => a.id !== Number(id)) })
      })
      .catch(() => {
        wx.hideLoading()
      })
  }
})
