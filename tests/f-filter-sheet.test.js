// 1010-F 专项：node test7.js <html>
const fs=require('fs'); const {JSDOM}=require('jsdom'); const IDB=require('./helpers/idb');
const RC=require('./helpers/rec');   // 1020-G：选分类（不在最近常用 4 个里的从抽屉选）、选统计（面板）
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
const ids=t=>[...t.$('billList').querySelectorAll('.bl-row[data-act="detail"]')].map(b=>b.dataset.id).sort().join();

(async()=>{
// ===== 1. 搜一笔：抽屉里一改，结果页跟着变（1023-G 起没有「点完成才生效」的草稿）=====
const sids=t=>{ t.w.JiwenSearch.searchFlush(); return [...t.$('searchList').querySelectorAll('.bl-row[data-act="detail"]')].map(b=>b.dataset.id).sort().join(); };
const tags=t=>[...t.$('searchTags').querySelectorAll('.sp-tag')].map(e=>e.textContent).join();
{
  const t=await boot();
  t.$('filterFab').click();
  ok(t.w.JiwenSearch.isOpen() && t.$('filterSheetMask').style.display==='flex', '点「搜一笔」：结果页 + 抽屉一起出来');
  const opts=[...t.$('filterModeChips').querySelectorAll('.cc')].map(e=>e.textContent);
  ok(opts.join()==='计入,不计,往来', '统计三个（1023-G 起没有「全部」那一格，都不选就是全部）：'+opts.join());
  ok(!t.$('filterModeChips').querySelector('.sel') && t.$('filterModeVal').textContent==='全部', '默认都不选，那一行写「全部」');
  ok(sids(t)==='a,b,cc,dep,lp' && t.$('sheetApply').textContent==='看这 5 笔', '没条件：结果页是全部记录，按钮写「看这 5 笔」');
  t.$('filterModeRow').click();
  ok(!t.$('filterModeChips').hidden, '点「统计 ›」展开三个');
  t.chip('filterModeChips','往来').click();
  ok(sids(t)==='dep,lp' && t.$('sheetApply').textContent==='看这 2 笔' && ids(t)==='a,b,cc,lp', '点「往来」：结果页马上跟着变、按钮写还剩几笔；账单页不动');
  t.$('sheetApply').click();
  ok(t.$('filterSheetMask').style.display==='none' && tags(t)==='往来' && t.$('searchCount').textContent==='2 笔', '「看这 2 笔」：收起抽屉就是结果页，条件列成小标签');
  ok(t.$('batchBar') && t.$('batchBar').textContent.includes('批量改'), '有条件：有「批量改」');
  // 改条件：条件保留
  t.$('searchEdit').click();
  ok(t.$('filterModeChips').querySelector('.sel').textContent==='往来' && t.$('filterModeVal').textContent==='往来', '「改条件」重开抽屉：条件留着');
  t.$('filterCatRow').click();
  t.chip('filterChips','购物').click();
  ok(sids(t)==='lp' && tags(t)==='购物,往来' && t.$('filterCatVal').textContent==='购物', '和分类叠加：'+sids(t));
  // 统计多选
  t.chip('filterChips','购物').click(); t.chip('filterModeChips','往来').click(); t.chip('filterModeChips','不计').click();
  ok(sids(t)==='cc', '只看不计');
  t.chip('filterModeChips','往来').click();
  ok(sids(t)==='cc,dep,lp' && tags(t)==='不计,往来', '不计 + 往来，两种都算：'+sids(t));
  t.chip('filterModeChips','不计').click(); t.chip('filterModeChips','往来').click(); t.chip('filterModeChips','计入').click();
  ok(sids(t)==='a,b', '只看计入');
  // 清空条件：马上生效，回到全部
  t.$('sheetClear').click();
  ok(!t.$('filterModeChips').querySelector('.sel') && sids(t)==='a,b,cc,dep,lp' && /还没设条件|最近搜过/.test(t.$('searchTags').textContent), '清空条件：结果页回到全部');
  // 结果页的小标签：点 × 去掉那一条
  t.chip('filterModeChips','不计').click(); t.chip('filterChips','其他').click(); t.$('sheetApply').click();
  ok(tags(t)==='其他,不计' && sids(t)==='cc', '两个条件');
  t.$('searchTags').querySelector('.sp-tag-x').click();
  ok(tags(t)==='不计' && sids(t)==='cc', '点标签去掉「其他」');
  // 回到账单：页面收起，账单页照旧
  t.$('searchBack').click();
  ok(!t.w.JiwenSearch.isOpen() && ids(t)==='a,b,cc,lp', '「回到账单」：结果页收起，账单页照旧是这个月');
  t.$('filterFab').click();
  ok(t.$('filterModeChips').querySelector('.sel').textContent==='不计', '再点「搜一笔」：上次的条件还在');
  t.$('filterBack').click();
  ok(!t.w.JiwenSearch.isOpen() && t.$('filterSheetMask').style.display==='none', '抽屉里「回到账单」：抽屉和结果页一起收起');
  ok(!t.$('clearFilterFab') && t.$('filterFab').textContent.trim()==='搜一笔', '底栏左边是「搜一笔」，没有清筛选的 ✕ 了');
  ok(t.errs.length===0, '无脚本错误 '+t.errs.join(';'));
}

// ===== 2. 批量菜单说明 =====
{
  const t=await boot();
  t.$('filterFab').click(); t.$('searchKeyword').value='午饭'; t.$('sheetApply').click();
  t.$('batchBar').click();
  const rows=[...t.$('askChoices').querySelectorAll('.cc')];
  ok(rows.length===4 && rows.every(r=>r.querySelector('.cc-label') && r.querySelector('.cc-desc') && r.querySelector('.cc-desc').textContent.length>8), '四个选项都有说明');
  const desc=l=>rows.find(r=>r.querySelector('.cc-label').textContent===l).querySelector('.cc-desc').textContent;
  ok(desc('标为往来')===t.w.JiwenBase.MODE_HINT.flow || desc('标为往来').startsWith('资金往来'), '往来说明与记一笔一致');
  ok(desc('标为不计').startsWith('哪里都不算'), '不计说明');
  rows[2].click(); t.$('askOk').click();
  ok(t.$('askTitle').textContent==='批量修改统计', '带说明的选项照常可选');
}

// ===== 3. 整片面板下滑关闭 =====
{
  const t=await boot(); const sheet=t.$('filterSheet'), mask=t.$('filterSheetMask');
  const body=sheet.querySelector('.sf-body');   // 1023-G：抽屉里滚的是中间那块（底部按钮贴底）
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
  // jsdom 量不出框有多高，这里只能走「面板自己没在顶上」那条路（真浏览器里中间那块 .sf-body 滚，由 ui/audit.js 第 8 段真手指量）
  sheet.scrollTop=50;
  swipe(200,400,700,20,20);
  ok(mask.classList.contains('open') && sheet.style.transform==='' && body, '内容未到顶时下拉不关（交给原生往回滚）');
  sheet.scrollTop=0;
  // 横向滑 → 不接管
  t.touch(sheet,'touchstart',100,500); t.touch(sheet,'touchmove',200,520); t.touch(sheet,'touchmove',300,540); t.touch(sheet,'touchend',300,540);
  ok(mask.classList.contains('open') && sheet.style.transform==='', '横向滑不接管');
  // 点按（几乎不动）→ 不拦截
  const pd=(()=>{ t.touch(sheet,'touchstart',200,500); const r=t.touch(sheet,'touchmove',203,502); t.touch(sheet,'touchend',203,502); return r; })();
  ok(mask.classList.contains('open') && sheet.style.transform==='', '点按不触发拖动');
  // 下拉收起：条件留着（1023-G 起改一下就生效，收起就是结果页）
  t.chip('filterModeChips','不计').click();
  swipe(200,500,800,30,20);
  ok(!mask.classList.contains('open') && t.w.JiwenSearch.isOpen() && t.$('batchBar'), '下拉收起：条件留着，就是结果页');
  // 点暗处也收起（只这一个抽屉，用户点名要的）
  open(); mask.dispatchEvent(new t.w.MouseEvent('click', { bubbles:true }));
  ok(!mask.classList.contains('open') && mask.style.display==='none', '点暗处收起');
  // 阻尼：拉 110px（扣掉 10px 起拖距离）位移应为 80px
  open(); t.touch(sheet,'touchstart',200,500); t.touch(sheet,'touchmove',200,515); t.touch(sheet,'touchmove',200,610);
  ok(sheet.style.transform==='translateY(80px)', '跟手阻尼 0.8：'+sheet.style.transform);
  t.touch(sheet,'touchcancel',200,610);
  ok(sheet.style.transform==='' && mask.classList.contains('open'), 'touchcancel 回弹不关');
  // 1019-N 起：所有底部面板关掉都用共用的「影子」往下滑走，筛选浮层也是：当场关掉、影子做动画；1019-Z3 起打开 / 收起同一个时长 SHEET_MS（300 毫秒）、先快后慢
  ok(html.includes('transform:translateY(100%); transition:transform var(--sheet-ms) var(--sheet-ease);') && html.includes("mask.style.display='none';   // 1019-N：当场关掉，滑走的动画由共用的「影子」做") && html.includes('const SHEET_OUT_MS=SHEET_MS') && html.includes('const SHEET_MS=300;'), '关闭动画统一用共用的收起动画，打开 / 收起都是 SHEET_MS（300 毫秒）');
  ok(t.errs.length===0, '无脚本错误 '+t.errs.join(';'));
}
console.log(`\n1010-F 专项：${pass} 通过，${fail} 失败`); process.exit(fail?1:0);
})();
