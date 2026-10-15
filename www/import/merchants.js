// 记问 · 账单导入 · 内置商户词表
// 导入时按「交易对方」里的关键词推荐分类（需求「分类」一节的第 4 层）。
// 和 core.js 同样的写法：浏览器 / 后台线程里是全局变量 JiwenImportMerchants，Node 里 require 进来。
//
// 【隐私】仓库是公开的。这里只放通用的品牌、行业词，不放任何人真实账单里的商户名、地名。
// 1015-A（第一期 ① 骨架）：只放几条虚构示例，格式先定下来；真词表在第 ⑤ 版补。
//   每条：[关键词, 推荐分类]。关键词按「包含」匹配，长词优先（第 ⑤ 版实现）。
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else root.JiwenImportMerchants = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  return {
    version: 1,
    items: [
      ['青禾便利', '餐饮'],
      ['云杉咖啡', '餐饮'],
      ['橘子超市', '购物'],
      ['小满公交', '出行'],
      ['远山加油', '出行']
    ]
  };
});
