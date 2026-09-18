// 云函数 getList：分页获取商品列表（仅上架）
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const page = Math.max(0, Number(event.page) || 0);
  const pageSize = Math.min(20, Math.max(1, Number(event.pageSize) || 10));
  const category = event.category || '';
  const subCategory = (event.subCategory || '').trim();
  const thirdCategory = (event.thirdCategory || '').trim();
  const keyword = (event.keyword || '').trim();
  // 排序：latest=最新 views=最多浏览 flower=最多好评（送花数）
  const sort = event.sort || 'latest';

  const where = { status: 'on', autoHidden: _.neq(true) };

  // 拉黑过滤：排除我拉黑的人的帖子
  const blockedIds = await getMyBlockedOpenids(openid);
  if (blockedIds.length) {
    where._openid = _.nin(blockedIds);
  }

  if (category) where.category = category;
  if (subCategory) where.subCategory = subCategory;
  if (thirdCategory) where.thirdCategory = thirdCategory;
  if (keyword) {
    // 空格分词：每个词都必须在至少一个字段中命中（近似中文多词检索）
    const words = keyword.split(/\s+/).filter(Boolean);
    const escapes = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matchCmds = [];
    for (const w of words) {
      const reg = db.RegExp({ regexp: escapes(w), options: 'i' });
      // 每个词：多字段 or 匹配（title / desc / category / subCategory / tags）
      matchCmds.push(_.or([
        { title: reg },
        { desc: reg },
        { category: reg },
        { subCategory: reg },
        { tags: reg }
      ]));
    }
    // 多个词之间用 and 连接（每个词都要命中），词内字段用 or；与上方字段条件并存
    if (matchCmds.length === 1) {
      where[_.and] = matchCmds[0];
    } else if (matchCmds.length > 1) {
      where[_.and] = _.and(matchCmds);
    }
  }

  // 排序条件
  let orderBy = { field: 'createdAt', dir: 'desc' };
  if (sort === 'views') orderBy = { field: 'viewCount', dir: 'desc' };
  else if (sort === 'flower') orderBy = { field: 'flowerCount', dir: 'desc' };

  try {
    let query = db.collection('goods').where(where)
      .orderBy(orderBy.field, orderBy.dir)
      .skip(page * pageSize)
      .limit(pageSize)
      .field({
        _id: true, title: true, desc: true, price: true, category: true,
        cover: true, nickname: true, createdAt: true, status: true,
        viewCount: true, likeCount: true, subCategory: true, thirdCategory: true,
        priceType: true, tradeStatus: true, verified: true, contactType: true,
        flowerCount: true
      });
    const res = await query.get();

    const data = res.data.map(item => ({
      ...item,
      // 老数据无 priceType/tradeStatus，按 price 推断兼容
      priceType: item.priceType || (item.price === 0 ? 'free' : item.price === -1 ? 'bargain' : ''),
      tradeStatus: item.tradeStatus || 'selling',
      flowerCount: item.flowerCount || 0,
      timeText: formatTime(item.createdAt)
    }));

    return { ok: true, data };
  } catch (e) {
    return { ok: false, msg: e.message, data: [] };
  }
};

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
