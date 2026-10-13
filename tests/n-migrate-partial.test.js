// 1013-B 专项：迁移没一次搬完时。node n-migrate-partial.test.js <html>
// 覆盖：搬完的账号马上能进（不被别的卡住的账号拖累）、提示里点名没整理完的账号、
//      没整理完的账号不能往里导入、1013-A 里已经导进去的那份不再把老账本挡在外面。
const fs=require('fs'); const {JSDOM}=require('jsdom'); const IDB=require('./helpers/idb');
const html=fs.readFileSync(process.argv[2]||require('path').join(__dirname,'..','www','index.html'),'utf8');
let pass=0, fail=0; const ok=(c,n)=>{ if(c) pass++; else { fail++; console.log('  ✗ '+n); } };
const NOW='2026-10-10T14:00:00';
const R=(id,time,money,type,cat,remark)=>({id,time,money,type,cat,remark:remark||''});
const store=(recs, arcs)=>JSON.stringify({ archives:Object.assign({'默认存档':{cats:['未分类','餐饮'],records:recs||[]}}, arcs||{}), last:'默认存档' });
const recIds=s=>{ try{ return Object.values(JSON.parse(s).archives).flatMap(a=>a.records.map(r=>r.id)); }catch(_){ return []; } };

// failWhen(k)：返回 true 时这个键写入失败（模拟存储满）。传进来的函数可以随时改主意（比如腾出空间以后）
let __lastW=null, __phone=null, __lastPhone=null;
async function boot(...a){ const t=bootSync(...a); const __w=__lastW, __p=__lastPhone; t.idle=()=>IDB.idle(__w); t.phone=__p; t.db=async()=>{ await IDB.idle(__w); return IDB.dumpDb(__p); }; await IDB.idle(__w); return t; }
function bootSync(seed, failWhen, keepLs){
  const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/',beforeParse(w){ __lastW=w; __lastPhone=IDB.install(w, __phone);
    const ls=w.localStorage;
    if(keepLs) Object.keys(keepLs).forEach(k=>ls.setItem(k, keepLs[k]));
    Object.keys(seed||{}).forEach(k=>ls.setItem(k, seed[k]));
    if(failWhen){
      const S=w.Storage.prototype, orig=S.setItem;
      S.setItem=function(k,v){ if(failWhen(String(k))) throw new Error('quota'); return orig.call(this,k,v); };
    }
    w.scrollTo=()=>{}; w.HTMLElement.prototype.scrollIntoView=function(){};
    w.Capacitor={ isNativePlatform:()=>true, Plugins:{ OneDriveLink:{ writeText:async()=>{}, pickFile:async()=>({}), forget:async()=>{} } } };
    w.Date=class extends Date{constructor(...x){x.length?super(...x):super(NOW);}static now(){return new Date(NOW).getTime();}};}});
  const errs=[]; dom.window.addEventListener('error',e=>errs.push(e.message));
  const w=dom.window, d=w.document, $=id=>d.getElementById(id), ls=w.localStorage;
  const keys=()=>{ const a=[]; for(let i=0;i<ls.length;i++) a.push(ls.key(i)); return a.sort(); };
  const dump=()=>{ const o={}; keys().forEach(k=>o[k]=ls.getItem(k)); return o; };
  const accts=()=>JSON.parse(ls.getItem('accounts')||'[]');
  const idOf=n=>{ const a=accts().find(x=>x.name===n); return a?a.id:null; };
  const chip=n=>[...$('recentUsers').querySelectorAll('.user-chip')].find(c=>c.querySelector('span').textContent===n);
  const inMain=()=>$('mainBox').style.display==='block';
  const open=()=>$('askMask').style.display!=='none';
  const title=()=>$('askTitle').textContent, msg=()=>$('askMsg').textContent;
  const choices=()=>[...$('askChoices').querySelectorAll('.cc')].map(e=>e.textContent);
  const pick=async(inputId, text)=>{
    const input=$(inputId);
    const file=new w.File([text],'备份.json',{type:'application/json'});
    Object.defineProperty(input,'files',{value:[file],configurable:true});
    input.dispatchEvent(new w.Event('change'));
    for(let i=0;i<50 && !open();i++) await new Promise(r=>setTimeout(r,10));
  };
  return {w,d,$,ls,errs,keys,dump,accts,idOf,chip,inMain,open,title,msg,choices,pick};
}

