// pages/chat/chat.js：站内聊天窗口
const app = getApp();

Page({
  data: {
    conversationId: '',
    otherOpenid: '',
    otherAvatar: '',
    myOpenid: '',
    nickname: '同学',
    goodsTitle: '',
    list: [],
    input: '',
    loading: true,
    sending: false,
    scrollTop: 0
  },

  onLoad(options) {
    const conversationId = options.conversationId || '';
    const other = options.other || '';
    const avatar = decodeURIComponent(options.avatar || '');
    const nickname = decodeURIComponent(options.nickname || '同学');
    const goodsTitle = decodeURIComponent(options.goodsTitle || '');
    this.setData({ conversationId, otherOpenid: other, otherAvatar: avatar, nickname, goodsTitle });
    wx.setNavigationBarTitle({ title: nickname });
    // 拿自己 openid，用于区分消息左右
    wx.cloud.callFunction({ name: 'chat', data: { action: 'myId' } })
      .then(res => {
        const myOpenid = (res.result && res.result.openid) || '';
        this.setData({ myOpenid });
        this.loadHistory();
      })
      .catch(() => this.loadHistory());
  },

  // silent=true 时不显示 loading、不做滚动/已读副作用（用于轮询）
  loadHistory(silent) {
    return wx.cloud.callFunction({
      name: 'chat',
      data: { action: 'history', conversationId: this.data.conversationId, page: 0, pageSize: 50 }
    }).then(res => {
      const r = (res.result) || {};
      if (r.ok) {
        const myOpenid = this.data.myOpenid;
        const list = (r.data || []).map(m => ({ ...m, isMine: !!myOpenid && m.from === myOpenid }));
        this.setData({ list, loading: false });
        if (!silent) this.scrollBottom();
        this.markRead();
      } else {
        this.setData({ loading: false });
      }
    }).catch(err => {
      console.error(err);
      this.setData({ loading: false });
    });
  },

  markRead() {
    wx.cloud.callFunction({
      name: 'chat',
      data: { action: 'markRead', conversationId: this.data.conversationId }
    }).then(() => {
      // 本地乐观清零 tabBar 红点：后端最终一致有延迟，不能等 unreadCount 异步查完（会读到旧值，红点迟迟不消）
      const app = getApp();
      const tb = app && app.globalData && app.globalData.tabBar;
      if (tb) {
        tb.setData({ unread: 0 });
        // 800ms 后异步校准：若有其它会话未读，会写回正确值；此时 markRead 已落库
        setTimeout(() => {
          if (typeof tb.refreshUnread === 'function') tb.refreshUnread();
        }, 800);
      }
    }).catch(() => {});
  },

  onInput(e) {
    this.setData({ input: e.detail.value });
  },

  send() {
    const content = this.data.input.trim();
    if (!content) return;
    if (this.data.sending) return;
    this.setData({ sending: true });

    wx.cloud.callFunction({
      name: 'chat',
      data: { action: 'send', conversationId: this.data.conversationId, content }
    }).then(res => {
      this.setData({ sending: false });
      const r = (res.result) || {};
      if (r.ok) {
        // 乐观插入：先本地渲染，再拉一次历史做校准
        const myOpenid = this.data.myOpenid;
        const list = this.data.list.concat([{
          _id: 'local_' + Date.now(),
          from: myOpenid,
          to: this.data.otherOpenid,
          content,
          type: 'text',
          timeText: '刚刚',
          isMine: true
        }]);
        this.setData({ input: '', list });
        this.scrollBottom();
        this.loadHistory(true);
      } else {
        wx.showToast({ title: r.msg || '发送失败', icon: 'none' });
      }
    }).catch(err => {
      console.error(err);
      this.setData({ sending: false });
      wx.showToast({ title: '发送失败', icon: 'none' });
    });
  },

  // 滚动到底部：直接操作 scroll-view 的 scrollTop（比 scroll-into-view 更可靠，能连续触发）
  scrollBottom() {
    // 用一个递增的“足够大”值，scroll-view 会自动夹到最底。每次调用都触发滚动。
    const big = this._scrollMax = (this._scrollMax || 0) + 1;
    setTimeout(() => {
      this.setData({ scrollTop: 999999000 + big });
    }, 80);
  },

  // 点对方头像 → 进对方主页（拉黑仍在主页原位置）
  goOtherProfile() {
    if (!this.data.otherOpenid) return;
    // 优先用对方在售商品解析身份（getSeller 支持 self=1 / goodsId）
    // 聊天页没有 goodsId，这里用 openid 兜底：走新加的 byOpenid 分支
    wx.navigateTo({
      url: '/pages/seller/seller?byOpenid=' + this.data.otherOpenid +
        '&nickname=' + encodeURIComponent(this.data.nickname || '同学')
    });
  },

  // 定时刷新（轻量轮询新消息）——不依赖 loading，避免首轮后不再刷新
  onShow() {
    this.startPolling();
  },
  onHide() {
    this.stopPolling();
  },
  onUnload() {
    this.stopPolling();
  },
  startPolling() {
    this.stopPolling();
    this._timer = setInterval(() => {
      if (this.data.conversationId) this.loadHistory(true);
    }, 3000);
  },
  stopPolling() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  }
});
