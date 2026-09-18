// 云函数 chat：站内私聊
// - conversation：取或创建与某人的会话
// - send：发送文字消息
// - history：拉取某会话历史（分页）
// - myConversations：我的会话列表（含未读数/最后消息）
// - unreadCount：总未读数（tabBar 红点）
// - markRead：标记会话已读
//
// 集合：
//   conversations: { users:[openidA,openidB](排序), lastMessage, lastTime,
//                    readBy:{ [openidA]:lastTime, [openidB]:lastTime },
//                    goodsId?, goodsTitle?, createdAt }
//   messages: { conversationId, from, to, content, type:'text', createdAt }
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const sec = require('./sec');

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const action = event.action || 'myConversations';

  try {
    switch (action) {
      case 'conversation': return await getConversation(event, openid);
      case 'send': return await sendMessage(event, openid);
      case 'history': return await getHistory(event, openid);
      case 'myConversations': return await myConversations(openid);
      case 'unreadCount': return await unreadCount(openid);
      case 'markRead': return await markRead(event, openid);
      case 'myId': return { ok: true, openid };
      default: return { ok: false, msg: '未知操作: ' + action };
    }
  } catch (e) {
    return { ok: false, msg: '操作失败: ' + e.message };
  }
};

// 生成会话标识 key：两个 openid 排序后拼接
function convKey(a, b) {
  return [a, b].sort().join('_');
}

// 取或创建与某人的会话（对方 openid 必填）
async function getConversation(event, openid) {
  const other = (event.other || '').trim();
  if (!other) return { ok: false, msg: '缺少对方id' };
  if (other === openid) return { ok: false, msg: '不能和自己聊天' };

  const key = convKey(openid, other);
  // 优先按 key 查（保证唯一）
  const exist = await db.collection('conversations').where({ key }).limit(1).get();
  if (exist.data.length) return { ok: true, conversationId: exist.data[0]._id };

  // 兼容老数据：按 users 含两者查
  const exist2 = await db.collection('conversations')
    .where({ users: { all: [openid, other] }, 'users.1': _.exists(true) })
    .limit(5).get();
  for (const c of exist2.data) {
    if (c.users && c.users.indexOf(openid) !== -1 && c.users.indexOf(other) !== -1) {
      return { ok: true, conversationId: c._id };
    }
  }

  // 新建会话
  const createdAt = db.serverDate();
  const doc = {
    key,
    users: [openid, other].sort(),
    lastMessage: '',
    lastTime: createdAt,
    readBy: { [openid]: createdAt, [other]: createdAt },
    createdAt
  };
  // 可选带商品上下文
  if (event.goodsId) {
    doc.goodsId = String(event.goodsId);
    doc.goodsTitle = (event.goodsTitle || '').slice(0, 60);
  }
  const add = await db.collection('conversations').add({ data: doc });
  return { ok: true, conversationId: add._id };
}

// 发送文字消息
async function sendMessage(event, openid) {
  const conversationId = (event.conversationId || '').trim();
  const content = (event.content || '').trim().slice(0, 500);
  if (!conversationId) return { ok: false, msg: '缺少会话id' };
  if (!content) return { ok: false, msg: '消息不能为空' };

  // ---- 内容安全检测（聊天消息，scene=4 社交日志） ----
  const textCheck = await sec.checkText(cloud, openid, content, { scene: 4 });
  if (!textCheck.ok) return { ok: false, msg: textCheck.msg };

  const conv = await db.collection('conversations').doc(conversationId).get().catch(() => null);
  if (!conv || !conv.data) return { ok: false, msg: '会话不存在' };
  const users = conv.data.users || [];
  if (users.indexOf(openid) === -1) return { ok: false, msg: '无权发送' };
  const other = users[0] === openid ? users[1] : users[0];

  const msg = {
    conversationId,
    from: openid,
    to: other,
    content,
    type: 'text',
    createdAt: db.serverDate()
  };
  const add = await db.collection('messages').add({ data: msg });

  // 更新会话：最后消息 + 时间；发送方已读，接收方未读
  await db.collection('conversations').doc(conversationId).update({
    data: {
      lastMessage: content,
      lastTime: db.serverDate(),
      // readBy：发送方记为最新，接收方不动（保持未读）
    }
  }).catch(() => {});

  return { ok: true, id: add._id, msg: '已发送' };
}