const LEGACY={
  users_index:JSON.stringify(['乙','甲']),
  'store_甲':store([R('a1','2026-10-01T12:00',20,'expense','餐饮','午饭')]),
  'store_乙':store([R('b1','2026-10-03T12:00',5,'expense','餐饮','早饭')]),
  'days_甲':JSON.stringify([{id:'d1',name:'元旦',date:'2027-01-01'}]),
  'app_logged_in_user':'乙',
};
const daysFail=k=>/^days_u\d{19}$/.test(k);   // 只有甲有日子：甲搬不完，乙能搬完

// 重启 App：同一台手机（同一个 IndexedDB），localStorage 用给定的快照
async function reboot(t, ls, failWhen){ __phone=t.phone; try{ return await boot(null, failWhen||null, ls); } finally{ __phone=null; } }

(async()=>{
// ===== 1. 甲卡住，乙已经搬完：乙照常自动进入，提示里只点名甲 =====
{
  const t=await boot(LEGACY, daysFail);
  const yi=t.accts().find(a=>a.name==='乙'), jia=t.accts().find(a=>a.name==='甲');
  ok(t.ls.getItem('accounts_v')===null, '1 没打完成标记');
  ok(!('legacy' in yi) && typeof jia.legacy==='string', '1 乙去掉了老名字记号，甲还留着');
  ok(t.inMain() && t.$('billList').textContent.includes('早饭'), '1 上次用的乙已经搬完，照常自动进入');
  ok(t.title()==='提示' && t.msg().includes('没有全部完成') && t.msg().includes('「甲」暂时进不去') && !t.msg().includes('「乙」'), '1 提示点名甲，不提乙');
  ok(JSON.parse((await t.db())['store_'+yi.id]).accountName==='乙', '1 乙的名字抄进了账本（已进 IndexedDB）');
  ok(t.ls.getItem('days_甲')!==null && t.ls.getItem('store_甲')===null, '1 甲没搬完的日子留在老位置');
  ok(!t.errs.length, '1 无报错 '+t.errs.join('|'));

  // 退回登录页：乙能进，甲还不让进
  t.$('askOk').click(); await t.idle(); t.$('logoutBtn').click();
  t.chip('甲').click(); await t.idle();
  ok(!t.inMain() && t.msg().includes('还没整理完'), '1 点甲仍先不让进');
  t.$('askOk').click(); await t.idle();
  t.chip('乙').click(); await t.idle();
  ok(t.inMain(), '1 点乙能进');

  // 存储一直满：第二次打开，乙仍然能进
  const t2=await reboot(t, t.dump(), daysFail);
  ok(t2.inMain() && t2.$('billList').textContent.includes('早饭') && t2.msg().includes('「甲」暂时进不去'), '1 卡住的情况一直在，乙照样自动进入，提示还在');
  t2.$('askOk').click(); await t2.idle();

  // 存储恢复：甲续上，打完成标记
  const t3=await reboot(t2, t2.dump());
  ok(t3.ls.getItem('accounts_v')==='1' && t3.accts().every(a=>!('legacy' in a)), '1 存储恢复后全部整理完');
  ok(t3.ls.getItem('users_index')===null, '1 老的账号索引收掉了');
  t3.$('logoutBtn').click(); t3.chip('甲').click(); await t3.idle();
  ok(t3.inMain() && t3.$('billList').textContent.includes('午饭') && t3.ls.getItem('days_'+jia.id).includes('元旦'), '1 甲的账单和日子都在');
}

// ===== 2. 没整理完时，登录页导入：选不到这个账号 =====
{
  const t=await boot(LEGACY, daysFail);
  t.$('askOk').click(); await t.idle(); t.$('logoutBtn').click();
  const backup=JSON.stringify({ app:'记问', user:'甲', archive:'备份', cats:['未分类','餐饮'],
    data:[R('z1','2026-09-01T12:00',99,'expense','餐饮','导入的')] });
  await t.pick('loginImportFile', backup);
  ok(t.title()==='导入到账号', '2 弹出选账号');
  const c=t.choices();
  ok(c.some(x=>x.startsWith('乙')) && !c.some(x=>x.startsWith('甲')), '2 列表里有乙、没有还没整理完的甲');
  ok(!recIds(t.ls.getItem('store_'+t.idOf('甲'))).includes('z1') && (await t.db())['store_'+t.idOf('甲')]===undefined, '2 没有东西导进甲');
}

// ===== 3. 全部账号都没整理完：登录页导入直接走新建，不会导进它们 =====
{
  const t=await boot({ users_index:'["甲"]', 'store_甲':LEGACY['store_甲'], 'days_甲':LEGACY['days_甲'] }, daysFail);
  t.$('askOk').click(); await t.idle();
  await t.pick('loginImportFile', JSON.stringify({ app:'记问', user:'丁', archive:'备份', data:[R('z2','2026-09-01T12:00',1,'expense','餐饮','')] }));
  ok(t.title()==='新建账号' && t.$('askInput').value==='丁', '3 唯一的账号没整理完，直接新建');
}

// ===== 4. 1013-A 留下的情况：没搬完时往甲里导入过，新位置已有一份别的账本 =====
{
  const J='u1760000000000000001';
  const imported=store([R('z1','2026-09-01T12:00',99,'expense','餐饮','导入的')]);
  const t=await boot({
    users_index:'["甲"]',
    accounts:JSON.stringify([{ id:J, name:'甲', legacy:'甲' }]),
    'store_甲':LEGACY['store_甲'],
    ['store_'+J]:imported,
    'app_logged_in_user':J,
  });
  ok(t.ls.getItem('accounts_v')==='1', '4 这次能整理完');
  ok(recIds((await t.db())['store_'+J]).includes('a1') && t.ls.getItem('store_甲')===null && t.ls.getItem('store_'+J)===null, '4 老账本搬进了甲的新位置（IndexedDB）');
  const k=t.keys().find(x=>x.startsWith(`migrate_conflict_store_${J}_`));
  ok(k && t.ls.getItem(k)===imported, '4 当时导进去的那份另存着，没删');
  ok(t.inMain() && t.$('billList').textContent.includes('午饭'), '4 自动进入甲，看得到原来的账单');
  ok(t.accts().length===1, '4 另存的那份不会被当成一个老账号');
  ok(!t.errs.length, '4 无报错 '+t.errs.join('|'));
}

// ===== 5. 同上，但另存也写不进去：这一项算没搬完，老数据原样不动 =====
{
  const J='u1760000000000000002';
  const imported=store([R('z1','2026-09-01T12:00',99,'expense','餐饮','导入的')]);
  const seed={ users_index:'["甲"]', accounts:JSON.stringify([{ id:J, name:'甲', legacy:'甲' }]),
    'store_甲':LEGACY['store_甲'], ['store_'+J]:imported };
  const t=await boot(seed, k=>k.startsWith('migrate_conflict_'));
  ok(t.ls.getItem('accounts_v')===null && typeof t.accts()[0].legacy==='string', '5 没打完成标记，甲还在整理中');
  ok(t.ls.getItem('store_甲')===LEGACY['store_甲'] && t.ls.getItem('store_'+J)===imported, '5 两份都原样不动');
  const t2=await reboot(t, t.dump());
  ok(t2.ls.getItem('accounts_v')==='1' && recIds((await t2.db())['store_'+J]).includes('a1'), '5 下次打开续上');
}

console.log(`${pass} 通过，${fail} 失败`);
process.exit(fail?1:0);
})();
