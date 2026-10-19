// 1010-K7 专项：账号改为内部编号。node m-accounts.test.js <html>
// 覆盖：新建账号、老数据迁移（含中途失败续跑）、账号列表损坏找回、移走/找回账号、改名、导出带编号。
const fs=require('fs'); const {JSDOM}=require('jsdom'); const IDB=require('./helpers/idb');
const html=fs.readFileSync(process.argv[2]||require('path').join(__dirname,'..','www','index.html'),'utf8');
let pass=0, fail=0; const ok=(c,n)=>{ if(c) pass++; else { fail++; console.log('  ✗ '+n); } };
const NOW='2026-10-10T14:00:00';
const ID_RE=/^u\d{19}$/;
const R=(id,time,money,type,cat,remark)=>({id,time,money,type,cat,remark:remark||''});
const store=(recs, arcs)=>JSON.stringify({ archives:Object.assign({'默认存档':{cats:['未分类','餐饮'],records:recs||[]}}, arcs||{}), last:'默认存档' });

// seed：启动前写进 localStorage 的键值；failWhen(k)：返回 true 时这个键写入失败（模拟存储满）
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
  const chips=()=>[...$('recentUsers').querySelectorAll('.user-chip')].map(c=>c.querySelector('span').textContent);
  const chip=n=>[...$('recentUsers').querySelectorAll('.user-chip')].find(c=>c.querySelector('span').textContent===n);
  const inMain=()=>$('mainBox').style.display==='block';
  const prompt=async v=>{ $('askInput').value=v; $('askOk').click(); await IDB.idle(w); };
  return {w,d,$,ls,errs,keys,dump,accts,idOf,chips,chip,inMain,prompt};
}

// 重启 App：同一台手机（同一个 IndexedDB），localStorage 用给定的快照
async function reboot(t, ls, failWhen){ __phone=t.phone; try{ return await boot(null, failWhen||null, ls); } finally{ __phone=null; } }

