// 1013-D 起账本存在 IndexedDB。jsdom 没有 IndexedDB，测试里装一个纯 JS 的实现（fake-indexeddb）。
//   install(w, factory)：把 IndexedDB 装进页面；传同一个 factory 就是「同一台手机」，重启 App 后账本还在。
//   idle(w)：等页面里进行中的读写、登录、导入都结束（新版有 ledgerIdle；老版本没有就直接返回）。
//   dumpDb(factory)：把库里所有键值读出来（测试「写进去了没有」用）。
const { IDBFactory, IDBKeyRange } = require('fake-indexeddb');

function newPhone(){ return new IDBFactory(); }

function install(w, factory){
  const f = factory || new IDBFactory();
  w.indexedDB = f;
  w.IDBKeyRange = IDBKeyRange;
  // 1013-G：账本里的记录是冻结的，测试里打开「一改就报错」，漏改成「换新对象」的地方会直接红
  w.__LEDGER_STRICT = true;
  return f;
}

async function idle(w){
  // 让出几拍，让 setTimeout(0) 一类排在后面的回调也跑掉
  for (let i = 0; i < 3; i++) {
    const st = w.JiwenStore || w;   // modules 分支 1019-Z4-M5 起 ledgerIdle 在 JiwenStore 上；页面还没跑到 / 老版本单文件时照旧看 window
    if (typeof st.ledgerIdle === 'function') await st.ledgerIdle();
    await new Promise(r => setTimeout(r, 0));
  }
}

function dumpDb(factory){
  return new Promise((resolve, reject) => {
    const req = factory.open('jiwen', 1);
    req.onupgradeneeded = () => { req.result.createObjectStore('kv'); };
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result, out = {};
      const tx = db.transaction('kv', 'readonly'), os = tx.objectStore('kv');
      const cur = os.openCursor();
      cur.onsuccess = () => { const c = cur.result; if (c) { out[c.key] = c.value; c.continue(); } };
      tx.oncomplete = () => { db.close(); resolve(withMerged(out)); };
      tx.onerror = () => reject(tx.error);
    };
  });
}

// 1013-G 起账本按月分块存（led_<账号>_m + led_<账号>_<存档号>_<月份>）。
// 为了让「库里那本账是什么样」的断言照旧好写，dumpDb 额外合成一个 store_<账号>：
// 和 1013-F 整段存的一模一样（meta 里的存档号换回记录数组，按序号排好）。库里真有 store_<账号>（还没搬）就不合成。
// 合成的键不可枚举，Object.keys(db) 看到的仍是库里真实的键。
function withMerged(out){
  const metas = Object.keys(out).filter(k => /^led_.+_m$/.test(k));
  metas.forEach(mk => {
    const id = mk.slice(4, -2);
    if (out['store_' + id] !== undefined) return;
    let meta;
    try { meta = JSON.parse(out[mk]); } catch (_) { return; }
    if (!meta || !meta.archives) return;
    const re = new RegExp('^led_' + id + '_(a[0-9a-z]+)_(\\d{4}-\\d{2}|none)$');
    const by = {};
    Object.keys(out).forEach(k => {
      const m = re.exec(k); if (!m) return;
      let blk; try { blk = JSON.parse(out[k]); } catch (_) { return; }
      if (!blk || !Array.isArray(blk.s) || !Array.isArray(blk.r)) return;
      const list = (by[m[1]] = by[m[1]] || []);
      blk.r.forEach((r, i) => list.push([blk.s[i], r]));
    });
    Object.keys(meta.archives).forEach(n => {
      const a = meta.archives[n];
      a.records = (by[a.records] || []).sort((x, y) => x[0] - y[0]).map(x => x[1]);
    });
    Object.defineProperty(out, 'store_' + id, { value: JSON.stringify(meta), enumerable: false, configurable: true });
  });
  return out;
}

module.exports = { newPhone, install, idle, dumpDb, withMerged };
