App({
  globalData: {
    // 真机调试时改成电脑局域网 IP，如 http://192.168.1.5:3000
    // 模拟器可直接用 localhost
    baseUrl: 'http://localhost:3000',

    // 阶段一不做登录系统，固定测试用户
    userId: 'test-user-001'
  },

  onLaunch() {
    console.log('[TopTouge] baseUrl =', this.globalData.baseUrl)
  }
})
