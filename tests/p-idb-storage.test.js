// 1013-D 专项：账本从 localStorage 搬到 IndexedDB。node p-idb-storage.test.js <html>
// 覆盖：缓存给副本、先改内存再写库、切后台强制写、写到一半被杀、写失败的提示与重试、
//      新建账号 / 导入要确认写进去、搬家（成功 / 中途失败续搬 / 读回对不上 / 旧的删不掉 / 两边不一致）、
//      库里的账本坏了、打不开库、1.7 万条进入账号的耗时。
const fs=require('fs'); const path=require('path'); const {JSDOM}=require('jsdom'); const IDB=require('./helpers/idb');
const FIDB=require('fake-indexeddb');
const file=process.argv[2]||path.join(__dirname,'..','www','index.html');
const html=fs.readFileSync(file,'utf8');
let pass=0, fail=0; const ok=(c,n)=>{ if(c) pass++; else { fail++; console.log('  ✗ '+n); } };
const NOW='2026-10-10T14:00:00';
const ID_A='u1760000000000000011', ID_B='u1760000000000000022';
const R=(id,time,money,type,cat,remark)=>({id,time,money,type,cat,remark:remark||''});
const store=(recs, name)=>JSON.stringify(Object.assign({ archives:{'默认存档':{cats:['未分类','餐饮'],records:recs||[]}}, last:'默认存档' }, name?{accountName:name}:{}));
const ACCTS=JSON.stringify([{id:ID_A,name:'小明'},{id:ID_B,name:'小红'}]);
// 1013-C 时的样子：账号已经是编号，账本还在 localStorage
const OLD={ accounts:ACCTS, accounts_v:'1', app_logged_in_user:ID_A,
  ['store_'+ID_A]:store([R('a1','2026-10-01T12:00',20,'expense','餐饮','午饭')],'小明'),
  ['store_'+ID_B]:store([R('b1','2026-10-02T12:00',5,'expense','餐饮','早饭')],'小红'),
  ['app_time_repaired_'+ID_A]:'1', ['app_time_repaired_'+ID_B]:'1' };

// ---- 让 IndexedDB 出故障：只影响满足条件的键，用完记得 restore() ----
const OS=FIDB.IDBObjectStore.prototype, origPut=OS.put, origGet=OS.get;
function breakPut(when, how){   // how: 'abort' 事务中途死掉 | 'quota' 存储满
  OS.put=function(v,k){
    if(when(String(k), v)){
      if(how==='quota'){ const e=new Error('full'); e.name='QuotaExceededError'; throw e; }
      const req=origPut.call(this,v,k); this.transaction.abort(); return req;
    }
    return origPut.call(this,v,k);
  };
}
function breakGet(when, fake){ OS.get=function(k){ const req=origGet.call(this,k); if(when(String(k))){ const tx=this.transaction; req.addEventListener('success',()=>{ Object.defineProperty(req,'result',{value:fake,configurable:true}); }); } return req; }; }
function restore(){ OS.put=origPut; OS.get=origGet; }
// 1013-G 起账本按月分块：某个账号的账本键都以 led_<编号>_ 开头（损坏备份除外）
const led=id=>k=>k.indexOf('led_'+id+'_')===0 && k.indexOf('__corrupted_')<0;
function countPuts(){ const log=[]; OS.put=function(v,k){ log.push(String(k)); return origPut.call(this,v,k); }; return log; }

