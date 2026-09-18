// pages/detail/detail.js
Page({
  data: {
    id: '',
    item: null,
    loading: true,
    liked: false,
    isMine: false,
    myOpenid: '',
    copied: false // 是否已复制联系方式（送花按钮解锁条件）
  },

  onLoad(options) {
    this.setData({ id: options.id });
    this.loadDetail();
  },

  // 分享商品卡片（右上角···转发）
  onShareAppMessage() {
    const item = this.data.item;
    return {
      title: item ? item.title : '畅学尼龙 - 看看这个',
      path: '/pages/detail/detail?id=' + this.data.id,
      imageUrl: (item && item.cover) ? item.cover : '/images/share_default.png'
    };
  },

  // 朋友圈分享（个人页右上角··· → 分享到朋友圈）
  onShareTimeline() {
    const item = this.data.item;
    return {
      title: item ? item.title : '畅学尼龙 - 看看这个',
      query: 'id=' + this.data.id,
      imageUrl: (item && item.cover) ? item.cover : '/images/share_default.png'
    };
  },

  loadDetail() {
    wx.cloud.callFunction({
      name: 'getDetail',
      data: { id: this.data.id }
    }).then(res => {
      const data = (res.result && res.result.data) || null;
      this.setData({ item: data, loading: false, liked: !!(data && data.liked), isMine: !!(data && data.isMine) });
      if (data) {
        wx.setNavigationBarTitle({ title: data.title });
        this.saveHistory(data);
      }
    }).catch(err => {
      console.error(err);
      this.setData({ loading: false });
    });
  },

  // 记录浏览历史（本地存储，最多20条，去重，最近在前）
  saveHistory(item) {
    try {
      const KEY = 'viewHistory';
      const history = wx.getStorageSync(KEY) || [];
      const record = {
        _id: item._id,
        title: item.title || '',
        cover: item.cover || '',
        price: item.price,
        priceType: item.priceType || (item.price === 0 ? 'free' : item.price === -1 ? 'bargain' : ''),
        tradeStatus: item.tradeStatus || 'selling',
        category: item.category || '',
        subCategory: item.subCategory || '',
        thirdCategory: item.thirdCategory || '',
        viewCount: item.viewCount || 0,
        flowerCount: item.flowerCount || 0,
        viewedAt: Date.now()
      };
      const list = [record].concat(history.filter(x => x._id !== item._id)).slice(0, 20);
      wx.setStorageSync(KEY, list);
    } catch (e) {
      console.error('saveHistory', e);
    }
  },

  preview(e) {
    const idx = e.currentTarget.dataset.index;
    wx.previewImage({ current: this.data.item.images[idx], urls: this.data.item.images });
  },

  // 复制卖家联系方式（降级入口）：需登录；先引导走站内私信
  copyContactDemoted() {
    if (!wx.getStorageSync('loggedIn')) {
      wx.showModal({
        title: '需要先登录',
        content: '请先登录后再操作',
        confirmText: '去登录',
        success: (r) => { if (r.confirm) wx.switchTab({ url: '/pages/mine/mine' }); }
      });
      return;
    }
    wx.showModal({
      title: '建议先私信沟通',
      content: '建议先通过站内私信与对方沟通确认，再决定是否交换联系方式，更安全。仍要复制请点「继续复制」。',
      confirmText: '继续复制',
      cancelText: '去私信',
      success: (r) => {
        if (r.confirm) this.copyContact();
        else this.goChat();
      }
    });
  },

  // 站内私信（核心闭环入口）
  goChat() {
    if (!wx.getStorageSync('loggedIn')) {
      wx.showModal({
        title: '需要先登录',
        content: '私信前请先登录',
        confirmText: '去登录',
        success: (r) => { if (r.confirm) wx.switchTab({ url: '/pages/mine/mine' }); }
      });
      return;
    }
    if (!this.data.item || !this.data.item._id) return;
    wx.showLoading({ title: '创建会话…', mask: true });
    wx.cloud.callFunction({
      name: 'chatEntry',
      data: { type: 'goods', id: this.data.item._id }
    }).then(res => {
      wx.hideLoading();
      const r = (res.result) || {};
      if (!r.ok) {
        return wx.showToast({ title: r.msg || '无法私信', icon: 'none' });
      }
      wx.navigateTo({
        url: '/pages/chat/chat?conversationId=' + r.conversationId +
          '&other=' + r.otherOpenid +
          '&nickname=' + encodeURIComponent(r.otherNickname || '同学') +
          '&goodsTitle=' + encodeURIComponent(r.goodsTitle || '')
      });
    }).catch(err => {
      wx.hideLoading();
      console.error(err);
      wx.showToast({ title: '操作失败', icon: 'none' });
    });
  },

  // 复制卖家联系方式（不外显明文）：点击后调 getContact 按需获取并复制到剪贴板（复制后解锁送花按钮）
  copyContact() {
    wx.cloud.callFunction({
      name: 'getContact',
      data: { type: 'goods', id: this.data.id }
    }).then(res => {
      const r = (res && res.result) || {};
      if (!r.ok || !r.contact) {
        return wx.showToast({ title: r.msg || '无联系方式', icon: 'none' });
      }
      wx.setClipboardData({
        data: r.contact,
        success: () => {
          const type = this.data.item.contactType === 'QQ' ? 'QQ' : '微信';
          wx.showToast({ title: type + '已复制，去添加吧', icon: 'none' });
          this.setData({ copied: true });
        }
      });
    }).catch(() => wx.showToast({ title: '获取失败', icon: 'none' }));
  },

  // 送小花（好评）：需先复制联系方式
  sendFlower() {
    if (!this.data.copied) {
      return wx.showToast({ title: '请先复制联系方式', icon: 'none' });
    }
    if (this.data.isMine) {
      return wx.showToast({ title: '不能给自己送花哦', icon: 'none' });
    }
    if (!wx.getStorageSync('loggedIn')) {
      wx.showModal({
        title: '需要先登录',
        content: '送花前请先登录',
        confirmText: '去登录',
        success: (r) => { if (r.confirm) wx.switchTab({ url: '/pages/mine/mine' }); }
      });
      return;
    }
    wx.showModal({
      title: '送小花 🌸',
      content: '确定要给这条内容的用户送一朵小花吗？（每人每帖一朵，30分钟内限一位）',
      confirmText: '送花',
      cancelText: '取消',
      success: (r) => {
        if (!r.confirm) return;
        wx.showLoading({ title: '送出中…', mask: true });
        wx.cloud.callFunction({
          name: 'sendFlower',
          data: { goodsId: this.data.id }
        }).then(res => {
          wx.hideLoading();
          const ok = res.result && res.result.ok;
          wx.showToast({ title: ok ? '送花成功 🌸' : ((res.result && res.result.msg) || '送花失败'), icon: 'none' });
          if (ok) this.loadDetail(); // 刷新花朵数
        }).catch(err => {
          wx.hideLoading();
          console.error(err);
          wx.showToast({ title: '送花失败', icon: 'none' });
        });
      }
    });
  },

  // 收藏/取消收藏
  toggleLike() {
    const liked = this.data.liked;
    wx.cloud.callFunction({
      name: 'favorite',
      data: { id: this.data.id, liked: !liked }
    }).then(res => {
      if (res.result && res.result.ok) {
        this.setData({ liked: !liked });
        wx.showToast({ title: this.data.liked ? '已收藏' : '已取消', icon: 'none' });
      }
    }).catch(err => console.error(err));
  },

  goMine() {
    wx.switchTab({ url: '/pages/mine/mine' });
  },

  // 进卖家主页
  goSeller() {
    if (!this.data.item || !this.data.item._id) return;
    wx.navigateTo({ url: '/pages/seller/seller?goodsId=' + this.data.item._id });
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
    wx.navigateTo({ url: '/pages/report/report?type=goods&id=' + this.data.id });
  },

  // 生成海报
  goPoster() {
    if (!this.data.item || !this.data.item._id) return;
    wx.navigateTo({ url: '/pages/poster/poster?id=' + this.data.id });
  }
});
