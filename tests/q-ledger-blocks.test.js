// 1013-G 专项：账本按月分块存。node q-ledger-blocks.test.js <html>
// 覆盖：搬成分块（记录顺序、无时间的记录、逐字节一样）、改时间跨月、批量跨月与撤销（同一个事务）、
//      存档改名 / 删除、改分类名、账号改名只写 meta、坏了一块只影响那一块、meta 坏了用月份块重建、
//      搬家（中途被杀续搬、读回对不上、旧的删不掉、两边不一样、旧的本身就坏了）、
//      往别的账号导入、内存只留当前账号、记录不能直接改、账号列表坏了从 meta 找回、
//      装回 1013-F（设了 OLD_HTML 才跑）。
// 所有数据都是虚构的。
const fs=require('fs'); const path=require('path'); const {JSDOM}=require('jsdom'); const IDB=require('./helpers/idb');
const FIDB=require('fake-indexeddb');
const file=process.argv[2]||path.join(__dirname,'..','www','index.html');
const html=fs.readFileSync(file,'utf8');
let pass=0, fail=0; const ok=(c,n)=>{ if(c) pass++; else { fail++; console.log('  ✗ '+n); } };
const NOW='2026-10-10T14:00:00';
const ID_A='u1760000000000000011', ID_B='u1760000000000000022';
const R=(id,time,money,type,cat,remark)=>({id,time,money,type,cat,remark:remark||''});
// 记录故意不按时间排（补记的老账排在后面），还有一条没有时间
const RECS_A=[
  R('a1','2026-10-01T12:00',20,'expense','餐饮','十月午饭'),
  R('a2','2026-08-03T09:00',5,'expense','出行','八月地铁'),
  R('a3','2026-09-15T18:30',88,'expense','餐饮','九月聚餐'),
  R('a4','2026-10-05T08:00',3000,'income','工资','十月工资'),
  R('a5','',9,'expense','其他','没写时间的'),
  R('a6','2026-08-20T20:00',35,'expense','餐饮','八月夜宵'),
];
const storeOf=(recs, name, extra)=>Object.assign({ archives:{'默认存档':Object.assign({cats:['未分类','餐饮','出行','工资','其他'],records:recs||[]}, extra||{})}, last:'默认存档' }, name?{accountName:name}:{});
const ACCTS=JSON.stringify([{id:ID_A,name:'小明'},{id:ID_B,name:'小红'}]);
const BASE={ accounts:ACCTS, accounts_v:'1', app_logged_in_user:ID_A,
  ['app_time_repaired_'+ID_A]:'1', ['app_time_repaired_'+ID_B]:'1' };
// 1013-C 的样子：账本在 localStorage
const OLD_LS=Object.assign({}, BASE, {
  ['store_'+ID_A]:JSON.stringify(storeOf(RECS_A,'小明',{ budgets:{'餐饮':500}, tpls:[{type:'expense',cat:'餐饮',remark:'早饭',mode:'normal'}] })),
  ['store_'+ID_B]:JSON.stringify(storeOf([R('b1','2026-10-02T12:00',5,'expense','餐饮','小红的早饭')],'小红')) });

// ---- 让 IndexedDB 出故障（只影响满足条件的键，用完 restore()）----
const OS=FIDB.IDBObjectStore.prototype, origPut=OS.put, origDel=OS.delete;
function breakPut(when, how){
  OS.put=function(v,k){
    if(when(String(k))){
      if(how==='quota'){ const e=new Error('full'); e.name='QuotaExceededError'; throw e; }
      if(how==='tamper') return origPut.call(this, typeof v==='string' ? v.replace('十月', '拾月') : v, k);
      const req=origPut.call(this,v,k); this.transaction.abort(); return req;
    }
    return origPut.call(this,v,k);
  };
}
function breakDel(when){ OS.delete=function(k){ if(when(String(k))){ const req=origDel.call(this, '__不存在的键__'); return req; } return origDel.call(this,k); }; }
function restore(){ OS.put=origPut; OS.delete=origDel; }
function logOps(){ const log=[]; OS.put=function(v,k){ log.push('put '+k); return origPut.call(this,v,k); }; OS.delete=function(k){ log.push('del '+k); return origDel.call(this,k); }; return log; }