async function boot(seed, opts){
  opts=opts||{};
  let win;
  const dom=new JSDOM(opts.html||html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/',beforeParse(w){
    win=w;
    if(opts.noIdb){ w.indexedDB={ open(){ throw new Error('no idb'); } }; }
    else IDB.install(w, opts.phone);
    if(opts.loose) w.__LEDGER_STRICT=false;   // 测耗时时关掉「一改就报错」（它让每次读记录都慢一点）
    const ls=w.localStorage;
    Object.keys(seed||{}).forEach(k=>ls.setItem(k, seed[k]));
    if(opts.lsFail){ const S=w.Storage.prototype, o=S.removeItem; S.removeItem=function(k){ if(opts.lsFail(String(k))) return; return o.call(this,k); }; }
    w.scrollTo=()=>{}; w.HTMLElement.prototype.scrollIntoView=function(){};
    w.Capacitor={ isNativePlatform:()=>true, Plugins:{ OneDriveLink:{ writeText:async()=>{}, pickFile:async()=>({}), forget:async()=>{} } } };
    w.Date=class extends Date{constructor(...x){x.length?super(...x):super(NOW);}static now(){return new Date(NOW).getTime();}};}});
  const errs=[]; dom.window.addEventListener('error',e=>errs.push(e.message));
  const w=dom.window, d=w.document, $=id=>d.getElementById(id), ls=w.localStorage;
  const t={ w,d,$,ls,errs, phone:w.indexedDB,
    idle:()=>IDB.idle(w),
    db:async()=>{ await IDB.idle(w); return IDB.dumpDb(w.indexedDB); },
    inMain:()=>$('mainBox').style.display==='block',
    open:()=>w.getComputedStyle($('askMask')).display!=='none',
    title:()=>$('askTitle').textContent, msg:()=>$('askMsg').textContent,
    chip:n=>[...$('recentUsers').querySelectorAll('.user-chip')].find(c=>c.querySelector('span').textContent===n),
    choices:()=>[...$('askChoices').querySelectorAll('.cc')].map(e=>e.textContent),
    keys:()=>{ const a=[]; for(let i=0;i<ls.length;i++) a.push(ls.key(i)); return a.sort(); },
    dump:()=>{ const o={}; for(let i=0;i<ls.length;i++){ const k=ls.key(i); o[k]=ls.getItem(k); } return o; },
  };
  t.pick=async(inputId, text)=>{
    const input=$(inputId);
    const f=new w.File([text],'备份.json',{type:'application/json'});
    Object.defineProperty(input,'files',{value:[f],configurable:true});
    input.dispatchEvent(new w.Event('change'));
    for(let i=0;i<50 && !t.open();i++) await new Promise(r=>setTimeout(r,10));
    await t.idle();
  };
  t.addBill=async(money, remark)=>{
    // 直接走数据层记一笔（界面上的记一笔流程别的测试已覆盖）
    const data=(w.JiwenStore || w).getUserData(); data.push(R((w.JiwenStore || w).genId(), '2026-10-10T12:00', money, 'expense', '餐饮', remark)); (w.JiwenStore || w).saveUserData(data);
  };
  await t.idle();
  return t;
}
const reboot=(t, ls, opts)=>boot(ls, Object.assign({}, opts||{}, { phone:t.phone }));

