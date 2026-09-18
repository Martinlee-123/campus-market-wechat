// pages/mine/mine.js
Page({
  data: {
    userInfo: null,
    hasLogin: false,
    isAdmin: false,
    flowerReceived: 0,       // 收到的小花总数
    showLogin: false,       // 是否显示登录弹层
    loginAvatar: '',        // 弹层里选的头像
    loginNick: '',          // 弹层里填的昵称
    agreeChecked: false     // 是否已勾选同意协议
  },

  onShow() {
    const userInfo = wx.getStorageSync('userInfo');
    const hasLogin = !!wx.getStorageSync('loggedIn');
    this.setData({ userInfo, hasLogin });
    this.checkAdmin();
    this.loadMyFlowers();
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3 });
    }
  },

  // 加载我收到的小花总数
  loadMyFlowers() {
    if (!wx.getStorageSync('loggedIn')) {
      this.setData({ flowerReceived: 0 });
      return;
    }
    wx.cloud.callFunction({ name: 'getMyFlowers' })
      .then(res => this.setData({ flowerReceived: (res.result && res.result.flowerReceived) || 0 }))
      .catch(() => this.setData({ flowerReceived: 0 }));
  },

  // 检测当前用户是否管理员（决定是否显示管理入口）
  checkAdmin() {
    if (!wx.getStorageSync('loggedIn')) {
      this.setData({ isAdmin: false });
      return;
    }
    wx.cloud.callFunction({ name: 'admin', data: { action: 'me' } })
      .then(res => this.setData({ isAdmin: !!(res.result && res.result.ok) }))
      .catch(() => this.setData({ isAdmin: false }));
  },

  // 点登录：弹出"选头像+填昵称"面板（微信规范的登录方式）
  onLogin() {
    // 预填一次微信昵称（从上次本地记录拿，或留空）
    const userInfo = wx.getStorageSync('userInfo');
    this.setData({
      showLogin: true,
      loginAvatar: (userInfo && userInfo.avatar) || '',
      loginNick: (userInfo && userInfo.nickname) || '',
      agreeChecked: !!wx.getStorageSync('agreeAgreement')
    });
  },

  closeLogin() {
    this.setData({ showLogin: false });
  },

  // 勾选/取消勾选同意协议
  onAgreeChange() {
    this.setData({ agreeChecked: !this.data.agreeChecked });
  },

  // 查看用户服务协议
  goAgreement() {
    wx.navigateTo({ url: '/pages/agreement/agreement?type=service' });
  },

  // 查看隐私政策
  goPrivacy() {
    wx.navigateTo({ url: '/pages/agreement/agreement?type=privacy' });
  },

  // 选择头像（微信 chooseAvatar）
  onChooseAvatar(e) {
    const avatar = e.detail.avatarUrl;
    if (avatar) this.setData({ loginAvatar: avatar });
  },

  onNickInput(e) {
    this.setData({ loginNick: e.detail.value });
  },

  // 确认登录：上传头像到云存储，登记用户
  async confirmLogin() {
    // 必须勾选同意协议后才能登录（收集用户信息的授权同意）
    if (!this.data.agreeChecked) {
      wx.showToast({ title: '请先勾选同意协议', icon: 'none' });
      return;
    }
    const nick = (this.data.loginNick || '').trim();
    if (!nick) {
      wx.showToast({ title: '请填写昵称', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '登录中…', mask: true });
    try {
      // 若选了头像，上传到云存储拿稳定 fileID
      let avatarFileID = '';
      if (this.data.loginAvatar) {
        const ext = (this.data.loginAvatar.split('.').pop() || 'png').split('?')[0];
        const cloudPath = `avatars/${Date.now()}.${ext}`;
        const up = await wx.cloud.uploadFile({
          cloudPath,
          filePath: this.data.loginAvatar
        });
        avatarFileID = up.fileID;
      }

      const profile = { nickname: nick, avatar: avatarFileID };
      wx.setStorageSync('userInfo', profile);
      wx.setStorageSync('loggedIn', true);
      wx.setStorageSync('agreeAgreement', true); // 记录已同意协议

      await wx.cloud.callFunction({
        name: 'login',
        data: profile
      });

      wx.hideLoading();
      this.setData({
        showLogin: false,
        userInfo: profile,
        hasLogin: true,
        isAdmin: false
      });
      wx.showToast({ title: '登录成功', icon: 'success' });
      this.checkAdmin();
    } catch (e) {
      wx.hideLoading();
      console.error(e);
      wx.showToast({ title: '登录失败，请重试', icon: 'none' });
    }
  },

  goMyPosts() {
    wx.navigateTo({ url: '/pages/my-posts/my-posts' });
  },

  // 点头像/昵称 → 看自己的主页（与详情页点什么别人头像进主页一致）
  goSelf() {
    if (!wx.getStorageSync('loggedIn')) {
      this.onLogin();
      return;
    }
    wx.navigateTo({ url: '/pages/seller/seller?self=1' });
  },

  goFavorites() {
    wx.navigateTo({ url: '/pages/my-favorites/my-favorites' });
  },

  goHistory() {
    wx.navigateTo({ url: '/pages/history/history' });
  },

  goBlacklist() {
    wx.navigateTo({ url: '/pages/blacklist/blacklist' });
  },

  goAuth() {
    wx.navigateTo({ url: '/pages/auth/auth' });
  },

  goPublish() {
    wx.switchTab({ url: '/pages/publish/publish' });
  },

  goAdmin() {
    wx.navigateTo({ url: '/pages/admin/admin' });
  },

  clearUser() {
    wx.showModal({
      title: '退出登录',
      content: '确定退出当前账号吗？',
      success: (r) => {
        if (!r.confirm) return;
        wx.removeStorageSync('userInfo');
        wx.removeStorageSync('loggedIn');
        this.onShow();
      }
    });
  }
});