// 1013-F 的样子：账本在库里一整段
async function seedIdb(phone, kv){
  await new Promise((res,rej)=>{ const q=phone.open('jiwen',1); q.onupgradeneeded=()=>q.result.createObjectStore('kv');
    q.onsuccess=()=>{ const tx=q.result.transaction('kv','readwrite'); const os=tx.objectStore('kv');
      Object.keys(kv).forEach(k=>{ if(kv[k]===null) os.delete(k); else os.put(kv[k], k); });
      tx.oncomplete=()=>{ q.result.close(); res(); }; tx.onerror=rej; }; });
}

async function boot(seed, opts){
  opts=opts||{};
  const dom=new JSDOM(opts.html||html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/',beforeParse(w){
    IDB.install(w, opts.phone);
    const ls=w.localStorage;
    Object.keys(seed||{}).forEach(k=>ls.setItem(k, seed[k]));
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
    dump:()=>{ const o={}; for(let i=0;i<ls.length;i++){ const k=ls.key(i); o[k]=ls.getItem(k); } return o; },
    list:()=>$('billList').textContent,
    prompt:v=>{ $('askInput').value=v; $('askOk').click(); },
  };
  // 改一条记录（走数据层：换成新对象再存）
  t.edit=(id, patch)=>{ const d=w.getUserData(); const i=d.findIndex(r=>r.id===id); d[i]=Object.assign({}, d[i], patch); w.saveUserData(d); };
  t.add=(rec)=>{ const d=w.getUserData(); d.push(rec); w.saveUserData(d); };
  await t.idle();
  return t;
}
const reboot=(t, opts)=>boot(t.dump(), Object.assign({}, opts||{}, { phone:t.phone }));
// 库里某个账号的块：{ 存档号: { 月份: [备注…] } }
function blocksOf(db, id){
  const out={}, re=new RegExp(`^led_${id}_(a[0-9a-z]+)_(\\d{4}-\\d{2}|none)$`);
  Object.keys(db).forEach(k=>{ const m=re.exec(k); if(!m) return; const b=JSON.parse(db[k]); (out[m[1]]=out[m[1]]||{})[m[2]]=b.r.map(r=>r.remark); });
  return out;
}
const metaOf=(db,id)=>JSON.parse(db['led_'+id+'_m']);
const aidOf=(db,id,name)=>metaOf(db,id).archives[name].records;
const realKeys=db=>Object.keys(db);
const merged=(db,id)=>JSON.parse(db['store_'+id]);

