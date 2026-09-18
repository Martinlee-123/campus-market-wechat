// pages/publish/publish.js
const app = getApp();

// 草稿箱：本地 Storage key
const DRAFT_KEY = 'publishDraft';

Page({
  data: {
    categories: ['学习资料', '生活用品', '数码设备', '餐券/各种卡', '其他'],
    categoryIndex: 0,
    subCatList: [],   // 当前分类下的二级标签（仅学习资料）
    selectedSubCat: '', // 选中的二级标签，空=不选
    thirdCatList: [],   // 当前二级分类下的三级（学科）标签
    selectedThirdCat: '', // 选中的三级标签，空=不选
    title: '',
    desc: '',
    tags: '',
    price: '',
    priceType: '', // free=免费 bargain=可议价 ''=自定义/普通
    images: [],
    contact: '',
    contactType: '微信', // 微信 / QQ
    draftActive: false // 当前是否有未完成的草稿
  },

  onLoad() {
    const cats = app.globalData.categories.slice(1); // 去掉"全部"
    this.setData({ categories: cats });
    // 从本地读上次填的联系方式，省得每次重填
    const contact = wx.getStorageSync('myContact') || '';
    this.setData({ contact });
    // 初始化默认分类（学习资料）的二级标签
    this.refreshSubCats();
    // 检查是否有未完成的草稿
    this.checkDraft();
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }
  },

  // ============ 草稿箱 ============
  // 是否有实质内容（contact 与默认分类不算，避免空草稿误提示）
  hasDraftContent() {
    const d = this.data;
    return !!(d.title.trim() || d.desc.trim() || d.tags.trim() || d.price.trim() ||
      d.priceType || d.selectedSubCat || d.selectedThirdCat || d.images.length);
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
      tags: this.data.tags,
      price: this.data.price,
      priceType: this.data.priceType,
      categoryIndex: this.data.categoryIndex,
      selectedSubCat: this.data.selectedSubCat,
      selectedThirdCat: this.data.selectedThirdCat,
      contact: this.data.contact,
      contactType: this.data.contactType,
      images: this.data.images,
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
    const hasContent = !!(draft.title || draft.desc || draft.tags || draft.price ||
      draft.priceType || draft.selectedSubCat || draft.selectedThirdCat ||
      (draft.images && draft.images.length));
    if (!hasContent) { this.clearDraft(); return; }
    wx.showModal({
      title: '发现未完成的草稿',
      content: '是否恢复上次填写的发布内容？',
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
    const categoryIndex = Number(draft.categoryIndex) || 0;
    const selectedSubCat = draft.selectedSubCat || '';
    const selectedThirdCat = draft.selectedThirdCat || '';
    this.setData({
      title: draft.title || '',
      desc: draft.desc || '',
      tags: draft.tags || '',
      price: draft.price || '',
      priceType: draft.priceType || '',
      categoryIndex,
      selectedSubCat,
      selectedThirdCat,
      contact: draft.contact || this.data.contact,
      contactType: draft.contactType || '微信',
      images: Array.isArray(draft.images) ? draft.images : []
    });
    // 重建分类下拉（保留已选，不清空）
    this.refreshSubCats(true);
    this.refreshThirdCats();
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
        // 重置表单
        this.setData({
          title: '', desc: '', tags: '', price: '', priceType: '',
          categoryIndex: 0, selectedSubCat: '', selectedThirdCat: '',
          images: [], contactType: '微信', draftActive: false
        });
        this.refreshSubCats();
        this.clearDraft();
        wx.showToast({ title: '已清空', icon: 'none' });
      }
    });
  },

  onTitle(e) { this.setData({ title: e.detail.value }); this.saveDraft(); },
  onDesc(e) { this.setData({ desc: e.detail.value }); this.saveDraft(); },
  onTags(e) { this.setData({ tags: e.detail.value }); this.saveDraft(); },
  onPrice(e) {
    const price = e.detail.value;
    // 用户手动填了具体数字 → 清掉快捷项选择（互斥）
    const priceType = price.trim() !== '' ? '' : this.data.priceType;
    this.setData({ price, priceType });
    this.saveDraft();
  },

  // 选择一个价格快捷项
  onPriceTypeTap(e) {
    const t = e.currentTarget.dataset.type; // 'free' | 'bargain'
    // 已选则取消；选快捷项时清掉已填数字
    const priceType = this.data.priceType === t ? '' : t;
    this.setData({ price: '', priceType });
    this.saveDraft();
  },
  onContact(e) { this.setData({ contact: e.detail.value }); this.saveDraft(); },
  onContactTypeTap(e) {
    this.setData({ contactType: e.currentTarget.dataset.type });
    this.saveDraft();
  },

  onCatChange(e) {
    const categoryIndex = Number(e.detail.value);
    this.setData({ categoryIndex, selectedThirdCat: '' });
    this.refreshSubCats();
    this.saveDraft();
  },

  // 根据当前一级分类刷新二级标签
  refreshSubCats(keepSelection) {
    const cat = this.data.categories[this.data.categoryIndex];
    const subs = (app.globalData.subCategories || {})[cat] || [];
    if (keepSelection) {
      // 恢复草稿用：只更新二级列表，不清空已选
      this.setData({ subCatList: subs });
    } else {
      // 切分类时重置已选二级/三级
      this.setData({ subCatList: subs, selectedSubCat: '', thirdCatList: [], selectedThirdCat: '' });
    }
  },

  onSubCatTap(e) {
    const sub = e.currentTarget.dataset.sub;
    const selectedSubCat = sub === this.data.selectedSubCat ? '' : sub;
    this.setData({ selectedSubCat, selectedThirdCat: '' });
    this.refreshThirdCats();
    this.saveDraft();
  },

  // 根据当前二级分类刷新三级（学科）标签
  refreshThirdCats() {
    const thirds = (app.globalData.thirdCategories || {})[this.data.selectedSubCat] || [];
    this.setData({ thirdCatList: thirds });
  },

  onThirdCatTap(e) {
    const t = e.currentTarget.dataset.t;
    this.setData({ selectedThirdCat: t === this.data.selectedThirdCat ? '' : t });
    this.saveDraft();
  },

  // 选择图片（最多3张）
  chooseImage() {
    const left = 3 - this.data.images.length;
    if (left <= 0) { wx.showToast({ title: '最多3张', icon: 'none' }); return; }
    wx.chooseMedia({
      count: left,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: (res) => {
        const files = res.tempFiles.map(f => f.tempFilePath);
        this.setData({ images: this.data.images.concat(files) });
        this.saveDraft();
      }
    });
  },

  removeImage(e) {
    const idx = e.currentTarget.dataset.index;
    const images = this.data.images.slice();
    images.splice(idx, 1);
    this.setData({ images });
    this.saveDraft();
  },

  // 预览图片
  previewImage(e) {
    const idx = e.currentTarget.dataset.index;
    wx.previewImage({ current: this.data.images[idx], urls: this.data.images });
  },

  async submit() {
    // 游客不允许发布：必须先在“我的”页微信授权登录
    if (!wx.getStorageSync('loggedIn')) {
      wx.showModal({
        title: '需要先登录',
        content: '发布前请先登录（微信授权），登录后在“我的”页点击登录即可。',
        confirmText: '去登录',
        cancelText: '取消',
        success: (r) => {
          if (r.confirm) wx.switchTab({ url: '/pages/mine/mine' });
        }
      });
      return;
    }

    const { title, desc, price, images, contact, categoryIndex, priceType } = this.data;
    if (!title.trim()) return wx.showToast({ title: '请填写标题', icon: 'none' });
    if (!desc.trim()) return wx.showToast({ title: '请填写描述', icon: 'none' });
    // 价格：选了快捷项则不填数字，否则必须有有效数字
    const hasPriceType = priceType === 'free' || priceType === 'bargain';
    if (!hasPriceType && (!price.trim() || isNaN(Number(price)) || Number(price) < 0)) {
      return wx.showToast({ title: '请填写有效价格，或选择免费/可议价', icon: 'none' });
    }
    if (!contact.trim()) return wx.showToast({ title: '请填写联系方式', icon: 'none' });

    wx.showLoading({ title: '发布中…', mask: true });

    try {
      // 上传图片到云存储
      const cloudPaths = [];
      for (let i = 0; i < images.length; i++) {
        const ext = images[i].split('.').pop().split('?')[0] || 'jpg';
        const cloudPath = `goods/${Date.now()}_${i}.${ext}`;
        const upRes = await wx.cloud.uploadFile({
          cloudPath,
          filePath: images[i]
        });
        cloudPaths.push(upRes.fileID);
      }

      // 记住联系方式
      wx.setStorageSync('myContact', contact);

      // 调云函数写数据库
      const res = await wx.cloud.callFunction({
        name: 'publish',
        data: {
          title: title.trim(),
          desc: desc.trim(),
          tags: this.data.tags,
          price: hasPriceType ? 0 : Number(price),
          priceType,
          category: this.data.categories[categoryIndex],
          subCategory: this.data.selectedSubCat,
          thirdCategory: this.data.selectedThirdCat,
          images: cloudPaths,
          contact: contact.trim(),
          contactType: this.data.contactType
        }
      });

      wx.hideLoading();
      if (res.result && res.result.ok) {
        // 发布成功：清除草稿
        this.clearDraft();
        this.setData({ draftActive: false });
        wx.showToast({ title: '发布成功', icon: 'success' });
        setTimeout(() => {
          wx.switchTab({ url: '/pages/index/index' });
        }, 800);
      } else {
        wx.showToast({ title: (res.result && res.result.msg) || '发布失败', icon: 'none' });
      }
    } catch (e) {
      wx.hideLoading();
      console.error(e);
      wx.showToast({ title: '发布失败', icon: 'none' });
    }
  }
});
