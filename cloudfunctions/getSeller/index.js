// 云函数 getSeller：根据一条在售商品的ID，返回该卖家的资料 + 其在售的全部商品
// 用法：detail 页点卖家头像/昵称时，传当前商品ID，由云函数解析出卖家身份
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  // self=1：看自己的主页（“我的”页点头像进入）
  // 否则：传 goodsId，由这条商品解析出卖家身份（详情页点头像进入）
  const selfMode = event.self === 1 || event.self === '1' || event.self === true;

  let sellerOpenid = '';
  if (selfMode) {
    sellerOpenid = openid;
  } else {
    const goodsId = (event.goodsId || '').trim();
    if (!goodsId) return { ok: false, msg: '缺少商品ID' };

    // 1. 由这条商品 get 到卖家 _openid
    try {
      const doc = await db.collection('goods').doc(goodsId).get();
      const g = doc.data;
      if (!g || !g._openid) return { ok: false, msg: '商品不存在' };
      sellerOpenid = g._openid;
    } catch (e) {
      return { ok: false, msg: '商品不存在或已下架' };
    }
  }

  // 拉黑拦截：查看别人的主页时，若对方被我拉黑则拒绝
  if (!selfMode && sellerOpenid) {
    const blocked = await db.collection('blacklist')
      .where({ _openid: openid, targetOpenid: sellerOpenid })
      .count().catch(() => ({ total: 0 }));
    if (blocked.total > 0) {
      return { ok: false, msg: '该用户已被你拉黑' };
    }
  }

  // 2. 查卖家的资料（昵称/头像/收到的小花）
  let profile = { nickname: '同学', avatar: '', flowerReceived: 0, verified: 'none' };
  try {
    const userRec = await db.collection('users')
      .where({ _openid: sellerOpenid }).limit(1).get();
    if (userRec.data.length) {
      const u = userRec.data[0];
      profile.nickname = u.nickname || profile.nickname;
      profile.avatar = u.avatar || '';
      profile.flowerReceived = u.flowerReceived || 0;
      profile.verified = u.verified || 'none';
    }
  } catch (e) { /* 忽略 */ }

  // 3. 查该卖家在售商品（仅 status='on'）
  const goodsList = [];
  try {
    const res = await db.collection('goods')
      .where({ _openid: sellerOpenid, status: 'on' })
      .orderBy('createdAt', 'desc')
      .limit(100)
      .field({
        _id: true, title: true, desc: true, price: true, category: true,
        cover: true, nickname: true, avatar: true, createdAt: true,
        viewCount: true, likeCount: true, subCategory: true, thirdCategory: true,
        priceType: true, tradeStatus: true, verified: true, contactType: true,
        flowerCount: true
      })
      .get();
    res.data.forEach(item => {
      item.priceType = item.priceType || (item.price === 0 ? 'free' : item.price === -1 ? 'bargain' : '');
      item.tradeStatus = item.tradeStatus || 'selling';
      item.flowerCount = item.flowerCount || 0;
      goodsList.push(item);
    });
  } catch (e) { /* 忽略 */ }

  return {
    ok: true,
    seller: profile,
    goods: goodsList,
    sellerId: sellerOpenid
  };
};
