// 1015-A 起导入代码在 www/import/ 下，单独成文件、按需加载。这里给测试准备两样东西：
//
//   interceptor(wwwDir, log, opts)：给 jsdom 的「资源读取器」。jsdom 默认不加载外部脚本，
//     用法：new JSDOM(html, { runScripts:'dangerously', url:'https://localhost/', resources:{ interceptors:[ interceptor(dir, log) ] } })
//     把 https://localhost/<路径> 映射到 wwwDir/<路径>，和安卓上 Capacitor 的地址一样；
//     每个请求的路径记进 log（测「启动时没去加载 import/」用）；文件不存在或 opts.missing(路径) 为真时回 404。
//
//   makeFakeWorker(wwwDir, opts)：假的 Worker 类（jsdom 和 Node 都没有 Web Worker）。
//     在 Node 的 vm 里跑真正的 www/import/worker.js，importScripts 读的是真文件；
//     消息用 structuredClone 传，transfer 的 ArrayBuffer 真的会被交走（发送方那个变空），和浏览器一样。
//     opts.failLoad(文件名) 为真：载入这个文件时出错（模拟「线程脚本没加载上」）。
//     FakeWorker.created：起过的所有线程（测「取消后重新起」用）。
const fs = require('fs'), path = require('path'), vm = require('vm');
const { requestInterceptor } = require('jsdom');

const BASE = 'https://localhost/';

function fileOf(wwwDir, url) {
  if (!url.startsWith(BASE)) return null;
  const rel = decodeURIComponent(url.slice(BASE.length).split(/[?#]/)[0]);
  const p = path.resolve(wwwDir, rel);
  if (!p.startsWith(path.resolve(wwwDir) + path.sep)) return null;
  return { rel, p };
}

function interceptor(wwwDir, log, opts) {
  opts = opts || {};
  return requestInterceptor((request) => {
    const f = fileOf(wwwDir, request.url);
    if (log) log.push(f ? f.rel : request.url);
    if (!f || (opts.missing && opts.missing(f.rel)) || !fs.existsSync(f.p)) {
      return Promise.resolve(new Response('not found', { status: 404 }));
    }
    return Promise.resolve(new Response(fs.readFileSync(f.p), {
      status: 200, headers: { 'Content-Type': 'application/javascript; charset=utf-8' }
    }));
  });
}

function makeFakeWorker(wwwDir, opts) {
  opts = opts || {};
  const created = [];
  const later = fn => setImmediate(fn);
  class FakeWorker {
    constructor(url) {
      const u = new URL(String(url), BASE);
      this.url = u.href;
      this.terminated = false;
      this.onmessage = null;
      this.onerror = null;
      this.received = [];     // 线程收到的消息（transfer 之后的样子）
      created.push(this);
      const g = { console, setTimeout, clearTimeout, URL, Uint8Array, ArrayBuffer, TextDecoder };
      g.self = g;
      g.postMessage = (msg) => {
        if (this.terminated) return;
        const c = structuredClone(msg);
        later(() => { if (!this.terminated && this.onmessage) this.onmessage({ data: c }); });
      };
      g.close = () => { this.terminated = true; };
      g.importScripts = (...names) => {
        names.forEach(n => {
          if (opts.failLoad && opts.failLoad(n)) throw new Error('NetworkError: 没能加载 ' + n);
          const f = fileOf(wwwDir, new URL(n, u).href);
          if (!f || !fs.existsSync(f.p)) throw new Error('NetworkError: 没能加载 ' + n);
          vm.runInContext(fs.readFileSync(f.p, 'utf8'), this.g, { filename: f.p });
        });
      };
      this.g = vm.createContext(g);
      later(() => {
        if (this.terminated) return;
        try {
          const name = path.basename(u.pathname);
          if (opts.failLoad && opts.failLoad(name)) throw new Error('NetworkError: 没能加载 ' + name);
          const f = fileOf(wwwDir, u.href);
          if (!f || !fs.existsSync(f.p)) throw new Error('NetworkError: 没能加载 ' + name);
          vm.runInContext(fs.readFileSync(f.p, 'utf8'), this.g, { filename: f.p });
        } catch (e) { this._error(e); }
      });
    }
    postMessage(msg, transfer) {
      if (this.terminated) return;
      const c = structuredClone(msg, { transfer: transfer || [] });
      this.received.push(c);
      later(() => {
        if (this.terminated) return;
        try { if (typeof this.g.onmessage === 'function') this.g.onmessage({ data: c }); }
        catch (e) { this._error(e); }
      });
    }
    terminate() { this.terminated = true; }
    _error(e) {
      later(() => {
        if (!this.terminated && this.onerror) this.onerror({ message: e && e.message, preventDefault() {} });
      });
    }
  }
  FakeWorker.created = created;
  return FakeWorker;
}

module.exports = { interceptor, makeFakeWorker, BASE };
