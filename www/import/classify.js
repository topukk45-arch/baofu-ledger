// 记问 · 账单导入 · 分类推荐（纯计算，第一期 ⑤）
// 只推荐，不写入：每一行给出 { cat, want, layer, reason, conf, newCat? }。
// 和 core.js 同样的写法：浏览器 / 后台线程里是全局变量 JiwenImportClassify，Node 里直接 require。
//
// 五层，前一层命中就停；层与层之间不比关键词长短，只看层级；「越长越优先」只用在同一层内部：
//   rule    你的规则（importRules.cat）：关键词包含在交易对方里（原文或清洗后的） —— 把握高
//   learned 从本批合并里学：同一个清洗后的对方合并上的手记，取次数最多的分类，打平不推荐 —— 把握高
//   borrow  两家互借：同一个清洗后的对方在本批支付宝账单里带着交易分类，微信跟着用 —— 把握中
//   builtin 内置词表（merchants.js）：对方里找到算中，只在商品说明里找到算低
//   alipay  支付宝分类对照 —— 把握中
//   none    都没有：未分类
// 内置词表和支付宝对照的目标分类都用支付宝那套名字（want），落地时按同义表对到存档已有的分类（cat）。
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else root.JiwenImportClassify = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1016-A';
  var NEW_CAT_MIN = 3;          // 新建分类：这次至少要有 3 笔落进去，不到的归「其他」

  // ---------- 交易对方清洗 ----------
  // 去掉括号里的分店名、平台前缀、末尾编号；剩下不到两个字、或是打码的人名（带 *），保留原文
  var PREFIXES = ['美团平台商户-', '平台商户-', '美团商户-', '支付宝-', '微信支付-', '财付通-', '抖音支付-', '京东支付-'];
  function cleanCp(raw) {
    var s = String(raw == null ? '' : raw).trim();
    if (!s || s.indexOf('*') >= 0) return s;
    var t = s;
    for (var i = 0; i < PREFIXES.length; i++) if (t.indexOf(PREFIXES[i]) === 0) { t = t.slice(PREFIXES[i].length); break; }
    var prev;
    do { prev = t; t = t.replace(/[（(【\[][^（()）【】\[\]]*[)）】\]]/g, ''); } while (t !== prev);
    t = t.replace(/[\s\-—_·.#]*(No\.?|NO\.?|第)?[0-9０-９]+(号店|号|店|分店)?$/, '');
    t = t.replace(/[\s\-—_·]+$/, '').trim();
    return t.length >= 2 ? t : s;
  }

  // ---------- 支付宝分类对照 ----------
  // 不按分类走的（按口径和退款规则处理）：退款、信用借还、投资理财、账户存取
  var ALI_SKIP = ['退款', '信用借还', '投资理财', '账户存取'];
  var ALI_NAMES = ['餐饮美食', '日用百货', '数码电器', '服饰装扮', '美容美发', '转账红包', '文化休闲', '交通出行', '充值缴费',
                   '医疗健康', '酒店旅游', '公共服务', '商业服务', '生活服务', '收入', '其他'];
  function aliWant(kind) {
    if (!kind || ALI_SKIP.indexOf(kind) >= 0) return null;
    return ALI_NAMES.indexOf(kind) >= 0 ? kind : null;
  }
  // ---------- 落到存档的分类：同义表 ----------
  // 先找同名的，再按顺序找意思一样的已有分类。都没有 → 要新建（或归「未分类」，看新老用户）
  var SYN = {
    '餐饮美食': ['餐饮', '吃饭', '饮食', '美食', '三餐'],
    '日用百货': ['购物', '日用', '日用品', '超市'],
    '数码电器': ['数码', '电器', '购物'],
    '服饰装扮': ['服饰', '衣服', '穿搭', '购物'],
    '美容美发': ['美容', '美发', '个护', '购物'],
    '转账红包': ['转账', '红包'],
    '文化休闲': ['娱乐', '休闲', '文娱', '游戏'],
    '交通出行': ['出行', '交通', '通勤'],
    '充值缴费': ['缴费', '生活缴费', '话费', '水电'],
    '医疗健康': ['医疗', '健康', '看病', '医药'],
    '酒店旅游': ['旅游', '旅行', '酒店'],
    '生活服务': ['生活', '服务'],
    '收入': ['工资', '收入'],
    '其他': ['其他', '其它']
  };
  function land(want, cats) {
    if (cats.indexOf(want) >= 0) return want;
    var syn = SYN[want] || [];
    for (var i = 0; i < syn.length; i++) if (cats.indexOf(syn[i]) >= 0) return syn[i];
    return null;
  }

  // ---------- 内置词表：长词优先 ----------
  function builtinIndex(merchants) {
    var items = (merchants && merchants.items || []).filter(function (x) { return Array.isArray(x) && x[0] && x[1]; });
    return items.slice().sort(function (a, b) { return b[0].length - a[0].length; });
  }
  function findIn(list, text) {
    if (!text) return null;
    var low = text.toLowerCase();
    for (var i = 0; i < list.length; i++) if (low.indexOf(String(list[i][0]).toLowerCase()) >= 0) return list[i];
    return null;
  }

  // ---------- 主函数 ----------
  //   rows：[{ app, cp, desc, kind, io }]（要推荐的行）
  //   ctx：{ cats: 存档分类, rules: importRules.cat [{kw, cat}], learned: Map(清洗后的对方 → 分类),
  //          borrowRows: 本批全部支付宝行 [{ cp, kind }]（互借用）, merchants, isNewUser }
  //   返回 { recs: 与 rows 一一对应, newCats: [{ name, count, defaultOn, mergeInto }] }
  function classify(rows, ctx) {
    ctx = ctx || {};
    var cats = Array.isArray(ctx.cats) && ctx.cats.length ? ctx.cats : ['未分类'];
    var rules = (Array.isArray(ctx.rules) ? ctx.rules : [])
      .filter(function (r) { return r && typeof r.kw === 'string' && r.kw && cats.indexOf(r.cat) >= 0; })
      .slice().sort(function (a, b) { return b.kw.length - a.kw.length; });
    var learned = ctx.learned instanceof Map ? ctx.learned : new Map();
    var words = builtinIndex(ctx.merchants);
    // 两家互借：清洗后的对方 → 支付宝分类（取次数最多的，打平不借）
    var borrow = new Map();
    (ctx.borrowRows || []).forEach(function (r) {
      var w = aliWant(r.kind); if (!w) return;
      var k = cleanCp(r.cp); if (!k) return;
      var m = borrow.get(k); if (!m) borrow.set(k, m = {}); m[w] = (m[w] || 0) + 1;
    });
    function majority(m) {
      var best = null, n = 0, tie = false;
      Object.keys(m).forEach(function (k) { if (m[k] > n) { best = k; n = m[k]; tie = false; } else if (m[k] === n) tie = true; });
      return tie ? null : best;
    }

    var raw = rows.map(function (r) {
      var cp = r.cp || '', cc = cleanCp(cp);
      // 1. 你的规则
      for (var i = 0; i < rules.length; i++) {
        var kw = rules[i].kw;
        if (cp.indexOf(kw) >= 0 || cc.indexOf(kw) >= 0) return { cat: rules[i].cat, layer: 'rule', conf: 'high', reason: '你的规则：' + kw + ' → ' + rules[i].cat };
      }
      // 2. 从本批合并里学
      if (cc && learned.has(cc)) { var lc = learned.get(cc); return { cat: lc, layer: 'learned', conf: 'high', reason: '从合并里学：「' + cc + '」你记成' + lc }; }
      // 3. 两家互借（只给微信借；支付宝自己有分类，走第 5 层）
      if (r.app === 'wechat' && cc && borrow.has(cc)) {
        var bw = majority(borrow.get(cc));
        if (bw) return { want: bw, layer: 'borrow', conf: 'mid', reason: '支付宝里「' + cc + '」是' + bw };
      }
      // 4. 内置词表：对方里找到算中，只在商品说明里找到算低
      var hit = findIn(words, cc) || findIn(words, cp);
      if (hit) return { want: hit[1], layer: 'builtin', conf: 'mid', reason: '内置：' + hit[0] + ' → ' + hit[1] };
      var hd = findIn(words, r.desc || '');
      if (hd) return { want: hd[1], layer: 'builtin', conf: 'low', reason: '内置（商品说明里的「' + hd[0] + '」）→ ' + hd[1] };
      // 5. 支付宝分类对照
      if (r.app === 'alipay') { var aw = aliWant(r.kind); if (aw) return { want: aw, layer: 'alipay', conf: 'mid', reason: '支付宝分类：' + aw }; }
      return { cat: '未分类', layer: 'none', conf: null, reason: '没找到依据' };
    });

    // 落到存档的分类；落不下的数一数，决定建不建
    var need = {};
    raw.forEach(function (x) {
      if (x.cat) return;
      var c = land(x.want, cats);
      if (c) x.cat = c; else need[x.want] = (need[x.want] || 0) + 1;
    });
    var other = land('其他', cats);
    var newCats = Object.keys(need).map(function (name) {
      var n = need[name];
      // 新用户默认建；不到 3 笔的归「其他」。老用户默认不建，落「未分类」
      return { name: name, count: n, defaultOn: !!ctx.isNewUser && n >= NEW_CAT_MIN,
               mergeInto: n >= NEW_CAT_MIN ? null : (other || '未分类') };
    }).sort(function (a, b) { return b.count - a.count; });
    var plan = {}; newCats.forEach(function (c) { plan[c.name] = c; });
    var recs = raw.map(function (x) {
      var o = { cat: x.cat, want: x.want || x.cat, layer: x.layer, conf: x.conf, reason: x.reason };
      if (!x.cat) {
        var p = plan[x.want];
        o.newCat = x.want;
        o.cat = p.defaultOn ? x.want : (p.mergeInto && ctx.isNewUser ? p.mergeInto : '未分类');
      }
      return o;
    });
    return { recs: recs, newCats: newCats };
  }

  return { VERSION: VERSION, cleanCp: cleanCp, classify: classify, land: land, aliWant: aliWant, NEW_CAT_MIN: NEW_CAT_MIN };
});
