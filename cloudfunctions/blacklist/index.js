// 云函数 blacklist：用户拉黑 / 取消拉黑 / 黑名单列表
// 集合 blacklist：{ _openid(操作者), targetOpenid(被拉黑者), createdAt }
// 拉黑后：对方的商品/求购/主页/收藏在你的可见范围内全部隐藏（列表接口过滤 + 详情拦截）
//
// action:
//   add    { targetOpenid }   拉黑
//   remove { targetOpenid }   取消拉黑
//   list                     我的黑名单（含对方昵称/头像/认证标）
//   check  { targetOpenid }   是否已拉黑某人
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const action = event.action || 'list';

  try {
    switch (action) {
      case 'add': return await add(event, openid);
      case 'remove': return await remove(event, openid);
      case 'list': return await list(openid);
      case 'check': return await check(event, openid);
      default: return { ok: false, msg: '未知操作: ' + action };
    }
  } catch (e) {
    return { ok: false, msg: '操作失败: ' + e.message };
  }
};

// 拉黑某人
async function add(event, openid) {
  const targetOpenid = (event.targetOpenid || '').trim();
  if (!targetOpenid) return { ok: false, msg: '缺少目标用户' };
  if (targetOpenid === openid) return { ok: false, msg: '不能拉黑自己' };

  // 已拉黑则幂等返回
  const exist = await db.collection('blacklist')
    .where({ _openid: openid, targetOpenid }).count();
  if (exist.total > 0) return { ok: true, msg: '该用户已在你的黑名单' };

  await db.collection('blacklist').add({
    data: { _openid: openid, targetOpenid, createdAt: db.serverDate() }
  });
  return { ok: true, msg: '已拉黑，对方的内容将不再显示' };
}

// 取消拉黑
async function remove(event, openid) {
  const targetOpenid = (event.targetOpenid || '').trim();
  if (!targetOpenid) return { ok: false, msg: '缺少目标用户' };
  const exist = await db.collection('blacklist')
    .where({ _openid: openid, targetOpenid }).get();
  if (exist.data.length) {
    await db.collection('blacklist').doc(exist.data[0]._id).remove();
  }
  return { ok: true, msg: '已取消拉黑' };
}

// 我的黑名单列表（带对方资料）
async function list(openid) {
  const res = await db.collection('blacklist')
    .where({ _openid: openid })
    .orderBy('createdAt', 'desc')
    .limit(100)
    .get();
  const targets = res.data.map(x => x.targetOpenid);
  if (!targets.length) return { ok: true, data: [] };

  // 查被拉黑者的昵称/头像
  const userMap = {};
  try {
    const users = await db.collection('users')
      .where({ _openid: _.in(targets) })
      .field({ _openid: true, nickname: true, avatar: true, verified: true })
      .get();
    users.data.forEach(u => { userMap[u._openid] = u; });
  } catch (e) { /* 忽略 */ }

  const data = res.data.map(x => {
    const u = userMap[x.targetOpenid] || {};
    return {
      targetOpenid: x.targetOpenid,
      nickname: u.nickname || '同学',
      avatar: u.avatar || '',
      verified: u.verified || 'none',
      timeText: formatTime(x.createdAt)
    };
  });
  return { ok: true, data };
}

// 是否已拉黑某人
async function check(event, openid) {
  const targetOpenid = (event.targetOpenid || '').trim();
  if (!targetOpenid) return { ok: true, blocked: false };
  const exist = await db.collection('blacklist')
    .where({ _openid: openid, targetOpenid }).count();
  return { ok: true, blocked: exist.total > 0 };
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