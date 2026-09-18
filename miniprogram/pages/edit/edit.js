// pages/edit/edit.js：编辑自己的商品
const app = getApp();

Page({
  data: {
    id: '',
    categories: [],
    categoryIndex: 0,
    subCatList: [],
    selectedSubCat: '',
    thirdCatList: [],
    selectedThirdCat: '',
    title: '',
    desc: '',
    tags: '',
    price: '',
    priceType: '',
    contact: '',
    contactType: '微信',
    loading: true
  },

  onLoad(options) {
    const cats = (app.globalData.categories || []).slice(1); // 去掉"全部"
    this.setData({ categories: cats });

    const id = options.id;
    if (!id) {
      wx.showToast({ title: '参数错误', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1000);
      return;
    }
    this.setData({ id });
    this.loadDetail(id);
  },

  // 读取原商品数据
  loadDetail(id) {
    wx.cloud.callFunction({
      name: 'getDetail',
      data: { id }
    }).then(res => {
      const item = res.result && res.result.data;
      if (!item) {
        wx.showToast({ title: '商品不存在', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 1000);
        return;
      }
      const idx = this.data.categories.indexOf(item.category);
      const pt = item.priceType || (item.price === 0 ? 'free' : item.price === -1 ? 'bargain' : '');
      this.setData({
        title: item.title || '',
        desc: item.desc || '',
        tags: (item.tags || []).join(' '),
        price: pt ? '' : (item.price === 0 ? '0' : String(item.price || '')),
        priceType: pt,
        contact: item.contact || '',
        contactType: item.contactType === 'QQ' ? 'QQ' : '微信',
        categoryIndex: idx >= 0 ? idx : 0,
        loading: false
      });
      this.refreshSubCats(item.subCategory || '');
      this.refreshThirdCats(item.subCategory, item.thirdCategory || '');
    }).catch(err => {
      console.error(err);
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ loading: false });
    });
  },

  onTitle(e) { this.setData({ title: e.detail.value }); },
  onDesc(e) { this.setData({ desc: e.detail.value }); },
  onTags(e) { this.setData({ tags: e.detail.value }); },
  onPrice(e) {
    const price = e.detail.value;
    const priceType = price.trim() !== '' ? '' : this.data.priceType;
    this.setData({ price, priceType });
  },
  onPriceTypeTap(e) {
    const t = e.currentTarget.dataset.type;
    const priceType = this.data.priceType === t ? '' : t;
    this.setData({ price: '', priceType });
  },
  onContact(e) { this.setData({ contact: e.detail.value }); },
  onContactTypeTap(e) { this.setData({ contactType: e.currentTarget.dataset.type }); },
  onCatChange(e) {
    const categoryIndex = Number(e.detail.value);
    this.setData({ categoryIndex, selectedThirdCat: '' });
    this.refreshSubCats('');
  },

  // 根据当前分类刷新二级标签，keepSub 为当前保留选中的二级
  refreshSubCats(keepSub) {
    const cat = this.data.categories[this.data.categoryIndex];
    const subs = (app.globalData.subCategories || {})[cat] || [];
    const selectedSubCat = subs.indexOf(keepSub) >= 0 ? keepSub : '';
    this.setData({ subCatList: subs, selectedSubCat, thirdCatList: [], selectedThirdCat: '' });
  },

  onSubCatTap(e) {
    const sub = e.currentTarget.dataset.sub;
    const selectedSubCat = sub === this.data.selectedSubCat ? '' : sub;
    this.setData({ selectedSubCat, selectedThirdCat: '' });
    this.refreshThirdCats(selectedSubCat, '');
  },

  // 根据当前二级分类刷新三级（学科）标签。keepThird 为当前保留选中的三级
  refreshThirdCats(keepSub, keepThird) {
    const thirds = (app.globalData.thirdCategories || {})[keepSub || this.data.selectedSubCat] || [];
    const selectedThirdCat = thirds.indexOf(keepThird) >= 0 ? keepThird : '';
    this.setData({ thirdCatList: thirds, selectedThirdCat });
  },

  onThirdCatTap(e) {
    const t = e.currentTarget.dataset.t;
    this.setData({ selectedThirdCat: t === this.data.selectedThirdCat ? '' : t });
  },

  submit() {
    const { id, title, desc, price, contact, categoryIndex, categories, selectedSubCat, selectedThirdCat, priceType } = this.data;
    if (!title.trim()) return wx.showToast({ title: '请填写标题', icon: 'none' });
    if (!desc.trim()) return wx.showToast({ title: '请填写描述', icon: 'none' });
    const hasPriceType = priceType === 'free' || priceType === 'bargain';
    if (!hasPriceType && (!price.trim() || isNaN(Number(price)) || Number(price) < 0)) {
      return wx.showToast({ title: '请填写有效价格，或选择免费/可议价', icon: 'none' });
    }
    if (!contact.trim()) return wx.showToast({ title: '请填写联系方式', icon: 'none' });

    wx.showLoading({ title: '保存中…', mask: true });
    wx.cloud.callFunction({
      name: 'updatePost',
      data: {
        id,
        title: title.trim(),
        desc: desc.trim(),
        tags: this.data.tags,
        price: hasPriceType ? 0 : Number(price),
        priceType,
        category: categories[categoryIndex],
        subCategory: selectedSubCat,
        thirdCategory: selectedThirdCat,
        contact: contact.trim(),
        contactType: this.data.contactType
      }
    }).then(res => {
      wx.hideLoading();
      if (res.result && res.result.ok) {
        wx.showToast({ title: '保存成功', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 800);
      } else {
        wx.showToast({ title: (res.result && res.result.msg) || '保存失败', icon: 'none' });
      }
    }).catch(err => {
      wx.hideLoading();
      console.error(err);
      wx.showToast({ title: '保存失败', icon: 'none' });
    });
  },

  // 分享页面（右上角···转发给好友/群）
  onShareAppMessage() {
    return {
      title: '畅学尼龙 - 校园二手集市',
      path: '/pages/edit/edit',
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
  }
});
