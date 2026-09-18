// pages/want-detail/want-detail.js：求购详情 + 回应
Page({
  data: {
    id: '',
    item: null,
    loading: true,
    replyDesc: '',
    replyContact: '',
    replyContactType: '微信',
    replying: false
  },

  onLoad(options) {
    this.setData({ id: options.id });
    this.loadDetail();
  },

  loadDetail() {
    wx.cloud.callFunction({ name: 'want', data: { action: 'detail', id: this.data.id } })
      .then(res => {
        const data = (res.result && res.result.data) || null;
        this.setData({ item: data, loading: false });
        if (data) wx.setNavigationBarTitle({ title: data.title });
      })
      .catch(err => {
        console.error(err);
        this.setData({ loading: false });
      });
  },

  // 复制求购者联系方式（不外显明文）：点击后调 getContact 按需获取
  copyContact() {
    wx.cloud.callFunction({
      name: 'getContact',
      data: { type: 'want', id: this.data.id }
    }).then(res => {
      const r = (res && res.result) || {};
      if (!r.ok || !r.contact) {
        return wx.showToast({ title: r.msg || '无联系方式', icon: 'none' });
      }
      const type = r.contactType === 'QQ' ? 'QQ' : '微信';
      wx.setClipboardData({ data: r.contact, success: () => wx.showToast({ title: type + '已复制，去联系吧', icon: 'none' }) });
    }).catch(() => wx.showToast({ title: '获取失败', icon: 'none' }));
  },

  // 复制回应者联系方式（不外显明文）：调 getContact 按需获取
  copyReplyContact(e) {
    const rid = e.currentTarget.dataset.rid;
    if (!rid) return;
    wx.cloud.callFunction({
      name: 'getContact',
      data: { type: 'reply', id: rid }
    }).then(res => {
      const r = (res && res.result) || {};
      if (!r.ok || !r.contact) {
        return wx.showToast({ title: r.msg || '无联系方式', icon: 'none' });
      }
      const type = r.contactType === 'QQ' ? 'QQ' : '微信';
      wx.setClipboardData({ data: r.contact, success: () => wx.showToast({ title: type + '已复制，去联系吧', icon: 'none' }) });
    }).catch(() => wx.showToast({ title: '获取失败', icon: 'none' }));
  },

  onReplyDesc(e) { this.setData({ replyDesc: e.detail.value }); },
  onReplyContact(e) { this.setData({ replyContact: e.detail.value }); },
  onReplyContactTypeTap(e) { this.setData({ replyContactType: e.currentTarget.dataset.type }); },

  submitReply() {
    if (!wx.getStorageSync('loggedIn')) {
      wx.showModal({
        title: '需要先登录',
        content: '回应求购前请先登录，登录后在"我的"页点击登录即可。',
        confirmText: '去登录',
        success: (r) => { if (r.confirm) wx.switchTab({ url: '/pages/mine/mine' }); }
      });
      return;
    }
    const desc = this.data.replyDesc.trim();
    const contact = this.data.replyContact.trim();
    if (!desc) return wx.showToast({ title: '请填写提供内容说明', icon: 'none' });
    if (!contact) return wx.showToast({ title: '请填写你的联系方式', icon: 'none' });

    wx.setStorageSync('myContact', contact);
    this.setData({ replying: true });
    wx.cloud.callFunction({
      name: 'want',
      data: { action: 'reply', wantId: this.data.id, desc, contact, contactType: this.data.replyContactType }
    }).then(res => {
      this.setData({ replying: false });
      if (res.result && res.result.ok) {
        wx.showToast({ title: '已回应，求购者可查看', icon: 'success' });
        this.setData({ replyDesc: '', replyContact: '' });
        this.loadDetail();
      } else {
        wx.showToast({ title: (res.result && res.result.msg) || '回应失败', icon: 'none' });
      }
    }).catch(err => {
      console.error(err);
      this.setData({ replying: false });
      wx.showToast({ title: '回应失败', icon: 'none' });
    });
  },

  toggleStatus() {
    const next = this.data.item.status === 'open' ? 'closed' : 'open';
    wx.cloud.callFunction({ name: 'want', data: { action: 'close', id: this.data.id, status: next } })
      .then(res => {
        if (res.result && res.result.ok) {
          wx.showToast({ title: res.result.msg || '已更新', icon: 'success' });
          this.loadDetail();
        } else {
          wx.showToast({ title: (res.result && res.result.msg) || '操作失败', icon: 'none' });
        }
      })
      .catch(err => console.error(err));
  },

  // 举报入口
  goReport() {
    if (!wx.getStorageSync('loggedIn')) {
      wx.showModal({
        title: '需要先登录',
        content: '举报前请先登录',
        confirmText: '去登录',
        success: (r) => { if (r.confirm) wx.switchTab({ url: '/pages/mine/mine' }); }
      });
      return;
    }
    wx.navigateTo({ url: '/pages/report/report?type=want&id=' + this.data.id });
  },

  // 分享页面（右上角···转发给好友/群）
  onShareAppMessage() {
    return {
      title: '畅学尼龙 - 校园二手集市',
      path: '/pages/want-detail/want-detail',
      imageUrl: '/images/share_default.png'
    };
  },

  // 朋友圈分享（右上角··· → 分享到朋友圈）
  onShareTimeline() {
    return {
      title: '畅学尼龙 - 校园二手集市',
      query: '',
      imageUrl: '/images/share_default.png'
    };
  }});
