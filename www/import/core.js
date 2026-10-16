// 记问 · 账单导入 · 纯计算部分
// 以后的解析、配对、分类都放在这个文件（或同样写法的兄弟文件）里。
//
// 【规矩】
//   1. 只做计算：不碰页面（document / window）、不碰存储（localStorage / IndexedDB）、不发网络请求。
//      输入是参数，输出是返回值；要报进度就调传进来的回调。
//   2. 同一份文件三处都能用：
//        浏览器主页面：<script src="import/core.js"> 后是全局变量 JiwenImportCore（只在后台线程起不来时才这么用）；
//        后台线程：worker.js 里 importScripts('core.js')，同样是 JiwenImportCore；
//        Node 测试：require('../www/import/core.js')，不需要 jsdom。
//   3. 金额以后一律按「分」的整数算（见需求「导入稳定性」第 4 条）。
//
// 1015-A（第一期 ① 骨架）：只有一个占位函数 countLines，用来验证「主页面 → 后台线程 → 结果 / 进度」这条路是通的。
// 1015-C（第一期 ③ 解析）：解析在兄弟文件 parse.js 里，这里只分派命令 parse（ctx.parse 由线程 / 主线程兜底传进来）。
// 1015-D（第一期 ④ 定去向）：定去向在 route.js 里，命令 route。
// 1016-A（第一期 ⑤ 配对与分类）：在 match.js / classify.js 里，命令 match。
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else root.JiwenImportCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1016-C';
  // 每处理这么多个字符 / 字节报一次进度
  var STEP = 1 << 16;

  // 不用 instanceof：页面、线程、Node 测试里的 ArrayBuffer 可能来自不同的全局环境
  function tagOf(x) { return Object.prototype.toString.call(x); }
  function isBytes(x) { return tagOf(x) === '[object ArrayBuffer]' || tagOf(x) === '[object Uint8Array]'; }

  // 数一数有多少行（占位）。
  //   data：文本，或字节（ArrayBuffer / Uint8Array，不解码，直接数换行字节 0x0A——UTF-8 和 GBK 里换行都是这个字节）
  //   onProgress(done, total)：可不传；最后一次一定是 done === total
  //   行的算法：「\n」和「\r\n」都算一个换行；最后一行没有换行也算一行；空内容 0 行。
  function countLines(data, onProgress) {
    var total, lines = 0, last, i, end;
    var report = typeof onProgress === 'function' ? onProgress : null;
    if (typeof data === 'string') {
      total = data.length;
      for (i = 0; i < total; i = end) {
        end = Math.min(total, i + STEP);
        for (var j = i; j < end; j++) if (data.charCodeAt(j) === 10) lines++;
        if (report) report(end, total);
      }
      last = total ? data.charCodeAt(total - 1) : 10;
    } else if (isBytes(data)) {
      var u8 = tagOf(data) === '[object Uint8Array]' ? data : new Uint8Array(data);
      total = u8.length;
      for (i = 0; i < total; i = end) {
        end = Math.min(total, i + STEP);
        for (var k = i; k < end; k++) if (u8[k] === 10) lines++;
        if (report) report(end, total);
      }
      last = total ? u8[total - 1] : 10;
    } else {
      throw new TypeError('countLines 只收文本或字节（ArrayBuffer），收到的是 ' + (data === null ? 'null' : typeof data));
    }
    if (total === 0) { if (report) report(0, 0); return { lines: 0, size: 0 }; }
    if (last !== 10) lines++;
    return { lines: lines, size: total };
  }

  // 后台线程和主线程兜底都走这个入口：按命令名分派。
  //   ctx：线程里能拿到的附加数据（比如内置词表），纯计算函数需要什么就从这里取
  var COMMANDS = {
    countLines: function (data, onProgress) { return countLines(data, onProgress); },
    info: function (data, onProgress, ctx) {
      var m = ctx && ctx.merchants;
      return { core: VERSION, merchants: m && m.items ? m.items.length : 0, parse: ctx && ctx.parse ? ctx.parse.VERSION : null,
               route: ctx && ctx.route ? ctx.route.VERSION : null, match: ctx && ctx.match ? ctx.match.VERSION : null };
    },
    // 主页面要查单号表 / 账本之前，先问线程这一批要查什么（route.js / match.js 主页面不载入）
    lookups: function (data, onProgress, ctx) { return ctx.route.lookups(data && data.parsed); },
    ledgerQuery: function (data, onProgress, ctx) { return ctx.match.ledgerQuery(data && data.routed, data && data.parsed); },
    // 配对与分类：data = { routed, parsed, manual, refundCands, cats, rules, isNewUser }，见 match.js
    //   （manual、refundCands 由主页面按 match.ledgerQuery 从账本里取出来；内置词表线程里自己有）
    match: function (data, onProgress, ctx) {
      if (!ctx || !ctx.match) throw new Error('配对模块没有载入');
      data = data || {};
      var r = ctx.match.match(data.routed, data.parsed, { manual: data.manual, refundCands: data.refundCands, cats: data.cats,
        rules: data.rules, isNewUser: data.isNewUser, merchants: ctx.merchants });
      if (onProgress) onProgress(1, 1);
      return r;
    },
    // 定去向：data = { parsed: parse 的结果, known, rules }，见 route.js（known 由主页面查好单号表和账本拼出来）
    route: function (data, onProgress, ctx) {
      if (!ctx || !ctx.route) throw new Error('定去向模块没有载入');
      var r = ctx.route.route(data && data.parsed, { known: data && data.known, rules: data && data.rules });
      if (onProgress) onProgress(1, 1);
      return r;
    },
    // 解析账单：data = { files: [{ name, data: ArrayBuffer }] }，见 parse.js
    parse: function (data, onProgress, ctx) {
      if (!ctx || !ctx.parse) throw new Error('解析模块没有载入');
      return ctx.parse.parseFiles(data && data.files, onProgress);
    }
  };

  function run(cmd, data, onProgress, ctx) {
    if (!Object.prototype.hasOwnProperty.call(COMMANDS, cmd)) throw new Error('不认识的命令：' + cmd);
    return COMMANDS[cmd](data, onProgress, ctx);
  }

  return { VERSION: VERSION, countLines: countLines, run: run, commands: Object.keys(COMMANDS) };
});
