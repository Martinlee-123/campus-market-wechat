// pages/auth/auth.js：校内认证（学号自动审核）
Page({
  data: {
    verified: 'none',      // none=未认证 pending=审核中 approved=已认证 rejected=未通过
    studentId: '',
    submitting: false
  },

  onShow() {
    this.loadStatus();
  },

  // 拉取当前用户认证状态
  loadStatus() {
    if (!wx.getStorageSync('loggedIn')) {
      this.setData({ verified: 'none' });
      return;
    }
    wx.cloud.callFunction({ name: 'auth', data: { action: 'status' } })
      .then(res => {
        if (res.result && res.result.ok) {
          this.setData({ verified: res.result.verified || 'none' });
        }
      })
      .catch(err => console.error(err));
  },

  onStudentId(e) {
    // 只允许数字，最多9位
    const v = e.detail.value.replace(/\D/g, '').slice(0, 9);
    this.setData({ studentId: v });
  },

  // 提示学号规则
  showRule() {
    wx.showModal({
      title: '学号规则',
      content: '请输入本校9位学号：第1位为1或2（本科/研究生），第2位为2，第4位为0。系统自动校验。',
      showCancel: false
    });
  },

  submitAuth() {
    if (!wx.getStorageSync('loggedIn')) {
      wx.showModal({
        title: '需要先登录',
        content: '请先在"我的"页登录后再认证。',
        confirmText: '去登录',
        success: (r) => { if (r.confirm) wx.switchTab({ url: '/pages/mine/mine' }); }
      });
      return;
    }
    const studentId = this.data.studentId;
    if (studentId.length !== 9) {
      return wx.showToast({ title: '请输入9位学号', icon: 'none' });
    }

    this.setData({ submitting: true });
    wx.cloud.callFunction({
      name: 'auth',
      data: { action: 'submit', studentId }
    }).then(res => {
      this.setData({ submitting: false });
      if (res.result && res.result.ok) {
        wx.showToast({ title: res.result.msg || '认证成功', icon: 'success' });
        this.loadStatus();
      } else {
        wx.showToast({ title: (res.result && res.result.msg) || '提交失败', icon: 'none' });
        this.loadStatus();
      }
    }).catch(err => {
      console.error(err);
      this.setData({ submitting: false });
      wx.showToast({ title: '提交失败', icon: 'none' });
    });
  },

  // 分享页面（右上角···转发给好友/群）
  onShareAppMessage() {
    return {
      title: '校内认证 - 畅学尼龙',
      path: '/pages/auth/auth',
      imageUrl: '/images/share_default.png'
    };
  },

  // 朋友圈分享（右上角··· → 分享到朋友圈）
  onShareTimeline() {
    return {
      title: '校内认证 - 畅学尼龙',
      query: '',
      imageUrl: '/images/share_default.png'
    };
  }});