(async()=>{
// ===== 1. 搬家：1013-C 的数据第一次打开 =====
{
  const t=await boot(OLD);
  const db=await t.db();
  ok(db['store_'+ID_A]===OLD['store_'+ID_A] && db['store_'+ID_B]===OLD['store_'+ID_B], '1 两个账号的账本原样进了 IndexedDB（逐字节一样）');
  ok(t.ls.getItem('store_'+ID_A)===null && t.ls.getItem('store_'+ID_B)===null, '1 localStorage 里的账本删掉了');
  ok(t.ls.getItem('accounts')===ACCTS && t.ls.getItem('app_time_repaired_'+ID_A)==='1', '1 账号列表、设置这些小数据留在 localStorage 不动');
  ok(t.inMain() && t.$('billList').textContent.includes('午饭'), '1 自动进入小明，账单都在');
  ok(!t.open(), '1 搬完不弹任何提示');
  ok(!t.errs.length, '1 无报错 '+t.errs.join('|'));
  // 再开一次：什么都不变
  const snapLs=JSON.stringify(t.dump()), snapDb=JSON.stringify(db);
  const t2=await reboot(t, t.dump());
  ok(JSON.stringify(t2.dump())===snapLs && JSON.stringify(await t2.db())===snapDb, '1 第二次打开不再搬，两边都原样');
  ok(t2.inMain() && t2.$('billList').textContent.includes('午饭'), '1 第二次打开照常进入');
}

// ===== 2. 缓存给副本 =====
{
  const t=await boot(OLD);
  const a=(t.w.JiwenStore || t.w).loadStore(), b=(t.w.JiwenStore || t.w).loadStore();
  ok(a!==b && a.archives!==b.archives && a.archives['默认存档'].records!==b.archives['默认存档'].records, '2 两次 loadStore 拿到的是两个不同的对象');
  a.archives['默认存档'].records.push(R('x1','2026-10-09T12:00',1,'expense','餐饮','没保存的'));
  a.last='改了没存';
  ok((t.w.JiwenStore || t.w).loadStore().archives['默认存档'].records.length===1 && (t.w.JiwenStore || t.w).loadStore().last==='默认存档', '2 改了副本不保存：再读还是原样');
  const recs=(t.w.JiwenStore || t.w).getUserData(); recs.length=0;
  ok((t.w.JiwenStore || t.w).getUserData().length===1, '2 getUserData 拿到的数组被清空，也不影响缓存');
  (t.w.JiwenStore || t.w).getBudgets().x=1; (t.w.JiwenStore || t.w).getCats().push('乱加的');
  ok(!('x' in (t.w.JiwenStore || t.w).getBudgets()) && !(t.w.JiwenStore || t.w).getCats().includes('乱加的'), '2 getBudgets / getCats 给的也是副本');
  ok(!(await t.db())['store_'+ID_A].includes('没保存的'), '2 没保存的东西也没写进库');
}

// ===== 3. 先改内存，马上写库 =====
{
  const t=await boot(OLD);
  await t.addBill(12.5, '奶茶');
  ok((t.w.JiwenStore || t.w).getUserData().some(r=>r.remark==='奶茶'), '3 存完立刻能读到（内存先改好了）');
  ok(t.$('billList').textContent.includes('午饭'), '3 界面照常');
  const db=await t.db();
  ok(JSON.parse(db['store_'+ID_A]).archives['默认存档'].records.some(r=>r.remark==='奶茶'), '3 等一下就写进了 IndexedDB');
  // 连着存好几次：库里是最后一次的
  for(let i=0;i<5;i++) await t.addBill(i+1, '连续'+i);
  const last=JSON.parse((await t.db())['store_'+ID_A]).archives['默认存档'].records;
  ok(last.filter(r=>r.remark.startsWith('连续')).length===5, '3 连续存 5 次，库里最后是完整的 5 条');
  ok(JSON.stringify(last)===JSON.stringify((t.w.JiwenStore || t.w).getUserData()), '3 库里和内存一致');
  const t2=await reboot(t, t.dump());
  ok((t2.w.JiwenStore || t2.w).getUserData().length===last.length, '3 重开 App 读回来的就是这份');
}

// ===== 4. 切后台：强制写一次 =====
{
  const t=await boot(OLD);
  const log=countPuts();
  Object.defineProperty(t.d,'visibilityState',{configurable:true,get:()=>'hidden'});
  t.d.dispatchEvent(new t.w.Event('visibilitychange'));
  await t.idle();
  restore();
  ok(log.filter(k=>k==='led_'+ID_A+'_m').length===1 && log.every(led(ID_A)), '4 切后台：没改东西也把当前账号（meta）写了一遍（'+log.join(',')+'）');
  ok(!log.some(led(ID_B)), '4 不碰没打开的账号');
  // 写库失败、修改还在内存里：切后台时会再写
  breakPut(led(ID_A), 'abort');
  await t.addBill(8, '后台补写'); await t.idle();
  ok(t.open() && t.title()==='保存失败', '4 写库失败弹「保存失败」');
  t.$('askOk').click();
  restore();
  ok(!(await t.db())['store_'+ID_A].includes('后台补写'), '4 这时库里还没有');
  t.w.dispatchEvent(new t.w.Event('pagehide'));
  ok((await t.db())['store_'+ID_A].includes('后台补写'), '4 切后台（pagehide）时补写进去了');
}

// ===== 5. 写到一半被杀：库里留下的是上一份完整的账本 =====
{
  const t=await boot(OLD);
  await t.addBill(30, '被杀前写好的'); await t.idle();
  const before=(await t.db())['store_'+ID_A];
  // 下一次写库的事务中途死掉（相当于写到一半 App 被杀）
  breakPut(led(ID_A), 'abort');
  await t.addBill(40, '写到一半'); await t.idle();
  restore();
  const after=(await t.db())['store_'+ID_A];
  ok(after===before, '5 事务没提交：库里还是上一份，一个字节都没变');
  let parsed=null; try{ parsed=JSON.parse(after); }catch(_){}
  ok(parsed && parsed.archives['默认存档'].records.some(r=>r.remark==='被杀前写好的'), '5 上一份是完整、能解析的账本');
  // 「被杀」：不再给它补写的机会，直接用这台手机重开
  const t2=await reboot(t, t.dump());
  ok(t2.inMain() && t2.$('billList').textContent.includes('被杀前写好的') && !t2.$('billList').textContent.includes('写到一半'), '5 重开：看到的是被杀前那份，没有半截数据');
  ok(!t2.open() && !t2.errs.length, '5 重开不报损坏、无报错 '+t2.errs.join('|'));
}

// ===== 6. 写库失败：提示一次，修改留在内存，下次保存时一起写进去 =====
{
  const t=await boot(OLD);
  breakPut(led(ID_A), 'quota');
  await t.addBill(1, '第一笔'); await t.idle();
  ok(t.open() && t.msg().includes('存储空间已满'), '6 存储满：提示和以前一样');
  t.$('askOk').click();
  await t.addBill(2, '第二笔'); await t.idle();
  ok(!t.open(), '6 连续失败不重复弹');
  restore();
  await t.addBill(3, '第三笔'); await t.idle();
  const r=JSON.parse((await t.db())['store_'+ID_A]).archives['默认存档'].records.map(x=>x.remark);
  ok(['第一笔','第二笔','第三笔'].every(x=>r.includes(x)), '6 恢复后三笔一起写进去了');
  breakPut(led(ID_A), 'quota');
  await t.addBill(4, '第四笔'); await t.idle();
  ok(t.open() && t.title()==='保存失败', '6 好过一次以后再失败，会再提示');
  restore();
}

// ===== 7. 新建账号、导入：要确认写进去才算 =====
{
  const t=await boot(OLD);
  t.$('logoutBtn').click();
  breakPut(k=>/^led_u\d{19}_/.test(k), 'quota');
  t.$('newAccountBtn').click(); t.$('askInput').value='小刚'; t.$('askOk').click(); await t.idle();
  ok(t.title()==='新建失败' && !t.inMain(), '7 账本写不进去：新建失败，留在登录页');
  ok(!JSON.parse(t.ls.getItem('accounts')).some(a=>a.name==='小刚'), '7 账号列表里没有半成品');
  t.$('askOk').click();
  restore();
  t.$('newAccountBtn').click(); t.$('askInput').value='小刚'; t.$('askOk').click(); await t.idle();
  const id=JSON.parse(t.ls.getItem('accounts')).find(a=>a.name==='小刚').id;
  ok(t.inMain() && JSON.parse((await t.db())['store_'+id]).accountName==='小刚', '7 正常时新建好，账本在库里');
  // 设置页导入：写库失败 → 导入失败，内存退回原样
  const backup=JSON.stringify({ app:'记问', user:'小刚', archive:'备份', cats:['未分类'], data:[R('z1','2026-09-01T12:00',9,'expense','未分类','导入的')] });
  breakPut(led(id), 'quota');
  await t.pick('importFile', backup);
  restore();
  ok(t.msg().includes('存储空间不足') && t.msg().includes('导入失败'), '7 导入写不进去：如实说导入失败');
  ok(!(t.w.JiwenStore || t.w).loadStore().archives['备份'], '7 内存里也没有留下导入了一半的存档');
  t.$('askOk').click();
  await t.pick('importFile', backup);
  ok(t.title()==='导入成功' && JSON.parse((await t.db())['store_'+id]).archives['备份'], '7 正常时导入成功并写进库');
  // 登录页导入到另一个没打开过的账号
  t.$('askOk').click(); t.$('logoutBtn').click();
  await t.pick('loginImportFile', backup);
  const opt=[...t.$('askChoices').querySelectorAll('.cc')].find(e=>e.textContent.startsWith('小红'));
  opt.click(); t.$('askOk').click(); await t.idle();
  ok(t.title()==='导入成功' && JSON.parse((await t.db())['store_'+ID_B]).archives['备份'], '7 登录页导入到没打开过的账号：先读它的账本再导，写进了库');
  ok(JSON.parse((await t.db())['store_'+ID_B]).archives['默认存档'].records[0].remark==='早饭', '7 那个账号原来的账单没丢');
  ok(!t.errs.length, '7 无报错 '+t.errs.join('|'));
}

// ===== 8. 搬家中途失败：没搬完的账号先不让进，下次接着搬 =====
{
  breakPut(k=>k==='store_'+ID_B, 'quota');
  const t=await boot(OLD);
  restore();
  ok(t.ls.getItem('store_'+ID_B)===OLD['store_'+ID_B], '8 没搬过去的账本留在原处，原样');
  ok((await t.db())['store_'+ID_B]===undefined, '8 库里没有半份');
  ok(t.ls.getItem('store_'+ID_A)===null && (await t.db())['store_'+ID_A], '8 别的账号照常搬完');
  ok(t.inMain() && t.$('billList').textContent.includes('午饭'), '8 搬完的小明照常自动进入');
  ok(t.title()==='提示' && t.msg().includes('「小红」暂时进不去') && !t.msg().includes('「小明」'), '8 提示点名小红');
  t.$('askOk').click(); t.$('logoutBtn').click();
  t.chip('小红').click(); await t.idle();
  ok(!t.inMain() && t.msg().includes('还没整理完'), '8 点小红：先不让进');
  t.$('askOk').click();
  await t.pick('loginImportFile', JSON.stringify({ app:'记问', user:'x', archive:'备份', data:[R('z1','2026-09-01T12:00',9,'expense','餐饮','')] }));
  ok(t.choices().some(x=>x.startsWith('小明')) && !t.choices().some(x=>x.startsWith('小红')), '8 登录页导入也选不到小红');
  // 下次打开，存储正常了
  const t2=await reboot(t, t.dump());
  ok(t2.ls.getItem('store_'+ID_B)===null && (await t2.db())['store_'+ID_B]===OLD['store_'+ID_B], '8 下次打开接着搬完');
  ok(!t2.open(), '8 搬完不再提示');
  t2.$('logoutBtn').click(); t2.chip('小红').click(); await t2.idle();
  ok(t2.inMain() && t2.$('billList').textContent.includes('早饭'), '8 小红能进了，账单都在');
}

// ===== 9. 读回来对不上 / 旧的删不掉：都算没搬完 =====
{
  breakGet(k=>k==='store_'+ID_B, '{"读回来不一样":1}');
  const t=await boot(OLD);
  restore();
  ok(t.ls.getItem('store_'+ID_B)===OLD['store_'+ID_B], '9 读回对不上：旧的不删');
  ok(t.msg().includes('「小红」暂时进不去'), '9 读回对不上：小红先不让进');
  const t2=await reboot(t, t.dump());
  ok(t2.ls.getItem('store_'+ID_B)===null && (await t2.db())['store_'+ID_B]===OLD['store_'+ID_B], '9 下次打开搬完');

  const t3=await boot(OLD, { lsFail:k=>k==='store_'+ID_B });
  ok(t3.ls.getItem('store_'+ID_B)!==null && t3.msg().includes('「小红」暂时进不去'), '9 旧的删不掉：也算没搬完（不然下次会被旧的盖回来）');
  const t4=await reboot(t3, t3.dump());
  ok(t4.ls.getItem('store_'+ID_B)===null && (await t4.db())['store_'+ID_B]===OLD['store_'+ID_B] && !t4.open(), '9 下次打开：库里已经是同一份，删掉旧的就算完');
  ok(!Object.keys(await t4.db()).some(k=>k.startsWith('migrate_conflict_')), '9 两边一样时不另存冲突副本');
}

// ===== 10. 两边都有、内容不一样（装回过旧版本又用了几天）：旧位置那份是最新的 =====
{
  const t=await boot(OLD);
  await t.addBill(66, '新版里记的'); await t.idle();
  const newer=(await t.db())['store_'+ID_A];
  // 装回旧版本：旧版本只认 localStorage，在那里接着记
  const lsAfterDowngrade=Object.assign(t.dump(), { ['store_'+ID_A]:store([R('a1','2026-10-01T12:00',20,'expense','餐饮','午饭'), R('a9','2026-10-11T12:00',7,'expense','餐饮','旧版里记的')],'小明') });
  const t2=await reboot(t, lsAfterDowngrade);
  const db=await t2.db();
  ok(db['store_'+ID_A].includes('旧版里记的') && t2.ls.getItem('store_'+ID_A)===null, '10 旧位置那份放进了库');
  const ck=Object.keys(db).find(k=>k.startsWith('migrate_conflict_store_'+ID_A+'_'));
  ok(ck && db[ck]===newer, '10 库里原来那份另存着，没删');
  ok(t2.inMain() && t2.$('billList').textContent.includes('旧版里记的'), '10 进去看到的是最新的');
}

// ===== 11. 库里的账本坏了：照旧不白屏、另存原文、暂停云同步 =====
{
  // 1013-F 的样子：库里只有一整段、而且坏了（1013-H 起分块好好的时候旁边的坏整本不会顶掉分块，见 q-ledger-blocks 第 21 组）
  const phone=IDB.newPhone();
  await new Promise((res,rej)=>{ const q=phone.open('jiwen',1); q.onupgradeneeded=()=>q.result.createObjectStore('kv');
    q.onsuccess=()=>{ const tx=q.result.transaction('kv','readwrite'); tx.objectStore('kv').put('{坏了', 'store_'+ID_A); tx.oncomplete=()=>{ q.result.close(); res(); }; tx.onerror=rej; }; });
  const seed=Object.assign({}, OLD); delete seed['store_'+ID_A]; delete seed['store_'+ID_B];
  const t=await boot(seed, { phone });
  if(t.open()) t.$('askOk').click();   // 1013-H：先提示「有数据读不出来」
  ok(t.inMain() && t.$('billList').textContent.includes('暂无记账记录'), '11 坏账本：界面照常打开（空的）');
  const db=await t.db();
  const bk=Object.keys(db).find(k=>k.startsWith('store_'+ID_A+'__corrupted_'));
  ok(bk && db[bk]==='{坏了', '11 原文另存进了库');
  t.ls.setItem(`onedrive_link_${ID_A}__默认存档`, JSON.stringify({ uri:'content://a', name:'a.json', lastCount:1 }));
  await (t.w.JiwenStore || t.w).odSyncNow();
  ok(JSON.parse(t.ls.getItem(`onedrive_link_${ID_A}__默认存档`)).blocked===true, '11 云同步照旧被拦住，不拿空账本覆盖云端');
}

// ===== 12. 打不开 IndexedDB：不动老数据，说明情况 =====
{
  const t=await boot(OLD, { noIdb:true });
  ok(!t.inMain() && t.title()==='提示' && t.msg().includes('打不开'), '12 打不开库：停在登录页并说明');
  ok(t.ls.getItem('store_'+ID_A)===OLD['store_'+ID_A], '12 localStorage 里的账本原样不动');
  t.$('askOk').click();
  t.chip('小明').click(); await t.idle();
  ok(!t.inMain() && t.msg().includes('还没整理完'), '12 点账号也先不让进（不会建出空账本）');
  ok(t.ls.getItem('app_logged_in_user')===ID_A, '12 记住的登录不清掉，好了以后还能自动进');
}

// ===== 13. 大数据量：1.7 万条，进入账号的耗时 =====
{
  const N=17000, recs=[];
  const cats=['餐饮','购物','出行','其他'];
  for(let i=0;i<N;i++){
    const d=new Date(Date.UTC(2021,9,1)+Math.floor(i*5*365/N)*86400000);
    const ds=d.toISOString().slice(0,10);
    recs.push({ id:'r'+String(i).padStart(6,'0'), time:`${ds}T${String(8+i%12).padStart(2,'0')}:${String(i%60).padStart(2,'0')}`,
      money:Math.round((5+(i*37)%300)*100)/100, type:i%40===0?'income':'expense', cat:cats[i%4], remark:['早饭','午饭','地铁','超市',''][i%5] });
  }
  const big=JSON.stringify({ archives:{'默认存档':{cats:['未分类'].concat(cats),records:recs}}, last:'默认存档', accountName:'小明' });
  const seed=Object.assign({}, OLD, { ['store_'+ID_A]:big });
  let t0=Date.now();
  const t=await boot(seed);
  const tBoot=Date.now()-t0;
  ok(t.inMain() && (await t.db())['store_'+ID_A]===big, `13 ${N} 条（${(big.length/1e6).toFixed(1)}M 字符）搬进库并自动进入，用时 ${tBoot}ms`);
  t.$('logoutBtn').click();
  // 数页面里 JSON.parse / JSON.stringify 处理了多少字符（和机器快慢无关，照第 14 组的做法）
  const J13=t.w.JSON, op13=J13.parse, os13=J13.stringify; let c13=0;
  J13.parse=function(x){ if(typeof x==='string') c13+=x.length; return op13.apply(this, arguments); };
  J13.stringify=function(){ const r=os13.apply(this, arguments); if(typeof r==='string') c13+=r.length; return r; };
  const take13=()=>{ const c=c13; c13=0; return c; };
  t0=Date.now(); t.chip('小明').click(); await t.idle();
  const tEnter=Date.now()-t0, cEnter=take13();
  ok(t.inMain() && t.$('billList').querySelectorAll('.bl-row').length===50 && t.$('pagerBottom').textContent.includes(`/ ${Math.ceil(N/50)} 页`), `13 从登录页进入账号（读库 + 显示）用时 ${tEnter}ms`);
  t0=Date.now(); await t.addBill(1, '大账本里记一笔'); const tSave=Date.now()-t0; await t.idle();
  const tSaveAll=Date.now()-t0, cSave=take13();
  J13.parse=op13; J13.stringify=os13;
  ok((await t.db())['store_'+ID_A].includes('大账本里记一笔'), `13 记一笔：界面那头 ${tSave}ms，连写库 ${tSaveAll}ms`);
  // 以前比的是毫秒（进入 < 5 秒、记一笔 < 1 秒），机器忙的时候会偶发不过；改成比处理了多少数据
  ok(cEnter < 1.2*big.length, `13 进入账号只解析一遍账本（处理了 ${(cEnter/big.length).toFixed(2)} 本）`);
  ok(cSave < 0.1*big.length, `13 记一笔只处理这一个月（处理了 ${(cSave/big.length).toFixed(3)} 本，5 年的账按月分了 60 来块）`);
  // 和 1013-C（localStorage）对比一下
  const oldFile=process.env.OLD_HTML;
  if(oldFile && fs.existsSync(oldFile)){
    const oh=fs.readFileSync(oldFile,'utf8');
    const od=new JSDOM(oh,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/',beforeParse(w){
      Object.keys(seed).forEach(k=>w.localStorage.setItem(k, seed[k])); w.localStorage.setItem('app_logged_in_user','');
      w.scrollTo=()=>{}; w.HTMLElement.prototype.scrollIntoView=function(){};
      w.Date=class extends Date{constructor(...x){x.length?super(...x):super(NOW);}static now(){return new Date(NOW).getTime();}};}});
    const chip=[...od.window.document.getElementById('recentUsers').querySelectorAll('.user-chip')].find(c=>c.textContent.includes('小明'));
    // 只有 1013-C（账本在 localStorage、同步启动）能这样比；1013-D 以后的老版本这里找不到账号，跳过（第 14 组会比）
    if(chip){
      t0=Date.now(); chip.click(); const oEnter=Date.now()-t0;
      console.log(`  （对比 1013-C：同样 ${N} 条从登录页进入用时 ${oEnter}ms）`);
    }
  }
  console.log(`  耗时：首次打开（含搬家）${tBoot}ms，进入账号 ${tEnter}ms，记一笔 ${tSave}ms / 连写库 ${tSaveAll}ms`);
}

