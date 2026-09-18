// 云函数 updatePost：编辑自己的商品（部分更新 - 只更新传入的字段）
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  const id = (event.id || '').trim();
  if (!id) return { ok: false, msg: '缺少商品ID' };

  // 校验所有权
  let exist;
  try {
    exist = await db.collection('goods').doc(id).get();
  } catch (e) {
    return { ok: false, msg: '商品不存在' };
  }
  if (!exist.data || exist.data._openid !== openid) {
    return { ok: false, msg: '只能编辑自己发布的商品' };
  }

  // ---- 部分更新：仅处理传入的字段，统一做格式校验 ----
  const upd = {};
  let hasField = false;

  // 标题
  if (event.title !== undefined) {
    const title = (event.title || '').trim();
    if (!title) return { ok: false, msg: '标题不能为空' };
    upd.title = title;
    hasField = true;
  }

  // 描述
  if (event.desc !== undefined) {
    const desc = (event.desc || '').trim();
    if (!desc) return { ok: false, msg: '描述不能为空' };
    upd.desc = desc;
    hasField = true;
  }

  // 标签
  if (event.tags !== undefined) {
    upd.tags = buildTags(event.tags);
    hasField = true;
  }

  // 价格 + 价格类型（一起处理，避免类型与数值不一致）
  if (event.price !== undefined || event.priceType !== undefined) {
    const inPrice = Number(event.price);
    const inPriceType = event.priceType || '';
    let finalPrice = inPrice;
    if (inPriceType === 'free') finalPrice = 0;
    else if (inPriceType === 'bargain') finalPrice = -1;
    if (isNaN(finalPrice) || finalPrice < -1) return { ok: false, msg: '价格无效' };
    upd.price = finalPrice;
    upd.priceType = inPriceType === 'custom' ? '' : inPriceType;
    hasField = true;
  }

  // 分类
  if (event.category !== undefined) {
    upd.category = event.category || '其他';
    hasField = true;
  }

  // 二级分类
  if (event.subCategory !== undefined) {
    upd.subCategory = (event.subCategory || '').trim();
    hasField = true;
  }

  // 三级分类（学科）
  if (event.thirdCategory !== undefined) {
    upd.thirdCategory = (event.thirdCategory || '').trim();
    hasField = true;
  }

  // 联系方式类型
  if (event.contactType !== undefined) {
    const ct = event.contactType === 'QQ' ? 'QQ' : '微信';
    if (ct !== '微信' && ct !== 'QQ') return { ok: false, msg: '请选择联系方式类型' };
    upd.contactType = ct;
    hasField = true;
  }

  // 联系方式
  if (event.contact !== undefined) {
    const contact = (event.contact || '').trim();
    if (!contact) return { ok: false, msg: '联系方式不能为空' };
    upd.contact = contact;
    hasField = true;
  }

  // 交易状态
  if (event.tradeStatus !== undefined) {
    const ts = event.tradeStatus;
    if (['selling', 'sold', 'pending'].indexOf(ts) === -1) {
      return { ok: false, msg: '交易状态无效' };
    }
    upd.tradeStatus = ts;
    hasField = true;
  }

  if (!hasField) return { ok: false, msg: '没有可更新的内容' };

  upd.updatedAt = db.serverDate();
  await db.collection('goods').doc(id).update({ data: upd });
  return { ok: true };
};

// 解析并归一化标签（与 publish 一致）：入参可为字符串或数组，空格/逗号拆分，去重去空，最多 5 个
function buildTags(input) {
  if (!input) return [];
  const list = Array.isArray(input) ? input : [input];
  const seen = new Set();
  const out = [];
  for (const item of list) {
    for (const raw of String(item).split(/[，,\s]+/)) {
      const t = raw.trim().slice(0, 20);
      if (t && !seen.has(t)) {
        seen.add(t);
        out.push(t);
      }
      if (out.length >= 5) return out;
    }
  }
  return out;
}
