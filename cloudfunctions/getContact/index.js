// 云函数 getContact：点击复制时按需返回联系方式明文（详情接口已脱敏，不外泄）
// type: goods=商品(wants? 否) / want=求购 / reply=求购回应
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const type = event.type || 'goods';
  const id = (event.id || '').trim();
  if (!id) return { ok: false, msg: '缺少id' };

  try {
    if (type === 'goods') {
      const doc = await db.collection('goods').doc(id).get();
      const item = doc.data;
      if (!item || item.status === 'deleted') return { ok: false, msg: '内容不存在' };
      return { ok: true, contact: item.contact || '', contactType: item.contactType || '' };
    }
    if (type === 'want') {
      const doc = await db.collection('wants').doc(id).get();
      const item = doc.data;
      if (!item || item.status === 'deleted') return { ok: false, msg: '求购不存在' };
      return { ok: true, contact: item.contact || '', contactType: item.contactType || '' };
    }
    if (type === 'reply') {
      const doc = await db.collection('wantReplies').doc(id).get();
      const r = doc.data;
      if (!r) return { ok: false, msg: '回应不存在' };
      return { ok: true, contact: r.contact || '', contactType: r.contactType || '' };
    }
    return { ok: false, msg: '未知类型' };
  } catch (e) {
    return { ok: false, msg: '获取失败' };
  }
};