// 云函数 getDetail：获取商品详情 + 是否收藏 + 浏览量
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const id = event.id;

  if (!id) return { ok: false, msg: '缺少id' };

  try {
    const doc = await db.collection('goods').doc(id).get();
    const item = doc.data;

    // 被举报自动隐藏：非本人不可见
    if (item.autoHidden && item._openid !== openid) {
      return { ok: false, msg: '该内容正在审核中，暂不可见' };
    }
    // 拉黑拦截：发帖人被我拉黑 → 非本人不可见
    if (item._openid !== openid && await isBlocked(openid, item._openid)) {
      return { ok: false, msg: '该内容不可见' };
    }
    // 仅上架或本人可见
    if (item.status === 'deleted') return { ok: false, msg: '已删除' };

    // 浏览量+1（异步，不阻塞）
    db.collection('goods').doc(id).update({
      data: { viewCount: _.inc(1) }
    }).catch(() => {});

    // 是否已收藏
    let liked = false;
    try {
      const like = await db.collection('favorites')
        .where({ _openid: openid, goodsId: id }).count();
      liked = like.total > 0;
    } catch (e) { /* 忽略 */ }

    const data = {
      ...item,
      // 兼容老数据
      priceType: item.priceType || (item.price === 0 ? 'free' : item.price === -1 ? 'bargain' : ''),
      tradeStatus: item.tradeStatus || 'selling',
      flowerCount: item.flowerCount || 0,
      liked,
      isMine: item._openid === openid,
      timeText: formatTime(item.createdAt)
    };
    // 联系方式脱敏：非本人不下发明文（点击复制时经 getContact 按需获取）
    if (!data.isMine) {
      delete data.contact;
    }

    return { ok: true, data };
  } catch (e) {
    return { ok: false, msg: '获取失败' };
  }
};

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
