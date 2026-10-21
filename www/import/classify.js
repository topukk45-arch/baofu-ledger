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
// 1016-C：
//   平台名（淘宝、天猫、京东、拼多多、抖音商城、唯品会）在对方里只算「低」，先看商品说明里有没有更具体的词，再看支付宝分类，最后才用平台；
//   只在商品说明里找到的（低）按清洗后的对方投票：同一个对方票数最多的唯一一个分类给这个对方的所有这种行，打平就都不推荐，
//   免得同一个对方的几笔有的推成「游戏」、有的未分类。
// 1016-J：分类对照（importRules.map [{ from: 推荐分类, cat: 我的分类 }]）：确认页「新建分类」里手动选过「并到已有 X」的，下次直接归到 X。
//   只管「落不到」这一步：同名 → 同义 → 对照 → 新建分类建议。你的规则、从合并里学的在前面就返回了，不经过这一步。
//   目标分类不在存档里（被删了）的对照不算。命中对照的层级照旧（内置 / 支付宝 / 互借），理由写「你的对照：A → X（原依据）」。
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else root.JiwenImportClassify = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1021-T21';
  var HIST_MIN = 3, HIST_SHARE = 0.8;   // 1021-T8 从账本历史里学：同一个对方以前至少 3 条、八成以上同一类
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
    '游戏': ['游戏', '娱乐', '休闲', '文娱'],            // 1021-T21：从文化休闲拆出来的两类，没有同名的就落进原来那几个娱乐分类
    '会员订阅': ['会员订阅', '会员', '订阅', '娱乐', '休闲', '文娱'],
    '交通出行': ['出行', '交通', '通勤'],
    '充值缴费': ['缴费', '生活缴费', '日常缴费', '话费', '通讯', '通信', '手机', '充值', '水电', '水电煤'],
    '医疗健康': ['医疗', '健康', '看病', '医药'],
    '酒店旅游': ['旅游', '旅行', '酒店'],
    '生活服务': ['生活', '服务'],
    // 1021-T3（实测 10-20）：收入不再落「工资」——工资只来自你的规则或你手动选。收钱码、个人转账、闲鱼这类另推「收款」
    '收入': ['收入'],
    '收款': ['收款', '收入'],
    '其他': ['其他', '其它']
  };
  function land(want, cats) {
    if (cats.indexOf(want) >= 0) return want;
    var syn = SYN[want] || [];
    for (var i = 0; i < syn.length; i++) if (cats.indexOf(syn[i]) >= 0) return syn[i];
    return null;
  }

  var RECEIPT_RE = /收钱码|收款|转账|闲鱼|二手/;
  var CARRIER_RE = /(联通|移动|电信)(股份有限公司|有限责任公司|有限公司|分公司|公司|集团)?$/;
  var PLATFORMS = ['淘宝', '天猫', '京东', '拼多多', '抖音商城', '唯品会'];
  function isPlatform(word) { return PLATFORMS.some(function (p) { return String(word).indexOf(p) >= 0; }); }
  // 分分捐这类合并记录的默认分类：存档里有公益类的就用它，没有用「其他」，再没有「未分类」
  function pettyCat(cats) {
    cats = Array.isArray(cats) ? cats : [];
    for (var i = 0; i < cats.length; i++) if (/公益|慈善|捐/.test(cats[i])) return cats[i];
    return land('其他', cats) || '未分类';
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
  //          borrowRows: 本批全部支付宝行 [{ cp, kind }]（互借用）, merchants, isNewUser,
  //          maps: importRules.map [{ from, cat }]（1016-J 分类对照） }
  //   返回 { recs: 与 rows 一一对应, newCats: [{ name, count, defaultOn, mergeInto }] }
  function gameHit(list, text) { for (var i = 0; i < (list || []).length; i++) if (text.indexOf(list[i]) >= 0) return list[i]; return null; }
  function classify(rows, ctx) {
    ctx = ctx || {};
    var cats = Array.isArray(ctx.cats) && ctx.cats.length ? ctx.cats : ['未分类'];
    var rules = (Array.isArray(ctx.rules) ? ctx.rules : [])
      .filter(function (r) { return r && typeof r.kw === 'string' && r.kw && cats.indexOf(r.cat) >= 0; })
      .slice().sort(function (a, b) { return b.kw.length - a.kw.length; });
    var learned = ctx.learned instanceof Map ? ctx.learned : new Map();
    // 1021-T8：账本历史（主页面按名单原文数好的 { 对方: { e:{分类:次数}, i:{…} } }），按清洗后的对方合起来
    var hist = new Map();
    Object.keys(ctx.history && typeof ctx.history === 'object' ? ctx.history : {}).forEach(function (nm) {
      var k = cleanCp(nm), h = ctx.history[nm]; if (!k || !h) return;
      var m = hist.get(k); if (!m) hist.set(k, m = { e: {}, i: {} });
      ['e', 'i'].forEach(function (io) { Object.keys(h[io] || {}).forEach(function (c) { var v = +h[io][c]; if (v > 0) m[io][c] = (m[io][c] || 0) + v; }); });
    });
    function fromHist(cc, io) {
      var m = hist.get(cc); if (!m || (io !== 'income' && io !== 'expense')) return null;
      var x = m[io === 'income' ? 'i' : 'e'], tot = 0, best = null, bn = 0;
      Object.keys(x).forEach(function (c) { tot += x[c]; if (x[c] > bn) { bn = x[c]; best = c; } });
      if (tot < HIST_MIN || bn < tot * HIST_SHARE || cats.indexOf(best) < 0) return null;
      return { cat: best, layer: 'history', conf: 'mid', reason: '你以前 ' + tot + ' 次' + (bn === tot ? '都' : '里 ' + bn + ' 次') + '记成「' + best + '」' };
    }
    var mapOf = {};
    (Array.isArray(ctx.maps) ? ctx.maps : []).forEach(function (m) {
      if (m && typeof m.from === 'string' && m.from && cats.indexOf(m.cat) >= 0 && !(m.from in mapOf)) mapOf[m.from] = m.cat;
    });
    var words = builtinIndex(ctx.merchants);
    var G = (ctx.merchants && ctx.merchants.games) || { cat: '游戏', strong: [], weak: [], notWith: [] };
    var gameOn = cats.indexOf(G.cat) >= 0;
    var SELLS = (ctx.merchants && ctx.merchants.sellsAll) || [];
    // 1021-T7：平台名和「什么都卖」的综合商超都只算低、排在商品说明和支付宝分类后面
    var weakWord = function (w) { return isPlatform(w) || SELLS.indexOf(w) >= 0; };
    var nonPlat = words.filter(function (x) { return !weakWord(x[0]); });
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
        if (cp.indexOf(kw) >= 0 || cc.indexOf(kw) >= 0) return { cat: rules[i].cat, layer: 'rule', conf: 'high', reason: '你的规则：' + kw + ' → ' + rules[i].cat, kw: kw };
      }
      // 2. 从本批合并里学
      if (cc && learned.has(cc)) { var lc = learned.get(cc); return { cat: lc, layer: 'learned', conf: 'high', reason: '从合并里学：「' + cc + '」你记成' + lc }; }
      // 2.5（1021-T8）从账本历史里学：同一个对方以前导进账本的（同收支）至少 3 条、八成以上同一类 → 把握中
      var hx = cc ? fromHist(cc, r.io) : null;
      if (hx) return hx;
      // 3. 两家互借（只给微信借；支付宝自己有分类，走第 5 层）
      if (r.app === 'wechat' && cc && borrow.has(cc)) {
        var bw = majority(borrow.get(cc));
        if (bw) return { want: bw, layer: 'borrow', conf: 'mid', reason: '支付宝里「' + cc + '」是' + bw };
      }
      // 4. 内置词表：对方里找到算中，只在商品说明里找到算低
      // 1016-I：对方是运营商（联通、移动、电信，含「中国联通」「河南联通」这类）：直接充值缴费，把握中
      if (CARRIER_RE.test(cc)) return { want: '充值缴费', layer: 'builtin', conf: 'mid', reason: '对方是运营商「' + cc + '」→ 充值缴费' };
      var hit = findIn(words, cc) || findIn(words, cp);
      var hd = findIn(nonPlat, r.desc || '');
      var aw = r.app === 'alipay' ? aliWant(r.kind) : null;
      if (hit && !weakWord(hit[0])) return { want: hit[1], layer: 'builtin', conf: 'mid', reason: '内置：' + hit[0] + ' → ' + hit[1] };
      // 1021-T7：商品说明里的词和支付宝分类说的是同一类 → 两个依据一致，升到「中」
      if (hd && aw && aw === hd[1]) return { want: hd[1], layer: 'builtin', conf: 'mid', reason: '内置（商品说明里的「' + hd[0] + '」）和支付宝分类一致 → ' + hd[1], descOnly: true, cc: cc, agree: true };
      if (hd) return { want: hd[1], layer: 'builtin', conf: 'low', reason: '内置（商品说明里的「' + hd[0] + '」）→ ' + hd[1], descOnly: true, cc: cc };
      // 1016-Z4：游戏词（存档里有「游戏」分类才推荐）：首充、月卡、战令、钻石……→ 游戏（把握中）
      var gs = gameHit(G.strong, cc + ' ' + cp + ' ' + (r.desc || ''));
      if (gameOn && gs) return { cat: G.cat, layer: 'builtin', conf: 'mid', reason: '内置：' + gs + ' → ' + G.cat };
      // 5. 支付宝分类对照
      //   1021-T3：支付宝「收入」里收钱码 / 转账 / 闲鱼这类是别人付给你的钱 → 推「收款」（存档里没有就是新建分类建议，老用户默认不建、落未分类）
      if (aw === '收入' && RECEIPT_RE.test(cp + ' ' + (r.desc || ''))) return { want: '收款', layer: 'alipay', conf: 'mid', reason: '支付宝分类：收入（收钱码 / 转账收款）→ 收款' };
      if (aw) return { want: aw, layer: 'alipay', conf: 'mid', reason: '支付宝分类：' + aw };
      // 平台名：最后才用，把握低
      if (hit) return { want: hit[1], layer: 'builtin', conf: 'low', reason: '内置（' + (isPlatform(hit[0]) ? '平台' : '综合商超') + '「' + hit[0] + '」，卖什么的都有）→ ' + hit[1] };
      // 1016-Z4：「礼包」→ 游戏，把握低、排在最后；说明里有流量、零食这类词时不算（那些词前面已经认过了）
      var gwText = cc + ' ' + cp + ' ' + (r.desc || '');
      if (gameOn && gameHit(G.weak, gwText) && !gameHit(G.notWith, gwText)) return { cat: G.cat, layer: 'builtin', conf: 'low', reason: '内置（「礼包」多半是游戏）→ ' + G.cat };
      return { cat: '未分类', layer: 'none', conf: null, reason: '没找到依据' };
    });

    // 只在商品说明里找到的：同一个对方投票，唯一最多的给这个对方所有这种行（还有没推出来的行），打平都不推荐
    //   1021-T19（实测 10-21）：对方是平台（淘宝、美团……）或「什么都卖」名单里的不投票：同一平台下是不同的店，
    //   惠宜选超市不该因为闪购别的几笔是外卖就被带成餐饮
    var votes = new Map();
    raw.forEach(function (x) { if (x.descOnly && x.cc && !weakWord(x.cc) && SELLS.every(function (w) { return x.cc.indexOf(w) < 0; })) { var v = votes.get(x.cc); if (!v) votes.set(x.cc, v = {}); v[x.want] = (v[x.want] || 0) + 1; } });
    var winner = new Map(); votes.forEach(function (v, k) { winner.set(k, majority(v)); });
    raw.forEach(function (x, i) {
      var cc = x.descOnly ? x.cc : (x.layer === 'none' ? cleanCp(rows[i].cp || '') : null);
      if (!cc || !winner.has(cc)) return;
      var w = winner.get(cc);
      if (!w) { raw[i] = { cat: '未分类', layer: 'none', conf: null, reason: '「' + cc + '」几笔的商品说明各指向不同分类，不推荐' }; return; }
      if (x.layer === 'none' || x.want !== w) raw[i] = { want: w, layer: 'builtin', conf: 'low', reason: '内置（「' + cc + '」其他几笔的商品说明）→ ' + w };
    });

    // 1021-T21（实测 10-21）：推出来是「文化休闲」的再拆成「游戏」「会员订阅」（词表在 merchants.js 的 funSplit），剩下的才算文化休闲
    var FS = (ctx.merchants && ctx.merchants.funSplit) || null;
    if (FS) raw.forEach(function (x, i) {
      if (x.cat || x.want !== '文化休闲') return;
      var r = rows[i], text = (cleanCp(r.cp || '') + ' ' + (r.cp || '') + ' ' + (r.desc || '')).toLowerCase();
      var has = function (list) { for (var j = 0; j < list.length; j++) if (text.indexOf(String(list[j]).toLowerCase()) >= 0) return list[j]; return null; };
      var kw = has(G.strong || []), to = kw ? '游戏' : null;
      if (!to && (kw = has(FS.sub))) to = '会员订阅';
      if (!to && (kw = has(FS.game))) to = '游戏';
      if (!to) return;
      x.want = to; x.reason = '拆开文化休闲：「' + kw + '」→ ' + to;
    });
    // 落到存档的分类；落不下的数一数，决定建不建
    var need = {};
    raw.forEach(function (x) {
      if (x.cat) return;
      var c = land(x.want, cats);
      if (!c && Object.prototype.hasOwnProperty.call(mapOf, x.want)) {
        c = mapOf[x.want];
        x.reason = '你的对照：' + x.want + ' → ' + c + '（' + x.reason + '）';
      }
      // 1021-T7：理由里写落到了你的哪个分类（同义落地时，推荐名和你的分类名不一样）
      if (c && c !== x.want && x.reason.indexOf('你的对照') !== 0) x.reason += '（落到你的「' + c + '」）';
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
      if (x.kw) o.kw = x.kw;          // 1016-Y：命中的是你的哪条规则（确认页改了分类时问「以后都改吗」）
      if (!x.cat) {
        var p = plan[x.want];
        o.newCat = x.want;
        o.cat = p.defaultOn ? x.want : (p.mergeInto && ctx.isNewUser ? p.mergeInto : '未分类');
      }
      return o;
    });
    return { recs: recs, newCats: newCats };
  }

  return { VERSION: VERSION, cleanCp: cleanCp, classify: classify, land: land, aliWant: aliWant, pettyCat: pettyCat, isPlatform: isPlatform,
           PLATFORMS: PLATFORMS, NEW_CAT_MIN: NEW_CAT_MIN };
});
