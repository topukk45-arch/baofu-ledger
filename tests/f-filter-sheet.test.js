// 1010-F 专项：node test7.js <html>
const fs=require('fs'); const {JSDOM}=require('jsdom'); const IDB=require('./helpers/idb');
const html=fs.readFileSync(process.argv[2]||require('path').join(__dirname,'..','www','index.html'),'utf8');
let pass=0, fail=0; const ok=(c,n)=>{ if(c) pass++; else { fail++; console.log('  ✗ '+n); } };
const R=(id,time,money,type,cat,remark,extra)=>Object.assign({id,time,money,type,cat,remark},extra||{});
const recs=[
  R('dep','2026-07-01T00:00',50000.00,'income','存款','期初',{flow:true}),
  R('cc','2026-10-01T10:33',1234.56,'expense','其他','信用卡',{skip:true}),
  R('lp','2026-10-04T16:30',3999.00,'expense','购物','笔记本',{flow:true}),
  R('a','2026-10-05T12:00',14,'expense','餐饮','午饭'),
  R('b','2026-10-06T12:00',20,'expense','购物','充电器'),
];
let __lastW=null, __phone=null, __lastPhone=null;
async function boot(...a){ const t=bootSync(...a); const __w=__lastW, __p=__lastPhone; t.idle=()=>IDB.idle(__w); t.phone=__p; t.db=async()=>{ await IDB.idle(__w); return IDB.dumpDb(__p); }; await IDB.idle(__w); return t; }
function bootSync(){
  const store={archives:{'默认存档':{cats:['未分类','餐饮','购物','其他','存款'],records:recs}},last:'默认存档'};
  const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/',beforeParse(w){ __lastW=w; __lastPhone=IDB.install(w, __phone);
    const ls=w.localStorage; ls.setItem('app_logged_in_user','小明'); ls.setItem('store_小明',JSON.stringify(store)); ls.setItem('app_time_repaired_小明','1');
    w.scrollTo=()=>{}; w.HTMLElement.prototype.scrollIntoView=function(){};
    w.__clock=1e12;
    w.Date=class extends Date{constructor(...a){a.length?super(...a):super('2026-10-10T10:00:00');}static now(){return w.__clock;}};}});
  const errs=[]; dom.window.addEventListener('error',e=>errs.push(e.message));
  const d=dom.window.document,$=id=>d.getElementById(id);
  const chip=(box,txt)=>[...$(box).querySelectorAll('.cc')].find(e=>(e.querySelector('.cc-label')||e).textContent===txt);
  // 触摸模拟：返回是否被 preventDefault
  const touch=(el,type,x,y)=>{ const ev=new dom.window.Event(type,{bubbles:true,cancelable:true});
    Object.defineProperty(ev,'touches',{value: type==='touchend'?[]:[{clientX:x,clientY:y}]}); el.dispatchEvent(ev); return ev.defaultPrevented; };
  return {w:dom.window,d,$,errs,chip,touch};
}
const ids=t=>[...t.$('billList').querySelectorAll('[data-act="edit"]')].map(b=>b.dataset.id).sort().join();

