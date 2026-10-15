// 记问 · 账单导入 · 主页面这一侧
// index.html 只在打开导入时才插入这个脚本（loadImportModule），平时启动不加载 import/ 下的任何文件。
// 载入后是全局变量 JiwenImport：
//   JiwenImport.run(cmd, data, { onProgress }) → Promise<{ result, mode }>
//       data：文本，或 ArrayBuffer（用 transfer 交给后台线程，不复制；交出去以后调用方手里的那个就空了），
//             或 { files: [{ name, data: ArrayBuffer }] }（解析账单，里面的 ArrayBuffer 也都交出去）
//       mode：'worker'（后台线程算的）或 'main'（线程起不来，在主线程算的）
//   JiwenImport.cancel()     退出导入页时调：停掉线程，进行中的任务都以「已取消」失败；下次 run 重新起线程
//   JiwenImport.state()      { mode, starts, fallbackReason, busy }（自检和测试用）
//   JiwenImport.selfTest()   通路自检：文本和字节各数一遍行数
//
// 【兜底只管「线程起不来」】没有 Worker、new Worker 报错、线程脚本没加载上（准备好之前就报错 / 超时没准备好），
//   才改在主线程算。线程准备好以后算出错，一律原样报错（reject），不换到主线程重算——
//   重算只会把同一个错误再算一遍，还会把界面卡住。
(function () {
  'use strict';
  if (window.JiwenImport) return;

  var READY_MS = 10000;          // 线程这么久还没说「准备好」，当作起不来
  // import/ 目录的地址：按这个脚本自己的地址算，安卓上就是 https://localhost/import/
  var here = (document.currentScript && document.currentScript.src) || new URL('import/import.js', location.href).href;
  function urlOf(name) { return new URL(name, here).href; }
  function tagOf(x) { return Object.prototype.toString.call(x); }

  var worker = null;             // 准备好的线程
  var starting = null;           // 正在起的线程（还没说准备好）
  var readyP = null;             // 本轮起线程的结果：'worker' | 'main'
  var rejectStarting = null;
  var mode = null, fallbackReason = '', starts = 0;
  var generation = 0;            // 每次 cancel 加一，旧任务的回调认得出自己过期了
  var seq = 0, pending = {};

  function makeError(name, message, extra) {
    var e = new Error(message);
    e.name = name || 'Error';
    if (extra) for (var k in extra) e[k] = extra[k];
    return e;
  }
  function cancelled() { return makeError('AbortError', '已取消', { cancelled: true }); }

  function failAll(err) {
    var ids = Object.keys(pending), list = ids.map(function (id) { return pending[id]; });
    pending = {};
    list.forEach(function (p) { p.reject(err); });
  }

  function onMessage(m) {
    var p = pending[m.id];
    if (!p) return;                         // 已取消的任务，后面的消息不理
    if (m.type === 'progress') { if (p.onProgress) try { p.onProgress(m.done, m.total); } catch (_) {} return; }
    delete pending[m.id];
    if (m.type === 'done') p.resolve({ result: m.result, mode: 'worker' });
    else if (m.type === 'error') p.reject(makeError(m.name, m.message, { fromWorker: true }));
  }

  // 主线程兜底要用的两个脚本
  function loadScript(name) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = urlOf(name);
      s.onload = function () { resolve(); };
      s.onerror = function () { s.remove(); reject(makeError('Error', name + ' 没加载上')); };
      document.head.appendChild(s);
    });
  }
  function loadMain() {
    var need = [['JiwenImportCore', 'core.js'], ['JiwenImportMerchants', 'merchants.js'],
                ['JiwenTinyInflate', 'vendor/tiny-inflate.js'], ['JiwenImportParse', 'parse.js']];
    return need.reduce(function (p, x) {
      return p.then(function () { return window[x[0]] ? null : loadScript(x[1]); });
    }, Promise.resolve());
  }
  function mainCtx() { return { merchants: window.JiwenImportMerchants, parse: window.JiwenImportParse }; }
  // 要交给线程的 ArrayBuffer：data 本身，或 data.files 里每个文件的字节（同一个只交一次）
  function transferOf(data) {
    if (tagOf(data) === '[object ArrayBuffer]') return [data];
    var out = [];
    if (data && Array.isArray(data.files)) data.files.forEach(function (f) {
      if (f && tagOf(f.data) === '[object ArrayBuffer]' && out.indexOf(f.data) < 0) out.push(f.data);
    });
    return out;
  }

  function ensure() {
    if (readyP) return readyP;
    var gen = generation;
    readyP = new Promise(function (resolve, reject) {
      var settled = false;
      rejectStarting = function (err) { if (!settled) { settled = true; reject(err); } };
      function useMain(why) {
        if (settled) return;
        loadMain().then(function () {
          if (settled || gen !== generation) return;
          settled = true; mode = 'main'; fallbackReason = why; resolve('main');
        }, function (err) {
          if (settled) return;
          settled = true; if (gen === generation) readyP = null; reject(err);
        });
      }
      if (typeof Worker === 'undefined') { useMain('这台手机的浏览器内核不支持后台线程'); return; }
      var w;
      try { w = new Worker(urlOf('worker.js')); } catch (err) { useMain('后台线程起不来：' + (err && err.message)); return; }
      starts++;
      starting = w;
      var ready = false;
      var timer = setTimeout(function () {
        if (ready) return;
        try { w.terminate(); } catch (_) {}
        if (starting === w) starting = null;
        useMain('后台线程 ' + (READY_MS / 1000) + ' 秒内没准备好');
      }, READY_MS);
      w.onmessage = function (e) {
        var m = e.data || {};
        if (m.type === 'ready') {
          if (ready || settled) return;
          ready = true; clearTimeout(timer);
          starting = null; worker = w; mode = 'worker'; fallbackReason = '';
          settled = true; resolve('worker');
          return;
        }
        if (worker === w) onMessage(m);
      };
      w.onerror = function (ev) {
        try { if (ev && ev.preventDefault) ev.preventDefault(); } catch (_) {}
        var msg = (ev && ev.message) || '未知错误';
        if (!ready) {
          // 准备好之前出错 = 线程脚本没加载上（文件缺了、importScripts 失败、语法错）
          clearTimeout(timer);
          try { w.terminate(); } catch (_) {}
          if (starting === w) starting = null;
          useMain('后台线程脚本没加载上：' + msg);
          return;
        }
        // 准备好以后线程里冒出没接住的错：原样报给进行中的任务，线程作废，下次重新起
        if (worker !== w) return;
        try { w.terminate(); } catch (_) {}
        worker = null; readyP = null;
        failAll(makeError('Error', '后台线程出错：' + msg, { fromWorker: true }));
      };
    });
    return readyP;
  }

  function run(cmd, data, opts) {
    var onProgress = opts && opts.onProgress;
    var gen = generation;
    return ensure().then(function (how) {
      if (gen !== generation) throw cancelled();
      if (how === 'worker') {
        return new Promise(function (resolve, reject) {
          var id = ++seq;
          pending[id] = { resolve: resolve, reject: reject, onProgress: onProgress };
          var transfer = transferOf(data);
          try { worker.postMessage({ id: id, cmd: cmd, data: data }, transfer); }
          catch (err) { delete pending[id]; reject(err); }
        });
      }
      // 主线程兜底：同一份 core.js，结果一样，只是算的时候界面会停一下
      return new Promise(function (resolve, reject) {
        setTimeout(function () {
          if (gen !== generation) { reject(cancelled()); return; }
          try {
            var r = window.JiwenImportCore.run(cmd, data, onProgress, mainCtx());
            resolve({ result: r, mode: 'main' });
          } catch (err) { reject(err); }
        }, 0);
      });
    });
  }

  function cancel() {
    generation++;
    var w = worker || starting;
    worker = null; starting = null; readyP = null; mode = null;
    if (w) try { w.terminate(); } catch (_) {}
    if (rejectStarting) { rejectStarting(cancelled()); rejectStarting = null; }
    failAll(cancelled());
  }

  function state() {
    return { mode: mode, starts: starts, fallbackReason: fallbackReason, busy: Object.keys(pending).length };
  }

  // 文本转 UTF-8 字节（老内核没有 TextEncoder 时手工转）
  function utf8(s) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s);
    var b = unescape(encodeURIComponent(s)), u = new Uint8Array(b.length);
    for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
    return u;
  }

  // GBK 解码自检用：一份两笔的虚构支付宝账单，GBK 编码（测试里用 tests/helpers/bills.js 生成的）
  var GBK_SAMPLE = 'LS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tDQq1vLP20MXPoqO6DQrQ1cP7o7qy4srU08O7pw0K1qe4trGm1cu7p6O6dGVzdCoqKkBleGFtcGxlLmNvbQ0KxvDKvMqxvOSjulsyMDI2LTAxLTA1IDAwOjAwOjAwXSAgICDW1da5yrG85KO6WzIwMjYtMDEtMDYgMjM6NTk6NTldDQq1vLP2vbvS18Dg0M2julvIq7K/XQ0Ktbyz9sqxvOSjulsyMDI2LTEwLTAxIDEwOjAwOjAwXQ0KubIyscq8x8K8DQrK1cjro7owscogMC4wMNSqDQrWp7P2o7oyscogMjQuNTDUqg0Ksru8xsrV1qejujCxyiAwLjAw1KoNCg0KzNix8Mzhyr6jug0KMS6xvrvYtaXE2sjdv8mx7cP31qe4trGmytzA7cHLz+C52NanuLbJ6sfro6jQ6bm5y7XD96OpDQoyLrG+u9i1pbK71/fOqsrVv+63vbeiu/XSwL7do6jQ6bm5y7XD96OpDQozLtDpubnLtcP3yP0NCjQu0Om5ucu1w/fLxA0KNS7Q6bm5y7XD987lDQo2LtDpubnLtcP3wfkNCjcu0Om5ucu1w/fG3w0KOC7Q6bm5y7XD97DLDQotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS3Wp7i2saajqNbQufqjqc34wue8vMr109DP3rmry74gILXn19O/zbunu9i1pS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLQ0KvbvS18qxvOQsvbvS17fWwOAsvbvS17bUt70sttS3vdXLusUsyczGt8u1w/csytUv1qcsvfC27izK1S+4tr/ut73KvSy9u9LX17TMrCy9u9LXtqm1pbrFLMnMvNK2qbWlusUssbjXoiwNCjIwMjYtMDEtMDUgMDg6MTA6MDAsss3S+8PAyrMsx+C6zLHjwPsscWgqKipAZXhhbXBsZS5jb20s1OeyzSzWp7P2LDYuNTAs0+C27iy9u9LXs8m5piwiMjAyNjAxMDUyMjAwMTQwMDAwMDAwMDAwMDAwMQkiLCIJIiwiCSIsDQoyMDI2LTAxLTA2IDA5OjAwOjAwLLLN0vvDwMqzLNTGyby/p7fILHFoKioqQGV4YW1wbGUuY29tLMTDzPos1qez9iwxOC4wMCzEs9L40NC0otDuv6gsvbvS17PJuaYsIjIwMjYwMTA2MjIwMDE0MDAwMDAwMDAwMDAwMDIJIiwiCSIsIgkiLA0K';
  function b64bytes(s) { var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }

  // 通路自检：一段虚构的账单样子的文本，文本数一遍、转成字节再数一遍，两次都要对；
  //   1015-C：再解析一份 GBK 编码的虚构账单（确认手机的浏览器内核能解 GBK、解析能在线程里跑）
  function selfTest() {
    var rows = ['交易时间,交易对方,收/支,金额'];
    var names = ['青禾便利', '云杉咖啡', '橘子超市', '小满公交'];
    for (var i = 0; i < 11; i++) {
      rows.push('2026-01-' + (i < 9 ? '0' : '') + (i + 1) + ' 08:0' + (i % 10) + ',' + names[i % 4] + ',支出,' + (i + 3) + '.50');
    }
    var text = rows.join('\r\n') + '\r\n';
    var expect = rows.length;
    var t0 = Date.now(), out = { expect: expect };
    return run('info', null).then(function (r) {
      out.mode = r.mode; out.core = r.result.core; out.merchants = r.result.merchants;
      return run('countLines', text);
    }).then(function (r) {
      out.textLines = r.result.lines;
      var buf = utf8(text).buffer;
      out.bytes = buf.byteLength;
      return run('countLines', buf).then(function (r) {
        out.bufferAfter = buf.byteLength;   // 走后台线程时交出去了（不复制），这里是 0
        return r;
      });
    }).then(function (r) {
      out.byteLines = r.result.lines;
      out.byteMode = r.mode;
      return run('parse', { files: [{ name: '自检.csv', data: b64bytes(GBK_SAMPLE).buffer }] });
    }).then(function (r) {
      var f = r.result.files[0];
      out.gbk = { encoding: f.encoding, app: f.app, rows: f.rows.length, cp: f.rows[0] && f.rows[0].cp, countOk: f.stats && f.stats.countOk, fatal: f.fatal && f.fatal.msg };
      out.gbkOk = !f.fatal && f.encoding === 'gb18030' && f.app === 'alipay' && f.rows.length === 2 && f.rows[0].cp === '青禾便利' && f.stats.countOk === true;
      out.ms = Date.now() - t0;
      out.ok = out.textLines === expect && out.byteLines === expect && out.gbkOk;
      return out;
    });
  }

  window.JiwenImport = { run: run, cancel: cancel, state: state, selfTest: selfTest };
})();
