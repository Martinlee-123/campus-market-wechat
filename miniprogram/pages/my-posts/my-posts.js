// pages/my-posts/my-posts.js
Page({
  data: { list: [], loading: true },

  onShow() { this.loadList(); },

  loadList() {
    wx.cloud.callFunction({
      name: 'getMyPosts',
      data: {}
    }).then(res => {
      const list = (res.result && res.result.data) || [];
      // 归一化：老数据可能没有 viewCount/likeCount
      list.forEach(item => {
        item.viewCount = item.viewCount || 0;
        item.likeCount = item.likeCount || 0;
      });
      this.setData({ list, loading: false });
    }).catch(err => {
      console.error(err);
      this.setData({ loading: false });
    });
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/detail/detail?id=${id}` });
  },

  // 编辑商品
  goEdit(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/edit/edit?id=${id}` });
  },

  // 下架/重新上架
  toggleStatus(e) {
    const id = e.currentTarget.dataset.id;
    const status = e.currentTarget.dataset.status; // 'on' | 'off'
    const next = status === 'on' ? 'off' : 'on';
    wx.showModal({
      title: '提示',
      content: next === 'off' ? '确定下架这条吗？' : '确定重新上架吗？',
      success: (r) => {
        if (!r.confirm) return;
        wx.cloud.callFunction({
          name: 'updateStatus',
          data: { id, status: next }
        }).then(() => {
          wx.showToast({ title: '已更新', icon: 'success' });
          this.loadList();
        }).catch(err => console.error(err));
      }
    });
  },

  // 删除
  del(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除',
      content: '删除后不可恢复，确定删除？',
      confirmColor: '#e53935',
      success: (r) => {
        if (!r.confirm) return;
        wx.cloud.callFunction({
          name: 'updateStatus',
          data: { id, status: 'deleted' }
        }).then(() => {
          wx.showToast({ title: '已删除', icon: 'success' });
          this.loadList();
        }).catch(err => console.error(err));
      }
    });
  },

  // 切换交易状态：在售/已出/进行中（循环或弹选择）
  changeTradeStatus(e) {
    const id = e.currentTarget.dataset.id;
    const cur = e.currentTarget.dataset.trade; // 'selling' | 'sold' | 'pending'
    const MAP = { 'selling': '在售', 'sold': '已出', 'pending': '进行中' };
    const options = ['selling', 'pending', 'sold'];
    const items = options.map(k => MAP[k]);
    wx.showActionSheet({
      itemList: items,
      success: (r) => {
        const next = options[r.tapIndex];
        if (next === cur) return;
        wx.cloud.callFunction({
          name: 'updatePost',
          data: { id, tradeStatus: next }
        }).then(res => {
          if (res.result && res.result.ok) {
            wx.showToast({ title: '已更新', icon: 'success' });
            this.loadList();
          } else {
            wx.showToast({ title: (res.result && res.result.msg) || '操作失败', icon: 'none' });
          }
        }).catch(err => console.error(err));
      }
    });
  },

  // 分享页面（右上角···转发给好友/群）
  onShareAppMessage() {
    return {
      title: '我发布的 - 畅学尼龙',
      path: '/pages/my-posts/my-posts',
      imageUrl: '/images/share_default.png'
    };
  },

  // 朋友圈分享（右上角··· → 分享到朋友圈）
  onShareTimeline() {
    return {
      title: '我发布的 - 畅学尼龙',
      query: '',
      imageUrl: '/images/share_default.png'
    };
  }});
