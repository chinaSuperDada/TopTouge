const mock = require('../../utils/mock')

// 头像压缩后的尺寸。132x132 是微信官方推荐值 ——
// 再大在这个显示尺寸下也看不出区别，白白增加传输量
const AVATAR_SIZE = 132

Page({
  data: {
    nickName: '',
    avatar: '',
    saving: false,
    // 昵称输入是否可编辑。点「修改」才展开，避免误触
    editingName: false
  },

  onLoad() {
    mock.getProfile().then((p) => {
      this.setData({
        nickName: p.nickName || '',
        avatar: p.avatar || ''
      })
    })
  },

  /**
   * 用户从微信头像列表里选了一个。
   *
   * 拿到的是临时文件路径，必须先转成 base64 才能存库 ——
   * 临时路径重装小程序就失效了。
   *
   * 上传前一定要压缩：用户可能选相册里的原图，几 MB 直接超后端限制。
   */
  onChooseAvatar(e) {
    const tempPath = e.detail.avatarUrl
    if (!tempPath) return

    wx.showLoading({ title: '处理中…', mask: true })

    wx.getImageInfo({
      src: tempPath,
      success: (info) => {
        // 用 canvas 等比缩放到 AVATAR_SIZE
        const ctx = wx.createCanvasContext('avatarCanvas', this)
        // 居中裁剪成正方的偏移量
        const size = Math.min(info.width, info.height)
        const sx = (info.width - size) / 2
        const sy = (info.height - size) / 2

        ctx.drawImage(tempPath, sx, sy, size, size, 0, 0, AVATAR_SIZE, AVATAR_SIZE)
        ctx.draw(false, () => {
          wx.canvasToTempFilePath(
            {
              canvasId: 'avatarCanvas',
              fileType: 'png',
              success: (res) => {
                wx.getFileSystemManager().readFile({
                  filePath: res.tempFilePath,
                  encoding: 'base64',
                  success: (b64) => {
                    wx.hideLoading()
                    this.setData({ avatar: `data:image/png;base64,${b64.data}` })
                    this.save({ avatar: `data:image/png;base64,${b64.data}` })
                  },
                  fail: () => {
                    wx.hideLoading()
                    wx.showToast({ title: '头像读取失败', icon: 'none' })
                  }
                })
              },
              fail: () => {
                wx.hideLoading()
                wx.showToast({ title: '头像处理失败', icon: 'none' })
              }
            },
            this
          )
        })
      },
      fail: () => {
        wx.hideLoading()
        wx.showToast({ title: '头像读取失败', icon: 'none' })
      }
    })
  },

  onNameTap() {
    this.setData({ editingName: true })
  },

  onNameInput(e) {
    this.setData({ nickName: e.detail.value })
  },

  /** 失焦时保存 —— 用户填完切走就自动存，不用额外点按钮 */
  onNameBlur() {
    const name = this.data.nickName.trim()
    if (!name) {
      wx.showToast({ title: '昵称不能为空', icon: 'none' })
      return
    }
    this.setData({ nickName: name, editingName: false })
    this.save({ nickName: name })
  },

  save(patch) {
    if (this.data.saving) return
    this.setData({ saving: true })

    mock
      .updateProfile(patch)
      .then((profile) => {
        this.setData({
          nickName: profile.nickName,
          avatar: profile.avatar
        })
        wx.showToast({ title: '已保存', icon: 'success' })
      })
      .catch(() => {})
      .finally(() => {
        this.setData({ saving: false })
      })
  }
})
