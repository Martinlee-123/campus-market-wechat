// pages/chat-list/chat-list.js：消息列表（会话列表）
const app = getApp();

Page({
  data: {
    list: [],
    loading: true,
    unreadTotal: 0
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 4 });
    }
    if (!wx.getStorageSync('loggedIn')) {
      this.setData({ list: [], loading: false });
      return;
    }
    this.loadList();
  },

  loadList() {
    wx.cloud.callFunction({
      name: 'chat',
      data: { action: 'myConversations' }
    }).then(res => {
      const r = (res.result) || {};
      const list = (r.data || []).map(c => ({
        ...c,
        timeText: c.lastTimeText || ''
      }));
      this.setData({ list, loading: false });
      // 同步刷新底部 tabBar 未读红点
      if (typeof this.getTabBar === 'function' && this.getTabBar()) {
        this.getTabBar().refreshUnread();
      } else {
        const app = getApp();
        const tb = app && app.globalData && app.globalData.tabBar;
        if (tb && typeof tb.refreshUnread === 'function') tb.refreshUnread();
      }
    }).catch(err => {
      console.error(err);
      this.setData({ loading: false });
    });
  },

  // 进入会话
  openChat(e) {
    const conv = e.currentTarget.dataset.conv;
    if (!conv || !conv.conversationId) return;
    wx.navigateTo({
      url: '/pages/chat/chat?conversationId=' + conv.conversationId +
        '&other=' + conv.other +
        '&avatar=' + encodeURIComponent(conv.otherAvatar || '') +
        '&nickname=' + encodeURIComponent(conv.otherNickname || '同学')
    });
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.loadList();
    wx.stopPullDownRefresh();
  }
});