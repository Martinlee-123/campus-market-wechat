// 云函数 admin：管理员后台操作（删帖/下架/列表/统计）
// 权限：校验调用者 openid ∈ 管理员白名单，或 users.role === 'admin'
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// ⚠️ 管理员白名单（openid）。在此填写你的 openid 即可拥有管理权限。
// 也可以在 users 集合里把某条记录的 role 字段设为 'admin'（两者满足其一即可）。
const ADMIN_OPENIDS = [
  'your-admin-openid',
];

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  if (!(await isAdmin(openid))) {
    return { ok: false, msg: '无管理权限' };
  }

  const action = event.action || 'list';

  try {
    switch (action) {
      case 'list': return await listPosts(event);
      case 'delete': return await deletePost(event);
      case 'off': return await offPost(event);
      case 'recover': return await recoverPost(event);
      case 'stats': return await getStats();
      case 'authList': return await authList(event);
      case 'authApprove': return await authApprove(event);
      case 'reportList': return await reportList(event);
      case 'reportHandle': return await reportHandle(event);
      case 'reportStats': return await reportStats();
      case 'me': return { ok: true, isAdmin: true };
      default: return { ok: false, msg: '未知操作: ' + action };
    }
  } catch (e) {
    return { ok: false, msg: '操作失败: ' + e.message };
  }
};

// 是否管理员
async function isAdmin(openid) {
  if (ADMIN_OPENIDS.indexOf(openid) !== -1) return true;
  try {
    const rec = await db.collection('users')
      .where({ _openid: openid, role: 'admin' }).count();
    return rec.total > 0;
  } catch (e) {
    return false;
  }
}

// 分页拉取帖子（含下架/已删），支持搜索
async function listPosts(event) {
  const page = Math.max(0, Number(event.page) || 0);
  const pageSize = Math.min(30, Math.max(1, Number(event.pageSize) || 20));
  const keyword = (event.keyword || '').trim();
  const category = event.category || '';
  const status = event.status || ''; // ''=全部 on/off/deleted

  const where = {};
  if (category) where.category = category;
  if (status) where.status = status;
  if (keyword) {
    where.title = db.RegExp({ regexp: keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), options: 'i' });
  }

  const res = await db.collection('goods')
    .where(where)
    .orderBy('createdAt', 'desc')
    .skip(page * pageSize)
    .limit(pageSize)
    .field({
      _id: true, title: true, desc: true, price: true, category: true,
      cover: true, nickname: true, createdAt: true, status: true,
      viewCount: true, likeCount: true, tradeStatus: true, priceType: true,
      _openid: true, contact: true
    })
    .get();

  res.data.forEach(item => {
    item.priceType = item.priceType || (item.price === 0 ? 'free' : item.price === -1 ? 'bargain' : '');
    item.tradeStatus = item.tradeStatus || 'selling';
  });

  return { ok: true, data: res.data };
}

// 删除任意帖（标记 deleted，可恢复）
async function deletePost(event) {
  const id = (event.id || '').trim();
  if (!id) return { ok: false, msg: '缺少id' };
  await db.collection('goods').doc(id).update({
    data: { status: 'deleted', updatedAt: db.serverDate() }
  });
  return { ok: true, msg: '已删除' };
}

// 强制下架
async function offPost(event) {
  const id = (event.id || '').trim();
  if (!id) return { ok: false, msg: '缺少id' };
  await db.collection('goods').doc(id).update({
    data: { status: 'off', updatedAt: db.serverDate() }
  });
  return { ok: true, msg: '已下架' };
}

// 恢复上架
async function recoverPost(event) {
  const id = (event.id || '').trim();
  if (!id) return { ok: false, msg: '缺少id' };
  await db.collection('goods').doc(id).update({
    data: { status: 'on', updatedAt: db.serverDate() }
  });
  return { ok: true, msg: '已恢复上架' };
}

// 简单统计
async function getStats() {
  const total = await db.collection('goods').count();
  const on = await db.collection('goods').where({ status: 'on' }).count();
  const off = await db.collection('goods').where({ status: 'off' }).count();
  const deleted = await db.collection('goods').where({ status: 'deleted' }).count();
  const users = await db.collection('users').count();
  const favs = await db.collection('favorites').count();
  const approved = await db.collection('users').where({ verified: 'approved' }).count();
  const pending = await db.collection('users').where({ verified: 'pending' }).count();
  return {
    ok: true,
    data: {
      total: total.total,
      on: on.total,
      off: off.total,
      deleted: deleted.total,
      users: users.total,
      favorites: favs.total,
      approved, pending
    }
  };
}

// 认证管理列表（含完整学号，仅管理员可见）
async function authList(event) {
  const page = Math.max(0, Number(event.page) || 0);
  const pageSize = Math.min(30, Math.max(1, Number(event.pageSize) || 20));
  const status = event.status || ''; // ''=全部 none/pending/approved/rejected
  const where = {};
  if (status) where.verified = status;
  const res = await db.collection('users')
    .where(where)
    .orderBy('updatedAt', 'desc')
    .skip(page * pageSize)
    .limit(pageSize)
    .get();
  return { ok: true, data: res.data.map(u => ({
    _id: u._id,
    _openid: u._openid,
    nickname: u.nickname,
    avatar: u.avatar,
    verified: u.verified || 'none',
    // 完整学号（仅管理员可见）
    studentId: (u.verifyInfo && u.verifyInfo.studentId) || '',
    submittedAt: (u.verifyInfo && u.verifyInfo.submittedAt) || u.updatedAt
  })) };
}

