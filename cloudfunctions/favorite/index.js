// 云函数 favorite：收藏/取消收藏
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  // 批量取消收藏（收藏页批量清理用）
  if (event.action === 'batchUnfav') {
    const ids = Array.isArray(event.ids) ? event.ids.filter(x => x) : [];
    if (!ids.length) return { ok: false, msg: '缺少id' };

    const favs = db.collection('favorites');
    const goods = db.collection('goods');

    try {
      // 逐批删除收藏记录（in 上限 20）
      for (let i = 0; i < ids.length; i += 20) {
        const batch = ids.slice(i, i + 20);
        const res = await favs.where({ _openid: openid, goodsId: _.in(batch) }).get();
        for (const r of res.data) {
          await favs.doc(r._id).remove();
        }
        // 对应商品点赞数 -1（失败忽略）
        for (const id of batch) {
          await goods.doc(id).update({ data: { likeCount: _.inc(-1) } }).catch(() => {});
        }
      }
      return { ok: true, removed: ids.length };
    } catch (e) {
      return { ok: false, msg: e.message };
    }
  }

  const id = event.id;       // 商品id
  const liked = !!event.liked; // 目标状态：true=收藏 false=取消

  if (!id) return { ok: false, msg: '缺少id' };

  const favs = db.collection('favorites');
  const goods = db.collection('goods');

  try {
    if (liked) {
      // 已存在则不重复
      const exist = await favs.where({ _openid: openid, goodsId: id }).count();
      if (exist.total === 0) {
        await favs.add({
          data: { _openid: openid, goodsId: id, createdAt: db.serverDate() }
        });
        await goods.doc(id).update({ data: { likeCount: _.inc(1) } }).catch(() => {});
      }
    } else {
      const exist = await favs.where({ _openid: openid, goodsId: id }).get();
      if (exist.data.length) {
        await favs.doc(exist.data[0]._id).remove();
        await goods.doc(id).update({ data: { likeCount: _.inc(-1) } }).catch(() => {});
      }
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, msg: e.message };
  }
};
