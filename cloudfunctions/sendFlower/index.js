// 云函数 sendFlower：给帖主送一朵小花（好评机制）
//  规则1：同一用户对同一篇帖子只能送一朵
//  规则2：同一用户 30 分钟内只能给一个用户送花（跨帖子也限制）
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const RATE_LIMIT_MS = 30 * 60 * 1000; // 30分钟
const COLL_FLOWERS = 'flowerLogs';

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const goodsId = (event.goodsId || '').trim();
  if (!goodsId) return { ok: false, msg: '缺少商品ID' };

  const flowers = db.collection(COLL_FLOWERS);
  const goods = db.collection('goods');

  // 被送花的帖子必须存在且为在架商品
  let seller;
  try {
    const doc = await goods.doc(goodsId).get();
    seller = doc.data;
    if (!seller || seller.status !== 'on') {
      return { ok: false, msg: '该内容不存在或已下架' };
    }
  } catch (e) {
    return { ok: false, msg: '该内容不存在或已下架' };
  }

  // 自己不能给自己送花（与前端 detail.js 拦截保持一致）
  if (seller._openid === openid) {
    return { ok: false, msg: '不能给自己送花哦' };
  }

  // 规则1：同一用户对同一篇帖子只能送一朵
  try {
    const dup = await flowers.where({ _openid: openid, goodsId }).count();
    if (dup.total > 0) {
      return { ok: false, msg: '这朵花已经送过啦' };
    }
  } catch (e) {
    return { ok: false, msg: '校验失败，请重试' };
  }

  // 规则2：同一用户 30 分钟内只能给一个用户送花
  try {
    const since = new Date(Date.now() - RATE_LIMIT_MS);
    const recent = await flowers
      .where({ _openid: openid, createdAt: _.gte(since) })
      .limit(1)
      .get();
    if (recent.data.length > 0) {
      return { ok: false, msg: '30分钟内只能给一位用户送花哦' };
    }
  } catch (e) {
    return { ok: false, msg: '校验失败，请重试' };
  }

  // 写入送花记录
  try {
    await flowers.add({
      data: {
        _openid: openid,
        goodsId,
        sellerOpenid: seller._openid,
        createdAt: db.serverDate()
      }
    });
  } catch (e) {
    return { ok: false, msg: '送出失败，请重试' };
  }

  // 累计：帖子花朵数 +1
  try {
    await goods.doc(goodsId).update({ data: { flowerCount: _.inc(1) } }).catch(() => {});
  } catch (e) { /* 忽略 */ }

  // 累计：卖家收到总花数 +1（写 users 集合）
  try {
    await db.collection('users')
      .where({ _openid: seller._openid })
      .update({ data: { flowerReceived: _.inc(1) } })
      .catch(() => {});
  } catch (e) { /* 忽略 */ }

  return { ok: true, msg: '送花成功 🌸' };
};