// 手动通过/拒绝（兜底，自动审核一般用不到）
async function authApprove(event) {
  const id = (event.id || '').trim();
  const status = event.status; // 'approved' | 'rejected' | 'none'
  if (!id || ['approved', 'rejected', 'none'].indexOf(status) === -1) {
    return { ok: false, msg: '参数错误' };
  }
  await db.collection('users').doc(id).update({
    data: { verified: status, updatedAt: db.serverDate() }
  });
  return { ok: true, msg: '已更新认证状态' };
}


// ---------- 举报管理 ----------

// 举报列表（含目标帖子/求购信息），支持按状态/类型筛选
async function reportList(event) {
  const page = Math.max(0, Number(event.page) || 0);
  const pageSize = Math.min(30, Math.max(1, Number(event.pageSize) || 20));
  const status = event.status || '';        // ''=全部 pending=待处理 handled=已处理
  const targetType = event.targetType || ''; // ''=全部 goods=帖子 want=求购

  const where = {};
  if (status) where.status = status;
  if (targetType) where.targetType = targetType;

  const res = await db.collection('reports')
    .where(where)
    .orderBy('createdAt', 'desc')
    .skip(page * pageSize)
    .limit(pageSize)
    .get();

  // 补充目标信息（帖子标题/图/卖家）
  const goodsIds = [], wantIds = [];
  res.data.forEach(r => {
    if (r.targetType === 'want') wantIds.push(r.targetId);
    else goodsIds.push(r.targetId);
  });
  const goodsMap = {}, wantMap = {};
  if (goodsIds.length) {
    // 分批拉取（单条 in 上限 20）
    for (let i = 0; i < goodsIds.length; i += 20) {
      const g = await db.collection('goods')
        .where({ _id: _.in(goodsIds.slice(i, i + 20)) })
        .field({ title: true, cover: true, status: true, nickname: true, category: true })
        .get();
      g.data.forEach(d => goodsMap[d._id] = d);
    }
  }
  if (wantIds.length) {
    for (let i = 0; i < wantIds.length; i += 20) {
      const w = await db.collection('wants')
        .where({ _id: _.in(wantIds.slice(i, i + 20)) })
        .field({ title: true, status: true, nickname: true, category: true })
        .get();
      w.data.forEach(d => wantMap[d._id] = d);
    }
  }

  const data = res.data.map(r => {
    const target = r.targetType === 'want' ? wantMap[r.targetId] : goodsMap[r.targetId];
    return {
      ...r,
      targetTitle: target ? target.title : '(已删除)',
      targetCover: target ? (target.cover || '') : '',
      targetStatus: target ? target.status : 'deleted',
      targetNickname: target ? (target.nickname || '') : '',
      targetCategory: target ? (target.category || '') : '',
      // 时间字段转字符串避免序列化问题交给前端
      createdAtText: formatTime(r.createdAt)
    };
  });

  return { ok: true, data };
}

// 处理举报：ignore=忽略(取消隐藏/标记处理) off=下架 delete=删除 均标记 handled
async function reportHandle(event) {
  const id = (event.id || '').trim();
  const result = event.result; // 'ignore' | 'off' | 'delete'
  if (!id || ['ignore', 'off', 'delete'].indexOf(result) === -1) {
    return { ok: false, msg: '参数错误' };
  }

  const rec = await db.collection('reports').doc(id).get().catch(() => null);
  if (!rec || !rec.data) return { ok: false, msg: '举报记录不存在' };
  const r = rec.data;

  // 更新举报状态
  await db.collection('reports').doc(id).update({
    data: { status: 'handled', handleResult: result, handledAt: db.serverDate() }
  });

  // 根据处理结果作用于目标帖
  if (r.targetType === 'want') {
    if (result === 'off') await db.collection('wants').doc(r.targetId).update({ data: { status: 'closed', autoHidden: true, updatedAt: db.serverDate() } }).catch(() => {});
    else if (result === 'delete') await db.collection('wants').doc(r.targetId).update({ data: { status: 'deleted', autoHidden: true, updatedAt: db.serverDate() } }).catch(() => {});
    else if (result === 'ignore') await db.collection('wants').doc(r.targetId).update({ data: { autoHidden: false, reportedCount: 0, updatedAt: db.serverDate() } }).catch(() => {});
  } else {
    if (result === 'off') await db.collection('goods').doc(r.targetId).update({ data: { status: 'off', autoHidden: true, updatedAt: db.serverDate() } }).catch(() => {});
    else if (result === 'delete') await db.collection('goods').doc(r.targetId).update({ data: { status: 'deleted', autoHidden: true, updatedAt: db.serverDate() } }).catch(() => {});
    else if (result === 'ignore') await db.collection('goods').doc(r.targetId).update({ data: { autoHidden: false, reportedCount: 0, updatedAt: db.serverDate() } }).catch(() => {});
  }

  // ignore 时把该目标的其他举报也一并标记 handled（避免重复处理）
  if (result === 'ignore') {
    await db.collection('reports')
      .where({ targetType: r.targetType, targetId: r.targetId, status: 'pending' })
      .update({ data: { status: 'handled', handleResult: 'ignore', handledAt: db.serverDate() } })
      .catch(() => {});
  }

  return { ok: true, msg: result === 'ignore' ? '已忽略并恢复' : result === 'off' ? '已下架' : '已删除' };
}

// 举报统计（给后台 tab 角标/概览）
async function reportStats() {
  const pending = await db.collection('reports').where({ status: 'pending' }).count();
  const total = await db.collection('reports').count();
  const autoHiddenGoods = await db.collection('goods').where({ autoHidden: true }).count();
  const autoHiddenWants = await db.collection('wants').where({ autoHidden: true }).count();
  return {
    ok: true,
    data: {
      pending: pending.total,
      total: total.total,
      autoHiddenGoods: autoHiddenGoods.total,
      autoHiddenWants: autoHiddenWants.total
    }
  };
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
