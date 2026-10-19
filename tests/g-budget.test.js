// 1010-G 预算专项：node test8.js <html>
const fs=require('fs'); const {JSDOM}=require('jsdom'); const IDB=require('./helpers/idb');
const html=fs.readFileSync(process.argv[2]||require('path').join(__dirname,'..','www','index.html'),'utf8');
let pass=0, fail=0; const ok=(c,n)=>{ if(c) pass++; else { fail++; console.log('  ✗ '+n); } };
const R=(id,time,money,type,cat,remark,extra)=>Object.assign({id,time,money,type,cat,remark},extra||{});
const base=()=>[
  R('g1','2026-10-04T16:20',29.91,'expense','游戏','游戏充值'),
  R('g2','2026-10-09T14:14',29.99,'expense','游戏','游戏充值'),
  R('g3','2026-10-09T14:15',98.97,'expense','游戏','游戏充值'),
  R('gs','2026-10-06T10:00',50,'expense','游戏','送人的',{skip:true}),   // 不计入：不占预算
  R('gf','2026-10-06T11:00',40,'expense','游戏','代付',{flow:true}),        // 只算结余：不占预算
  R('gi','2026-10-07T11:00',10,'income','游戏','退款'),                     // 收入：不占预算
  R('sep','2026-09-20T20:00',300,'expense','游戏','九月'),                  // 上个月
  R('f1','2026-10-05T12:00',14,'expense','餐饮','午饭'),
];
let __lastW=null, __phone=null, __lastPhone=null;
async function boot(...a){ const t=bootSync(...a); const __w=__lastW, __p=__lastPhone; t.idle=()=>IDB.idle(__w); t.phone=__p; t.db=async()=>{ await IDB.idle(__w); return IDB.dumpDb(__p); }; await IDB.idle(__w); return t; }
function bootSync(records, budgets){
  const store={archives:{'默认存档':{cats:['未分类','餐饮','游戏','其他'],records:records||base(),budgets}},last:'默认存档'};
  const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/',beforeParse(w){ __lastW=w; __lastPhone=IDB.install(w, __phone);
    const ls=w.localStorage; ls.setItem('app_logged_in_user','小明'); ls.setItem('store_小明',JSON.stringify(store)); ls.setItem('app_time_repaired_小明','1');
    w.scrollTo=()=>{}; w.HTMLElement.prototype.scrollIntoView=function(){};
    w.Date=class extends Date{constructor(...a){a.length?super(...a):super('2026-10-10T14:00:00');}static now(){return new Date('2026-10-10T14:00:00').getTime();}};}});
  const errs=[]; dom.window.addEventListener('error',e=>errs.push(e.message));
  const d=dom.window.document,$=id=>d.getElementById(id);
  const arc=()=>JSON.parse(dom.window.JiwenStore.ledgerGet(dom.window.JiwenStore.storeKey())).archives['默认存档'];
  const chip=(box,txt)=>[...$(box).querySelectorAll('.cc')].find(e=>(e.querySelector('.cc-label')||e).textContent===txt);
  const stats=()=>d.querySelector('.tab-btn[data-tab="stats"]').click();
  const catRow=c=>[...$('catList').querySelectorAll('.cat-item')].find(r=>r.dataset.cat===c);
  // 1019-C 起行里不放按钮：点整行打开操作面板，再在面板里找按钮（预算 → 设预算 / 改预算，删除 → 删除这个分类）
  const btn=(row,txt)=>{ if(dom.window.JiwenSheet.isOpen()) dom.window.JiwenSheet.close(); row.click();
    const id={'预算':'catActBudget','改名':'catActRename','删除':'catActDelete'}[txt]; return id ? $(id) : null; };
  return {w:dom.window,d,$,errs,arc,chip,stats,catRow,btn};
}
const USED=round=>Math.round((29.91+29.99+98.97)*100)/100;   // 158.87

