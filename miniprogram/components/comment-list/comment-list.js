const { formatTime } = require('../../utils/format')

Component({
  properties: {
    /** 后端返回的评论数组 */
    comments: {
      type: Array,
      value: []
    }
  },

  data: {
    input: '',
    rows: [],
    submitting: false
  },

  observers: {
    comments(comments) {
      this.setData({
        rows: (comments || []).map((c) => ({
          ...c,
          timeText: formatTime(c.createdAt)
        }))
      })
    }
  },

  methods: {
    onInput(e) {
      this.setData({ input: e.detail.value })
    },

    onSubmit() {
      const content = this.data.input.trim()
      if (!content) {
        wx.showToast({ title: '请先输入评论', icon: 'none' })
        return
      }
      if (this.data.submitting) return

      this.setData({ submitting: true })
      // 真正的提交由页面负责，组件只把内容抛出去
      this.triggerEvent('submit', { content }, { bubbles: true, composed: true })
    },

    /** 页面提交完成后回调，让组件清空输入框 */
    clearInput() {
      this.setData({ input: '' })
    },

    setSubmitting(value) {
      this.setData({ submitting: value })
    }
  }
})
