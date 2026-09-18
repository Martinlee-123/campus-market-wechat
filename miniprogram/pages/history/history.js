// pages/history/history.js：最近浏览（本地存储，最多20条，去重）
const KEY = 'viewHistory';

Page({
  data: {
    list: [],
    loading: true
  },

  onShow() { this.loadList(); },

  loadList() {
    const list = wx.getStorageSync(KEY) || [];
    // 格式化浏览时间（相对时间：刚刚/x分钟前/x小时前/昨天/日期）
    list.forEach(item => {
      item.timeText = formatTime(item.viewedAt);
    });
    this.setData({ list, loading: false });
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id;
    // 商品可能已被删除/下架，点击后详情页会自行处理（显示"内容不存在或已下架"）
    wx.navigateTo({ url: `/pages/detail/detail?id=${id}` });
  },

  // 清空浏览历史
  clearAll() {
    if (!this.data.list.length) return;
    wx.showModal({
      title: '清空浏览历史',
      content: '确定要清空最近浏览吗？',
      success: (r) => {
        if (!r.confirm) return;
        wx.removeStorageSync(KEY);
        this.setData({ list: [] });
        wx.showToast({ title: '已清空', icon: 'none' });
      }
    });
  },

  // 单条删除
  removeOne(e) {
    const id = e.currentTarget.dataset.id;
    const list = (wx.getStorageSync(KEY) || []).filter(x => x._id !== id);
    wx.setStorageSync(KEY, list);
    this.setData({ list });
  },

  // 分享页面（右上角···转发给好友/群）
  onShareAppMessage() {
    return {
      title: '畅学尼龙 - 校园二手集市',
      path: '/pages/history/history',
      imageUrl: '/images/share_default.png'
    };
  },

  // 朋友圈分享（右上角··· → 分享到朋友圈）
  onShareTimeline() {
    return {
      title: '畅学尼龙 - 校园二手集市',
      query: '',
      imageUrl: '/images/share_default.png'
    };
  }});

// 相对时间格式化
function formatTime(ts) {
  if (!ts) return '';
  const t = Number(ts);
  const diff = Date.now() - t;
  if (diff < 60 * 1000) return '刚刚';
  if (diff < 3600 * 1000) return Math.floor(diff / 60000) + '分钟前';
  if (diff < 24 * 3600 * 1000) return Math.floor(diff / 3600000) + '小时前';
  const d = new Date(t);
  const now = new Date();
  const pad = n => (n < 10 ? '0' + n : '' + n);
  const sameYear = d.getFullYear() === now.getFullYear();
  return (sameYear ? '' : d.getFullYear() + '-') + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}