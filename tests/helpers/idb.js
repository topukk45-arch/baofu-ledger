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
  return f;
}

async function idle(w){
  // 让出几拍，让 setTimeout(0) 一类排在后面的回调也跑掉
  for (let i = 0; i < 3; i++) {
    if (typeof w.ledgerIdle === 'function') await w.ledgerIdle();
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
      tx.oncomplete = () => { db.close(); resolve(out); };
      tx.onerror = () => reject(tx.error);
    };
  });
}

module.exports = { newPhone, install, idle, dumpDb };
