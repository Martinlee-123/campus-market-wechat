// 云函数 getFavorites：我的收藏列表
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  try {
    const favRes = await db.collection('favorites')
      .where({ _openid: openid })
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    const ids = favRes.data.map(f => f.goodsId);
    if (ids.length === 0) return { ok: true, data: [] };

    const goods = db.collection('goods');
    const fetched = [];
    // 逐条查（云开发单条最多20个 in，这里拆批）
    const _ = db.command;
    for (let i = 0; i < ids.length; i += 20) {
      const batch = ids.slice(i, i + 20);
      const res = await goods.where({ _id: _.in(batch), status: _.neq('deleted') })
        .field({
          _id: true, title: true, desc: true, price: true, category: true,
          cover: true, status: true, createdAt: true, subCategory: true, thirdCategory: true,
          priceType: true, tradeStatus: true, flowerCount: true, _openid: true
        }).get();
      fetched.push(...res.data);
    }

    // 拉黑过滤：去除我拉黑的人发布的商品
    try {
      const blk = await db.collection('blacklist')
        .where({ _openid: openid }).field({ targetOpenid: true }).limit(100).get();
      const blockedIds = blk.data.map(x => x.targetOpenid).filter(Boolean);
      if (blockedIds.length) {
        for (let i = fetched.length - 1; i >= 0; i--) {
          if (fetched[i]._openid && blockedIds.indexOf(fetched[i]._openid) !== -1) {
            fetched.splice(i, 1);
          }
        }
      }
    } catch (e) { /* 忽略 */ }

    // 按收藏时间倒序整理
    const order = {};
    ids.forEach((id, idx) => order[id] = idx);
    fetched.sort((a, b) => (order[a._id] || 0) - (order[b._id] || 0));

    // 输出前做归一化，兼容老数据无 priceType/tradeStatus
    fetched.forEach(item => {
      item.priceType = item.priceType || (item.price === 0 ? 'free' : item.price === -1 ? 'bargain' : '');
      item.tradeStatus = item.tradeStatus || 'selling';
      item.flowerCount = item.flowerCount || 0;
    });

    return { ok: true, data: fetched };
  } catch (e) {
    return { ok: false, msg: e.message, data: [] };
  }
};
