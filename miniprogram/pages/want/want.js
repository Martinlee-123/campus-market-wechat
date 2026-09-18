// pages/want/want.js：求购列表
const app = getApp();

Page({
  data: {
    categories: ['全部', '学习资料', '生活用品', '数码设备', '餐券/各种卡', '其他'],
    activeCat: '全部',
    keyword: '',
    list: [],
    loading: false,
    finished: false,
    page: 0,
    pageSize: 10
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
    this.loadList(true);
  },

  // 分享整页：转发给好友/群
  onShareAppMessage() {
    return {
      title: '畅学尼龙 - 校园二手集市',
      path: '/pages/want/want',
      imageUrl: '/images/share_default.png'
    };
  },

  // 朋友圈分享
  onShareTimeline() {
    return {
      title: '畅学尼龙 - 校园二手集市',
      query: '',
      imageUrl: '/images/share_default.png'
    };
  },

  onPullDownRefresh() {
    this.loadList(true, () => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (!this.data.finished && !this.data.loading) this.loadList(false);
  },

  loadList(isRefresh, done) {
    if (this.data.loading) { done && done(); return; }
    this.setData({ loading: true });
    const page = isRefresh ? 0 : this.data.page;
    wx.cloud.callFunction({
      name: 'want',
      data: {
        action: 'list',
        page,
        pageSize: this.data.pageSize,
        keyword: this.data.keyword,
        category: this.data.activeCat === '全部' ? '' : this.data.activeCat
      }
    }).then(res => {
      const records = (res.result && res.result.data) || [];
      const list = isRefresh ? records : this.data.list.concat(records);
      this.setData({ list, page: page + 1, finished: records.length < this.data.pageSize, loading: false });
      done && done();
    }).catch(err => {
      console.error(err);
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
      done && done();
    });
  },

  onSearchInput(e) { this.setData({ keyword: e.detail.value }); },
  onSearch() { this.loadList(true); },
  clearSearch() { this.setData({ keyword: '' }); this.loadList(true); },

  onCatTap(e) {
    const cat = e.currentTarget.dataset.cat;
    if (cat === this.data.activeCat) return;
    this.setData({ activeCat: cat });
    this.loadList(true);
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/want-detail/want-detail?id=${id}` });
  },

  goPublish() {
    wx.navigateTo({ url: '/pages/want-publish/want-publish' });
  }
});
