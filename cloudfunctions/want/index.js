// 云函数 want：求购板块（发布求购/列表/详情/回应/我的）
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const sec = require('./sec');

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const action = event.action || 'list';

  try {
    switch (action) {
      case 'list': return await listWants(event);
      case 'detail': return await detailWant(event, openid);
      case 'publish': return await publishWant(event, openid);
      case 'reply': return await replyWant(event, openid);
      case 'my': return await myWants(openid);
      case 'close': return await closeWant(event, openid);
      default: return { ok: false, msg: '未知操作: ' + action };
    }
  } catch (e) {
    return { ok: false, msg: '操作失败: ' + e.message };
  }
};

// 求购列表（默认求购中 open）
async function listWants(event) {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const page = Math.max(0, Number(event.page) || 0);
  const pageSize = Math.min(20, Math.max(1, Number(event.pageSize) || 10));
  const keyword = (event.keyword || '').trim();
  const category = event.category || '';

  const where = { status: 'open', autoHidden: _.neq(true) };

  // 拉黑过滤：排除我拉黑的人的求购
  const blockedIds = await getMyBlockedOpenids(openid);
  if (blockedIds.length) {
    where._openid = _.nin(blockedIds);
  }

  if (category) where.category = category;
  if (keyword) {
    where.title = db.RegExp({ regexp: keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), options: 'i' });
  }

  const res = await db.collection('wants')
    .where(where)
    .orderBy('createdAt', 'desc')
    .skip(page * pageSize)
    .limit(pageSize)
    .field({
      _id: true, title: true, desc: true, category: true, images: true, cover: true,
      nickname: true, viewCount: true, replyCount: true, createdAt: true, status: true,
      verified: true, contactType: true
    })
    .get();

  return { ok: true, data: res.data.map(d => ({ ...d, timeText: formatTime(d.createdAt) })) };
}

// 求购详情 + 回应列表
async function detailWant(event, openid) {
  const id = (event.id || '').trim();
  if (!id) return { ok: false, msg: '缺少id' };
  const doc = await db.collection('wants').doc(id).get();
  const item = doc.data;
  if (!item || item.status === 'deleted') return { ok: false, msg: '求购不存在' };
  // 被举报自动隐藏：非本人不可见
  if (item.autoHidden && item._openid !== openid) return { ok: false, msg: '该内容正在审核中，暂不可见' };

  // 拉黑拦截：求购者被我拉黑 → 非本人不可见
  if (item._openid !== openid && await isBlocked(openid, item._openid)) {
    return { ok: false, msg: '该内容不可见' };
  }

  // 浏览量+1
  db.collection('wants').doc(id).update({ data: { viewCount: _.inc(1) } }).catch(() => {});
  // 本人？
  const isMine = item._openid === openid;

  // 回应列表
  const replies = await db.collection('wantReplies')
    .where({ wantId: id })
    .orderBy('createdAt', 'asc')
    .limit(50)
    .get();
  // 拉黑过滤：我拉黑的人的回应也不可见
  let replyList = replies.data;
  if (!isMine) {
    replyList = replyList.filter(r => !(r._openid && r._openid === openid));
  }
  const blockedIds = replyList.length ? await getMyBlockedOpenids(openid) : [];
  if (blockedIds.length) {
    replyList = replyList.filter(r => !(r._openid && blockedIds.indexOf(r._openid) !== -1));
  }

  const data = {
    ...item,
    isMine,
    timeText: formatTime(item.createdAt),
    replies: replyList.map(r => ({ ...r, timeText: formatTime(r.createdAt) }))
  };
  // 联系方式脱敏：非本人不下发求购者/回应者明文（点击复制时经 getContact 按需获取）
  if (!isMine) {
    delete data.contact;
    data.replies.forEach(r => delete r.contact);
  }

  return { ok: true, data };
}

// 发布求购
async function publishWant(event, openid) {
  // 登录校验
  const userCnt = await db.collection('users').where({ _openid: openid }).count();
  if (userCnt.total === 0) return { ok: false, msg: '请先登录后再发布求购' };

  // ---- 内容安全检测 ----
  let myNickname = '';
  try {
    const u = await db.collection('users').where({ _openid: openid }).limit(1).get();
    if (u.data.length) myNickname = u.data[0].nickname || '';
  } catch (e) {}
  const textCheck = await sec.checkText(cloud, openid, title + '\n' + desc, {
    scene: 3, title, nickname: myNickname
  });
  if (!textCheck.ok) return { ok: false, msg: textCheck.msg };
  const contactCheck = await sec.checkText(cloud, openid, contact, { scene: 3, nickname: myNickname });
  if (!contactCheck.ok) return { ok: false, msg: contactCheck.msg };

  const title = (event.title || '').trim();
  const desc = (event.desc || '').trim();
  const category = event.category || '其他';
  const contact = (event.contact || '').trim();
  const contactType = event.contactType === 'QQ' ? 'QQ' : '微信';

  if (!title) return { ok: false, msg: '求购内容不能为空' };
  if (!desc) return { ok: false, msg: '请补充说明' };
  if (!contact) return { ok: false, msg: '请填写联系方式' };
  if (contactType !== '微信' && contactType !== 'QQ') return { ok: false, msg: '请选择联系方式类型' };

  // 限流：60秒1条
  const recent = await db.collection('wants')
    .where({ _openid: openid })
    .orderBy('createdAt', 'desc').limit(1).get();
  if (recent.data.length) {
    const last = recent.data[0].createdAt;
    const lastMs = last.$date ? new Date(last.$date).getTime() : new Date(last).getTime();
    if (!isNaN(lastMs) && (Date.now() - lastMs) / 1000 < 60) {
      return { ok: false, msg: '发布太频繁，请稍后再试' };
    }
  }

  let nickname = '同学', avatar = '', verified = 'none';
  try {
    const u = await db.collection('users').where({ _openid: openid }).limit(1).get();
    if (u.data.length) { nickname = u.data[0].nickname || nickname; avatar = u.data[0].avatar || ''; verified = u.data[0].verified || 'none'; }
  } catch (e) {}

  const doc = {
    _openid: openid,
    title, desc, category, contact, contactType,
    nickname, avatar, verified,
    status: 'open', // open=求购中 closed=已结束
    viewCount: 0, replyCount: 0,
    createdAt: db.serverDate(), updatedAt: db.serverDate()
  };
  const add = await db.collection('wants').add({ data: doc });
  return { ok: true, id: add._id };
}

