// app.js
App({
  onLaunch() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
      return;
    }
    wx.cloud.init({
      env: 'your-cloud-env-id',
      traceUser: true
    });
  },

  globalData: {
    // 当前登录用户信息（openid 在云函数里获取，前端只存昵称头像缓存）
    userInfo: null,
    // 一级分类定义，展示用（首项"全部"为筛选入口，发布/编辑时剔除）
    categories: ['全部', '学习资料', '生活用品', '数码设备', '餐券/各种卡', '其他'],
    // 二级分类（仅"学习资料"下有 4 类，必选层次）
    subCategories: {
      '学习资料': ['CP/note', '卷子', '论文', '教材']
    },
    // 三级分类（学科，挂在二级下；四类共用同一套学科，暂定占位，后期可各自覆盖）
    thirdCategories: {
      'CP/note': ['MAT', 'CHI', 'PHY', 'CHM', 'CSC', 'ECO', 'FIN', 'GE课程'],
      '卷子': ['MAT', 'CHI', 'PHY', 'CHM', 'CSC', 'ECO', 'FIN', 'GE课程'],
      '论文': ['MAT', 'CHI', 'PHY', 'CHM', 'CSC', 'ECO', 'FIN', 'GE课程'],
      '教材': ['MAT', 'CHI', 'PHY', 'CHM', 'CSC', 'ECO', 'FIN', 'GE课程']
    }
  }
});
