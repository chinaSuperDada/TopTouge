const { formatTime } = require('../../utils/format')
const { displayName } = require('../../utils/user')

Component({
  properties: {
    /** 后端返回的路况提示数组 */
    roadConditions: {
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
    roadConditions(roadConditions) {
      this.setData({
        rows: (roadConditions || []).map((c) => ({
          ...c,
          timeText: formatTime(c.createdAt),
          userName: displayName(c.userId)
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
        wx.showToast({ title: '请先输入路况', icon: 'none' })
        return
      }
      if (this.data.submitting) return

      this.setData({ submitting: true })
      this.triggerEvent('submit', { content }, { bubbles: true, composed: true })
    },

    clearInput() {
      this.setData({ input: '' })
    },

    setSubmitting(value) {
      this.setData({ submitting: value })
    }
  }
})
