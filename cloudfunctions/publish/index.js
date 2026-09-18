// 云函数 publish：发布商品
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const sec = require('./sec');

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  // 登录校验：users 集合里有记录才算已登录，游客不可发布
  try {
    const userCnt = await db.collection('users').where({ _openid: openid }).count();
    if (userCnt.total === 0) {
      return { ok: false, msg: '请先登录后再发布' };
    }
  } catch (e) {
    return { ok: false, msg: '登录校验失败' };
  }

  // 防刷屏限制①：同一用户在架商品数量上限
  const MAX_ON_SHELF = 20;
  try {
    const onCnt = await db.collection('goods')
      .where({ _openid: openid, status: 'on' }).count();
    if (onCnt.total >= MAX_ON_SHELF) {
      return { ok: false, msg: '在架商品已达上限（' + MAX_ON_SHELF + ' 条），请先下架部分商品' };
    }
  } catch (e) { /* 忽略 */ }

  // 防刷屏限制②：发布频率限流（60 秒内只能发 1 条）
  const MIN_INTERVAL_SEC = 60;
  try {
    const rateRes = await db.collection('goods')
      .where({ _openid: openid })
      .orderBy('createdAt', 'desc')
      .limit(1)
      .field({ createdAt: true })
      .get();
    if (rateRes.data.length && rateRes.data[0].createdAt) {
      const last = rateRes.data[0].createdAt;
      const lastMs = last.$date ? new Date(last.$date).getTime() : new Date(last).getTime();
      if (!isNaN(lastMs)) {
        const elapsed = (Date.now() - lastMs) / 1000;
        if (elapsed < MIN_INTERVAL_SEC) {
          return { ok: false, msg: '发布太频繁，请 ' + Math.ceil(MIN_INTERVAL_SEC - elapsed) + ' 秒后再试' };
        }
      }
    }
  } catch (e) { /* 忽略 */ }

  const title = (event.title || '').trim();
  const desc = (event.desc || '').trim();
  const price = Number(event.price);
  // priceType: free=免费 bargain=可议价 custom/空=普通数字
  const priceType = event.priceType || '';
  const category = event.category || '其他';
  const subCategory = (event.subCategory || '').trim();
  const thirdCategory = (event.thirdCategory || '').trim();
  const images = Array.isArray(event.images) ? event.images.slice(0, 3) : [];
  const contact = (event.contact || '').trim();
  // 联系方式类型（必选）：微信 / QQ
  const contactType = event.contactType === 'QQ' ? 'QQ' : '微信';
  // 标签：最多 5 个，去重去空，每个 ≤20 字符（用于标签搜索）
  const tags = buildTags(event.tags);
  if (!title) return { ok: false, msg: '标题不能为空' };
  if (!desc) return { ok: false, msg: '描述不能为空' };
  // 价格归一化：free=0  bargain=-1(特殊值)  数字保持原样
  let finalPrice = price;
  if (priceType === 'free') finalPrice = 0;
  else if (priceType === 'bargain') finalPrice = -1;
  if (isNaN(finalPrice) || finalPrice < -1) return { ok: false, msg: '价格无效' };
  if (!contact) return { ok: false, msg: '联系方式不能为空' };
  if (contactType !== '微信' && contactType !== 'QQ') return { ok: false, msg: '请选择联系方式类型' };

  // ---- 内容安全检测（先查登录用户昵称，用于检测上下文） ----
  let myNickname = '';
  try {
    const u = await db.collection('users').where({ _openid: openid }).limit(1).get();
    if (u.data.length) myNickname = u.data[0].nickname || '';
  } catch (e) {}
  // 文本检测：标题+描述连一起，命中违规直接拦截（scene=3 论坛内容）
  const textCheck = await sec.checkText(cloud, openid, title + '\n' + desc + '\n' + tags.join(' '), {
    scene: 3, title, nickname: myNickname
  });
  if (!textCheck.ok) return { ok: false, msg: textCheck.msg };
  // 联系方式（微信号/QQ号等）也过一遍检测，防留联系方式时夹带违规内容
  const contactCheck = await sec.checkText(cloud, openid, contact, { scene: 3, nickname: myNickname });
  if (!contactCheck.ok) return { ok: false, msg: contactCheck.msg };

  // 查询发布者昵称头像（来自 users 集合）
  let nickname = '同学';
  let avatar = '';
  let verified = 'none';
  try {
    const userRec = await db.collection('users')
      .where({ _openid: openid }).limit(1).get();
    if (userRec.data.length) {
      nickname = userRec.data[0].nickname || nickname;
      avatar = userRec.data[0].avatar || '';
      verified = userRec.data[0].verified || 'none';
    }
  } catch (e) { /* 忽略 */ }

  const doc = {
    _openid: openid,
    title,
    desc,
    tags,
    price: finalPrice,
    priceType: priceType === 'custom' ? '' : priceType,
    category,
    subCategory: category === '学习资料' ? subCategory : '',
    thirdCategory: category === '学习资料' ? thirdCategory : '',
    images,
    cover: images.length ? images[0] : '',
    contact,
    contactType,
    nickname,
    avatar,
    verified,
    status: 'on', // on=上架 off=下架 deleted=删除
    tradeStatus: 'selling', // selling=在售 sold=已出 pending=进行中
    viewCount: 0,
    likeCount: 0,
    createdAt: db.serverDate(),
    updatedAt: db.serverDate()
  };

  try {
    const addRes = await db.collection('goods').add({ data: doc });
    // ---- 图片异步检测（不阻塞发布，结果30分钟内推送；违规由后台处理下架） ----
    sec.checkImagesAsync(cloud, openid, images, { scene: 3, target: 'goods', targetId: addRes._id })
      .catch(() => {});
    return { ok: true, id: addRes._id };
  } catch (e) {
    return { ok: false, msg: '写入失败：' + e.message };
  }
};

// 解析并归一化标签：入参可为字符串或数组，按空格/逗号拆分，去重去空，最多 5 个
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
