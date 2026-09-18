// 云函数 login：微信登录，登记用户真实昵称/头像，绑定 openid
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID; // 微信账号真实身份标识

  const nickname = (event.nickname || '同学').toString().slice(0, 20);
  const avatar = (event.avatar || '').toString();

  const users = db.collection('users');
  const exist = await users.where({ _openid: openid }).count();

  if (exist.total === 0) {
    await users.add({
      data: {
        _openid: openid,
        nickname,
        avatar,
        createdAt: db.serverDate(),
        updatedAt: db.serverDate()
      }
    });
  } else {
    const rec = await users.where({ _openid: openid }).get();
    if (rec.data.length) {
      await users.doc(rec.data[0]._id).update({
        data: { nickname, avatar, updatedAt: db.serverDate() }
      });
    }
  }

  return { ok: true, openid, user: { nickname, avatar } };
};
