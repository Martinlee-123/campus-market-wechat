// pages/want-publish/want-publish.js：发布求购
const app = getApp();

// 草稿箱：本地 Storage key（与发布商品页的草稿分开，互不覆盖）
const DRAFT_KEY = 'wantPublishDraft';

Page({
  data: {
    categories: ['学习资料', '生活用品', '数码设备', '餐券/各种卡', '其他'],
    categoryIndex: 0,
    title: '',
    desc: '',
    contact: '',
    contactType: '微信',
    submitting: false,
    draftActive: false // 当前是否有未完成的草稿
  },

  onLoad() {
    // 从本地读上次填的联系方式
    this.setData({ contact: wx.getStorageSync('myContact') || '' });
    // 检查是否有未完成的草稿
    this.checkDraft();
  },

  // ============ 草稿箱 ============
  // 是否有实质内容（contact 与默认分类不算，避免空草稿误提示）
  hasDraftContent() {
    const d = this.data;
    return !!(d.title.trim() || d.desc.trim() || d.categoryIndex);
  },

  // 实时自动保存草稿到本地 Storage
  saveDraft() {
    const hasContent = this.hasDraftContent();
    if (!hasContent) {
      this.clearDraft();
      if (this.data.draftActive) this.setData({ draftActive: false });
      return;
    }
    const draft = {
      title: this.data.title,
      desc: this.data.desc,
      categoryIndex: this.data.categoryIndex,
      contact: this.data.contact,
      contactType: this.data.contactType,
      savedAt: Date.now()
    };
    wx.setStorageSync(DRAFT_KEY, draft);
    if (!this.data.draftActive) this.setData({ draftActive: true });
  },

  clearDraft() {
    wx.removeStorageSync(DRAFT_KEY);
  },

  // 进页时检查草稿，有实质内容则弹窗提示恢复
  checkDraft() {
    const draft = wx.getStorageSync(DRAFT_KEY);
    if (!draft || !draft.savedAt) return;
    const hasContent = !!(draft.title || draft.desc || draft.categoryIndex);
    if (!hasContent) { this.clearDraft(); return; }
    wx.showModal({
      title: '发现未完成的草稿',
      content: '是否恢复上次填写的求购内容？',
      confirmText: '恢复',
      cancelText: '放弃',
      success: (r) => {
        if (r.confirm) this.restoreDraft(draft);
        else this.clearDraft();
      }
    });
  },

  // 一键恢复草稿
  restoreDraft(draft) {
    this.setData({
      title: draft.title || '',
      desc: draft.desc || '',
      categoryIndex: Number(draft.categoryIndex) || 0,
      contact: draft.contact || this.data.contact,
      contactType: draft.contactType || '微信'
    });
    this.setData({ draftActive: true });
    wx.showToast({ title: '草稿已恢复', icon: 'none' });
  },

  // 手动清空草稿
  clearDraftTap() {
    wx.showModal({
      title: '清空草稿',
      content: '确定清空当前未完成的草稿吗？',
      confirmText: '清空',
      cancelText: '取消',
      success: (r) => {
        if (!r.confirm) return;
        this.setData({
          title: '', desc: '', categoryIndex: 0,
          contactType: '微信', draftActive: false
        });
        this.clearDraft();
        wx.showToast({ title: '已清空', icon: 'none' });
      }
    });
  },

  onTitle(e) { this.setData({ title: e.detail.value }); this.saveDraft(); },
  onDesc(e) { this.setData({ desc: e.detail.value }); this.saveDraft(); },
  onContact(e) { this.setData({ contact: e.detail.value }); },
  onContactTypeTap(e) { this.setData({ contactType: e.currentTarget.dataset.type }); this.saveDraft(); },
  onCatChange(e) { this.setData({ categoryIndex: Number(e.detail.value) }); this.saveDraft(); },

  submit() {
    if (!wx.getStorageSync('loggedIn')) {
      wx.showModal({
        title: '需要先登录',
        content: '发布求购前请先登录（微信授权），登录后在"我的"页点击登录即可。',
        confirmText: '去登录',
        success: (r) => { if (r.confirm) wx.switchTab({ url: '/pages/mine/mine' }); }
      });
      return;
    }

    const { title: vTitle, desc: vDesc, contact: vContact, categoryIndex: vCat } = this.data;
    if (!vTitle.trim()) return wx.showToast({ title: '请填写求购内容', icon: 'none' });
    if (!vDesc.trim()) return wx.showToast({ title: '请填写补充说明', icon: 'none' });
    if (!vContact.trim()) return wx.showToast({ title: '请填写联系方式', icon: 'none' });

    wx.setStorageSync('myContact', vContact);
    this.setData({ submitting: true });
    wx.cloud.callFunction({
      name: 'want',
      data: {
        action: 'publish',
        title: vTitle.trim(),
        desc: vDesc.trim(),
        category: this.data.categories[vCat],
        contact: vContact.trim(),
        contactType: this.data.contactType
      }
    }).then(res => {
      this.setData({ submitting: false });
      if (res.result && res.result.ok) {
        // 发布成功：清草稿 + 重置表单，避免下次进来残留
        this.clearDraft();
        this.setData({
          title: '', desc: '', categoryIndex: 0, draftActive: false
        });
        wx.showToast({ title: '发布成功', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 800);
      } else {
        wx.showToast({ title: (res.result && res.result.msg) || '发布失败', icon: 'none' });
      }
    }).catch(err => {
      console.error(err);
      this.setData({ submitting: false });
      wx.showToast({ title: '发布失败', icon: 'none' });
    });
  },

  // 分享页面（右上角···转发给好友/群）
  onShareAppMessage() {
    return {
      title: '畅学尼龙 - 校园二手集市',
      path: '/pages/want-publish/want-publish',
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
