// 云函数 getMyFlowers：获取当前用户收到的小花总数（users.flowerReceived）
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  try {
    const res = await db.collection('users')
      .where({ _openid: openid })
      .limit(1)
      .field({ flowerReceived: true })
      .get();
    const count = (res.data.length && res.data[0].flowerReceived) || 0;
    return { ok: true, flowerReceived: count };
  } catch (e) {
    return { ok: false, msg: e.message, flowerReceived: 0 };
  }
};