// ===== 14. 一年导入量：12 万条（带 src / 交易对方编号），进入账号、记一笔、翻页、切到统计页 =====
//   1013-F（整段存）的基线见 tests/README.md。主要断言数的是每个操作解析 / 序列化了多少字符的 JSON
//   （和机器快慢无关）：1013-F 记一笔要整本解析 2 次 + 序列化 1 次，切统计页整本解析 3 次，进入账号整本解析 5 次。
//   设了 OLD_HTML 时，同样的数据再用老版本跑一遍，直接对比。结果写到 BENCH_OUT（如有）。
{
  const N=120000, recs=[];
  const cats=['餐饮','购物','出行','转账','其他'];
  for(let i=0;i<N;i++){
    const d=new Date(Date.UTC(2025,9,10)+Math.floor(i*365/N)*86400000);
    const ds=d.toISOString().slice(0,10);
    recs.push({ id:'r'+String(i).padStart(7,'0'), time:`${ds}T${String(i%24).padStart(2,'0')}:${String(i%60).padStart(2,'0')}`,
      money:Math.round((1+(i*37)%500)*100)/100, type:i%25===0?'income':'expense', cat:cats[i%5],
      remark:['扫码付款','收款','便利店','虚构商户'+(i%97),''][i%5], src:i%2?'wx':'ali', peer:'p'+String(i%3000).padStart(5,'0') });
  }
  const big=JSON.stringify({ archives:{'默认存档':{cats:['未分类'].concat(cats),records:recs}}, last:'默认存档', accountName:'小明' });
  const ms=()=>Number(process.hrtime.bigint())/1e6;
  // 同一台机器上整本解析一次要多久（取三次里最快的）
  let T=Infinity; for(let i=0;i<3;i++){ const t0=ms(); JSON.parse(big); T=Math.min(T, ms()-t0); }
  async function run(htmlStr){
    // 1013-F 的样子：库里一个账号一整段。localStorage 装不下 15M，直接放进库
    const phone=IDB.newPhone();
    await new Promise((res,rej)=>{ const q=phone.open('jiwen',1); q.onupgradeneeded=()=>q.result.createObjectStore('kv');
      q.onsuccess=()=>{ const tx=q.result.transaction('kv','readwrite'); tx.objectStore('kv').put(big, 'store_'+ID_A); tx.oncomplete=()=>{ q.result.close(); res(); }; tx.onerror=rej; }; });
    const seed=Object.assign({}, OLD); delete seed['store_'+ID_A]; seed.app_logged_in_user='';
    const t=await boot(seed, { phone, loose:true, html:htmlStr });
    // 数页面里 JSON.parse / JSON.stringify 处理了多少字符
    const J=t.w.JSON, op=J.parse, os=J.stringify; let chars=0;
    J.parse=function(x){ if(typeof x==='string') chars+=x.length; return op.apply(this, arguments); };
    J.stringify=function(){ const r=os.apply(this, arguments); if(typeof r==='string') chars+=r.length; return r; };
    const take=()=>{ const c=chars; chars=0; return c; };
    take();
    let t0=ms(); t.chip('小明').click(); await t.idle(); const tEnter=ms()-t0; const cEnter=take();
    const entered=t.inMain() && t.$('billList').querySelectorAll('.bl-row').length===50 && t.$('pagerBottom').textContent.includes(`/ ${Math.ceil(N/50)} 页`);
    t0=ms(); await t.addBill(1, '大账本里记一笔'); const tSave=ms()-t0; await t.idle(); const tSaveAll=ms()-t0; const cSave=take();
    const nextBtn=[...t.$('pagerBottom').querySelectorAll('button')].find(b=>b.textContent.includes('下一页'));
    t0=ms(); nextBtn.click(); const tPage=ms()-t0; const cPage=take();
    const paged=t.$('pagerBottom').textContent.includes('第 2 /');
    t0=ms(); t.d.querySelector('.tab-btn[data-tab="stats"]').click(); await t.idle(); const tStats=ms()-t0; const cStats=take();
    J.parse=op; J.stringify=os;
    const stats=t.d.querySelector('.tab-btn[data-tab="stats"]').classList.contains('active');
    t.d.querySelector('.tab-btn[data-tab="ledger"]').click();
    const data=(t.w.JiwenStore || t.w).getUserData();
    const saved=data.length===N+1 && data[N].remark==='大账本里记一笔';
    const db=await t.db();
    return { t, db, entered, paged, stats, saved, tEnter, tSave, tSaveAll, tPage, tStats, cEnter, cSave, cPage, cStats };
  }
  const r=await run(html);
  const f=x=>Math.round(x);
  ok(r.entered, `14 进入账号（读库 + 显示）${f(r.tEnter)}ms`);
  ok(r.paged, `14 翻页 ${f(r.tPage)}ms`);
  ok(r.stats, `14 切到统计页 ${f(r.tStats)}ms`);
  ok(r.saved, '14 记的那笔在账本里，排在最后');
  const blocks=Object.keys(r.db).filter(k=>k.indexOf('led_'+ID_A+'_a')===0);
  ok(r.db['store_'+ID_A]!==undefined && JSON.parse(r.db['store_'+ID_A]).archives['默认存档'].records.length===N+1 && blocks.length===13,
     `14 搬成了按月分块（${blocks.length} 块），合起来是完整的一本`);
  const L=big.length, x=c=>(c/L).toFixed(2)+' 本';
  ok(r.cEnter < 1.2*L, `14 进入账号只解析一遍（处理了 ${x(r.cEnter)}；1013-F 是 5 本）`);
  ok(r.cSave < 0.2*L, `14 记一笔只序列化这一个月（处理了 ${x(r.cSave)}；1013-F 是 3 本）`);
  ok(r.cPage < 0.01*L && r.cStats < 0.01*L, `14 翻页、切统计页不再解析账本（${x(r.cPage)}、${x(r.cStats)}；1013-F 是 1 本、3 本）`);
  // 以前这里比的是「记一笔连写库的毫秒数 < 整本解析一次的毫秒数」，两边都是几十毫秒，机器一抖就偶发不过；改成比数据量
  ok(r.cSave < 0.05*L, `14 记一笔处理的字符不到整本的 1/20（${x(r.cSave)}；连写库 ${f(r.tSaveAll)}ms，整本解析一次 ${f(T)}ms，只打印不比）`);
  const line=x=>`进入账号 ${f(x.tEnter)}ms，记一笔 ${f(x.tSave)}ms / 连写库 ${f(x.tSaveAll)}ms，翻页 ${f(x.tPage)}ms，切到统计页 ${f(x.tStats)}ms`;
  console.log(`  12 万条（${(big.length/1e6).toFixed(1)}M 字符，整本解析一次 ${f(T)}ms）耗时：${line(r)}`);
  console.log(`  处理的 JSON：进入账号 ${x(r.cEnter)}，记一笔 ${x(r.cSave)}，翻页 ${x(r.cPage)}，切到统计页 ${x(r.cStats)}`);
  const out={ T, now:{ tEnter:r.tEnter, tSave:r.tSave, tSaveAll:r.tSaveAll, tPage:r.tPage, tStats:r.tStats } };
  // 和老版本直接比
  const oldFile=process.env.OLD_HTML;
  if(oldFile && fs.existsSync(oldFile)){
    const o=await run(fs.readFileSync(oldFile,'utf8'));
    console.log(`  老版本（${path.basename(oldFile)}）同样数据：${line(o)}`);
    console.log(`  处理的 JSON（老版本）：进入账号 ${x(o.cEnter)}，记一笔 ${x(o.cSave)}，翻页 ${x(o.cPage)}，切到统计页 ${x(o.cStats)}`);
    ok(r.cSave <= o.cSave && r.cStats <= o.cStats && r.cEnter <= o.cEnter,
       '14 和老版本比：进入账号、记一笔、切统计页处理的数据都不比它多（只比数据量，耗时只打印）');
    out.old={ tEnter:o.tEnter, tSave:o.tSave, tSaveAll:o.tSaveAll, tPage:o.tPage, tStats:o.tStats };
  }
  if(process.env.BENCH_OUT) fs.writeFileSync(process.env.BENCH_OUT, JSON.stringify(out));
}

console.log(`\n${pass} 通过，${fail} 失败`);
process.exit(fail?1:0);
})();
