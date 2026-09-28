const mock = require('../../utils/mock')

/** 活动状态转展示文案 */
const STATUS_TEXT = {
  published: '进行中',
  draft: '草稿',
  offline: '已下线'
}

Page({
  data: {
    items: [],
    loading: true
  },

  onLoad() {
    this.loadItems()
  },

  onShow() {
    if (!this.data.loading) this.loadItems()
  },

  loadItems() {
    mock.getManagedActivities().then((items) => {
      this.setData({
        items: items.map((a) => ({
          ...a,
          statusText: STATUS_TEXT[a.status] || '草稿',
          // 活动目前还没有报名功能，先固定显示 0
          joined: a.joined || 0,
          startsAt: a.startsAt ? formatDate(a.startsAt) : '待设置'
        })),
        loading: false
      })
    })
  },

  /** 新建活动。完整表单（时间、关联路线）等后续再补 */
  onCreate() {
    wx.showModal({
      title: '新建活动',
      editable: true,
      placeholderText: '活动标题，如「周六晨跑 · 九曲发夹弯」',
      success: (res) => {
        if (!res.confirm || !res.content || !res.content.trim()) return

        mock.createActivity({ title: res.content.trim() })
          .then((created) => {
            wx.showToast({ title: '已创建草稿', icon: 'success' })
            this.loadItems()
          })
          .catch(() => {})
      }
    })
  },

  /** 发布 / 下线 */
  onToggleStatus(e) {
    const id = Number(e.currentTarget.dataset.id)
    const item = this.data.items.find((a) => a.id === id)
    if (!item) return

    const next = item.status === 'published' ? 'draft' : 'published'

    mock.updateActivityStatus(id, next)
      .then(() => {
        this.setData({
          items: this.data.items.map((a) =>
            a.id === id ? { ...a, status: next, statusText: STATUS_TEXT[next] } : a
          )
        })
        wx.showToast({
          title: next === 'published' ? '已发布，会展示在首页' : '已下线',
          icon: 'none'
        })
      })
      .catch(() => {})
  },

  onDelete(e) {
    const { id, title } = e.currentTarget.dataset

    wx.showModal({
      title: '删除活动',
      content: `「${title}」将被删除，已报名的车友会收到取消通知。`,
      confirmText: '删除',
      confirmColor: '#e5484d',
      success: (res) => {
        if (!res.confirm) return

        mock.deleteActivity(id)
          .then(() => {
            this.setData({ items: this.data.items.filter((a) => a.id !== Number(id)) })
            wx.showToast({ title: '已删除', icon: 'none' })
          })
          .catch(() => {})
      }
    })
  }
})

/** ISO 时间转 MM-DD HH:mm */
function formatDate(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '待设置'
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
