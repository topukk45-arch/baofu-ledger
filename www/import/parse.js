// 记问 · 账单导入 · 解析（纯计算，第一期 ③）
// 输入：一个或多个文件的原始字节；输出：每个文件的来源、起止时间、头部统计、统一格式的行，以及「出错」行和原因。
// 只做「读出来」：交易状态、交易类型怎么处理，去重、配对、分类都是后面几步的事。
// 和 core.js 同样的写法：浏览器 / 后台线程里是全局变量 JiwenImportParse，Node 里直接 require；不碰页面、存储、网络。
// 读 xlsx 要用 vendor/tiny-inflate.js（解压），线程里先 importScripts 它，Node 里自动 require。
//
// 一个文件的处理顺序：
//   认格式（PK 开头是压缩包 / xlsx，否则 CSV）→ 解码（先严格 UTF-8，失败再 GB18030，去 BOM）→ 切记录
//   → 找表头（同时有「交易时间」「收/支」「金额…」的那一行）→ 认来源 → 头部统计 → 逐行取值（拼回被拆开的行）
//   → 同单号合并 → 核笔数；多个文件之间按单号去重（先读的为准）。
// 条数守恒：每个文件「rows 里各行的 merged 之和 + errors 条数 + dups 条数 = 表格里的交易笔数」，要和头部「共 N 笔」一样。
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else root.JiwenImportParse = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1015-C';
  var MAX_BYTES = 8 * 1024 * 1024;     // 一份账单文件最大 8MB（沿用现有导入的规定）
  var MAX_ROWS = 50000;                // 一份账单最多 5 万行
  var NOT_BILL = '这不是能识别的微信 / 支付宝账单';

  function inflater() {
    if (typeof JiwenTinyInflate !== 'undefined') return JiwenTinyInflate;   // eslint-disable-line no-undef
    if (typeof require === 'function') return require('./vendor/tiny-inflate.js');
    throw new Error('解压库没有载入');
  }
  function tagOf(x) { return Object.prototype.toString.call(x); }
  function toU8(d) {
    if (tagOf(d) === '[object Uint8Array]') return d;
    if (tagOf(d) === '[object ArrayBuffer]') return new Uint8Array(d);
    if (d && d.buffer && tagOf(d.buffer) === '[object ArrayBuffer]') return new Uint8Array(d.buffer, d.byteOffset, d.byteLength);
    return null;
  }
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  // 去掉首尾空白（含制表符、全角空格、不换行空格）
  function clean(s) { return s == null ? '' : String(s).replace(/^[\s 　﻿]+|[\s 　]+$/g, ''); }
  // 「/」和空一样算没有
  function noneIfSlash(s) { return s === '/' ? '' : s; }

  // ---------- 解码 ----------
  function decodeText(u8) {
    var text, enc;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(u8); enc = 'utf-8'; }
    catch (_) { text = new TextDecoder('gb18030').decode(u8); enc = 'gb18030'; }
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    return { text: text, encoding: enc };
  }

  // ---------- CSV：按正规规则切成记录（引号里的逗号、换行、两个引号算一个）----------
  // 返回 [{ f: [字段原文], line: 这条记录从第几行开始 }]
  function splitCsv(text) {
    var out = [], n = text.length, i = 0, line = 1, rec = [], recLine = 1;
    if (!n) return out;
    for (;;) {
      var v;
      if (i < n && text.charCodeAt(i) === 34 /* " */) {
        // 带引号的字段：到下一个单独的引号为止，两个引号算一个
        v = ''; var j = i + 1;
        for (;;) {
          var q = text.indexOf('"', j);
          if (q < 0) { v += text.slice(j); i = n; break; }          // 引号没合上：剩下的全算这个字段
          v += text.slice(j, q);
          if (text.charCodeAt(q + 1) === 34) { v += '"'; j = q + 2; continue; }
          i = q + 1; break;
        }
        line += countNl(v);
        // 引号合上以后、分隔符之前还有字（不规范）：照收
        var k = i;
        while (k < n) { var d = text.charCodeAt(k); if (d === 44 || d === 10 || d === 13) break; k++; }
        if (k > i) { v += text.slice(i, k); i = k; }
      } else {
        var k2 = i;
        while (k2 < n) { var e = text.charCodeAt(k2); if (e === 44 || e === 10 || e === 13) break; k2++; }
        v = text.slice(i, k2); i = k2;
      }
      rec.push(v);
      if (i >= n) { out.push({ f: rec, line: recLine }); break; }
      if (text.charCodeAt(i) === 44) { i++; continue; }
      // 换行：\r\n、\n、\r 都算一个
      if (text.charCodeAt(i) === 13 && text.charCodeAt(i + 1) === 10) i += 2; else i++;
      line++;
      out.push({ f: rec, line: recLine }); rec = []; recLine = line;
      if (i >= n) break;
    }
    return out;
  }
  function countNl(s) { var c = 0, p = -1; while ((p = s.indexOf('\n', p + 1)) >= 0) c++; if (!c) { p = -1; while ((p = s.indexOf('\r', p + 1)) >= 0) c++; } return c; }

  // ---------- xlsx：解压 + 边读边取值 ----------
  function u16(b, o) { return b[o] | (b[o + 1] << 8); }
  function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + b[o + 3] * 16777216; }
  // 读压缩包目录：文件名 → { method, csize, usize, off, enc }
  function readZipDir(b) {
    var eocd = -1;
    for (var i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) {
      if (b[i] === 0x50 && b[i + 1] === 0x4b && b[i + 2] === 5 && b[i + 3] === 6) { eocd = i; break; }
    }
    if (eocd < 0) return null;
    var cnt = u16(b, eocd + 10), off = u32(b, eocd + 16), map = {};
    for (var k = 0; k < cnt; k++) {
      if (off + 46 > b.length || u32(b, off) !== 0x02014b50) return null;
      var flags = u16(b, off + 8), method = u16(b, off + 10), csize = u32(b, off + 20), usize = u32(b, off + 24);
      var nl = u16(b, off + 28), xl = u16(b, off + 30), cl = u16(b, off + 32), loff = u32(b, off + 42);
      var name = new TextDecoder('utf-8').decode(b.subarray(off + 46, off + 46 + nl));
      map[name] = { method: method, csize: csize, usize: usize, off: loff, enc: !!(flags & 1) };
      off += 46 + nl + xl + cl;
    }
    return map;
  }
  function zipRead(b, e) {
    if (!e || u32(b, e.off) !== 0x04034b50) throw new Error('zip');
    var start = e.off + 30 + u16(b, e.off + 26) + u16(b, e.off + 28);
    var src = b.subarray(start, start + e.csize);
    if (e.method === 0) return src;
    if (e.method !== 8) throw new Error('zip');
    var out = new Uint8Array(e.usize);
    var got = inflater()(src, out);
    if (got.length !== e.usize) throw new Error('zip');
    return got;
  }
  function zipText(b, dir, name) { return dir[name] ? new TextDecoder('utf-8').decode(zipRead(b, dir[name])) : null; }
  var ENT = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
  function xmlText(s) {
    if (s.indexOf('&') >= 0) s = s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-z]+);/g, function (m, g) {
      if (g[0] === '#') { var cp = g[1] === 'x' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10); return String.fromCodePoint(cp); }
      return ENT[g] !== undefined ? ENT[g] : m;
    });
    // OOXML 里的 _x000D_ 一类转义（回车之类的控制字符）
    if (s.indexOf('_x') >= 0) s = s.replace(/_x([0-9A-Fa-f]{4})_/g, function (m, h) { return String.fromCharCode(parseInt(h, 16)); });
    return s;
  }
  function attr(tag, name) { var m = new RegExp('\\s' + name + '="([^"]*)"').exec(tag); return m ? m[1] : null; }
  // <si> 里所有 <t> 的字拼起来（跳过注音 <rPh>）
  function siText(si) {
    si = si.replace(/<rPh[\s\S]*?<\/rPh>/g, '');
    var out = '', re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g, m;
    while ((m = re.exec(si))) if (m[1] !== undefined) out += xmlText(m[1]);
    return out;
  }
  function colIndex(ref) {
    var n = 0, i = 0;
    for (; i < ref.length; i++) { var c = ref.charCodeAt(i); if (c < 65 || c > 90) break; n = n * 26 + (c - 64); }
    return i ? n - 1 : -1;
  }
  // 读 xlsx 的第一个工作表：返回 { recs: [{ f, line, num }], d1904 }。num[i] 为真表示这一格是数字（时间列要按日期序列号换算）
  function readXlsx(b) {
    var dir = readZipDir(b);
    if (!dir) return { fatal: 'zip' };
    var names = Object.keys(dir);
    if (names.some(function (n) { return dir[n].enc; })) return { fatal: 'encrypted' };
    if (!dir['xl/workbook.xml']) return { fatal: 'notxlsx', names: names };
    var wb = zipText(b, dir, 'xl/workbook.xml');
    var pr = /<workbookPr\b[^>]*>/.exec(wb);
    var d1904 = !!(pr && /date1904="(1|true)"/.test(pr[0]));
    var sheet = /<sheet\b[^>]*>/.exec(wb);
    var target = 'xl/worksheets/sheet1.xml';
    if (sheet) {
      var rid = attr(sheet[0], 'r:id');
      var rels = zipText(b, dir, 'xl/_rels/workbook.xml.rels') || '';
      var re = /<Relationship\b[^>]*>/g, m;
      while ((m = re.exec(rels))) {
        if (attr(m[0], 'Id') === rid) {
          var t = attr(m[0], 'Target');
          target = t[0] === '/' ? t.slice(1) : 'xl/' + t.replace(/^\.\//, '');
          break;
        }
      }
    }
    if (!dir[target]) return { fatal: 'notxlsx', names: names };
    var ss = [];
    var sst = zipText(b, dir, 'xl/sharedStrings.xml');
    if (sst) { var rs = /<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g, sm; while ((sm = rs.exec(sst))) ss.push(sm[1] === undefined ? '' : siText(sm[1])); }
    var xml = zipText(b, dir, target);
    var recs = [], pos = 0;
    for (;;) {
      var rs0 = xml.indexOf('<row', pos);
      if (rs0 < 0) break;
      var rt = xml.indexOf('>', rs0);
      var rowTag = xml.slice(rs0, rt + 1);
      var rnum = +(attr(rowTag, 'r') || (recs.length ? recs[recs.length - 1].line + 1 : 1));
      var f = [], num = [];
      if (rowTag[rowTag.length - 2] === '/') { pos = rt + 1; recs.push({ f: f, line: rnum, num: num }); continue; }
      var re0 = xml.indexOf('</row>', rt);
      var body = xml.slice(rt + 1, re0 < 0 ? xml.length : re0);
      pos = re0 < 0 ? xml.length : re0 + 6;
      var cp = 0, next = 0;
      for (;;) {
        var cs = body.indexOf('<c', cp);
        if (cs < 0) break;
        var ct = body.indexOf('>', cs);
        var cellTag = body.slice(cs, ct + 1);
        var r = attr(cellTag, 'r'), ty = attr(cellTag, 't');
        var ci = r ? colIndex(r) : next;
        if (ci < 0) ci = next;
        var v = '', isNum = false;
        if (cellTag[cellTag.length - 2] === '/') { cp = ct + 1; }
        else {
          var ce = body.indexOf('</c>', ct);
          var inner = body.slice(ct + 1, ce < 0 ? body.length : ce);
          cp = ce < 0 ? body.length : ce + 4;
          if (ty === 'inlineStr') v = siText(inner);
          else {
            var vm = /<v>([\s\S]*?)<\/v>/.exec(inner);
            var raw = vm ? xmlText(vm[1]) : '';
            if (ty === 's') v = ss[+raw] !== undefined ? ss[+raw] : '';
            else if (ty === 'str' || ty === 'e') v = raw;
            else if (ty === 'b') v = raw === '1' ? 'TRUE' : 'FALSE';
            else { v = raw; isNum = raw !== ''; }
          }
        }
        while (f.length < ci) { f.push(''); num.push(false); }
        f[ci] = v; num[ci] = isNum;
        next = ci + 1;
      }
      recs.push({ f: f, line: rnum, num: num });
    }
    return { recs: recs, d1904: d1904 };
  }

  // ---------- 时间 ----------
  function isLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }
  function dim(y, m) { return [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]; }
  function mkTime(y, mo, d, h, mi, s) {
    if (!(y >= 1990 && y <= 2100 && mo >= 1 && mo <= 12 && d >= 1 && d <= dim(y, mo) && h >= 0 && h <= 23 && mi >= 0 && mi <= 59 && (s === null || (s >= 0 && s <= 59)))) return null;
    return { date: y + '-' + pad2(mo) + '-' + pad2(d), hm: pad2(h) + ':' + pad2(mi), sec: s };
  }
  // 文字时间：按几种写法依次试，不交给浏览器猜（不同内核猜法不同，还会按设备时区换算）
  //   2026-10-15 17:22:05 / 2026-10-15 17:22 / 2026/10/15 17:22（Excel 改过的）/ 2026/1/5 7:02 / 2026-10-15T17:22:05 / 2026.10.15 17:22
  var TIME_RE = /^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?:[ T]+|\s*)(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/;
  function parseTimeText(s) {
    var m = TIME_RE.exec(s);
    if (!m) return null;
    return mkTime(+m[1], +m[2], +m[3], +m[4], +m[5], m[6] === undefined ? null : +m[6]);
  }
  // 天数（从 1970-01-01 算）→ 年月日。整数算法（Howard Hinnant 的 civil_from_days），不经过 Date，不受设备时区影响
  function civil(z) {
    z += 719468;
    var era = Math.floor(z / 146097), doe = z - era * 146097;
    var yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
    var y = yoe + era * 400, doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
    var mp = Math.floor((5 * doy + 2) / 153), d = doy - Math.floor((153 * mp + 2) / 5) + 1, m = mp < 10 ? mp + 3 : mp - 9;
    return [m <= 2 ? y + 1 : y, m, d];
  }
  // Excel 日期序列号 → 年月日时分秒，直接按数字算。
  //   起点取 1899-12-30（序列号 0）：Excel 为了兼容 Lotus 1-2-3，把 1900 年当成闰年、多出一个不存在的 1900-02-29（序列号 60），
  //   从 1899-12-30 起算正好绕开这个错误，序列号 61 以后的日期全都对（账单不会有 1900 年 3 月以前的日期）。
  //   1904 日期制（老 Mac 版 Excel）的序列号 0 是 1904-01-01，比 1900 制少 1462 天。
  function serialToTime(v, d1904) {
    var x = Number(v);
    if (!isFinite(x) || x <= 60) return null;
    var days = Math.floor(x), secs = Math.round((x - days) * 86400);
    if (secs >= 86400) { days++; secs -= 86400; }
    if (d1904) days += 1462;
    var ymd = civil(days - 25569);                 // 1899-12-30 到 1970-01-01 是 25569 天
    return mkTime(ymd[0], ymd[1], ymd[2], Math.floor(secs / 3600), Math.floor(secs % 3600 / 60), secs % 60);
  }

  // ---------- 金额：去 ¥ 和千分位，转成整数分 ----------
  function parseFen(s) {
    var t = String(s).replace(/[¥￥\s,，元]/g, '').replace(/^\+/, '');
    if (!/^\d+(\.\d+)?$/.test(t)) return null;
    var x = Number(t) * 100, f = Math.round(x);
    if (Math.abs(x - f) > 1e-6 || f > 1e13) return null;    // 多于两位小数（不是钱）、或者大得离谱
    return f;
  }

  // ---------- 单号 ----------
  var SCI_RE = /^[+-]?\d+(\.\d+)?[eE][+-]?\d+$/;
  // 只取开头连续的数字字母；后面接的若还是单号样的字符（_ - * # . / 加数字字母，比如退款单号的后缀），算单号的一部分；
  // 若是带空格、中文一类的说明文字（比如外币金额），挪进备注
  function splitNo(raw) {
    var m = /^[0-9A-Za-z]+/.exec(raw), head = m ? m[0] : '', rest = raw.slice(head.length);
    if (!head) return { no: '', noRest: '', note: raw };
    if (/^[_\-*#.\/][0-9A-Za-z_\-*#.\/]*$/.test(rest)) return { no: head, noRest: rest, note: '' };
    return { no: head, noRest: '', note: clean(rest) };
  }

  // ---------- 表头 ----------
  function normName(s) { return clean(s).replace(/\s+/g, '').replace(/（/g, '(').replace(/）/g, ')'); }
  var COLS = {
    time: ['交易时间'], io: ['收/支', '收支'], kind: ['交易分类', '交易类型'], cp: ['交易对方'],
    desc: ['商品说明', '商品', '商品名称'], pm: ['收/付款方式', '支付方式', '收付款方式'],
    status: ['交易状态', '当前状态'], no: ['交易订单号', '交易单号', '订单号'], mno: ['商家订单号', '商户单号'], remark: ['备注']
  };
  function isHeader(f) {
    var hasT = false, hasIo = false, hasAmt = false;
    for (var i = 0; i < f.length; i++) {
      var n = normName(f[i]);
      if (n === '交易时间') hasT = true; else if (n === '收/支' || n === '收支') hasIo = true; else if (n.indexOf('金额') === 0) hasAmt = true;
    }
    return hasT && hasIo && hasAmt;
  }
  function mapCols(hdr) {
    var names = hdr.map(normName), idx = {};
    Object.keys(COLS).forEach(function (k) {
      for (var a = 0; a < COLS[k].length && idx[k] === undefined; a++) { var i = names.indexOf(COLS[k][a]); if (i >= 0) idx[k] = i; }
    });
    for (var i = 0; i < names.length; i++) if (names[i].indexOf('金额') === 0) { idx.amount = i; break; }
    var app = null;
    if (names.indexOf('交易订单号') >= 0 || (names.indexOf('交易分类') >= 0 && names.indexOf('收/付款方式') >= 0)) app = 'alipay';
    else if (names.indexOf('交易单号') >= 0 || names.indexOf('交易类型') >= 0) app = 'wechat';
    return { idx: idx, app: app };
  }
  function trimTail(f) { var n = f.length; while (n > 0 && clean(f[n - 1]) === '') n--; return n; }

  // ---------- 头部统计 ----------
  function parseStats(lines) {
    var text = lines.join('\n');
    function grab(re) { var m = re.exec(text); return m ? { n: +m[1], fen: parseFen(m[2]) } : null; }
    var h = {
      total: (function () { var m = /共\s*(\d+)\s*笔/.exec(text); return m ? +m[1] : null; })(),
      income: grab(/收入[：:]?\s*(\d+)\s*笔\s*([0-9,，.]+)\s*元/),
      expense: grab(/支出[：:]?\s*(\d+)\s*笔\s*([0-9,，.]+)\s*元/),
      neutral: grab(/(?:中性交易|不计收支)[：:]?\s*(\d+)\s*笔\s*([0-9,，.]+)\s*元/)
    };
    var range = null;
    var T = '(\\d{4}[-\\/.]\\d{1,2}[-\\/.]\\d{1,2}[ T]+\\d{1,2}:\\d{2}(?::\\d{2})?)';
    var ma = new RegExp('起始时间[：:]?\\s*\\[?\\s*' + T).exec(text), mb = new RegExp('终止时间[：:]?\\s*\\[?\\s*' + T).exec(text);
    if (ma && mb) {
      var a = parseTimeText(ma[1]), b = parseTimeText(mb[1]);
      if (a && b) range = { from: a.date + ' ' + a.hm + ':' + pad2(a.sec || 0), to: b.date + ' ' + b.hm + ':' + pad2(b.sec === null ? 59 : b.sec) };
    }
    var app = /支付宝/.test(text) ? 'alipay' : /微信/.test(text) ? 'wechat' : null;
    return { header: h, range: range, appHint: app };
  }

  // ---------- 一份文件 ----------
  function fatal(file, code, msg, header) {
    file.fatal = { code: code, msg: msg, header: header || null };
    return file;
  }
  function parseOne(name, data, report) {
    var file = { name: name, app: null, format: null, encoding: null, range: null,
                 stats: null, header: null, rows: [], errors: [], dups: [], fatal: null, blocking: false };
    var recs, d1904 = false, isX = false;
    if (typeof data === 'string') {
      file.format = 'csv'; file.encoding = 'text';
      if (data.length > MAX_BYTES) return fatal(file, 'toolarge', '文件太大（超过 8MB）');
      recs = splitCsv(data.charCodeAt(0) === 0xfeff ? data.slice(1) : data);
    } else {
      var u8 = toU8(data);
      if (!u8) return fatal(file, 'nodata', '没有读到文件内容');
      if (u8.length > MAX_BYTES) return fatal(file, 'toolarge', '文件太大（超过 8MB）');
      if (u8[0] === 0x50 && u8[1] === 0x4b) {
        file.format = 'xlsx'; file.encoding = 'utf-8'; isX = true;
        var x;
        try { x = readXlsx(u8); } catch (_) { x = { fatal: 'zip' }; }
        if (x.fatal === 'encrypted') return fatal(file, 'encrypted', '压缩包有密码，请先解压，再选里面的账单文件');
        if (x.fatal === 'notxlsx') return fatal(file, 'zip', '这是一个压缩包，请先解压，再选里面的账单文件');
        if (x.fatal) return fatal(file, 'zip', NOT_BILL + '（文件读不出来，可能坏了）');
        recs = x.recs; d1904 = x.d1904;
      } else {
        file.format = 'csv';
        var dec = decodeText(u8);
        file.encoding = dec.encoding;
        recs = splitCsv(dec.text);
      }
    }
    // 找表头
    var hi = -1;
    for (var i = 0; i < recs.length; i++) if (isHeader(recs[i].f)) { hi = i; break; }
    if (hi < 0) return fatal(file, 'noheader', NOT_BILL + '（没找到「交易时间、收/支、金额」这一行表头）');
    var hdrRaw = recs[hi].f, H = trimTail(hdrRaw);
    var hdr = hdrRaw.slice(0, H).map(clean);
    file.header = hdr;
    var cm = mapCols(hdr), ix = cm.idx;
    var pre = parseStats(recs.slice(0, hi).map(function (r) { return r.f.map(clean).filter(Boolean).join(' '); }));
    file.app = cm.app || null;
    if (!file.app) return fatal(file, 'unknown', NOT_BILL + '（认不出是微信还是支付宝的）', hdr);
    var miss = ['time', 'io', 'amount'].filter(function (k) { return ix[k] === undefined; });
    if (miss.length) return fatal(file, 'missing', NOT_BILL + '（缺了「' + miss.map(function (k) { return { time: '交易时间', io: '收/支', amount: '金额' }[k]; }).join('、') + '」）', hdr);
    file.range = pre.range;
    // 表头以下的数据行：跳过空行；碰到分隔线（一格、以 - 开头）就到底了（后面是页脚）
    var data0 = [];
    for (var j = hi + 1; j < recs.length; j++) {
      var f = recs[j].f, t = trimTail(f);
      if (t === 0) continue;
      if (t === 1 && /^[-—=]{3,}/.test(clean(f[0]))) break;
      data0.push(recs[j]);
    }
    if (data0.length > MAX_ROWS) return fatal(file, 'toomany', '一份账单最多 5 万行，这份有 ' + data0.length + ' 行', hdr);
    // 前 3 行数据的列数对不上，整份不认（见下面 rowOf 里怎么算「对不上」）
    var HR = hdrRaw.length;
    //   被不带引号的换行拆开、能和前后一行拼回去的不算
    for (var p = 0; p < Math.min(3, data0.length); p++) {
      if (badCols(data0[p]) && !(p + 1 < data0.length && join(data0[p], data0[p + 1])) && !(p > 0 && join(data0[p - 1], data0[p])))
        return fatal(file, 'columns', NOT_BILL + '（数据的列数和表头对不上）', hdr);
    }
    // 科学计数法：交易单号、商户单号两列出现就说明被 Excel 另存过，长单号已经丢了精度
    for (var s = 0; s < data0.length; s++) {
      var ff = data0[s].f;
      if ((ix.no !== undefined && SCI_RE.test(clean(ff[ix.no]))) || (ix.mno !== undefined && SCI_RE.test(clean(ff[ix.mno]))))
        return fatal(file, 'excel', '这份账单被 Excel 打开另存过，长单号变成了科学计数法（比如 4.2E+27），没法去重。请重新从' + (file.app === 'alipay' ? '支付宝' : '微信') + '导出，导出后别用 Excel 打开', hdr);
    }
    // 逐行取值
    var rangeFrom = file.range ? file.range.from : null, rangeTo = file.range ? file.range.to : null;
    // 列数对不上：去掉末尾空列后比表头多（支付宝每行末尾多一个空列，所以先去掉再比）；
    //   或者中间多出了几列、末尾那几列正好是空的（去掉末尾空列看不出来）：这时按原始列数比，而且这一行本身读不通才算
    function badCols(rec) {
      if (trimTail(rec.f) > H) return true;
      return rec.f.length !== HR && !!rowOf0(rec).err;
    }
    function rowOf(rec) {
      var f = rec.f;
      if (trimTail(f) > H) return { err: 'columns', msg: '这一行比表头多出 ' + (trimTail(f) - H) + ' 列' };
      var r = rowOf0(rec);
      if (r.err && f.length !== HR) return { err: 'columns', msg: '这一行有 ' + f.length + ' 列，和表头的 ' + HR + ' 列对不上（' + r.msg + '）' };
      return r;
    }
    function rowOf0(rec) {
      var f = rec.f;
      var g = function (k) { return ix[k] === undefined ? '' : clean(f[ix[k]]); };
      var tm = null, rawT = g('time');
      if (isX && rec.num && rec.num[ix.time]) tm = serialToTime(f[ix.time], d1904);
      else tm = parseTimeText(rawT);
      if (!tm) return { err: 'time', msg: '交易时间读不出来：' + (rawT || '（空）') };
      var fen = parseFen(g('amount'));
      if (fen === null) return { err: 'amount', msg: '金额读不出来：' + (g('amount') || '（空）') };
      var ioRaw = g('io'), io = ioRaw === '收入' ? 'income' : ioRaw === '支出' ? 'expense' : (ioRaw === '不计收支' || ioRaw === '/') ? 'neutral' : null;
      if (!io) return { err: 'io', msg: '收/支读不出来：' + (ioRaw || '（空）') };
      var full = tm.date + ' ' + tm.hm + ':' + pad2(tm.sec === null ? 0 : tm.sec);
      if (rangeFrom) {
        var okR = tm.sec === null
          ? (tm.date + ' ' + tm.hm >= rangeFrom.slice(0, 16) && tm.date + ' ' + tm.hm <= rangeTo.slice(0, 16))
          : (full >= rangeFrom && full <= rangeTo);
        if (!okR) return { err: 'range', msg: '交易时间 ' + full.slice(0, 16) + ' 不在账单的起止时间里' };
      }
      var sn = splitNo(g('no'));
      var remark = [noneIfSlash(g('remark')), sn.note].filter(Boolean).join(' ');
      return { row: { line: rec.line, time: tm.date + 'T' + tm.hm, sec: tm.sec, fen: fen, io: io,
        status: noneIfSlash(g('status')), kind: noneIfSlash(g('kind')), cp: noneIfSlash(g('cp')), desc: noneIfSlash(g('desc')),
        pm: noneIfSlash(g('pm')), no: sn.no, noRest: sn.noRest, noNote: sn.note, remark: remark, merged: 1, mno: noneIfSlash(g('mno')) } };   // 1021-T2：商家订单号只留在内存里配退款的原单，照旧不存   // noNote：单号后面挪进备注的附加信息（1016-B，确认页标出来）
    }
    // 不带引号的换行把一行拆成了两行：相邻两行列数加起来（减去断开的那一格）正好等于表头列数，拼起来能读通，就拼回去
    function join(a, b) {
      if (isX || a.f.length + b.f.length - 1 !== HR) return null;
      var f = a.f.slice(0, -1).concat([a.f[a.f.length - 1] + '\n' + b.f[0]], b.f.slice(1));
      var r = rowOf({ f: f, line: a.line });
      if (!r.row) return null;
      r.row.joined = true; r.row.lines = [a.line, b.line];
      return r.row;
    }
    var rows = [], errs = [], lastOk = -1;
    for (var q = 0; q < data0.length; q++) {
      if (report && q % 5000 === 0) report(q, data0.length);
      var r = rowOf(data0[q]);
      if (r.row) { rows.push(r.row); lastOk = q; continue; }
      // 先试和下一行拼
      if (q + 1 < data0.length) {
        var jn = join(data0[q], data0[q + 1]);
        if (jn) { rows.push(jn); lastOk = q + 1; q++; continue; }
      }
      // 再试和上一行拼（断在最后几列时，上一行自己也能读通）
      if (lastOk === q - 1 && rows.length && !rows[rows.length - 1].joined) {
        var jp = join(data0[q - 1], data0[q]);
        if (jp) { rows[rows.length - 1] = jp; continue; }
      }
      errs.push({ line: data0[q].line, code: r.err, msg: r.msg, raw: data0[q].f.slice(0, trimTail(data0[q].f)) });
    }
    // 同单号合并：同来源、同单号、同收支、同一分钟的合成一条，金额相加，支付方式用 & 连起来；完全一样的两行算重复
    var byKey = new Map(), merged = [];
    rows.forEach(function (row) {
      if (!row.no) { merged.push(row); return; }
      var key = row.no + row.noRest + '|' + row.io + '|' + row.time;
      var prev = byKey.get(key);
      if (!prev) { byKey.set(key, row); merged.push(row); return; }
      if (prev.merged === 1 && sameRow(prev, row)) { file.dups.push({ line: row.line, no: row.no + row.noRest, inFile: name, why: 'same', io: row.io, fen: row.fen }); return; }
      prev.fen += row.fen; prev.merged += 1;
      if (row.pm && prev.pm.split('&').indexOf(row.pm) < 0) prev.pm = prev.pm ? prev.pm + '&' + row.pm : row.pm;
      prev.lines = (prev.lines || [prev.line]).concat(row.lines || [row.line]);
    });
    file.rows = merged;
    file.errors = errs;
    // 头部统计 vs 实际
    var units = 0, P = { total: 0, income: { n: 0, fen: 0 }, expense: { n: 0, fen: 0 }, neutral: { n: 0, fen: 0 } };
    merged.forEach(function (row) { P[row.io].n += row.merged; P[row.io].fen += row.fen; units += row.merged; });
    file.dups.forEach(function (d) { P[d.io].n++; P[d.io].fen += d.fen; units++; });
    units += errs.length;
    P.total = units;
    file.stats = { header: pre.header, parsed: P, countOk: pre.header.total === null ? null : pre.header.total === units };
    if (file.stats.countOk === false) file.blocking = true;
    return file;
  }
  function sameRow(a, b) {
    return a.time === b.time && a.sec === b.sec && a.fen === b.fen && a.io === b.io && a.status === b.status && a.kind === b.kind
      && a.cp === b.cp && a.desc === b.desc && a.pm === b.pm && a.remark === b.remark;
  }

  // ---------- 多个文件 ----------
  //   files：[{ name, data: ArrayBuffer | Uint8Array | 文本 }]；onProgress(已处理字节, 总字节)
  //   先读的文件为准：后面的文件里同来源、同单号、同收支、同一分钟的行挪进 dups（记下在哪份文件里重复）
  function parseFiles(files, onProgress) {
    files = Array.isArray(files) ? files : [];
    var sizes = files.map(function (f) { var u = toU8(f && f.data); return u ? u.length : (typeof (f && f.data) === 'string' ? f.data.length : 0); });
    var total = sizes.reduce(function (s, x) { return s + x; }, 0), done = 0;
    var seen = new Map(), out = [];
    files.forEach(function (fobj, k) {
      var name = (fobj && typeof fobj.name === 'string' && fobj.name) || ('文件' + (k + 1));
      var base = done;
      var rep = onProgress ? function (a, b) { onProgress(base + Math.floor(sizes[k] * a / Math.max(1, b)), total); } : null;
      var file = parseOne(name, fobj && fobj.data, rep);
      if (!file.fatal) {
        var keep = [];
        file.rows.forEach(function (row) {
          if (!row.no) { keep.push(row); return; }
          var key = file.app + '|' + row.no + row.noRest + '|' + row.io + '|' + row.time;
          var at = seen.get(key);
          if (at !== undefined && at !== name) { for (var m = 0; m < row.merged; m++) file.dups.push({ line: row.line, no: row.no + row.noRest, inFile: at, why: 'otherfile', io: row.io, fen: m ? 0 : row.fen }); return; }
          seen.set(key, name); keep.push(row);
        });
        file.rows = keep;
      }
      out.push(file);
      done += sizes[k];
      if (onProgress) onProgress(done, total);
    });
    if (onProgress && !files.length) onProgress(0, 0);
    return { version: VERSION, files: out };
  }

  return { VERSION: VERSION, MAX_BYTES: MAX_BYTES, MAX_ROWS: MAX_ROWS, parseFiles: parseFiles,
    // 下面几个单独导出给测试用
    _splitCsv: splitCsv, _decodeText: decodeText, _parseTimeText: parseTimeText, _serialToTime: serialToTime,
    _parseFen: parseFen, _splitNo: splitNo };
});