(async()=>{
// ===== 1. 设置预算（分类管理） =====
{
  const t=await boot();
  t.$('manageCatSetting').click();
  const row=t.catRow('游戏');
  ok(t.btn(row,'预算') && t.btn(row,'改名') && t.btn(row,'删除'), '每行点开有「设预算 / 改名 / 删除这个分类」');
  t.btn(row,'预算').click();
  // 1019-P 起数字键盘是 App 自己的（输入框标 data-kp，打开以后弹出来），不再是系统的 inputmode=decimal
  ok(t.$('askTitle').textContent==='分类预算' && t.$('askInput').dataset.kp==='1', '弹出预算输入，数字键盘');
  t.$('askInput').value='-5'; t.$('askOk').click();
  ok(t.$('askErr').style.display==='block' && !t.arc().budgets, '负数被拦下');
  t.$('askInput').value='200'; t.$('askOk').click();
  ok(t.arc().budgets && t.arc().budgets['游戏']===200, '保存 200');
  ok(t.catRow('游戏').querySelector('.cat-budget').textContent==='每月预算 200', '分类行显示「每月预算 200」（1019-C 起的写法）');
  ok(t.$('catMask').style.display==='flex', '保存后仍停在分类管理');
  t.btn(t.catRow('游戏'),'预算').click();
  ok(t.$('askInput').value==='200', '再次打开回显当前预算');
  t.$('askInput').value='0'; t.$('askOk').click();
  ok(!('游戏' in t.arc().budgets) && !t.catRow('游戏').querySelector('.cat-budget'), '填 0 取消预算');
  ok(t.errs.length===0, '无脚本错误 '+t.errs.join(';'));
}

// ===== 2. 预算页签：数值与配色 =====
{
  const t=await boot(null, {'游戏':200});
  t.stats(); t.$('statTabSeg').querySelector('[data-v="budget"]').click();
  const row=()=>t.$('bgGroups').querySelector('.bg-row');
  ok(row().querySelector('.bg-num').textContent==='158.87 / 200.00', '只算计入的支出：'+row().querySelector('.bg-num').textContent);
  ok(row().querySelector('.bg-fill').style.width==='79.4%' && row().querySelector('.bg-fill').className==='bg-fill ', '进度 79.4%，未到 80% 用主题色');
  ok(row().querySelector('.bg-mark').style.left==='32.3%', '竖线在 10/31');
  ok(row().querySelector('.bg-foot').textContent==='已用 79%还剩 41.13（花得偏快）', '比时间快时提醒');
  const t2=await boot(null,{'游戏':180}); t2.stats(); t2.$('statTabSeg').querySelector('[data-v="budget"]').click();
  ok(t2.$('bgGroups').querySelector('.bg-fill').classList.contains('warn'), '88% 用琥珀色');
  const t3=await boot(null,{'游戏':150}); t3.stats(); t3.$('statTabSeg').querySelector('[data-v="budget"]').click();
  const r3=t3.$('bgGroups').querySelector('.bg-row');
  ok(r3.querySelector('.bg-fill').classList.contains('over') && r3.querySelector('.bg-foot .over').textContent==='超出 8.87', '超支：红色、写明超出多少');
  t.$('bgPrevM').click();
  ok(t.$('bgMonthLabel').textContent==='2026年09月' && !t.$('bgGroups').querySelector('.bg-mark'), '看上个月：无竖线');
  ok(t.$('bgGroups').querySelector('.bg-num').textContent==='300.00 / 200.00', '9 月按 9 月的记录算');
}

// ===== 3. 记账成功提示 =====
{
  const t=await boot(null,{'游戏':200});
  const add=(money,cat,type,mode)=>{
    t.$('fabAdd').click(); t.$('billMoney').value=String(money);
    t.chip('billCatChips',cat).click(); t.chip('billTypeChips',type).click();
    if(mode) [...t.$('billMode').querySelectorAll('.cc')].find(e=>e.textContent===mode).click();
    t.$('addBill').click();
    const msg=t.$('askMsg').textContent; t.$('askCancel').click(); return msg;
  };
  const m1=add(30,'游戏','支出');
  ok(m1.startsWith('10月「游戏」预算：已花 188.87 / 200.00，还剩 11.13'), '记游戏支出后提示预算：'+m1.split('\n')[0]);
  ok(m1.endsWith('已记下这一笔，要再记一笔吗？'), '原提示保留在后面');
  const m2=add(20,'游戏','支出');
  ok(m2.includes('已花 208.87 / 200.00，超出 8.87'), '超支提示');
  ok(add(5,'游戏','收入')==='已记下这一笔，要再记一笔吗？', '收入不提示');
  ok(add(5,'游戏','支出','不计入')==='已记下这一笔，要再记一笔吗？', '不计入不提示');
  ok(add(5,'餐饮','支出')==='已记下这一笔，要再记一笔吗？', '没预算的分类不提示');
}

// ===== 4. 改名 / 删除分类 =====
{
  const t=await boot(null,{'游戏':200});
  t.$('manageCatSetting').click();
  t.btn(t.catRow('游戏'),'改名').click(); t.$('askInput').value='电玩'; t.$('askOk').click();
  ok(t.arc().budgets['电玩']===200 && !('游戏' in t.arc().budgets), '改名后预算跟过去');
  t.btn(t.catRow('电玩'),'删除').click(); t.$('askOk').click();
  ok(!('电玩' in t.arc().budgets), '删分类连预算一起删');
}

// ===== 5. 导出 / 导入 / AI =====
{
  const t=await boot(null,{'游戏':200});
  ok(t.w.JiwenStore.odBuildPayload().budgets['游戏']===200, '云备份带上预算');
  t.w.JiwenStore.importArchiveFromText(JSON.stringify({user:'小明',archive:'导入',cats:['游戏','餐饮'],budgets:{'游戏':300,'不存在':100,'餐饮':-5},
    data:[R('x','2026-10-01T10:00',10,'expense','游戏','')]}), t.w.localStorage.getItem('app_logged_in_user'));
  const b=JSON.parse(t.w.JiwenStore.ledgerGet(t.w.JiwenStore.storeKey())).archives['导入'].budgets;
  ok(JSON.stringify(b)==='{"游戏":300}', '导入只收合法预算：'+JSON.stringify(b));
  t.w.JiwenStore.importArchiveFromText(JSON.stringify({user:'小明',archive:'旧备份',cats:['游戏'],data:[R('y','2026-10-01T10:00',10,'expense','游戏','')]}), t.w.localStorage.getItem('app_logged_in_user'));
  ok(JSON.stringify(JSON.parse(t.w.JiwenStore.ledgerGet(t.w.JiwenStore.storeKey())).archives['旧备份'].budgets)==='{}', '旧备份没有预算字段也能导入');
  // AI：按月导出带预算
  t.$('exportAiBtn').click(); t.chip('askChoices','按月').click(); t.$('askOk').click();
  t.chip('askChoices','2026年10月（7 笔）').click(); t.$('askOk').click();
  const txt=t.$('aiExpText').value;
  ok(txt.includes('■ 分类月预算：\n  · 游戏：预算 200.00 元，已花 158.87 / 200.00，还剩 41.13\n■ 支出分类占比：'), 'AI 按月导出带预算一节');
  ok(t.errs.length===0, '无脚本错误 '+t.errs.join(';'));
}

// ===== 6. 收支标签靠右 =====
ok(html.includes('tbody td[data-label="收支"]::before { margin-right:auto; }'), '手机卡片收支行：标签一起靠右');

console.log(`\n1010-G 预算专项：${pass} 通过，${fail} 失败`); process.exit(fail?1:0);
})();
