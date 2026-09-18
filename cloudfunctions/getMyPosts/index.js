// 云函数 getMyPosts：我发布的商品（含下架/删除状态展示）
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  try {
    const res = await db.collection('goods')
      .where({ _openid: openid })
      .orderBy('createdAt', 'desc')
      .limit(100)
      .field({
        _id: true, title: true, desc: true, price: true, category: true,
        cover: true, status: true, createdAt: true,
        viewCount: true, likeCount: true, subCategory: true,
        priceType: true, tradeStatus: true, verified: true, contactType: true,
        flowerCount: true
      })
      .get();

    res.data.forEach(item => {
      item.priceType = item.priceType || (item.price === 0 ? 'free' : item.price === -1 ? 'bargain' : '');
      item.tradeStatus = item.tradeStatus || 'selling';
      item.flowerCount = item.flowerCount || 0;
    });

    return { ok: true, data: res.data };
  } catch (e) {
    return { ok: false, msg: e.message, data: [] };
  }
};
