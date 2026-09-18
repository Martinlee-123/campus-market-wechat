// pages/admin/admin.js：管理后台（仅管理员可见）
Page({
  data: {
    tab: 'posts',          // posts=帖子管理 auth=认证管理
    stats: {},
    keyword: '',
    status: '',           // ''=全部 on=在售 off=下架 deleted=已删
    statusFilters: [
      { key: '', label: '全部' },
      { key: 'on', label: '在售' },
      { key: 'off', label: '下架' },
      { key: 'deleted', label: '已删' }
    ],
    list: [],
    loading: false,
    finished: false,
    page: 0,
    pageSize: 20,
    // 认证管理
    authStatus: '',
    authFilters: [
      { key: '', label: '全部' },
      { key: 'approved', label: '🎓已认证' },
      { key: 'pending', label: '审核中' },
      { key: 'rejected', label: '未通过' },
      { key: 'none', label: '未认证' }
    ],
    authList: [],
    authLoading: false,
    // 举报管理
    repPending: 0,
    repFilters: [
      { key: '', label: '全部' },
      { key: 'pending', label: '待处理' },
      { key: 'handled', label: '已处理' }
    ],
    repStatus: '',
    repStats: {},
    repList: [],
    repLoading: false,
    repFinished: false,
    repPage: 0
  },

  onLoad() {
    this.checkAdmin();
    this.loadStats();
    this.loadList(true);
    this.loadRepStats();
  },

  onPullDownRefresh() {
    this.loadStats();
    this.loadList(true, () => wx.stopPullDownRefresh());
    this.loadRepStats();
    if (this.data.tab === 'reports') this.loadRepList(true);
  },

  onReachBottom() {
    if (this.data.tab === 'auth') {
      this.loadAuthList(false);
    } else if (this.data.tab === 'reports') {
      this.loadRepList(false);
    } else if (!this.data.finished && !this.data.loading) {
      this.loadList(false);
    }
  },

  // 切换 帖子/认证 tab
  onTabTap(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === this.data.tab) return;
    this.setData({ tab });
    if (tab === 'auth') this.loadAuthList(true);
    if (tab === 'reports') { this.loadRepStats(); this.loadRepList(true); }
  },

  // ----- 认证管理 -----
  loadAuthList(isRefresh) {
    if (this.data.authLoading) return;
    this.setData({ authLoading: true });
    wx.cloud.callFunction({
      name: 'admin',
      data: { action: 'authList', status: this.data.authStatus }
    }).then(res => {
      const records = (res.result && res.result.data) || [];
      this.setData({
        authList: isRefresh ? records : this.data.authList.concat(records),
        authLoading: false
      });
    }).catch(err => {
      console.error(err);
      this.setData({ authLoading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    });
  },

  onAuthStatusTap(e) {
    const status = e.currentTarget.dataset.status;
    if (status === this.data.authStatus) return;
    this.setData({ authStatus: status });
    this.loadAuthList(true);
  },

  callAuth(id, status, msg) {
    wx.cloud.callFunction({ name: 'admin', data: { action: 'authApprove', id, status } })
      .then(res => {
        if (res.result && res.result.ok) {
          wx.showToast({ title: msg, icon: 'success' });
          this.loadAuthList(true);
        } else {
          wx.showToast({ title: (res.result && res.result.msg) || '操作失败', icon: 'none' });
        }
      }).catch(err => console.error(err));
  },

  onAuthApprove(e) {
    this.callAuth(e.currentTarget.dataset.id, 'approved', '已通过');
  },
  onAuthReject(e) {
    this.callAuth(e.currentTarget.dataset.id, 'rejected', '已拒绝');
  },


  // 权限校验
  checkAdmin() {
    wx.cloud.callFunction({ name: 'admin', data: { action: 'me' } }).then(res => {
      if (!res.result || !res.result.ok) {
        wx.showToast({ title: '无管理权限', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 800);
      }
    }).catch(() => {
      wx.showToast({ title: '权限验证失败', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
    });
  },

  loadStats() {
    wx.cloud.callFunction({ name: 'admin', data: { action: 'stats' } }).then(res => {
      if (res.result && res.result.ok) this.setData({ stats: res.result.data });
    }).catch(() => {});
  },

  loadList(isRefresh, done) {
    if (this.data.loading) { done && done(); return; }
    this.setData({ loading: true });
    const page = isRefresh ? 0 : this.data.page;
    wx.cloud.callFunction({
      name: 'admin',
      data: {
        action: 'list',
        page,
        pageSize: this.data.pageSize,
        keyword: this.data.keyword.trim(),
        status: this.data.status
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

  onStatusTap(e) {
    const status = e.currentTarget.dataset.status;
    if (status === this.data.status) return;
    this.setData({ status });
    this.loadList(true);
  },

  // 封装 admin 调用
  call(action, id, cb) {
    wx.cloud.callFunction({ name: 'admin', data: { action, id } }).then(res => {
      if (res.result && res.result.ok) {
        wx.showToast({ title: res.result.msg || '成功', icon: 'success' });
        cb && cb();
      } else {
        wx.showToast({ title: (res.result && res.result.msg) || '操作失败', icon: 'none' });
      }
    }).catch(err => {
      console.error(err);
      wx.showToast({ title: '操作失败', icon: 'none' });
    });
  },

  onDelete(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除帖子',
      content: '将标记为已删除（可恢复），确定？',
      confirmColor: '#e53935',
      success: (r) => { if (r.confirm) this.call('delete', id, () => { this.loadStats(); this.loadList(true); }); }
    });
  },

  onOff(e) {
    const id = e.currentTarget.dataset.id;
    this.call('off', id, () => { this.loadStats(); this.loadList(true); });
  },

  onRecover(e) {
    const id = e.currentTarget.dataset.id;
    this.call('recover', id, () => { this.loadStats(); this.loadList(true); });
  },

  // ----- 举报管理 -----
  loadRepStats() {
    wx.cloud.callFunction({ name: 'admin', data: { action: 'reportStats' } }).then(res => {
      if (res.result && res.result.ok) {
        this.setData({ repStats: res.result.data, repPending: res.result.data.pending || 0 });
      }
    }).catch(() => {});
  },

  loadRepList(isRefresh) {
    if (this.data.repLoading) return;
    this.setData({ repLoading: true });
    const page = isRefresh ? 0 : this.data.repPage;
    wx.cloud.callFunction({
      name: 'admin',
      data: { action: 'reportList', page, pageSize: 10, status: this.data.repStatus }
    }).then(res => {
      const records = (res.result && res.result.data) || [];
      this.setData({
        repList: isRefresh ? records : this.data.repList.concat(records),
        repPage: page + 1,
        repFinished: records.length < 10,
        repLoading: false
      });
    }).catch(err => {
      console.error(err);
      this.setData({ repLoading: false });
    });
  },

  onRepStatusTap(e) {
    const status = e.currentTarget.dataset.status;
    if (status === this.data.repStatus) return;
    this.setData({ repStatus: status });
    this.loadRepList(true);
  },

  previewImg(e) {
    const url = e.currentTarget.dataset.url;
    if (url) wx.previewImage({ current: url, urls: [url] });
  },

  onRepHandle(e) {
    const id = e.currentTarget.dataset.id;
    const result = e.currentTarget.dataset.result;
    const tip = result === 'delete' ? '删除' : result === 'off' ? '下架' : '忽略'; // '删除'/'下架'/'忽略'  -> 恢复
    const content = result === 'ignore' ? '将恢复该内容并标记所有相关举报为已处理，确定？' : '确定' + tip + '该内容？';
    wx.showModal({
      title: tip + '处理',
      content,
      confirmColor: result === 'ignore' ? '#7C6BC0' : '#e53935',
      success: (r) => {
        if (!r.confirm) return;
        wx.cloud.callFunction({ name: 'admin', data: { action: 'reportHandle', id, result } })
          .then(res => {
            if (res.result && res.result.ok) {
              wx.showToast({ title: res.result.msg || '已处理', icon: 'success' });
              this.loadRepList(true);
              this.loadRepStats();
            } else {
              wx.showToast({ title: (res.result && res.result.msg) || '操作失败', icon: 'none' });
            }
          }).catch(err => {
            console.error(err);
            wx.showToast({ title: '操作失败', icon: 'none' });
          });
      }
    });
  },

  // 分享页面（右上角···转发给好友/群）
  onShareAppMessage() {
    return {
      title: '管理后台 - 畅学尼龙',
      path: '/pages/admin/admin',
      imageUrl: '/images/share_default.png'
    };
  },

  // 朋友圈分享（右上角··· → 分享到朋友圈）
  onShareTimeline() {
    return {
      title: '管理后台 - 畅学尼龙',
      query: '',
      imageUrl: '/images/share_default.png'
    };
  }});
