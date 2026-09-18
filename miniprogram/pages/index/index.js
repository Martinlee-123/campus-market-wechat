// pages/index/index.js
const app = getApp();

// 静态兜底热门词（对应用真实聚合搜索词，聚合失败时使用）
const STATIC_HOT_WORDS = ['高数笔记', '考研资料', '教材', '编程', '四六级', '毕业照', '校卡', '电子版', '笔记', '网课'];

Page({
  data: {
    categories: [],
    activeCat: '全部',
    showCatPanel: false,
    subCatList: [],   // 当前一级分类下的二级标签（仅“学习资料”有）
    activeSubCat: '', // 当前选中的二级分类，空=全部
    thirdCatList: [],   // 当前二级分类下的三级标签（学科）
    activeThirdCat: '', // 当前选中的三级分类，空=全部
    keyword: '',
    list: [],
    loading: false,
    finished: false,
    page: 0,
    pageSize: 10,
    sort: 'latest',
    sortOptions: [
      { key: 'latest', label: '最新' },
      { key: 'views', label: '最多浏览' },
      { key: 'flower', label: '最多好评' }
    ],
    // 搜索面板
    showSearchPanel: false,
    searchHistory: [],
    hotWords: [],
    showBackTop: false, // 是否显示回到顶部按钮
    hasLogin: false      // 是否已登录（未登录时显示引导条）
  },

  onLoad() {
    this.setData({ categories: app.globalData.categories });
    this.setData({ hasLogin: !!wx.getStorageSync('loggedIn') });
    this.loadList(true);
    this.loadSearchPanel();
    this.prewarm();
  },

  // 预热核心云函数：提前触发实例活跃，避免用户点进各页面时再冷启动
  prewarm() {
    // 等首屏数据渲染完再预热，避免抢资源
    setTimeout(() => {
      // 这些调用只为了触发云函数冷启动（实例活跃），结果可忽略
      const jobs = [
        { name: 'getDetail', data: { id: '' } },
        { name: 'getSeller', data: { goodsId: '' } },
        { name: 'want', data: { action: 'list' } },
        { name: 'getMyPosts', data: {} },
        { name: 'getMyFlowers', data: {} },
        { name: 'getFavorites', data: {} },
        { name: 'getContact', data: { type: 'goods', id: '' } },
        { name: 'favorite', data: { action: 'list' } }
      ];
      // 并行发起，全部静默忽略结果与错误
      jobs.forEach(j => {
        wx.cloud.callFunction({ name: j.name, data: j.data })
          .catch(() => {});
      });
    }, 1200);
  },

  onShow() {
    // 每次回到本页刷新登录状态（登录后引导条消失）
    this.setData({ hasLogin: !!wx.getStorageSync('loggedIn') });
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
  },

  // 分享整页：转发给好友/群
  onShareAppMessage() {
    return {
      title: '畅学尼龙 - 校园二手集市',
      path: '/pages/index/index',
      imageUrl: '/images/share_default.png'
    };
  },

  // 朋友圈分享（需页面配置 enableShareTimeline）
  onShareTimeline() {
    return {
      title: '畅学尼龙 - 校园二手集市',
      query: '',
      imageUrl: '/images/share_default.png'
    };
  },

  onPullDownRefresh() {
    // 记录刷新前的商品 id 集合，用于判断刷新后是否有新数据
    const oldIds = {};
    this.data.list.forEach(item => { oldIds[item._id] = true; });
    this.loadList(true, (info) => {
      wx.stopPullDownRefresh();
      if (!info || !info.ok) return; // 刷新未真正执行 / 失败（失败已有提示）
      // 对比新列表：出现旧列表没有的 id = 有新内容
      const added = this.data.list.filter(item => !oldIds[item._id]).length;
      if (added > 0) {
        wx.showToast({ title: `有新内容 ${added} 件`, icon: 'none', duration: 1200 });
      } else {
        wx.showToast({ title: '已是最新', icon: 'none', duration: 1000 });
      }
    });
  },

  onReachBottom() {
    if (!this.data.finished && !this.data.loading) {
      this.loadList(false);
    }
  },

  // 监听页面滚动：滚过 400px 显示回到顶部按钮
  onPageScroll(e) {
    const show = e.scrollTop > 400;
    if (show !== this.data.showBackTop) {
      this.setData({ showBackTop: show });
    }
  },

  // 回到顶部
  backTop() {
    wx.pageScrollTo({ scrollTop: 0, duration: 300 });
  },

  // 加载列表。isRefresh=true 时重置页码
  // done 回调：{ ok: true } 成功 / { ok: false } 未执行或失败（失败已自行提示）
  loadList(isRefresh, done) {
    if (this.data.loading) { done && done({ ok: false }); return; }
    this.setData({ loading: true });

    const page = isRefresh ? 0 : this.data.page;
    wx.cloud.callFunction({
      name: 'getList',
      data: {
        category: this.data.activeCat === '全部' ? '' : this.data.activeCat,
        keyword: this.data.keyword,
        sort: this.data.sort,
        subCategory: this.data.activeSubCat,
        thirdCategory: this.data.activeThirdCat,
        page,
        pageSize: this.data.pageSize
      }
    }).then(res => {
      const records = (res.result && res.result.data) || [];
      const list = isRefresh ? records : this.data.list.concat(records);
      this.setData({
        list,
        page: page + 1,
        finished: records.length < this.data.pageSize,
        loading: false
      });
      done && done({ ok: true });
    }).catch(err => {
      console.error(err);
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
      done && done({ ok: false });
    });
  },

  onSearchInput(e) {
    const v = e.detail.value;
    // 输入非空则收起热门/历史面板（避免遮挡手输）；清空则重新弹出
    this.setData({ keyword: v, showSearchPanel: v.trim() === '' });
  },

  // 获取输入焦点 → 弹出搜索面板（历史+热门，仅在输入框为空时）
  onSearchFocus() {
    if (this.data.keyword.trim() !== '') {
      this.setData({ showSearchPanel: false });
      return;
    }
    this.loadSearchPanel();
    this.setData({ showSearchPanel: true });
  },

  // 收起搜索面板
  closeSearchPanel() {
    this.setData({ showSearchPanel: false });
  },

  // 加载搜索历史 + 热门词
  loadSearchPanel() {
    const searchHistory = wx.getStorageSync('searchHistory') || [];
    this.setData({ searchHistory: searchHistory.slice(0, 10) });
    // 拉热门词（真实聚合），失败则用静态兜底
    wx.cloud.callFunction({ name: 'search', data: { action: 'hot' } })
      .then(res => {
        const words = (res.result && res.result.data) || [];
        this.setData({ hotWords: words.length ? words : STATIC_HOT_WORDS });
      })
      .catch(() => {
        this.setData({ hotWords: STATIC_HOT_WORDS });
      });
  },

  onSearchConfirm() {
    const kw = this.data.keyword.trim();
    if (!kw) return;
    this.saveHistory(kw);
    this.setData({ showSearchPanel: false });
    this.loadList(true);
    // 记录搜索（用于热门词聚合），失败不影响
    wx.cloud.callFunction({ name: 'search', data: { action: 'log', keyword: kw } }).catch(() => {});
  },

  clearSearch() {
    this.setData({ keyword: '' });
    this.loadList(true);
  },

  // 点历史/热门词直接搜索
  onSearchWordTap(e) {
    const kw = (e.currentTarget.dataset.word || '').trim();
    if (!kw) return;
    this.setData({ keyword: kw, showSearchPanel: false });
    this.saveHistory(kw);
    this.loadList(true);
    wx.cloud.callFunction({ name: 'search', data: { action: 'log', keyword: kw } }).catch(() => {});
  },

  // 记录搜索历史（最近10条，去重，最近优先）
  saveHistory(kw) {
    const arr = wx.getStorageSync('searchHistory') || [];
    const list = [kw].concat(arr.filter(x => x !== kw)).slice(0, 10);
    wx.setStorageSync('searchHistory', list);
    this.setData({ searchHistory: list });
  },

  // 删除单条历史
  delHistory(e) {
    const word = e.currentTarget.dataset.word;
    const list = (wx.getStorageSync('searchHistory') || []).filter(x => x !== word);
    wx.setStorageSync('searchHistory', list);
    this.setData({ searchHistory: list });
  },

  // 清空历史
  clearHistory() {
    wx.removeStorageSync('searchHistory');
    this.setData({ searchHistory: [] });
  },

  noopSearchPanel() {},

  onCatTap(e) {
    const cat = e.currentTarget.dataset.cat;
    if (cat === this.data.activeCat) return;
    this.setData({ activeCat: cat, activeSubCat: '', activeThirdCat: '' });
    this.refreshSubCats();
    this.loadList(true);
  },

  // 根据当前一级分类刷新二级标签
  refreshSubCats() {
    const subs = (app.globalData.subCategories || {})[this.data.activeCat] || [];
    this.setData({ subCatList: subs, thirdCatList: [], activeThirdCat: '' });
  },

  onSubCatTap(e) {
    const sub = e.currentTarget.dataset.sub; // ''=全部
    if (sub === this.data.activeSubCat) return;
    this.setData({ activeSubCat: sub, activeThirdCat: '' });
    this.refreshThirdCats();
    this.loadList(true);
  },

  // 根据当前二级分类刷新三级（学科）标签
  refreshThirdCats() {
    const thirds = (app.globalData.thirdCategories || {})[this.data.activeSubCat] || [];
    this.setData({ thirdCatList: thirds });
  },

  onThirdCatTap(e) {
    const t = e.currentTarget.dataset.t; // ''=全部
    if (t === this.data.activeThirdCat) return;
    this.setData({ activeThirdCat: t });
    this.loadList(true);
  },

  // 展开/收起全部分类面板
  toggleCatPanel() {
    this.setData({ showCatPanel: !this.data.showCatPanel });
  },

  noop() {},

  // 面板内选择分类
  onCatPanelTap(e) {
    const cat = e.currentTarget.dataset.cat;
    this.setData({ activeCat: cat, showCatPanel: false, activeSubCat: '', activeThirdCat: '' });
    this.refreshSubCats();
    this.loadList(true);
  },

  onSortTap(e) {
    const sort = e.currentTarget.dataset.sort;
    if (sort === this.data.sort) return;
    this.setData({ sort });
    this.loadList(true);
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/detail/detail?id=${id}` });
  },

  // 未登录引导条：跳转“我的”页登录
  goLogin() {
    wx.switchTab({ url: '/pages/mine/mine' });
  },

  goPublish() {
    wx.switchTab({ url: '/pages/publish/publish' });
  }
});
