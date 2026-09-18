// pages/blacklist/blacklist.js：我的黑名单管理
Page({
  data: {
    list: [],
    loading: true
  },

  onShow() {
    this.loadList();
  },

  loadList() {
    wx.cloud.callFunction({ name: 'blacklist', data: { action: 'list' } })
      .then(res => {
        this.setData({ list: (res.result && res.result.data) || [], loading: false });
      })
      .catch(err => {
        console.error(err);
        this.setData({ loading: false });
        wx.showToast({ title: '加载失败', icon: 'none' });
      });
  },

  // 取消拉黑
  unblock(e) {
    const targetOpenid = e.currentTarget.dataset.openid;
    const nickname = e.currentTarget.dataset.nick;
    wx.showModal({
      title: '取消拉黑',
      content: '确定取消拉黑「' + (nickname || '该用户') + '」吗？取消后对方的内容会重新显示。',
      confirmText: '取消拉黑',
      success: (r) => {
        if (!r.confirm) return;
        wx.showLoading({ title: '处理中…', mask: true });
        wx.cloud.callFunction({
          name: 'blacklist',
          data: { action: 'remove', targetOpenid }
        }).then(res => {
          wx.hideLoading();
          if (res.result && res.result.ok) {
            wx.showToast({ title: '已取消拉黑', icon: 'none' });
            this.loadList();
          } else {
            wx.showToast({ title: (res.result && res.result.msg) || '操作失败', icon: 'none' });
          }
        }).catch(() => {
          wx.hideLoading();
          wx.showToast({ title: '操作失败', icon: 'none' });
        });
      }
    });
  },

  // 分享页面（右上角···转发给好友/群）
  onShareAppMessage() {
    return {
      title: '黑名单 - 畅学尼龙',
      path: '/pages/blacklist/blacklist',
      imageUrl: '/images/share_default.png'
    };
  },

  // 朋友圈分享（右上角··· → 分享到朋友圈）
  onShareTimeline() {
    return {
      title: '黑名单 - 畅学尼龙',
      query: '',
      imageUrl: '/images/share_default.png'
    };
  }
});