// pages/want-publish/want-publish.js：发布求购
const app = getApp();

Page({
  data: {
    categories: ['学习资料', '生活用品', '数码设备', '餐券/各种卡', '其他'],
    categoryIndex: 0,
    title: '',
    desc: '',
    contact: '',
    contactType: '微信',
    submitting: false
  },

  onLoad() {
    // 从本地读上次填的联系方式
    this.setData({ contact: wx.getStorageSync('myContact') || '' });
  },

  onTitle(e) { this.setData({ title: e.detail.value }); },
  onDesc(e) { this.setData({ desc: e.detail.value }); },
  onContact(e) { this.setData({ contact: e.detail.value }); },
  onContactTypeTap(e) { this.setData({ contactType: e.currentTarget.dataset.type }); },
  onCatChange(e) { this.setData({ categoryIndex: Number(e.detail.value) }); },

  submit() {
    if (!wx.getStorageSync('loggedIn')) {
      wx.showModal({
        title: '需要先登录',
        content: '发布求购前请先登录（微信授权），登录后在"我的"页点击登录即可。',
        confirmText: '去登录',
        success: (r) => { if (r.confirm) wx.switchTab({ url: '/pages/mine/mine' }); }
      });
      return;
    }

    const { title, desc, contact, categoryIndex } = this.data;
    if (!title.trim()) return wx.showToast({ title: '请填写求购内容', icon: 'none' });
    if (!desc.trim()) return wx.showToast({ title: '请填写补充说明', icon: 'none' });
    if (!contact.trim()) return wx.showToast({ title: '请填写联系方式', icon: 'none' });

    wx.setStorageSync('myContact', contact);
    this.setData({ submitting: true });
    wx.cloud.callFunction({
      name: 'want',
      data: {
        action: 'publish',
        title: title.trim(),
        desc: desc.trim(),
        category: this.data.categories[categoryIndex],
        contact: contact.trim(),
        contactType: this.data.contactType
      }
    }).then(res => {
      this.setData({ submitting: false });
      if (res.result && res.result.ok) {
        wx.showToast({ title: '发布成功', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 800);
      } else {
        wx.showToast({ title: (res.result && res.result.msg) || '发布失败', icon: 'none' });
      }
    }).catch(err => {
      console.error(err);
      this.setData({ submitting: false });
      wx.showToast({ title: '发布失败', icon: 'none' });
    });
  },

  // 分享页面（右上角···转发给好友/群）
  onShareAppMessage() {
    return {
      title: '畅学尼龙 - 校园二手集市',
      path: '/pages/want-publish/want-publish',
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
