const mock = require('../../utils/mock')

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
      this.setData({ items, loading: false })
    })
  },

  /**
   * 新建活动。
   *
   * 表单还没做，先用一个简化流程：点「新建」弹输入框填标题。
   * 完整表单（时间、路线、人数上限）等后端接口就绪再补。
   */
  onCreate() {
    wx.showModal({
      title: '新建活动',
      editable: true,
      placeholderText: '活动标题，如「周六晨跑 · 九曲发夹弯」',
      success: (res) => {
        if (!res.confirm || !res.content || !res.content.trim()) return

        this.setData({
          items: [
            {
              id: Date.now(),
              title: res.content.trim(),
              status: 'draft',
              statusText: '草稿',
              joined: 0,
              startsAt: '待设置'
            },
            ...this.data.items
          ]
        })
        wx.showToast({ title: '已创建草稿', icon: 'success' })
      }
    })
  },

  /** 发布 / 下线 */
  onToggleStatus(e) {
    const id = Number(e.currentTarget.dataset.id)

    this.setData({
      items: this.data.items.map((a) => {
        if (a.id !== id) return a
        const published = a.status === 'published'
        return {
          ...a,
          status: published ? 'draft' : 'published',
          statusText: published ? '草稿' : '进行中'
        }
      })
    })

    const item = this.data.items.find((a) => a.id === id)
    wx.showToast({
      title: item.status === 'published' ? '已发布，会展示在首页' : '已下线',
      icon: 'none'
    })
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
        this.setData({ items: this.data.items.filter((a) => a.id !== Number(id)) })
        wx.showToast({ title: '已删除', icon: 'none' })
      }
    })
  }
})