(async()=>{
// ===== 1. 新装：没有账号，新建一个 =====
{
  const t=await boot();
  ok(!t.inMain() && t.$('recentUsers').textContent.includes('还没有账号'), '1 新装停在登录页，提示先新建');
  ok(!t.$('userNameInput') && t.$('newAccountBtn'), '1 登录页没有输入框，有「新建账号」');
  t.$('newAccountBtn').click();
  ok(t.$('askTitle').textContent==='新建账号', '1 弹出新建账号');
  await t.prompt('');            ok(t.$('askErr').style.display!=='none', '1 名字不能为空');
  await t.prompt('一二三四五六七八九'); ok(t.$('askErr').textContent.includes('8'), '1 超过 8 个字被拦');
  await t.prompt('小明');
  const id=t.idOf('小明');
  ok(ID_RE.test(id), '1 账号有编号 '+id);
  ok(t.inMain(), '1 建好直接进入');
  ok(t.ls.getItem('app_logged_in_user')===id, '1 自动登录记的是编号');
  ok(JSON.parse((await t.db())['store_'+id]).accountName==='小明', '1 名字抄进了账本（账本在 IndexedDB）');
  ok(t.ls.getItem('store_'+id)===null, '1 账本不在 localStorage');
  ok(t.ls.getItem('store_小明')===null, '1 不再按名字存');
  t.$('logoutBtn').click();
  t.$('newAccountBtn').click(); await t.prompt('小明');
  ok(t.$('askErr').textContent.includes('已经有'), '1 同名账号建不了');
  ok(!t.errs.length, '1 无报错 '+t.errs.join('|'));
}

// ===== 2. 老数据迁移：几个账号、各种数据都搬到编号下 =====
const LEGACY={
  users_index:JSON.stringify(['乙','甲']),
  'store_甲':store([R('a1','2026-10-01T12:00',20,'expense','餐饮','午饭')], {'旅行':{cats:['未分类'],records:[R('a2','2026-10-02T12:00',300,'expense','未分类','车票')]}}),
  'store_乙':store([R('b1','2026-10-03T12:00',5,'expense','餐饮','')]),
  'store_丙':store([R('c1','2026-10-04T12:00',7,'expense','餐饮','')]),     // 以前被移出了最近账号
  'days_甲':JSON.stringify([{id:'d1',name:'元旦',date:'2027-01-01',pin:true}]),
  'days_card_n_甲':'5',
  'app_time_repaired_甲':'1',
  'store_甲__corrupted_1700000000000':'{坏数据',
  'onedrive_link_甲__默认存档':JSON.stringify({uri:'content://a',name:'a.json'}),
  'onedrive_link_甲__旅行':JSON.stringify({uri:'content://b',name:'b.json'}),
  'onedrive_link_甲__x__别人':JSON.stringify({uri:'content://z',name:'z.json'}),   // 不属于甲
  'app_logged_in_user':'甲',
  'app_appearance':'{"x":1}',
};
{
  const t=await boot(LEGACY);
  const A=t.accts();
  const ja=A.find(a=>a.name==='甲'), yi=A.find(a=>a.name==='乙'), bing=A.find(a=>a.name==='丙');
  ok(ja && yi && bing && [ja,yi,bing].every(a=>ID_RE.test(a.id)), '2 三个老账号都有了编号');
  ok(!ja.hidden && !yi.hidden && bing.hidden===true, '2 以前移出列表的「丙」记为已移走');
  ok(A.every(a=>!('legacy' in a)), '2 迁移完不留老名字记号');
  ok(t.ls.getItem('accounts_v')==='1' && t.ls.getItem('users_index')===null, '2 打上完成标记，老索引删掉');
  const J=ja.id;
  const db=await t.db();
  ok(JSON.parse(db['store_'+J]).archives['旅行'].records[0].id==='a2', '2 甲的账本搬过去了（两个存档都在，在 IndexedDB）');
  ok(!t.keys().some(k=>/^store_u\d{19}$/.test(k)), '2 localStorage 里不再有账本');
  ok(db['store_'+yi.id] && db['store_'+bing.id], '2 乙、丙的账本也进了 IndexedDB');
  ok(t.ls.getItem('days_'+J).includes('元旦') && t.ls.getItem('days_card_n_'+J)==='5' && t.ls.getItem('app_time_repaired_'+J)==='1', '2 日子、入口卡条数、修复标记都搬了');
  ok(t.ls.getItem('store_'+J+'__corrupted_1700000000000')==='{坏数据', '2 损坏备份也搬了');
  ok(JSON.parse(t.ls.getItem('onedrive_link_'+J+'__默认存档')).uri==='content://a' && JSON.parse(t.ls.getItem('onedrive_link_'+J+'__旅行')).uri==='content://b', '2 两个存档的云备份连接都搬了');
  ok(t.ls.getItem('onedrive_link_甲__x__别人')!==null && t.ls.getItem('onedrive_link_'+J+'__x__别人')===null, '2 不误搬别人的连接');
  const leftovers=t.keys().filter(k=>/(^|_)(甲|乙|丙)(__|$)/.test(k) && k!=='onedrive_link_甲__x__别人');
  ok(leftovers.length===0, '2 老名字下的键都清掉了 '+leftovers.join(','));
  ok(t.ls.getItem('app_appearance')==='{"x":1}', '2 全机设置不动');
  ok(t.inMain() && t.ls.getItem('app_logged_in_user')===J, '2 自动登录换成编号，直接进入甲');
  ok(t.$('billList').textContent.includes('午饭'), '2 进去能看到原来的账单');
  ok(t.$('daysEntryRows').textContent.includes('元旦'), '2 进去能看到原来的日子');
  ok(t.$('odStatus').textContent.includes('已连接'), '2 云备份仍是已连接');
  ok(!t.errs.length, '2 无报错 '+t.errs.join('|'));

  // 再启动一次：什么都不该变
  const snap=t.dump(), dbSnap=JSON.stringify(await t.db());
  const t2=await reboot(t, snap);
  ok(JSON.stringify(t2.dump())===JSON.stringify(snap), '2 第二次启动不再迁移，数据原样');
  ok(JSON.stringify(await t2.db())===dbSnap, '2 第二次启动 IndexedDB 里也原样');
}

// ===== 3. 登录页：顺序、移走、找回 =====
{
  const t=await boot(Object.assign({}, LEGACY, { app_logged_in_user:'' }));
  ok(!t.inMain(), '3 没记住登录：停在登录页');
  ok(t.chips().join(',')==='乙,甲', '3 账号按以前「最近使用」的顺序排，移走的不显示');
  ok(t.$('hiddenToggle') && t.$('hiddenToggle').textContent.includes('1'), '3 底部有「已移走的账号（1）」');
  t.$('hiddenToggle').click();
  ok(t.chips().includes('丙'), '3 点开能看到丙');
  t.chip('丙').click(); await t.idle();
  ok(t.inMain() && t.$('billList').textContent.includes('7.00'), '3 点丙进入，账单都在');
  ok(!t.accts().find(a=>a.name==='丙').hidden && t.accts()[0].name==='丙', '3 进过就恢复显示、排到最前');
  t.$('logoutBtn').click();
  t.chip('乙').querySelector('.u-del').click();
  ok(t.$('askMsg').textContent.includes('不会删除'), '3 移走前说明数据不会删');
  t.$('askOk').click(); await t.idle();
  ok(!t.chips().includes('乙') && t.accts().find(a=>a.name==='乙').hidden===true, '3 乙被移走');
  ok((await t.db())['store_'+t.idOf('乙')]!==undefined, '3 乙的数据还在');
}

// ===== 4. 迁移中途失败（存储满）：老数据不丢，账号先不让进，下次启动续上 =====
{
  let J;
  const fail=k=>k.startsWith('days_u');      // 日子搬不过去
  const t=await boot(LEGACY, fail);
  ok(t.ls.getItem('accounts_v')===null, '4 没打完成标记');
  ok(t.$('askMsg').textContent.includes('没有全部完成'), '4 如实提示没整理完');
  ok(t.ls.getItem('days_甲')!==null, '4 搬失败的日子还在老位置');
  ok(!t.inMain(), '4 没整理完不自动进入');
  J=t.idOf('甲');
  t.$('askOk').click(); await t.idle();
  t.chip('甲').click(); await t.idle();
  ok(!t.inMain() && t.$('askMsg').textContent.includes('还没整理完'), '4 点甲也先不让进（免得建出空账本）');
  ok(t.ls.getItem('store_'+J)!==null, '4 能搬的账本已经搬到编号下（还在 localStorage，名字那步没搬完不搬库）');
  ok((await t.db())['store_'+J]===undefined, '4 没整理完的账号，账本先不进 IndexedDB');
  // 下次启动，存储正常了
  const t2=await reboot(t, t.dump());
  ok(t2.ls.getItem('accounts_v')==='1', '4 第二次启动续上，打上完成标记');
  ok(t2.idOf('甲')===J, '4 续跑沿用同一个编号');
  ok(t2.ls.getItem('days_'+J).includes('元旦') && t2.ls.getItem('days_甲')===null, '4 日子这次搬过去了');
  ok(t2.inMain() && t2.$('billList').textContent.includes('午饭'), '4 自动进入甲，账单都在');
  ok(t2.ls.getItem('store_'+J)===null && (await t2.db())['store_'+J], '4 这次账本也进了 IndexedDB');
}

// ===== 5. 更早期的 billData_ 格式也能迁移 =====
{
  const t=await boot({ 'billData_老用户':JSON.stringify([R('o1','2026-09-01T12:00',9,'expense','餐饮','很早的账')]), users_index:JSON.stringify(['老用户']) });
  t.chip('老用户').click(); await t.idle();
  ok(t.inMain() && t.$('billList').textContent.includes('很早的账'), '5 billData_ 老账也能进去看到');
}

// ===== 6. 账号列表坏了：从账本里把名字找回来 =====
{
  const t0=await boot(LEGACY);
  const snap=t0.dump(); const J=t0.idOf('甲');
  snap.accounts='{坏了';
  const t=await reboot(t0, snap);
  ok(t.idOf('甲')===J && t.idOf('乙') && t.idOf('丙'), '6 三个账号按账本里的名字找回');
  ok(t.keys().some(k=>k.startsWith('accounts__corrupted_')), '6 坏掉的原文另存了一份');
  ok(t.inMain(), '6 仍能自动进入');
}

// ===== 7. 改名：重名被拦；改完导出带编号和新名字 =====
{
  const t=await boot(LEGACY);
  const J=t.idOf('甲');
  t.$('editNameBtn').click(); await t.prompt('乙');
  ok(t.$('askErr').textContent.includes('已经有'), '7 不能改成别的账号的名字');
  await t.prompt('阿甲');
  ok(t.idOf('阿甲')===J && (await t.db())['store_'+J]!==undefined, '7 改名后编号和数据都不变');
  ok(JSON.parse((await t.db())['store_'+J]).accountName==='阿甲', '7 新名字也抄进了库里的账本');
  const p=t.w.JiwenStore.odBuildPayload();
  ok(p.accountId===J && p.user==='阿甲', '7 备份文件里带账号编号和新名字');
}

// ===== 8. 两个老名字截到 8 个字后撞名：自动加序号区分 =====
{
  const t=await boot({ users_index:JSON.stringify(['一二三四五六七八A','一二三四五六七八B']),
    'store_一二三四五六七八A':store(), 'store_一二三四五六七八B':store() });
  const names=t.accts().map(a=>a.name);
  ok(names.length===2 && new Set(names).size===2 && names.every(n=>Array.from(n).length<=8), '8 名字都不超过 8 字且不重名：'+names.join(','));
}

console.log(`\n${pass} 通过，${fail} 失败`);
process.exit(fail?1:0);
})();
