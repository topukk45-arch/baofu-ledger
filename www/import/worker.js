// 记问 · 账单导入 · 后台线程（Web Worker）
// 主页面用 new Worker('import/worker.js') 起它（地址相对 import.js 自己算，见 import.js）。
//
// 【消息格式】
//   主页面 → 线程：{ id, cmd, data }
//     data 是文本，或 ArrayBuffer（主页面用 transfer 交过来，不复制；交过来以后主页面那边的就空了），
//     或 { files: [{ name, data: ArrayBuffer }] }（1015-C 起，解析账单用；里面的 ArrayBuffer 也都是交过来的）。
//     以后 GBK 解码、xlsx 解压都在这里做，所以字节原样交给线程。
//   线程 → 主页面：
//     { type:'ready', core }                       脚本都载入了，可以干活（主页面靠它分清「起不来」和「算出错」）
//     { id, type:'progress', done, total }
//     { id, type:'done', result }
//     { id, type:'error', name, message }          算的时候出错，原样报回去；主页面不会换到主线程重算
//   取消：主页面直接 terminate() 这个线程，下次用时重新起一个。
importScripts('core.js', 'merchants.js', 'vendor/tiny-inflate.js', 'parse.js', 'route.js');

(function () {
  'use strict';
  var core = self.JiwenImportCore;
  var ctx = { merchants: self.JiwenImportMerchants, parse: self.JiwenImportParse, route: self.JiwenImportRoute };

  self.onmessage = function (e) {
    var m = e.data || {};
    var id = m.id;
    try {
      var result = core.run(m.cmd, m.data, function (done, total) {
        self.postMessage({ id: id, type: 'progress', done: done, total: total });
      }, ctx);
      self.postMessage({ id: id, type: 'done', result: result });
    } catch (err) {
      self.postMessage({
        id: id, type: 'error',
        name: (err && err.name) || 'Error',
        message: String(err && err.message !== undefined ? err.message : err)
      });
    }
  };

  self.postMessage({ type: 'ready', core: core.VERSION });
})();