// 拉取会话历史（倒序，前端倒转展示）
async function getHistory(event, openid) {
  const conversationId = (event.conversationId || '').trim();
  const before = Number(event.before) || 0; // 时间戳，用于分页？简化：用 skip
  const page = Math.max(0, Number(event.page) || 0);
  const pageSize = Math.min(50, Math.max(1, Number(event.pageSize) || 20));

  const conv = await db.collection('conversations').doc(conversationId).get().catch(() => null);
  if (!conv || !conv.data) return { ok: false, msg: '会话不存在' };
  const users = conv.data.users || [];
  if (users.indexOf(openid) === -1) return { ok: false, msg: '无权查看' };

  const res = await db.collection('messages')
    .where({ conversationId })
    .orderBy('createdAt', 'desc')
    .skip(page * pageSize)
    .limit(pageSize)
    .get();

  const list = res.data.map(m => ({
    _id: m._id,
    from: m.from,
    to: m.to,
    content: m.content,
    type: m.type || 'text',
    timeText: formatTime(m.createdAt)
  }));
  // 正序返回便于直接渲染
  list.reverse();

  return { ok: true, data: list, hasMore: res.data.length === pageSize };
}

// 我的会话列表（按 lastTime 倒序），计算每个会话未读数
async function myConversations(openid) {
  const res = await db.collection('conversations')
    .where({ 'users.0': _.exists(true) })
    .limit(100)
    .get();

  // 过滤含我的会话
  const mine = res.data.filter(c => c.users && c.users.indexOf(openid) !== -1);

  // 拉对方昵称/头像
  const otherIds = mine.map(c => c.users[0] === openid ? c.users[1] : c.users[0]);
  const userMap = {};
  if (otherIds.length) {
    const u = await db.collection('users').where({ _openid: _.in(otherIds) }).field({ _openid: true, nickname: true, avatar: true }).get();
    u.data.forEach(x => userMap[x._openid] = x);
  }

  // 未读数：messages 中 to=me 且 created>readBy[me]
  const list = [];
  for (const c of mine) {
    const other = c.users[0] === openid ? c.users[1] : c.users[0];
    const readAt = (c.readBy && c.readBy[openid]) || 0;
    let rt = 0;
    if (readAt) { const t = readAt.$date ? readAt.$date : readAt; rt = new Date(t).getTime(); if (isNaN(rt)) rt = 0; }
    const unread = await countUnreadInConv(c._id, openid, rt > 0 ? new Date(rt) : 0);
    const otherUser = userMap[other] || {};
    list.push({
      conversationId: c._id,
      other,
      otherNickname: otherUser.nickname || '同学',
      otherAvatar: otherUser.avatar || '',
      lastMessage: c.lastMessage || '',
      lastTimeText: formatTime(c.lastTime),
      lastTime: c.lastTime ? (c.lastTime.$date || c.lastTime) : 0,
      unread,
      goodsTitle: c.goodsTitle || ''
    });
  }
  list.sort((a, b) => new Date(b.lastTime || 0) - new Date(a.lastTime || 0));
  return { ok: true, data: list };
}

// 单独统计某会话发给我的未读（createdAt > readBy[me]）
async function countUnreadInConv(conversationId, openid, readAt) {
  try {
    let whereC = { conversationId, to: openid };
    if (readAt) whereC.createdAt = _.gt(readAt);
    const cnt = await db.collection('messages').where(whereC).count();
    return cnt.total;
  } catch (e) { return 0; }
}

// 总未读数（tabBar 红点）：按 readBy 时间，统计发给我的新消息
async function unreadCount(openid) {
  const res = await db.collection('conversations')
    .where({ 'users.0': _.exists(true) })
    .limit(100)
    .get();
  const cnvs = res.data.filter(c => c.users && c.users.indexOf(openid) !== -1);
  if (!cnvs.length) return { ok: true, count: 0 };

  let count = 0;
  for (const c of cnvs) {
    const readAt = (c.readBy && c.readBy[openid]) || 0;
    let rt = 0;
    if (readAt) { const t = readAt.$date ? readAt.$date : readAt; rt = new Date(t).getTime(); if (isNaN(rt)) rt = 0; }
    count += await countUnreadInConv(c._id, openid, rt > 0 ? new Date(rt) : 0);
  }
  return { ok: true, count };
}

// 标记某会话已读
async function markRead(event, openid) {
  const conversationId = (event.conversationId || '').trim();
  if (!conversationId) return { ok: false, msg: '缺少会话id' };
  const conv = await db.collection('conversations').doc(conversationId).get().catch(() => null);
  if (!conv || !conv.data) return { ok: false, msg: '会话不存在' };
  const users = conv.data.users || [];
  if (users.indexOf(openid) === -1) return { ok: false, msg: '无权操作' };

  const readBy = conv.data.readBy || {};
  readBy[openid] = db.serverDate();
  await db.collection('conversations').doc(conversationId).update({ data: { readBy } });
  return { ok: true };
}

function formatTime(dateObj) {
  if (!dateObj) return '';
  let t;
  try { t = new Date(dateObj.$date ? dateObj.$date : dateObj).getTime(); } catch (e) { return ''; }
  if (isNaN(t)) return '';
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