// 回应某求购（提供者留说明+联系方式）
async function replyWant(event, openid) {
  const wantId = (event.wantId || '').trim();
  if (!wantId) return { ok: false, msg: '缺少求购id' };
  const desc = (event.desc || '').trim();
  const contact = (event.contact || '').trim();
  const contactType = event.contactType === 'QQ' ? 'QQ' : '微信';
  if (!desc) return { ok: false, msg: '请填写提供内容说明' };
  if (!contact) return { ok: false, msg: '请填写联系方式' };
  if (contactType !== '微信' && contactType !== 'QQ') return { ok: false, msg: '请选择联系方式类型' };

  // 求购必须存在且是 open
  const want = await db.collection('wants').doc(wantId).get().catch(() => null);
  if (!want || !want.data || want.data.status !== 'open') {
    return { ok: false, msg: '求购不存在或已结束' };
  }

  // ---- 内容安全检测（回应内容） ----
  const textCheck = await sec.checkText(cloud, openid, desc, { scene: 2 });
  if (!textCheck.ok) return { ok: false, msg: textCheck.msg };
  const contactCheck = await sec.checkText(cloud, openid, contact, { scene: 2 });
  if (!contactCheck.ok) return { ok: false, msg: contactCheck.msg };

  let nickname = '同学', verified = 'none';
  try {
    const u = await db.collection('users').where({ _openid: openid }).limit(1).get();
    if (u.data.length) nickname = u.data[0].nickname || nickname;
    if (u.data.length) verified = u.data[0].verified || 'none';
  } catch (e) {}

  await db.collection('wantReplies').add({
    data: {
      wantId, _openid: openid,
      desc, contact, contactType, nickname, verified,
      createdAt: db.serverDate()
    }
  });
  // 回应数+1
  db.collection('wants').doc(wantId).update({ data: { replyCount: _.inc(1) } }).catch(() => {});
  return { ok: true, msg: '已回应求购者，对方可查看' };
}

// 我的求购
async function myWants(openid) {
  const res = await db.collection('wants')
    .where({ _openid: openid })
    .orderBy('createdAt', 'desc')
    .limit(100)
    .get();
  return { ok: true, data: res.data.map(d => ({ ...d, timeText: formatTime(d.createdAt) })) };
}

// 结束/重开求购（本人）
async function closeWant(event, openid) {
  const id = (event.id || '').trim();
  const status = event.status; // 'closed' | 'open'
  if (!id || ['closed', 'open'].indexOf(status) === -1) return { ok: false, msg: '参数错误' };
  const doc = await db.collection('wants').doc(id).get();
  if (!doc.data || doc.data._openid !== openid) return { ok: false, msg: '无权操作' };
  await db.collection('wants').doc(id).update({ data: { status, updatedAt: db.serverDate() } });
  return { ok: true, msg: status === 'closed' ? '已结束求购' : '已重新开启' };
}

// 获取我拉黑的用户 openid 列表
async function getMyBlockedOpenids(openid) {
  try {
    const res = await db.collection('blacklist')
      .where({ _openid: openid })
      .field({ targetOpenid: true })
      .limit(100)
      .get();
    return res.data.map(x => x.targetOpenid).filter(Boolean);
  } catch (e) {
    return [];
  }
}

// 我是否已拉黑某用户
async function isBlocked(openid, targetOpenid) {
  if (!targetOpenid) return false;
  try {
    const cnt = await db.collection('blacklist')
      .where({ _openid: openid, targetOpenid })
      .count();
    return cnt.total > 0;
  } catch (e) {
    return false;
  }
}

function formatTime(dateObj) {
  if (!dateObj) return '';
  let t;
  try { t = new Date(dateObj.$date ? dateObj.$date : dateObj).getTime(); } catch (e) { return ''; }
  if (isNaN(t)) return '';
  // 折算成北京时间（UTC+8），不依赖云函数运行环境时区
  const bj = new Date(t + 8 * 3600 * 1000);
  const nowBj = new Date(Date.now() + 8 * 3600 * 1000);
  const pad = n => (n < 10 ? '0' + n : '' + n);
  const sameDay =
    bj.getUTCFullYear() === nowBj.getUTCFullYear() &&
    bj.getUTCMonth() === nowBj.getUTCMonth() &&
    bj.getUTCDate() === nowBj.getUTCDate();
  const hm = pad(bj.getUTCHours()) + ':' + pad(bj.getUTCMinutes());
  if (sameDay) return '今天 ' + hm;
  const md = pad(bj.getUTCMonth() + 1) + '-' + pad(bj.getUTCDate());
  if (bj.getUTCFullYear() === nowBj.getUTCFullYear()) return md + ' ' + hm;
  return bj.getUTCFullYear() + '-' + md;
}