(async()=>{
// ===== 1. 搬成分块：按月份分开，无时间的单独一块，合起来和原来逐字节一样 =====
{
  const t=await boot(OLD_LS);
  const db=await t.db();
  ok(!realKeys(db).includes('store_'+ID_A) && t.ls.getItem('store_'+ID_A)===null, '1 旧的整段账本删掉了（localStorage 和库里都没有）');
  const aid=aidOf(db, ID_A, '默认存档');
  const bl=blocksOf(db, ID_A)[aid];
  ok(bl && JSON.stringify(Object.keys(bl).sort())===JSON.stringify(['2026-08','2026-09','2026-10','none']), '1 按月份分了块，没写时间的单独一块（'+Object.keys(bl||{}).join(',')+'）');
  ok(JSON.stringify(bl['2026-08'])===JSON.stringify(['八月地铁','八月夜宵']) && JSON.stringify(bl.none)===JSON.stringify(['没写时间的']), '1 每块里是这个月的记录');
  ok(db['store_'+ID_A]===OLD_LS['store_'+ID_A], '1 合起来和原来逐字节一样（记录顺序、预算、模板、名字都在）');
  const m=metaOf(db, ID_A);
  ok(m.accountName==='小明' && m.archives['默认存档'].budgets['餐饮']===500 && typeof m.archives['默认存档'].records==='string', '1 meta 里是存档级的东西，记录换成了存档号');
  ok(JSON.stringify(t.w.getUserData().map(r=>r.id))===JSON.stringify(RECS_A.map(r=>r.id)), '1 读出来的记录顺序和原来一样');
  ok(t.inMain() && t.list().includes('没写时间的') && t.list().includes('八月地铁'), '1 界面照常');
  ok(!t.open() && !t.errs.length, '1 不弹提示、无报错 '+t.errs.join('|'));
  // 再开一次：什么都不变
  const t2=await reboot(t);
  ok(JSON.stringify(await t2.db())===JSON.stringify(db) && t2.inMain(), '1 第二次打开不再搬，库里原样');
}

// ===== 2. 改记录时间跨月：两个月份块在同一个事务里改 =====
{
  const t=await boot(OLD_LS);
  const db0=await t.db(), aid=aidOf(db0, ID_A, '默认存档');
  const log=logOps();
  t.edit('a1', { time:'2026-09-02T12:00' }); await t.idle();
  restore();
  const db=await t.db(), bl=blocksOf(db, ID_A)[aid];
  ok(!bl['2026-10'].includes('十月午饭') && bl['2026-09'].includes('十月午饭'), '2 从十月块挪到了九月块');
  ok(JSON.stringify(log.sort())===JSON.stringify([`put led_${ID_A}_${aid}_2026-09`, `put led_${ID_A}_${aid}_2026-10`]), '2 只写了这两个月（'+log.join(',')+'）');
  ok(JSON.stringify(merged(db, ID_A).archives['默认存档'].records.map(r=>r.id))===JSON.stringify(RECS_A.map(r=>r.id)), '2 改了时间，在整本里的先后不变');
  // 写到一半被杀：两块都不变
  const before=JSON.stringify(blocksOf(db, ID_A));
  breakPut(k=>k===`led_${ID_A}_${aid}_2026-08`, 'abort');
  t.edit('a3', { time:'2026-08-30T18:30' }); await t.idle();
  restore();
  ok(JSON.stringify(blocksOf(await t.db(), ID_A))===before, '2 事务中途死掉：九月块和八月块都没变，没有一边有一边没有');
  ok(t.open() && t.title()==='保存失败', '2 提示保存失败'); t.$('askOk').click();
  t.w.dispatchEvent(new t.w.Event('pagehide'));
  const bl2=blocksOf(await t.db(), ID_A)[aid];
  ok(bl2['2026-08'].includes('九月聚餐') && !bl2['2026-09'].includes('九月聚餐'), '2 切后台时两块一起补写进去了');
  const t2=await reboot(t);
  ok(t2.w.getUserData().find(r=>r.id==='a3').time==='2026-08-30T18:30', '2 重开读回来是改过的');
}

// ===== 3. 批量改分类跨三个月、撤销：同一个事务 =====
{
  const t=await boot(OLD_LS);
  const aid=aidOf(await t.db(), ID_A, '默认存档');
  const ids=['a1','a2','a3'];   // 十月、八月、九月
  breakPut(k=>k===`led_${ID_A}_${aid}_2026-09`, 'abort');
  t.w.applyBatch(ids, { cat:'其他' }); await t.idle();
  restore();
  let db=await t.db();
  const cats=()=>merged(db, ID_A).archives['默认存档'].records.filter(r=>ids.includes(r.id)).map(r=>r.cat).join(',');
  ok(cats()==='餐饮,出行,餐饮', '3 写到一半死掉：三个月一条都没改（'+cats()+'）');
  t.$('askOk').click();
  t.w.dispatchEvent(new t.w.Event('pagehide')); db=await t.db();
  ok(cats()==='其他,其他,其他', '3 补写后三个月一起改好');
  t.w.undoBatch(); db=await t.db();
  ok(cats()==='餐饮,出行,餐饮', '3 撤销：三个月一起恢复');
  ok(db['store_'+ID_A]===OLD_LS['store_'+ID_A], '3 撤销后和原来逐字节一样');
  ok(!t.errs.length, '3 无报错 '+t.errs.join('|'));
}

// ===== 4. 存档改名、删除 =====
{
  const t=await boot(OLD_LS);
  const db0=await t.db(), aid=aidOf(db0, ID_A, '默认存档');
  let log=logOps();
  t.$('renameArchive').click(); t.prompt('日常 / 50%😀'); await t.idle();
  restore();
  let db=await t.db();
  ok(JSON.stringify(log)===JSON.stringify([`put led_${ID_A}_m`]), '4 存档改名只写 meta，月份块一块不动（'+log.join(',')+'）');
  ok(aidOf(db, ID_A, '日常 / 50%😀')===aid && merged(db, ID_A).archives['日常 / 50%😀'].records.length===RECS_A.length, '4 名字里有斜杠、百分号、emoji 也没事，记录都在');
  // 再建一个存档记几笔（跨月），然后删掉
  t.$('newArchive').click(); t.prompt('旅行'); await t.idle();
  t.add(R('t1','2026-07-01T10:00',300,'expense','未分类','七月火车票'));
  t.add(R('t2','2026-09-01T10:00',200,'expense','未分类','九月酒店'));
  db=await t.db();
  const aidT=aidOf(db, ID_A, '旅行');
  ok(aidT!==aid && Object.keys(blocksOf(db, ID_A)[aidT]).join(',')==='2026-07,2026-09', '4 新存档有自己的存档号和月份块');
  // 删存档写到一半死掉：存档和它的块都还在
  breakPut(k=>k===`led_${ID_A}_m`, 'abort');
  t.$('delArchive').click(); t.$('askOk').click(); await t.idle();
  restore();
  db=await t.db();
  ok(metaOf(db, ID_A).archives['旅行'] && blocksOf(db, ID_A)[aidT], '4 删存档写到一半死掉：meta 和块都没动');
  t.$('askOk').click();
  log=logOps();
  t.w.dispatchEvent(new t.w.Event('pagehide'));
  db=await t.db(); restore();
  ok(!metaOf(db, ID_A).archives['旅行'] && !blocksOf(db, ID_A)[aidT], '4 补写后：存档和它的月份块都删了');
  ok(log.includes(`del led_${ID_A}_${aidT}_2026-07`) && log.includes(`del led_${ID_A}_${aidT}_2026-09`), '4 两个月份块是删掉的');
  ok(blocksOf(db, ID_A)[aid] && merged(db, ID_A).archives['日常 / 50%😀'].records.length===RECS_A.length, '4 别的存档不受影响');
  const t2=await reboot(t);
  ok(t2.inMain() && t2.list().includes('十月午饭') && !t2.errs.length, '4 重开照常 '+t2.errs.join('|'));
}

// ===== 5. 没有时间的记录：补上时间后搬进月份块，none 块删掉 =====
{
  const t=await boot(OLD_LS);
  const aid=aidOf(await t.db(), ID_A, '默认存档');
  const log=logOps();
  t.edit('a5', { time:'2026-09-09T09:09' }); await t.idle();
  restore();
  const bl=blocksOf(await t.db(), ID_A)[aid];
  ok(!bl.none && bl['2026-09'].includes('没写时间的'), '5 进了九月块，空了的 none 块删掉');
  ok(log.includes(`del led_${ID_A}_${aid}_none`), '5 none 块是删掉的（不是留个空的）');
  t.edit('a5', { time:'不像时间' }); await t.idle();
  ok(blocksOf(await t.db(), ID_A)[aid].none.includes('没写时间的'), '5 时间不合法的又回到 none 块');
}

// ===== 6. 改分类名、账号改名 =====
{
  const t=await boot(OLD_LS);
  const aid=aidOf(await t.db(), ID_A, '默认存档');
  let log=logOps();
  t.w.eval("renameCat('餐饮')"); t.prompt('吃饭'); await t.idle();
  restore();
  const db=await t.db();
  ok(merged(db, ID_A).archives['默认存档'].records.filter(r=>r.cat==='吃饭').length===3, '6 改分类名：三条记录跟着改了');
  ok(!log.includes(`put led_${ID_A}_${aid}_none`) && log.includes(`put led_${ID_A}_${aid}_2026-08`) && log.includes(`put led_${ID_A}_${aid}_2026-10`) && log.includes(`put led_${ID_A}_m`),
     '6 只写用到这个分类的月份和 meta（'+log.join(',')+'）');
  log=logOps();
  t.$('editNameBtn').click(); t.prompt('明明'); await t.idle();
  restore();
  ok(JSON.stringify(log)===JSON.stringify([`put led_${ID_A}_m`]) && metaOf(await t.db(), ID_A).accountName==='明明', '6 账号改名只写 meta，不搬数据（'+log.join(',')+'）');
}

// ===== 7. 坏了一块：只影响那一块 =====
{
  const t0=await boot(OLD_LS);
  const aid=aidOf(await t0.db(), ID_A, '默认存档');
  const k9=`led_${ID_A}_${aid}_2026-09`;
  await seedIdb(t0.phone, { [k9]:'{坏了' });
  const t=await reboot(t0);
  ok(t.inMain() && t.list().includes('十月午饭') && t.list().includes('八月夜宵') && !t.list().includes('九月聚餐'), '7 别的月份照常显示，坏的那个月看不到');
  let db=await t.db();
  const bk=realKeys(db).find(k=>k.startsWith(k9+'__corrupted_'));
  ok(bk && db[bk]==='{坏了', '7 坏块的原文另存了');
  ok(db[`led_${ID_A}_${aid}_2026-08`]===(await t0.db())[`led_${ID_A}_${aid}_2026-08`], '7 别的块没动');
  t.ls.setItem(`onedrive_link_${ID_A}__默认存档`, JSON.stringify({ uri:'content://a', name:'a.json', lastCount:1 }));
  await t.w.odSyncNow();
  ok(JSON.parse(t.ls.getItem(`onedrive_link_${ID_A}__默认存档`)).blocked===true, '7 云同步被拦住，不拿缺了一个月的账本覆盖云端');
  ok(!t.errs.length, '7 无报错 '+t.errs.join('|'));
  // 第一次保存时坏块按内存里的样子重写（和以前坏了的整本在第一次保存时被覆盖一样；原文已另存）
  t.add(R('a7','2026-10-09T10:00',1,'expense','餐饮','坏了以后记的'));
  db=await t.db();
  ok(db[k9]===undefined && realKeys(db).some(k=>k.startsWith(k9+'__corrupted_')), '7 第一次保存后：坏块清掉了，备份还在');
  const t2=await reboot(t);
  ok(t2.inMain() && t2.list().includes('坏了以后记的') && !t2.errs.length, '7 重开照常');
}

// ===== 8. meta 坏了：用月份块把存档重建出来，记录不丢 =====
{
  const t0=await boot(OLD_LS);
  await seedIdb(t0.phone, { ['led_'+ID_A+'_m']:'{"archives":坏了' });
  const t=await reboot(t0);
  ok(t.inMain() && t.$('archiveSelect').textContent.includes('恢复的存档 1'), '8 存档重建出来了，叫「恢复的存档 1」');
  ok(t.w.getUserData().length===RECS_A.length && t.list().includes('十月午饭'), '8 记录都在');
  const db=await t.db();
  const bk=realKeys(db).find(k=>k.startsWith('store_'+ID_A+'__corrupted_'));
  ok(bk && db[bk]==='{"archives":坏了', '8 坏的原文另存了');
  t.ls.setItem(`onedrive_link_${ID_A}__恢复的存档 1`, JSON.stringify({ uri:'content://a', name:'a.json', lastCount:1 }));
  await t.w.odSyncNow();
  ok(JSON.parse(t.ls.getItem(`onedrive_link_${ID_A}__恢复的存档 1`)).blocked===true, '8 云同步被拦住');
  t.add(R('a8','2026-10-09T10:00',1,'expense','餐饮','重建后记的'));
  const t2=await reboot(t);
  ok(t2.inMain() && t2.list().includes('重建后记的') && t2.w.getUserData().length===RECS_A.length+1 && !t2.open(), '8 保存后 meta 写好了，重开不再报坏');
}

// ===== 9. 从 1013-F 搬：中途被杀续搬、读回对不上、旧的删不掉 =====
const F_A=JSON.stringify(storeOf(RECS_A,'小明')), F_B=JSON.stringify(storeOf([R('b1','2026-10-02T12:00',5,'expense','餐饮','小红的早饭')],'小红'));
const F_SEED=Object.assign({}, BASE);
{
  // 正常搬
  const phone=IDB.newPhone(); await seedIdb(phone, { ['store_'+ID_A]:F_A, ['store_'+ID_B]:F_B });
  const t=await boot(F_SEED, { phone });
  const db=await t.db();
  ok(!realKeys(db).includes('store_'+ID_A) && db['store_'+ID_A]===F_A && db['store_'+ID_B]===F_B, '9 1013-F 的整段账本搬成分块，合起来逐字节一样');
  ok(t.inMain() && t.list().includes('十月午饭') && !t.open(), '9 搬完自动进入，不弹提示');
}
{
  // 旧的删不掉（相当于写好新块、还没删旧的就被杀）：先不让进；下次打开删掉旧的就算完，不另存冲突
  const phone=IDB.newPhone(); await seedIdb(phone, { ['store_'+ID_A]:F_A, ['store_'+ID_B]:F_B });
  breakDel(k=>k==='store_'+ID_B);
  const t=await boot(F_SEED, { phone });
  restore();
  let db=await t.db();
  ok(realKeys(db).includes('store_'+ID_B) && realKeys(db).includes('led_'+ID_B+'_m'), '9 旧的删不掉：两边都在');
  ok(t.open() && t.msg().includes('小红') && !t.msg().includes('小明'), '9 提示点名小红没整理完');
  t.$('askOk').click(); t.$('logoutBtn').click(); t.chip('小红').click(); await t.idle();
  ok(!t.inMain() && t.msg().includes('还没整理完'), '9 小红先不让进（不然下次会被旧的盖回来）');
  t.$('askOk').click();
  t.chip('小明').click(); await t.idle();
  ok(t.inMain() && t.list().includes('十月午饭'), '9 小明不受影响');
  const t2=await reboot(t);
  db=await t2.db();
  ok(!realKeys(db).includes('store_'+ID_B) && db['store_'+ID_B]===F_B, '9 下次打开：新块已经对，删掉旧的就算完');
  ok(!realKeys(db).some(k=>k.startsWith('migrate_conflict_')), '9 一样的东西不另存冲突备份');
  ok(!t2.open(), '9 不再提示');
}
{
  // 读回来对不上（写进去的不是想写的）：先不让进、旧的不删；下次打开重搬
  const phone=IDB.newPhone(); await seedIdb(phone, { ['store_'+ID_A]:F_A, ['store_'+ID_B]:F_B });
  breakPut(k=>k.startsWith('led_'+ID_A+'_a'), 'tamper');
  const t=await boot(F_SEED, { phone });
  restore();
  let db=await t.db();
  ok(realKeys(db).includes('store_'+ID_A) && db['store_'+ID_A]===F_A, '9 读回对不上：旧的原样留着');
  ok(!t.inMain() && t.open() && t.msg().includes('小明'), '9 小明先不让进，提示点名');
  const t2=await reboot(t);
  db=await t2.db();
  ok(!realKeys(db).includes('store_'+ID_A) && db['store_'+ID_A]===F_A, '9 下次打开重搬成功，内容是旧的那份');
  ok(t2.inMain() && t2.list().includes('十月午饭') && !t2.list().includes('拾月'), '9 进去看到的是对的');
}

// ===== 10. 两边不一样（装回过 1013-F 又在那边记了账）：旧位置那份是最新的，分块那份另存，一条不删 =====
{
  const phone=IDB.newPhone(); await seedIdb(phone, { ['store_'+ID_A]:F_A, ['store_'+ID_B]:F_B });
  const t=await boot(F_SEED, { phone });
  t.add(R('n1','2026-10-09T12:00',66,'expense','餐饮','新版里记的')); await t.idle();
  const newer=(await t.db())['store_'+ID_A];
  // 1013-F 只认 store_<编号>：它在那里写了一本（装回旧版后，旧版看到的是空账本，记了一笔）
  const fromF=JSON.stringify(storeOf([R('f1','2026-10-11T12:00',7,'expense','餐饮','旧版里记的')],'小明'));
  await seedIdb(phone, { ['store_'+ID_A]:fromF });
  const t2=await reboot(t);
  const db=await t2.db();
  ok(!realKeys(db).includes('store_'+ID_A) && db['store_'+ID_A]===fromF, '10 旧位置那份搬进了分块');
  const ck=realKeys(db).find(k=>k.startsWith('migrate_conflict_store_'+ID_A+'_'));
  ok(ck && db[ck]===newer, '10 分块原来那份合成一整本另存着（1013-F 的格式），没删');
  ok(t2.inMain() && t2.list().includes('旧版里记的'), '10 进去看到的是最新的');
}

// ===== 11. 旧的那本本身就坏了：和 1013-F 一样不白屏、另存原文、暂停云同步，第一次保存才覆盖 =====
{
  const phone=IDB.newPhone(); await seedIdb(phone, { ['store_'+ID_A]:'{坏了', ['store_'+ID_B]:F_B });
  const t=await boot(F_SEED, { phone });
  let db=await t.db();
  // 搬的时候原文原样放到 meta 的位置；进入账号会存一次（记下当前存档），和 1013-F 一样这时就覆盖成正常的空账本了
  ok(!realKeys(db).includes('store_'+ID_A) && metaOf(db, ID_A).archives['默认存档'], '11 搬完：旧键删了，进入账号后 meta 已是正常的空账本');
  ok(t.inMain() && t.list().includes('暂无记账记录'), '11 进去是空账本，不白屏');
  ok(realKeys(db).some(k=>k.startsWith('store_'+ID_A+'__corrupted_') && db[k]==='{坏了'), '11 原文另存了');
  t.ls.setItem(`onedrive_link_${ID_A}__默认存档`, JSON.stringify({ uri:'content://a', name:'a.json', lastCount:1 }));
  await t.w.odSyncNow();
  ok(JSON.parse(t.ls.getItem(`onedrive_link_${ID_A}__默认存档`)).blocked===true, '11 云同步被拦住');
  t.add(R('c1','2026-10-09T12:00',1,'expense','未分类','坏了以后记的'));
  db=await t.db();
  ok(merged(db, ID_A).archives['默认存档'].records.length===1, '11 第一次保存写成了正常的分块');
}

// ===== 12. 往别的账号导入：整批一个事务；内存只留当前账号 =====
{
  const t=await boot(OLD_LS);
  t.$('logoutBtn').click();
  const backup=JSON.stringify({ app:'记问', user:'小红', archive:'导入的', cats:['未分类'], data:[
    R('z1','2026-06-01T12:00',9,'expense','未分类','六月的'), R('z2','2026-07-01T12:00',8,'expense','未分类','七月的') ] });
  const pick=async(text)=>{
    const input=t.$('loginImportFile');
    Object.defineProperty(input,'files',{value:[new t.w.File([text],'备份.json',{type:'application/json'})],configurable:true});
    input.dispatchEvent(new t.w.Event('change'));
    for(let i=0;i<50 && !t.open();i++) await new Promise(r=>setTimeout(r,10));
    await t.idle();
    [...t.$('askChoices').querySelectorAll('.cc')].find(e=>e.textContent.startsWith('小红')).click();
    t.$('askOk').click(); await t.idle();
  };
  breakPut(k=>k.startsWith('led_'+ID_B+'_a') && k.endsWith('2026-07'), 'abort');
  await pick(backup);
  restore();
  let db=await t.db();
  ok(t.msg().includes('导入失败') && !metaOf(db, ID_B).archives['导入的'] && !realKeys(db).some(k=>k.startsWith('led_'+ID_B+'_a') && k.endsWith('2026-06')),
     '12 写到一半死掉：导入失败，一个月份块都没留下，meta 没变');
  t.$('askOk').click();
  await pick(backup);
  db=await t.db();
  ok(t.title()==='导入成功' && merged(db, ID_B).archives['导入的'].records.length===2 && merged(db, ID_B).archives['默认存档'].records[0].remark==='小红的早饭', '12 再导一次成功，小红原来的账还在');
  t.$('askOk').click();   // 「立即进入」
  await t.idle();
  ok(t.inMain() && JSON.stringify(t.w.eval('[...__ledger.keys()]'))===JSON.stringify(['store_'+ID_B]), '12 进了小红，内存里只留小红');
  // 别的账号有没写进去的修改：先留在内存里，写完再丢
  breakPut(led=>led.startsWith('led_'+ID_B), 'quota');
  t.add(R('b9','2026-10-09T12:00',3,'expense','餐饮','没写进去的')); await t.idle();
  t.$('askOk').click();
  restore();
  t.$('logoutBtn').click(); t.chip('小明').click(); await t.idle();
  ok(JSON.stringify(t.w.eval('[...__ledger.keys()].sort()'))===JSON.stringify(['store_'+ID_A, 'store_'+ID_B].sort()), '12 小红有没写进去的修改：换账号时先留着');
  t.w.dispatchEvent(new t.w.Event('pagehide')); await t.idle();
  const arcsB=merged(await t.db(), ID_B).archives;
  ok(Object.keys(arcsB).some(n=>arcsB[n].records.some(r=>r.remark==='没写进去的')), '12 切后台时补写进去了');
}

// ===== 13. 记录不能直接改；改了副本不保存不影响缓存 =====
{
  const t=await boot(OLD_LS);
  let threw=false;
  try{ t.w.getUserData()[0].cat='乱改'; }catch(_){ threw=true; }
  ok(threw && t.w.getUserData()[0].cat==='餐饮', '13 直接改缓存里的记录会被拦下（测试里报错，App 里改不动）');
  threw=false;
  try{ t.w.loadStore().archives['默认存档'].records[1].money=0; }catch(_){ threw=true; }
  ok(threw && t.w.getUserData()[1].money===5, '13 从 loadStore 拿到的记录也一样');
  const d=t.w.getUserData(); d.pop(); d.push(R('x','2026-10-09T00:00',1,'expense','餐饮','没存的'));
  ok(t.w.getUserData().length===RECS_A.length && !t.w.getUserData().some(r=>r.remark==='没存的'), '13 数组随便改，不保存就不影响缓存');
  // 插到中间：整个存档重新编号，顺序照调用方的
  const e=t.w.getUserData(); e.splice(2, 0, R('mid','2026-07-07T07:07',2,'expense','餐饮','插在中间的')); t.w.saveUserData(e); await t.idle();
  const t2=await reboot(t);
  ok(JSON.stringify(t2.w.getUserData().map(r=>r.id))===JSON.stringify(e.map(r=>r.id)), '13 插到中间：重开后顺序照旧');
}

// ===== 14. 账号列表坏了：从 meta 里找回账号和名字 =====
{
  const t0=await boot(OLD_LS);
  const ls=t0.dump(); ls.accounts='坏了';
  const t=await boot(ls, { phone:t0.phone });
  const list=JSON.parse(t.ls.getItem('accounts'));
  ok(list.some(a=>a.id===ID_A && a.name==='小明') && list.some(a=>a.id===ID_B && a.name==='小红'), '14 两个账号都从 meta 找回来了，名字也对');
}

// ===== 15. 装回 1013-F（设了 OLD_HTML 才跑）=====
{
  const oldFile=process.env.OLD_HTML;
  if(oldFile && fs.existsSync(oldFile)){
    const oh=fs.readFileSync(oldFile,'utf8');
    const t=await boot(OLD_LS);
    const before=await t.db();
    const ls=t.dump(); ls.app_logged_in_user='';
    const o=await boot(ls, { phone:t.phone, html:oh });
    o.chip('小明').click(); await o.idle();
    ok(o.inMain() && o.list().includes('暂无记账记录') && !o.errs.length, '15 装回 1013-F：能进账号，看到的是空账本，不报错 '+o.errs.join('|'));
    const mid=await o.db();
    ok(realKeys(before).filter(k=>k.startsWith('led_')).every(k=>mid[k]===before[k]), '15 1013-F 不碰分块的数据');
    // 在 1013-F 里记一笔，再装回新版：1013-F 那份算最新的，分块那份另存
    const d=o.w.getUserData(); d.push(R('f9','2026-10-11T12:00',7,'expense','餐饮','旧版里记的')); o.w.saveUserData(d); await o.idle();
    const t2=await boot(o.dump(), { phone:t.phone });
    const db=await t2.db();
    const ck=realKeys(db).find(k=>k.startsWith('migrate_conflict_store_'+ID_A+'_'));
    ok(t2.inMain() && t2.list().includes('旧版里记的') && ck && db[ck]===before['store_'+ID_A], '15 再装回新版：看到 1013-F 里记的，原来的分块合成一整本另存着');
  } else console.log('  （没设 OLD_HTML，跳过「装回 1013-F」）');
}

console.log(`\n${pass} 通过，${fail} 失败`);
process.exit(fail?1:0);
})();
