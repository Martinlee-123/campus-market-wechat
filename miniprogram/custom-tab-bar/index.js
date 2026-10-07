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
      // 注册到全局，供非 tab 页（如 chat 聊天页）刷新未读红点
      const app = getApp();
      if (app && app.globalData) app.globalData.tabBar = this;
      this.refreshUnread();
      // 每 15 秒刷新一次未读数（原 30s 太久，红点消除迟滞）
      this._timer = setInterval(() => this.refreshUnread(), 15000);
    },
    detached() {
      if (this._timer) { clearInterval(this._timer); this._timer = null; }
      const app = getApp();
      if (app && app.globalData && app.globalData.tabBar === this) {
        app.globalData.tabBar = null;
      }
    }
  },

  // 每次页面显示时也刷新（切 tab 回来红点即时同步）
  pageLifetimes: {
    show() {
      this.refreshUnread();
    }
  }
});
