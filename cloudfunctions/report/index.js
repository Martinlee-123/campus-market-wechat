// 云函数 report：举报功能（帖子 goods / 求购 want）
// - 提交举报：单人单帖只能一次
// - 查询：某人对某帖是否已举报
// - 达到 5 个不同用户 → 自动标记该帖 autoHidden=true（列表不可见，保留现场给管理员）
//
// 集合 reports 字段：
//   _openid(举报人), targetType('goods'|'want'), targetId,
//   reason(举报原因), images([fileID]), status('pending'|'handled'),
//   handleResult('ignore'|'off'|'delete'), createdAt
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// 达到该人数自动隐藏
const AUTO_HIDE_THRESHOLD = 5;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const action = event.action || 'submit';

  try {
    switch (action) {
      case 'submit': return await submitReport(event, openid);
      case 'checkMine': return await checkMine(event, openid);
      default: return { ok: false, msg: '未知操作: ' + action };
    }
  } catch (e) {
    return { ok: false, msg: '操作失败: ' + e.message };
  }
};

// 校验 targetType/targetId 对应记录存在
async function ensureTarget(event) {
  const targetType = event.targetType === 'want' ? 'want' : 'goods';
  const targetId = (event.targetId || '').trim();
  if (!targetId) return { ok: false, msg: '缺少目标id' };
  const table = targetType === 'want' ? 'wants' : 'goods';
  let doc;
  try {
    const r = await db.collection(table).doc(targetId).get();
    doc = r.data;
  } catch (e) {
    return { ok: false, msg: '目标不存在' };
  }
  if (!doc || doc.status === 'deleted') return { ok: false, msg: '目标不可举报' };
  return { ok: true, targetType, targetId };
}

async function submitReport(event, openid) {
  // 登录校验
  const userCnt = await db.collection('users').where({ _openid: openid }).count();
  if (userCnt.total === 0) return { ok: false, msg: '请先登录后再举报' };

  const t = await ensureTarget(event);
  if (!t.ok) return t;

  const reason = (event.reason || '').trim().slice(0, 200);
  const images = Array.isArray(event.images) ? event.images.slice(0, 4) : [];

  // 不能举报自己的帖子
  const table = t.targetType === 'want' ? 'wants' : 'goods';
  const mine = await db.collection(table).doc(t.targetId).get().catch(() => null);
  if (mine && mine.data && mine.data._openid === openid) {
    return { ok: false, msg: '不能举报自己的内容' };
  }

  // 单人对同一目标只能举报一次
  const exist = await db.collection('reports')
    .where({ _openid: openid, targetType: t.targetType, targetId: t.targetId })
    .count();
  if (exist.total > 0) {
    return { ok: false, msg: '你已举报过这条内容' };
  }

  await db.collection('reports').add({
    data: {
      _openid: openid,
      targetType: t.targetType,
      targetId: t.targetId,
      reason,
      images,
      status: 'pending',
      handleResult: '',
      createdAt: db.serverDate()
    }
  });

  // 统计该目标的不同举报人数（去重 _openid）
  await maybeAutoHide(t.targetType, t.targetId);

  return { ok: true, msg: '举报已提交，管理员将尽快处理' };
}

// 统计不同举报人数，达到阈值则自动隐藏
async function maybeAutoHide(targetType, targetId) {
  const table = targetType === 'want' ? 'wants' : 'goods';
  // 拉取该目标所有举报，去重 openid
  const all = await db.collection('reports')
    .where({ targetType, targetId })
    .field({ _openid: true })
    .limit(1000)
    .get();
  const uniq = {};
  let count = 0;
  all.data.forEach(r => { if (r._openid && !uniq[r._openid]) { uniq[r._openid] = 1; count++; } });

  await db.collection(table).doc(targetId).update({
    data: {
      reportedCount: count,
      autoHidden: count >= AUTO_HIDE_THRESHOLD ? true : false,
      updatedAt: db.serverDate()
    }
  }).catch(() => {});
}

async function checkMine(event, openid) {
  const targetType = event.targetType === 'want' ? 'want' : 'goods';
  const targetId = (event.targetId || '').trim();
  if (!targetId) return { ok: false, reported: false };
  const exist = await db.collection('reports')
    .where({ _openid: openid, targetType, targetId })
    .count();
  return { ok: true, reported: exist.total > 0 };
}
