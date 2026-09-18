// pages/my-favorites/my-favorites.js：我的收藏（支持编辑模式批量取消）
Page({
  data: {
    list: [],
    loading: true,
    editMode: false,   // 是否编辑模式（多选）
    selected: {},      // 已勾选的 id -> true
    selectedCount: 0,  // 已勾选数量
    allSelected: false // 是否全选
  },

  onShow() { this.loadList(); },

  loadList() {
    wx.cloud.callFunction({
      name: 'getFavorites',
      data: {}
    }).then(res => {
      this.setData({ list: (res.result && res.result.data) || [], loading: false });
    }).catch(err => {
      console.error(err);
      this.setData({ loading: false });
    });
  },

  // 重新计算勾选数量/全选状态
  syncSelected() {
    const selected = this.data.selected;
    const selectedCount = Object.keys(selected).length;
    const allSelected = this.data.list.length > 0 && this.data.list.every(x => selected[x._id]);
    this.setData({ selectedCount, allSelected });
  },

  // 进入/退出编辑模式
  toggleEdit() {
    this.setData({ editMode: !this.data.editMode, selected: {} });
    this.syncSelected();
  },

  // 单条点击：编辑模式=勾选/取消勾选；普通模式=进详情
  onCardTap(e) {
    if (!this.data.editMode) {
      const id = e.currentTarget.dataset.id;
      wx.navigateTo({ url: `/pages/detail/detail?id=${id}` });
      return;
    }
    const id = e.currentTarget.dataset.id;
    const selected = { ...this.data.selected };
    if (selected[id]) delete selected[id];
    else selected[id] = true;
    this.setData({ selected });
    this.syncSelected();
  },

  // 全选/取消全选
  toggleSelectAll() {
    const allSelected = this.data.allSelected;
    const selected = {};
    if (!allSelected) this.data.list.forEach(x => { selected[x._id] = true; });
    this.setData({ selected });
    this.syncSelected();
  },

  // 批量取消收藏（删除所选）
  batchRemove() {
    const ids = this.data.list.filter(x => this.data.selected[x._id]).map(x => x._id);
    if (!ids.length) {
      wx.showToast({ title: '请先选择要取消的商品', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '取消收藏',
      content: `确定取消收藏选中的 ${ids.length} 件商品吗？`,
      confirmText: '取消收藏',
      confirmColor: '#d9534f',
      success: (r) => {
        if (!r.confirm) return;
        wx.showLoading({ title: '处理中…', mask: true });
        wx.cloud.callFunction({
          name: 'favorite',
          data: { action: 'batchUnfav', ids }
        }).then(res => {
          wx.hideLoading();
          if (res.result && res.result.ok) {
            wx.showToast({ title: '已取消 ' + res.result.removed + ' 件', icon: 'none' });
            this.setData({ editMode: false, selected: {} });
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
      title: '我的收藏 - 畅学尼龙',
      path: '/pages/my-favorites/my-favorites',
      imageUrl: '/images/share_default.png'
    };
  },

  // 朋友圈分享（右上角··· → 分享到朋友圈）
  onShareTimeline() {
    return {
      title: '我的收藏 - 畅学尼龙',
      query: '',
      imageUrl: '/images/share_default.png'
    };
  }});