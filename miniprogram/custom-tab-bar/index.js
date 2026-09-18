Component({
  data: {
    selected: 0,
    unread: 0,
    list: [
      {
        pagePath: '/pages/index/index',
        text: '逛逛',
        iconPath: '/images/tab_home.png',
        selectedIconPath: '/images/tab_home_active.png'
      },
      {
        pagePath: '/pages/want/want',
        text: '求购',
        iconPath: '/images/tab_want.png',
        selectedIconPath: '/images/tab_want_active.png'
      },
      {
        pagePath: '/pages/publish/publish',
        text: '发布',
        iconPath: '/images/tab_publish.png',
        selectedIconPath: '/images/tab_publish_active.png'
      },
      {
        pagePath: '/pages/mine/mine',
        text: '我的',
        iconPath: '/images/tab_mine.png',
        selectedIconPath: '/images/tab_mine_active.png'
      },
      {
        pagePath: '/pages/chat-list/chat-list',
        text: '消息',
        iconPath: '/images/tab_msg.png',
        selectedIconPath: '/images/tab_msg_active.png'
      }
    ]
  },

  methods: {
    switchTab(e) {
      const data = e.currentTarget.dataset;
      const url = data.path;
      const index = Number(data.index);
      this.setData({ selected: index });
      wx.switchTab({ url });
    },

    // 拉取未读消息数（tabBar 红点）
    refreshUnread() {
      if (!wx.getStorageSync('loggedIn')) {
        this.setData({ unread: 0 });
        return;
      }
      wx.cloud.callFunction({
        name: 'chat',
        data: { action: 'unreadCount' }
      }).then(res => {
        const count = (res.result && res.result.count) || 0;
        this.setData({ unread: count });
      }).catch(() => {});
    }
  },

  lifetimes: {
    attached() {
      this.refreshUnread();
      // 每 30 秒刷新一次未读数
      this._timer = setInterval(() => this.refreshUnread(), 30000);
    },
    detached() {
      if (this._timer) { clearInterval(this._timer); this._timer = null; }
    }
  }
});
