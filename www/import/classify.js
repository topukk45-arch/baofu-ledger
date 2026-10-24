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

  var VERSION = '1024-X';
  var HIST_MIN = 3, HIST_SHARE = 0.8;   // 1021-T8 从账本历史里学：同一个对方以前至少 3 条、八成以上同一类
  var REMARK_MIN = 2;   // 导入简化第 10 版：从手记备注学：同一句备注至少 2 次
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
  // 1021-T24：付给个人：商品说明写收钱码收款 / 转账 / 二维码收款，或对方名带 *、是英文名（没有商户字样）
  var PAY_PERSON_DESC = /收钱码|二维码收款|个人收款|^转账/;
  var SHOP_WORD = /公司|商行|商店|店|超市|旗舰|专营|工作室|酒店|餐厅|中心|集团|银行|有限|科技|网络|服务|商贸|贸易|平台|官方|Ltd|Inc|Co\./i;
  function payPerson(cp, desc) {
    var c = String(cp || '').trim();
    if (PAY_PERSON_DESC.test(String(desc || '').trim())) return !SHOP_WORD.test(c) || c.indexOf('*') >= 0 || /个人/.test(c);
    if (c.indexOf('*') >= 0 && c.length <= 8) return true;
    return /^[A-Za-z][A-Za-z.\s'’·-]*$/.test(c) && c.length <= 40 && !SHOP_WORD.test(c);
  }
  // 1024-W（实测 10-24：新存档一次导全年，推不出的 640 笔里 220 笔是和个人之间的）：和个人之间的钱（标 person，确认页单独归组；1024-X 起不默认推转账）。
  //   转账、红包（不管收支）；扫码付款、商品说明是二维码收款 / 收钱码或 payPerson 认得出是个人的（只算支出）；对方带 * 的
  function personRow(r) {
    var cp = String(r.cp || ''), k = String(r.kind || ''), ds = String(r.desc || '');
    if (/转账|红包/.test(k)) return true;
    if (cp.indexOf('*') >= 0 && cp.length <= 8) return true;
    if (r.io !== 'expense') return false;
    if (/二维码|扫码/.test(k) && (/二维码收款|收款码|收钱码|个人收款/.test(ds) ? !SHOP_WORD.test(cp) : payPerson(cp, ds))) return true;
    return payPerson(cp, ds);
  }
  // 1024-X：和个人之间的再按交易类型分一层（确认页各成一组）：转账 transfer / 红包 redpack / 扫收钱码 qr / 别的 other；
  //   工作日中午（11:00–13:30）付给个人的 10–30 元另成一组 lunch，多半是午饭（实测 10-24：全年八九十笔，对方都写成「个人」，账本历史学不了）
  function personSub(r) {
    var k = String(r.kind || ''), ds = String(r.desc || '');
    if (/转账/.test(k)) return 'transfer';
    if (/红包/.test(k)) return 'redpack';
    if (/二维码|扫码/.test(k) || /收钱码|收款码|二维码收款/.test(ds)) return 'qr';
    return 'other';
  }
  function isLunch(r) {
    if (r.io !== 'expense' || !(r.fen >= 1000 && r.fen <= 3000)) return false;
    var m = /^(\d{4})-(\d\d)-(\d\d)[T ](\d\d):(\d\d)/.exec(String(r.time || '')); if (!m) return false;
    var wd = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay(), mins = +m[4] * 60 + +m[5];
    return wd >= 1 && wd <= 5 && mins >= 660 && mins <= 810;
  }
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
    // 导入简化第 8 版：词表一条一个对象 { kw, cat, kind }；里面还是排成 [关键词, 分类] 找（老格式 [关键词, 分类] 也认）
    var items = (merchants && merchants.items || []).map(function (x) { return Array.isArray(x) ? x : (x && typeof x === 'object' ? [x.kw, x.cat] : null); })
      .filter(function (x) { return Array.isArray(x) && x[0] && x[1]; });
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
    // 导入简化第 10 版：从手记备注学：你自己记的（没有导入来源的，合并过账单的也算）备注整句 × 收支 × 分类的次数（主页面 archiveInfo().remarkHist 数好），
    //   账单的商品说明或清洗后的对方和某句备注一模一样、这句备注同收支至少 REMARK_MIN（2）次、八成以上同一类、分类还在 → 把握中。只认整句，不分词
    var rmk = ctx.remarks && typeof ctx.remarks === 'object' ? ctx.remarks : {};
    function fromRemark(texts, io) {
      if (io !== 'income' && io !== 'expense') return null;
      for (var t = 0; t < texts.length; t++) {
        var k = String(texts[t] || '').trim(), m = k && Object.prototype.hasOwnProperty.call(rmk, k) ? rmk[k] : null; if (!m) continue;
        var x = m[io === 'income' ? 'i' : 'e'] || {}, tot = 0, best = null, bn = 0;
        Object.keys(x).forEach(function (c) { var v = +x[c] || 0; tot += v; if (v > bn) { bn = v; best = c; } });
        if (tot < REMARK_MIN || bn < tot * HIST_SHARE || cats.indexOf(best) < 0) continue;
        return { cat: best, layer: 'remark', conf: 'mid', reason: '你记账时备注「' + k + '」的 ' + tot + ' 次' + (bn === tot ? '都' : '里 ' + bn + ' 次') + '记成「' + best + '」' };
      }
      return null;
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
    // 导入简化第 10 版：两家互借也借账本：以前导进账本的支付宝记录（对方名单原文 → 原始分类的次数，主页面 archiveInfo().aliHist 数好）一起算
    Object.keys(ctx.aliHist && typeof ctx.aliHist === 'object' ? ctx.aliHist : {}).forEach(function (nm) {
      var k = cleanCp(nm), h = ctx.aliHist[nm]; if (!k || !h) return;
      Object.keys(h).forEach(function (oc) { var w = aliWant(oc), v = +h[oc] || 0; if (!w || !(v > 0)) return; var m = borrow.get(k); if (!m) borrow.set(k, m = {}); m[w] = (m[w] || 0) + v; });
    });
    function majority(m) {
      var best = null, n = 0, tie = false;
      Object.keys(m).forEach(function (k) { if (m[k] > n) { best = k; n = m[k]; tie = false; } else if (m[k] === n) tie = true; });
      return tie ? null : best;
    }

    var raw = rows.map(function (r) {
      var cp = r.cp || '', cc = cleanCp(cp);
      // 1. 你的规则：先认交易对方的，再认商品说明的（导入简化第 9 版：on:'desc'）
      for (var i = 0; i < rules.length; i++) {
        var kw = rules[i].kw;
        if (rules[i].on === 'desc') continue;
        if (cp.indexOf(kw) >= 0 || cc.indexOf(kw) >= 0) return { cat: rules[i].cat, layer: 'rule', conf: 'high', reason: '你的规则：' + kw + ' → ' + rules[i].cat, kw: kw };
      }
      var ds0 = String(r.desc || '');
      if (ds0) for (var j = 0; j < rules.length; j++) {
        if (rules[j].on !== 'desc') continue;
        if (ds0.indexOf(rules[j].kw) >= 0) return { cat: rules[j].cat, layer: 'rule', conf: 'high', reason: '你的规则：商品说明里有「' + rules[j].kw + '」→ ' + rules[j].cat, kw: rules[j].kw, on: 'desc' };
      }
      // 2. 从本批合并里学
      if (cc && learned.has(cc)) { var lc = learned.get(cc); return { cat: lc, layer: 'learned', conf: 'high', reason: '从合并里学：「' + cc + '」你记成' + lc }; }
      // 2.5（1021-T8）从账本历史里学：同一个对方以前导进账本的（同收支）至少 3 条、八成以上同一类 → 把握中
      var hx = cc ? fromHist(cc, r.io) : null;
      if (hx) return hx;
      // 2.6（导入简化第 10 版）从手记备注学：商品说明或对方和你哪句备注一模一样
      var rx = fromRemark([r.desc, cc], r.io);
      if (rx) return rx;
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
      // 1024-X：1024-W 把普通商户的这种升成把握中，先撤回（照旧低）：等「按来源看导入后改了多少」的数出来再定
      if (hd) return { want: hd[1], layer: 'builtin', conf: 'low', reason: '内置（商品说明里的「' + hd[0] + '」）→ ' + hd[1], descOnly: true, cc: cc };
      // 1016-Z4：游戏词（存档里有「游戏」分类才推荐）：首充、月卡、战令、钻石……→ 游戏（把握中）
      var gs = gameHit(G.strong, cc + ' ' + cp + ' ' + (r.desc || ''));
      if (gameOn && gs) return { cat: G.cat, layer: 'builtin', conf: 'mid', reason: '内置：' + gs + ' → ' + G.cat };
      // 5. 支付宝分类对照
      //   1021-T3：支付宝「收入」里收钱码 / 转账 / 闲鱼这类是别人付给你的钱 → 推「收款」（存档里没有就是新建分类建议，老用户默认不建、落未分类）
      // 1021-T24（实测 10-21，Adeline 那几笔）：付给个人的钱（扫对方收钱码、转账；对方带 *、或是英文名）：支付宝的「交易分类」是收款方登记的类别
      //   （个人收钱码常写「商业服务」），不是你花钱的用途，不照抄；先推「转账红包」（落你的「转账」），把握低、进组让你定
      var pr = personRow(r);
      if (pr && isLunch(r)) return { want: '餐饮美食', layer: 'builtin', conf: 'low', reason: '工作日中午付给个人的 ' + (r.fen / 100).toFixed(2) + ' 元，多半是午饭 → 餐饮', person: true, psub: 'lunch' };
      if (aw && aw !== '转账红包' && r.io === 'expense' && payPerson(cp, r.desc)) return { want: '转账红包', layer: 'alipay', conf: 'low', reason: '付给个人的（收钱码 / 转账），支付宝写的「' + aw + '」不算数 → 转账红包', person: true, psub: personSub(r) };
      if (aw === '收入' && RECEIPT_RE.test(cp + ' ' + (r.desc || ''))) return { want: '收款', layer: 'alipay', conf: 'mid', reason: '支付宝分类：收入（收钱码 / 转账收款）→ 收款' };
      if (aw) return { want: aw, layer: 'alipay', conf: 'mid', reason: '支付宝分类：' + aw };
      // 平台名：最后才用，把握低
      if (hit) return { want: hit[1], layer: 'builtin', conf: 'low', reason: '内置（' + (isPlatform(hit[0]) ? '平台' : '综合商超') + '「' + hit[0] + '」，卖什么的都有）→ ' + hit[1] };
      // 1016-Z4：「礼包」→ 游戏，把握低、排在最后；说明里有流量、零食这类词时不算（那些词前面已经认过了）
      var gwText = cc + ' ' + cp + ' ' + (r.desc || '');
      if (gameOn && gameHit(G.weak, gwText) && !gameHit(G.notWith, gwText)) return { cat: G.cat, layer: 'builtin', conf: 'low', reason: '内置（「礼包」多半是游戏）→ ' + G.cat };
      // 1024-W / 1024-X：和个人之间的、前面都没认出来的：不推荐（不默认归转账，免得一键把午饭这类确认成转账），只标 person 和种类，确认页按种类各成一组
      if (pr) return { cat: '未分类', layer: 'none', conf: null, reason: '和个人之间的钱，没找到依据', person: true, psub: personSub(r) };
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
      // 导入简化 2b：新老用户统一：这次至少 3 笔落进去的直接建；不到 3 笔的并进「其他」这类已有分类（没有就未分类），导进去标「待确认分类」
      //   （原来老用户默认不建、落「未分类」）
      return { name: name, count: n, defaultOn: n >= NEW_CAT_MIN,
               mergeInto: n >= NEW_CAT_MIN ? null : (other || '未分类') };
    }).sort(function (a, b) { return b.count - a.count; });
    var plan = {}; newCats.forEach(function (c) { plan[c.name] = c; });
    var recs = raw.map(function (x) {
      var o = { cat: x.cat, want: x.want || x.cat, layer: x.layer, conf: x.conf, reason: x.reason };
      if (x.kw) o.kw = x.kw;          // 1016-Y：命中的是你的哪条规则（确认页改了分类时问「以后都改吗」）
      if (x.on) o.on = x.on;          // 导入简化第 9 版：认商品说明的规则
      if (x.person) { o.person = true; o.psub = x.psub || 'other'; }  // 1024-W / X：和个人之间的（确认页按种类归组）
      if (!x.cat) {
        var p = plan[x.want];
        o.newCat = x.want;
        o.cat = p.defaultOn ? x.want : (p.mergeInto || '未分类');
      }
      return o;
    });
    return { recs: recs, newCats: newCats };
  }

  return { VERSION: VERSION, cleanCp: cleanCp, classify: classify, land: land, aliWant: aliWant, pettyCat: pettyCat, isPlatform: isPlatform,
           PLATFORMS: PLATFORMS, NEW_CAT_MIN: NEW_CAT_MIN };
});
