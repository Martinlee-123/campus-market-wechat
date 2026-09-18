// pages/chat/chat.js：站内聊天窗口
Page({
  data: {
    conversationId: '',
    otherOpenid: '',
    myOpenid: '',
    nickname: '同学',
    goodsTitle: '',
    list: [],
    input: '',
    loading: true,
    sending: false
  },

  onLoad(options) {
    const conversationId = options.conversationId || '';
    const other = options.other || '';
    const nickname = decodeURIComponent(options.nickname || '同学');
    const goodsTitle = decodeURIComponent(options.goodsTitle || '');
    this.setData({ conversationId, otherOpenid: other, nickname, goodsTitle });
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

  loadHistory() {
    wx.cloud.callFunction({
      name: 'chat',
      data: { action: 'history', conversationId: this.data.conversationId, page: 0, pageSize: 50 }
    }).then(res => {
      const r = (res.result) || {};
      if (r.ok) {
        const myOpenid = this.data.myOpenid;
        const list = (r.data || []).map(m => ({ ...m, isMine: !!myOpenid && m.from === myOpenid }));
        this.setData({ list, loading: false });
        this.scrollBottom();
      } else {
        this.setData({ loading: false });
      }
      // 标记已读
      this.markRead();
    }).catch(err => {
      console.error(err);
      this.setData({ loading: false });
    });
  },

  markRead() {
    wx.cloud.callFunction({
      name: 'chat',
      data: { action: 'markRead', conversationId: this.data.conversationId }
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
        this.setData({ input: '' });
        this.loadHistory();
      } else {
        wx.showToast({ title: r.msg || '发送失败', icon: 'none' });
      }
    }).catch(err => {
      console.error(err);
      this.setData({ sending: false });
      wx.showToast({ title: '发送失败', icon: 'none' });
    });
  },

  // 滚动到底部
  scrollBottom() {
    setTimeout(() => {
      wx.pageScrollTo({ scrollTop: 99999, duration: 0 });
    }, 50);
  },

  // 定时刷新（轻量轮询新消息）
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
      if (!this.data.loading) this.loadHistory();
    }, 5000);
  },
  stopPolling() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  }
});