// pages/seller/seller.js：卖家主页（看卖家资料 + 其在售商品）
Page({
  data: {
    goodsId: '',
    seller: null,
    list: [],
    loading: true,
    selfMode: false,
    sellerId: '',
    blocked: false // 是否已拉黑该卖家
  },

  onLoad(options) {
    const goodsId = options.goodsId;
    const self = options.self; // '1' = 我的主页（自己）
    if (!goodsId && !self) {
      wx.showToast({ title: '参数错误', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this.setData({ goodsId, selfMode: !!self });
    this.loadSeller();
  },

  loadSeller() {
    const data = this.data.selfMode ? { self: 1 } : { goodsId: this.data.goodsId };
    wx.cloud.callFunction({
      name: 'getSeller',
      data
    }).then(res => {
      const r = (res.result || {});
      if (!r.ok) {
        wx.showToast({ title: r.msg || '加载失败', icon: 'none' });
        this.setData({ loading: false });
        return;
      }
      const seller = r.seller || {};
      seller.nickname = seller.nickname || '同学';
      seller.flowerReceived = seller.flowerReceived || 0;
      const list = (r.goods || []).map(item => ({
        ...item,
        viewCount: item.viewCount || 0,
        likeCount: item.likeCount || 0
      }));
      wx.setNavigationBarTitle({ title: (seller.nickname || '我的') + '的主页' });
      const sellerId = (r.sellerId || '').trim();
      this.setData({ seller, list, loading: false, sellerId });
      // 看别人主页时，查询是否已拉黑；自己主页不显示拉黑按钮
      if (!this.data.selfMode && sellerId) {
        this.checkBlocked(sellerId);
      }
    }).catch(err => {
      console.error(err);
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    });
  },

  // 查询是否已拉黑该卖家（自己的 openid 由云函数判断 selfMode，前端不存）
  checkBlocked(sellerId) {
    if (!wx.getStorageSync('loggedIn')) return;
    wx.cloud.callFunction({ name: 'blacklist', data: { action: 'check', targetOpenid: sellerId } })
      .then(res => this.setData({ blocked: !!(res.result && res.result.blocked) }))
      .catch(() => {});
  },

  // 拉黑 / 取消拉黑
  toggleBlock() {
    const sellerId = this.data.sellerId;
    if (!sellerId) return wx.showToast({ title: '暂时无法操作', icon: 'none' });
    if (!wx.getStorageSync('loggedIn')) {
      wx.showModal({
        title: '需要先登录',
        content: '登录后才能拉黑用户',
        confirmText: '去登录',
        success: (r) => { if (r.confirm) wx.switchTab({ url: '/pages/mine/mine' }); }
      });
      return;
    }
    const blocked = this.data.blocked;
    wx.showModal({
      title: blocked ? '取消拉黑' : '拉黑用户',
      content: blocked
        ? '取消拉黑后，对方的商品和求购会重新显示。'
        : '拉黑后，对方的商品、求购和主页都将对你隐藏，确定拉黑吗？',
      confirmText: blocked ? '取消拉黑' : '拉黑',
      confirmColor: blocked ? '#7C6BC0' : '#d9534f',
      success: (r) => {
        if (!r.confirm) return;
        wx.showLoading({ title: '处理中…', mask: true });
        wx.cloud.callFunction({
          name: 'blacklist',
          data: { action: blocked ? 'remove' : 'add', targetOpenid: sellerId }
        }).then(res => {
          wx.hideLoading();
          if (res.result && res.result.ok) {
            this.setData({ blocked: !blocked });
            wx.showToast({ title: res.result.msg || (blocked ? '已取消拉黑' : '已拉黑'), icon: 'none' });
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

  goDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/detail/detail?id=${id}` });
  },

  // 分享页面（右上角···转发给好友/群）
  onShareAppMessage() {
    return {
      title: '畅学尼龙 - 校园二手集市',
      path: '/pages/seller/seller',
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
