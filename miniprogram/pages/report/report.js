// pages/report/report.js：举报页（帖子/求购通用）
const REASONS = ['虚假信息', '违规内容', '广告骚扰', '侵权盗版', '其他'];

Page({
  data: {
    targetType: 'goods',   // goods | want
    targetId: '',
    reasons: REASONS,
    selectedReason: '',
    customReason: '',
    images: [],            // 本地临时路径
    submitting: false
  },

  onLoad(options) {
    const targetType = options.type === 'want' ? 'want' : 'goods';
    this.setData({
      targetType,
      targetId: options.id || '',
    });
    wx.setNavigationBarTitle({ title: '举报' });
  },

  onReasonTap(e) {
    const r = e.currentTarget.dataset.reason;
    this.setData({ selectedReason: r === this.data.selectedReason ? '' : r });
  },
  onCustomInput(e) {
    this.setData({ customReason: e.detail.value });
  },

  // 附加图片（最多4张）
  chooseImage() {
    const left = 4 - this.data.images.length;
    if (left <= 0) { wx.showToast({ title: '最多4张', icon: 'none' }); return; }
    wx.chooseMedia({
      count: left,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: (res) => {
        const files = res.tempFiles.map(f => f.tempFilePath);
        this.setData({ images: this.data.images.concat(files) });
      }
    });
  },
  removeImage(e) {
    const idx = e.currentTarget.dataset.index;
    const images = this.data.images.slice();
    images.splice(idx, 1);
    this.setData({ images });
  },
  previewImage(e) {
    const idx = e.currentTarget.dataset.index;
    wx.previewImage({ current: this.data.images[idx], urls: this.data.images });
  },

  async submit() {
    // 必须登录
    if (!wx.getStorageSync('loggedIn')) {
      wx.showModal({
        title: '需要先登录',
        content: '举报前请先登录',
        confirmText: '去登录',
        success: (r) => { if (r.confirm) wx.switchTab({ url: '/pages/mine/mine' }); }
      });
      return;
    }

    const reason = this.data.selectedReason || this.data.customReason.trim();
    if (!this.data.selectedReason && !this.data.customReason.trim()) {
      return wx.showToast({ title: '请选择或填写举报原因', icon: 'none' });
    }

    if (this.data.submitting) return;
    this.setData({ submitting: true });
    wx.showLoading({ title: '提交中…', mask: true });

    try {
      // 上传图片
      const cloudPaths = [];
      for (let i = 0; i < this.data.images.length; i++) {
        const ext = this.data.images[i].split('.').pop().split('?')[0] || 'jpg';
        const cloudPath = `report/${Date.now()}_${i}.${ext}`;
        const up = await wx.cloud.uploadFile({ cloudPath, filePath: this.data.images[i] });
        cloudPaths.push(up.fileID);
      }

      const res = await wx.cloud.callFunction({
        name: 'report',
        data: {
          action: 'submit',
          targetType: this.data.targetType,
          targetId: this.data.targetId,
          reason,
          images: cloudPaths
        }
      });
      wx.hideLoading();
      this.setData({ submitting: false });

      if (res.result && res.result.ok) {
        wx.showToast({ title: '举报已提交', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 800);
      } else {
        wx.showToast({ title: (res.result && res.result.msg) || '举报失败', icon: 'none' });
      }
    } catch (e) {
      wx.hideLoading();
      this.setData({ submitting: false });
      console.error(e);
      wx.showToast({ title: '举报失败', icon: 'none' });
    }
  },

  // 分享页面（右上角···转发给好友/群）
  onShareAppMessage() {
    return {
      title: '举报 - 畅学尼龙',
      path: '/pages/report/report',
      imageUrl: '/images/share_default.png'
    };
  },

  // 朋友圈分享（右上角··· → 分享到朋友圈）
  onShareTimeline() {
    return {
      title: '举报 - 畅学尼龙',
      query: '',
      imageUrl: '/images/share_default.png'
    };
  }});
