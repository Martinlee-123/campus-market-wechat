// 云函数 updateStatus：下架/上架/删除（仅本人）
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const id = event.id;
  const status = event.status; // 'on' | 'off' | 'deleted'

  if (!id) return { ok: false, msg: '缺少id' };
  if (['on', 'off', 'deleted'].indexOf(status) === -1) {
    return { ok: false, msg: '状态无效' };
  }

  try {
    const doc = await db.collection('goods').doc(id).get();
    if (!doc.data || doc.data._openid !== openid) {
      return { ok: false, msg: '无权操作' };
    }
    await db.collection('goods').doc(id).update({
      data: { status, updatedAt: db.serverDate() }
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, msg: '操作失败' };
  }
};