(async()=>{
// ===== 1. 筛选：统计口径 =====
{
  const t=await boot();
  t.$('filterFab').click();
  const opts=[...t.$('filterModeChips').querySelectorAll('.cc')].map(e=>e.textContent);
  ok(opts.join()==='全部,计入,只算结余,不计入', '口径选项四个：'+opts.join());
  ok(t.$('filterModeChips').querySelector('.sel').textContent==='全部', '默认「全部」');
  t.chip('filterModeChips','只算结余').click();
  ok(ids(t)==='a,b,cc,dep,lp', '只改草稿，未点完成列表不变');
  t.$('sheetApply').click();
  ok(ids(t)==='dep,lp', '只看只算结余：'+ids(t));
  ok(t.$('summaryFilter').querySelector('.filter-badge').textContent==='只算结余', '徽标显示口径名');
  ok(t.$('batchBar').style.display==='' && t.$('filterFab').classList.contains('active-filter'), '口径筛选算「正在筛选」：出批量入口、筛选按钮有红点');
  // 叠加分类
  t.$('filterFab').click();
  ok(t.$('filterModeChips').querySelector('.sel').textContent==='只算结余', '重开面板回显已提交的口径');
  t.chip('filterChips','购物').click(); t.$('sheetApply').click();
  ok(ids(t)==='lp' && t.$('summaryFilter').querySelector('.filter-badge').textContent==='购物·只算结余', '与分类叠加：'+ids(t));
  // 计入 / 不计入
  t.$('filterFab').click(); t.chip('filterChips','全部').click(); t.chip('filterModeChips','不计入').click(); t.$('sheetApply').click();
  ok(ids(t)==='cc', '只看不计入');
  t.$('filterFab').click(); t.chip('filterModeChips','计入').click(); t.$('sheetApply').click();
  ok(ids(t)==='a,b', '只看计入');
  // 面板里清除全部：只清草稿
  t.$('filterFab').click(); t.$('sheetClear').click();
  ok(t.$('filterModeChips').querySelector('.sel').textContent==='全部' && ids(t)==='a,b', '清除全部只清草稿');
  t.$('sheetApply').click();
  ok(ids(t)==='a,b,cc,dep,lp', '点完成后才生效');
  // 浮钮一键清除
  t.$('filterFab').click(); t.chip('filterModeChips','不计入').click(); t.$('sheetApply').click();
  t.$('clearFilterFab').click();
  ok(ids(t)==='a,b,cc,dep,lp' && t.$('batchBar').style.display==='none', '✕ 一键清除连口径一起清');
  t.$('filterFab').click();
  ok(t.$('filterModeChips').querySelector('.sel').textContent==='全部', '清除后面板回到「全部」');
  ok(t.errs.length===0, '无脚本错误 '+t.errs.join(';'));
}

// ===== 2. 批量菜单说明 =====
{
  const t=await boot();
  t.$('filterFab').click(); t.$('searchKeyword').value='午饭'; t.$('sheetApply').click();
  t.$('batchBar').querySelector('[data-act="batch"]').click();
  const rows=[...t.$('askChoices').querySelectorAll('.cc')];
  ok(rows.length===4 && rows.every(r=>r.querySelector('.cc-label') && r.querySelector('.cc-desc') && r.querySelector('.cc-desc').textContent.length>8), '四个选项都有说明');
  const desc=l=>rows.find(r=>r.querySelector('.cc-label').textContent===l).querySelector('.cc-desc').textContent;
  ok(desc('标为只算结余')===t.$('billModeHint').textContent || desc('标为只算结余').startsWith('资金往来'), '只算结余说明与记一笔一致');
  ok(desc('标为不计入').startsWith('重复记录'), '不计入说明');
  rows[2].click(); t.$('askOk').click();
  ok(t.$('askTitle').textContent==='批量修改统计口径', '带说明的选项照常可选');
}

// ===== 3. 整片面板下滑关闭 =====
{
  const t=await boot(); const sheet=t.$('filterSheet'), mask=t.$('filterSheetMask');
  const open=()=>{ t.$('filterFab').click(); mask.classList.add('open'); };   // rAF 在 jsdom 里异步，直接补上 open
  const swipe=(x,y0,y1,steps,msPerStep)=>{
    t.touch(sheet,'touchstart',x,y0);
    for(let i=1;i<=steps;i++){ t.w.__clock+=msPerStep; t.touch(sheet,'touchmove',x,y0+(y1-y0)*i/steps); }
    t.touch(sheet,'touchend',x,y1);
  };
  // 从面板中部（关键词输入框附近）慢慢往下拉 250px → 关闭
  open(); swipe(200,500,750,25,20);
  ok(!mask.classList.contains('open'), '面板中部下拉 250px 关闭');
  // 慢慢拉 100px → 不关（低于 140px 门槛），并回弹
  open(); swipe(200,500,600,10,30);
  ok(mask.classList.contains('open') && sheet.style.transform==='', '慢拉 100px 不关，回弹');
  // 快速甩 120px（末段速度 > 0.8px/ms）→ 关闭
  open(); swipe(200,500,620,4,8);
  ok(!mask.classList.contains('open'), '快速甩动 120px 关闭');
  // 快速但只有 60px → 不关（甩动也要过 80px）
  open(); swipe(200,500,560,3,5);
  ok(mask.classList.contains('open'), '快甩 60px 不关');
  // 往上滑 → 不接管
  open(); t.touch(sheet,'touchstart',200,600); const pv=t.touch(sheet,'touchmove',200,500); t.touch(sheet,'touchend',200,500);
  ok(mask.classList.contains('open') && !pv && sheet.style.transform==='', '向上滑交给原生滚动');
  // 内容没滚到顶 → 下拉是往回滚，不关
  sheet.scrollTop=50;
  swipe(200,400,700,20,20);
  ok(mask.classList.contains('open') && sheet.style.transform==='', '内容未到顶时下拉不关（交给原生往回滚）');
  sheet.scrollTop=0;
  // 横向滑 → 不接管
  t.touch(sheet,'touchstart',100,500); t.touch(sheet,'touchmove',200,520); t.touch(sheet,'touchmove',300,540); t.touch(sheet,'touchend',300,540);
  ok(mask.classList.contains('open') && sheet.style.transform==='', '横向滑不接管');
  // 点按（几乎不动）→ 不拦截
  const pd=(()=>{ t.touch(sheet,'touchstart',200,500); const r=t.touch(sheet,'touchmove',203,502); t.touch(sheet,'touchend',203,502); return r; })();
  ok(mask.classList.contains('open') && sheet.style.transform==='', '点按不触发拖动');
  // 下拉关闭 = 丢弃草稿
  t.chip('filterModeChips','不计入').click();
  swipe(200,500,800,30,20);
  ok(!mask.classList.contains('open') && t.$('batchBar').style.display==='none', '下拉关闭不提交草稿');
  // 阻尼：拉 110px（扣掉 10px 起拖距离）位移应为 80px
  open(); t.touch(sheet,'touchstart',200,500); t.touch(sheet,'touchmove',200,515); t.touch(sheet,'touchmove',200,610);
  ok(sheet.style.transform==='translateY(80px)', '跟手阻尼 0.8：'+sheet.style.transform);
  t.touch(sheet,'touchcancel',200,610);
  ok(sheet.style.transform==='' && mask.classList.contains('open'), 'touchcancel 回弹不关');
  // 1019-N 起：所有底部面板关掉都用共用的「影子」往下滑走（约 200 毫秒），筛选浮层也是：当场关掉、影子做动画；打开往上滑入 0.22s
  ok(html.includes('transform:translateY(100%); transition:transform .22s ease;') && html.includes("sheetMask.style.display='none'; loadCommittedIntoControls();   // 1019-N") && html.includes('const SHEET_OUT_MS=200'), '关闭动画统一用共用的收起动画（约 200 毫秒），打开 0.22s 滑入');
  ok(t.errs.length===0, '无脚本错误 '+t.errs.join(';'));
}
console.log(`\n1010-F 专项：${pass} 通过，${fail} 失败`); process.exit(fail?1:0);
})();
