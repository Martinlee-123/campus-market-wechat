// 云函数 chatEntry：从商品/求购详情进入站内私聊
// 用途：详情页「私信卖家/求购者」按钮 → 创建一个会话并返回会话id + 对方信息
// 入参: { type: 'goods'|'want'|'reply', id }
// 返回: { ok, conversationId, otherOpenid, otherNickname, otherAvatar, goodsTitle }
// 安全：校验目标存在、不是自己、未被拉黑；不泄露联系方式明文
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const type = event.type || 'goods';
  const id = (event.id || '').trim();
  if (!id) return { ok: false, msg: '缺少id' };

  try {
    // 目标表 + 标题字段
    let table, titleField, contactType;
    if (type === 'want') { table = 'wants'; titleField = 'title'; }
    else if (type === 'reply') { table = 'wantReplies'; titleField = 'desc'; }
    else { table = 'goods'; titleField = 'title'; }

    const doc = await db.collection(table).doc(id).get();
    const item = doc.data;
    if (!item || item.status === 'deleted') return { ok: false, msg: '内容不存在' };

    // 求购回应：跳转到求购主帖的发布者（回应只是中间人，私信应找求购人？）
    // 简化：私信目标 = 内容发布者（goods/want 的 _openid；reply 则私信"回应者"）
    const otherOpenid = item._openid;
    if (!otherOpenid) return { ok: false, msg: '对方信息缺失' };
    if (otherOpenid === openid) return { ok: false, msg: '不能和自己聊天' };

    // 拉黑校验：我拉黑了对方，或对方拉黑了我，都不可私信
    if (await isBlocked(openid, otherOpenid)) return { ok: false, msg: '无法私信该用户' };
    if (await isBlocked(otherOpenid, openid)) return { ok: false, msg: '对方设置了你无法私信' };

    // 取或创建会话（复用 chat 云函数逻辑，这里直接查/建）
    const key = [openid, otherOpenid].sort().join('_');
    let conversationId = '';
    const exist = await db.collection('conversations').where({ key }).limit(1).get();
    if (exist.data.length) {
      conversationId = exist.data[0]._id;
    } else {
      const createdAt = db.serverDate();
      const doc2 = {
        key,
        users: [openid, otherOpenid].sort(),
        lastMessage: '',
        lastTime: createdAt,
        readBy: { [openid]: createdAt, [otherOpenid]: createdAt },
        createdAt
      };
      // 商品上下文（仅 goods 带标题）
      if (type === 'goods' && item.title) {
        doc2.goodsId = String(id);
        doc2.goodsTitle = String(item.title).slice(0, 60);
      }
      const add = await db.collection('conversations').add({ data: doc2 });
      conversationId = add._id;
    }

    // 对方昵称头像
    let otherNickname = '同学', otherAvatar = '';
    try {
      const u = await db.collection('users').where({ _openid: otherOpenid }).limit(1).get();
      if (u.data.length) {
        otherNickname = u.data[0].nickname || otherNickname;
        otherAvatar = u.data[0].avatar || '';
      }
    } catch (e) {}

    const goodsTitle = type === 'goods' ? (item.title || '') : '';

    return {
      ok: true,
      conversationId,
      otherOpenid,
      otherNickname,
      otherAvatar,
      goodsTitle
    };
  } catch (e) {
    return { ok: false, msg: '操作失败: ' + e.message };
  }
};

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