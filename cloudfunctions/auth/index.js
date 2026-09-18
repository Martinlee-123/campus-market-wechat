// 云函数 auth：校内认证（学号自动审核）
// 学号规则（本校）：9位纯数字；第1位1/2(本/研)；第2位2；第4位0；后5位任意
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 学号格式校验
function validateStudentId(id) {
  if (typeof id !== 'string') return false;
  if (!/^\d{9}$/.test(id)) return false;      // 9位纯数字
  const c1 = id[0], c2 = id[1], c4 = id[3];
  if (c1 !== '1' && c1 !== '2') return false;  // 第1位 1/2
  if (c2 !== '2') return false;                // 第2位 2
  if (c4 !== '0') return false;                // 第4位 0
  return true;
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const action = event.action || 'status';

  switch (action) {
    case 'status': return await getStatus(openid);
    case 'submit': return await submitAuth(event, openid);
    case 'my': return await getStatus(openid);   // 前端查询用
    default: return { ok: false, msg: '未知操作: ' + action };
  }
};

// 查询当前用户认证状态
async function getStatus(openid) {
  const rec = await db.collection('users').where({ _openid: openid }).limit(1).get();
  if (rec.data.length === 0) {
    return { ok: true, verified: 'none', data: null };
  }
  const u = rec.data[0];
  const verified = u.verified || 'none';
  const data = {
    verified,
    // 学号永不返回给前端（后端保密，仅展示状态）
    studentId: undefined,
    submittedAt: u.verifyInfo && u.verifyInfo.submittedAt,
    reviewedAt: u.verifyInfo && u.verifyInfo.reviewedAt
  };
  return { ok: true, ...data };
}

// 提交学号认证（系统自动审核）
async function submitAuth(event, openid) {
  const studentId = (event.studentId || '').toString().trim();
  if (!studentId) return { ok: false, msg: '请输入学号' };
  

    if (!validateStudentId(studentId)) {
    return { ok: false, msg: '学号格式不符，请核对后重试' };
  }
// 需已登录
  const rec = await db.collection('users').where({ _openid: openid }).limit(1).get();
  if (rec.data.length === 0) return { ok: false, msg: '请先登录' };

  // 已认证/待审核则不再重复提交
  const cur = rec.data[0];
  const curVerified = cur.verified || 'none';
  if (curVerified === 'approved') return { ok: false, msg: '你已完成认证' };
  if (curVerified === 'pending') return { ok: false, msg: '认证审核中，请耐心等待' };

  // 学号格式已验证通过 => 自动审核通过
  const approved = 'approved';

  const verifyInfo = {
    studentId,           // 完整学号（仅管理后台可见，前端永不返回）
    submittedAt: new Date(),
    reviewedAt: new Date(),
    method: 'auto'       // 自动审核
  };

  await db.collection('users').doc(rec.data[0]._id).update({
    data: { verified: approved, verifyInfo, updatedAt: db.serverDate() }
  });

  if (approved === 'approved') {
    // 认证成功后：自动回填该用户所有历史帖子/求购/回应的 verified 字段，补上🎓标
    backfillVerified(openid).catch(() => {});
    return { ok: true, verified: 'approved', msg: '认证成功，已显示🎓标识' };
  }
  return { ok: false, verified: 'rejected', msg: '学号格式不符，未通过' };
}

// 回填用户所有历史内容的认证标识
async function backfillVerified(openid) {
  // goods 商品
  await db.collection('goods').where({ _openid: openid }).update({
    data: { verified: 'approved', updatedAt: db.serverDate() }
  }).catch(() => {});
  // wants 求购
  await db.collection('wants').where({ _openid: openid }).update({
    data: { verified: 'approved', updatedAt: db.serverDate() }
  }).catch(() => {});
  // wantReplies 求购回应
  await db.collection('wantReplies').where({ _openid: openid }).update({
    data: { verified: 'approved' }
  }).catch(() => {});
}
