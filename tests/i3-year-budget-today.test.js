// 1010-I3 专项：年度预算 + 月度进度 + 统计页「回到本月」。node test12.js <html>
const fs=require('fs'); const {JSDOM}=require('jsdom'); const IDB=require('./helpers/idb');
const html=fs.readFileSync(process.argv[2]||require('path').join(__dirname,'..','www','index.html'),'utf8');
let pass=0, fail=0; const ok=(c,n)=>{ if(c) pass++; else { fail++; console.log('  ✗ '+n); } };
const R=(id,time,money,type,cat,remark,extra)=>Object.assign({id,time,money,type,cat,remark:remark||''},extra||{});
let __lastW=null, __phone=null, __lastPhone=null;
async function boot(...a){ const t=bootSync(...a); const __w=__lastW, __p=__lastPhone; t.idle=()=>IDB.idle(__w); t.phone=__p; t.db=async()=>{ await IDB.idle(__w); return IDB.dumpDb(__p); }; await IDB.idle(__w); return t; }
function bootSync(arc, now){
  now=now||'2026-10-10T14:00:00';
  const a=Object.assign({ cats:['未分类','餐饮','游戏','出行','存款'], records:[] }, arc||{});
  const store={archives:{'默认存档':a},last:'默认存档'};
  const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/',beforeParse(w){ __lastW=w; __lastPhone=IDB.install(w, __phone);
    const ls=w.localStorage; ls.setItem('app_logged_in_user','小明'); ls.setItem('store_小明',JSON.stringify(store)); ls.setItem('app_time_repaired_小明','1');
    w.scrollTo=()=>{}; w.HTMLElement.prototype.scrollIntoView=function(){};
    w.Date=class extends Date{constructor(...x){x.length?super(...x):super(now);}static now(){return new Date(now).getTime();}};}});
  const errs=[]; dom.window.addEventListener('error',e=>errs.push(e.message));
  const d=dom.window.document,$=id=>d.getElementById(id);
  const toStats=()=>d.querySelector('.tab-btn[data-tab="stats"]').click();
  const toBudget=()=>{ toStats(); $('statTabSeg').querySelector('[data-v="budget"]').click(); };
  const yrow=()=>$('bgOverview').querySelector('.bgy-head');
  const mrows=()=>[...$('bgOverview').querySelectorAll('.bgy-row')];
  const fab=()=>!!$('statTodayFab');   // 1023-O：「回到本月」✕ 去掉了（月份浮条最右边就是这个月），下面原来要它出现的地方都改成「没有它」
  return {w:dom.window,d,$,errs,toStats,toBudget,yrow,mrows,fab};
}
// 6 月开始记；8 月一条都没有；预算 游戏 200 + 餐饮 1200 = 1400
const recs=[
  R('j1','2026-06-15T10:00',1000,'expense','餐饮'), R('j2','2026-06-16T10:00',210,'expense','游戏'),
  R('l1','2026-07-03T10:00',1300,'expense','餐饮'), R('l2','2026-07-05T10:00',288,'expense','游戏'),
  R('l3','2026-07-05T10:00',500,'expense','出行'),                                  // 未设预算：不算进年度已用
  R('s1','2026-09-03T10:00',900,'expense','餐饮'), R('s2','2026-09-04T10:00',300,'expense','游戏','',{skip:true}),  // 不计入
  R('o1','2026-10-02T10:00',310.2,'expense','餐饮'), R('o2','2026-10-04T10:00',158.87,'expense','游戏'),
  R('dep','2026-06-01T00:00',200000,'income','存款','期初',{flow:true}),
];
const B={'游戏':200,'餐饮':1200};

(async()=>{
// ===== 1. 年度预算：从第一次有记录的月份起算 =====
{
  const t=await boot({ records:recs, budgets:B });
  t.toBudget();
  const y=t.yrow();
  ok(y && y.querySelector('.bgo-k').textContent==='年度预算（6–12月）›', '标题从 6 月起：'+(y&&y.querySelector('.bgo-k').textContent));
  // 已用 = 1210 + 1588 + 0 + 900 + 469.07 = 4167.07；全年 = 1400 × 7 = 9800 → 43%
  ok(y.querySelector('.bgo-v').textContent==='4167 / 9800 · 43%', '年度数字：'+y.querySelector('.bgo-v').textContent);
  // 至今应花 = 1400 × 5 = 7000（8 月空着也照算），结余 2832.93；剩 10/11/12 三个月，(9800-4167.07)/3 = 1877.64
  const sub=y.querySelector('.bgo-sub').textContent;
  ok(sub==='至今应花 7000.00（5 个月），结余 2832.93 · 剩下 3 个月每月可花 1877.64', '副标题：'+sub);
  ok(!t.mrows().length, '默认收起');
}

// ===== 2. 展开：每月一条进度条，空月标「没有记录」 =====
{
  const t=await boot({ records:recs, budgets:B });
  t.toBudget(); t.yrow().click();
  const rs=t.mrows();
  ok(rs.map(r=>r.querySelector('.bgy-m').textContent).join()==='6月,7月,8月,9月,10月', '列出 6–10 月（未来月份不列）');
  const v=i=>rs[i].querySelector('.bgy-v');
  ok(v(0).textContent==='1210 / 1400' && rs[0].querySelector('.bg-fill').classList.contains('warn'), '6 月 86% 接近');
  ok(v(1).textContent==='1588 / 1400' && v(1).classList.contains('over') && rs[1].querySelector('.bg-fill').style.width==='100%', '7 月超支：红、条封顶');
  ok(rs[2].classList.contains('empty') && v(2).textContent==='没有记录' && !rs[2].querySelector('.bg-fill'), '8 月：没有记录');
  ok(v(3).textContent==='900 / 1400', '9 月不计入的那笔不算');
  ok(rs[4].classList.contains('cur'), '当前查看的月份高亮');
  ok(t.yrow().classList.contains('open'), '箭头转向');
  // 点 7 月：留在预算页签、切到 7 月、展开状态保留
  rs[1].click();
  ok(t.$('statMonthLabel').textContent==='2026年07月' && t.$('statPaneBudget').style.display==='', '点 7 月 → 预算页签切到 7 月');
  ok(t.mrows().length===5 && t.mrows()[1].classList.contains('cur'), '列表还开着，7 月高亮');
  // 年度数字不随查看月份变化
  ok(t.yrow().querySelector('.bgo-v').textContent==='4167 / 9800 · 43%', '翻到 7 月，年度进度不变');
  t.yrow().click();
  ok(!t.mrows().length, '再点收起');
  ok(t.errs.length===0, '无脚本错误 '+t.errs.join(';'));
}

// ===== 3. 超支时的副标题 / 全年用完 =====
{
  const r2=[R('a','2026-06-01T10:00',5000,'expense','餐饮'), R('b','2026-10-01T10:00',6000,'expense','餐饮')];
  const t=await boot({ records:r2, budgets:{'餐饮':1000} });
  t.toBudget();
  const sub=t.yrow().querySelector('.bgo-sub');
  // 全年 7000，已用 11000；至今应花 5000 → 已超 6000；全年已用完
  ok(sub.textContent==='至今应花 5000.00（5 个月），已超 6000.00 · 全年预算已用完', '超支：'+sub.textContent);
  ok(sub.querySelector('.over') && t.yrow().querySelector('.bgo-v .over'), '超出部分标红');
}

// ===== 4. 往年：不显示「每月可花」；今年还没开始记的空年 =====
{
  const t=await boot({ records:[R('a','2025-03-01T10:00',100,'expense','餐饮'), R('b','2026-10-01T10:00',10,'expense','餐饮')], budgets:{'餐饮':1000} });
  t.toBudget();
  t.w.eval('JiwenStats.statYear=2025; JiwenStats.statMonth=5; JiwenStats.renderStats()');
  const y=t.yrow();
  ok(y.querySelector('.bgo-k').textContent==='年度预算（3–12月）›', '2025 年从 3 月起');
  ok(y.querySelector('.bgo-sub').textContent==='至今应花 10000.00（10 个月），结余 9900.00', '往年只有至今应花：'+y.querySelector('.bgo-sub').textContent);
  t.w.eval('JiwenStats.statYear=2027; JiwenStats.statMonth=0; JiwenStats.renderStats()');
  ok(t.yrow() && t.yrow().querySelector('.bgo-v').textContent==='0 / 12000 · 0%' && !t.d.querySelectorAll('.bgy-row').length, '未来年份：全年预算、无月度列表');
  ok(t.errs.length===0, '无脚本错误 '+t.errs.join(';'));
}

// ===== 5. 回到本月浮钮（1023-O 去掉了，翻月照旧） =====
{
  const t=await boot({ records:recs, budgets:B });
  ok(!t.fab(), '记账页没有');
  t.toStats();
  ok(!t.fab(), '统计页、本月：没有');
  t.w.JiwenStats.stepMonth(-1);
  ok(!t.fab() && t.$('statMonthLabel').textContent==='2026年09月', '翻到上月：没有回到本月 ✕（1023-O）');
  t.w.JiwenStats.stepMonth(1);
  ok(t.$('statMonthLabel').textContent==='2026年10月' && !t.fab(), '再翻回本月');
  // 预算页签同样
  t.$('statTabSeg').querySelector('[data-v="budget"]').click();
  t.w.JiwenStats.stepMonth(-1); t.w.JiwenStats.stepMonth(-1);
  ok(!t.fab() && t.$('statMonthLabel').textContent==='2026年08月', '预算页签翻月：没有 ✕');
  t.w.JiwenStats.stepMonth(2);
  ok(t.$('statMonthLabel').textContent==='2026年10月' && t.$('statPaneBudget').style.display==='' && !t.fab(), '预算页签里翻回本月，仍在预算页签');
  // 月度列表点月份
  t.yrow().click(); t.mrows()[0].click();
  ok(!t.fab() && t.$('statMonthLabel').textContent==='2026年06月', '从年度列表跳到 6 月');
  t.d.querySelector('.tab-btn[data-tab="ledger"]').click();
  ok(!t.fab(), '切到记账页');
  t.toStats();
  ok(!t.fab() && t.$('statMonthLabel').textContent==='2026年06月', '回到统计页还在 6 月');
  t.w.eval('JiwenStats.statYear=2025; JiwenStats.statMonth=9; JiwenStats.renderStats()');
  ok(!t.fab() && t.$('statMonthLabel').textContent==='2025年10月', '去年同月');
  ok(/body\.kb-open \.clear-filter-fab/.test(html), '键盘弹出时一并隐藏（共用样式，账单页的圆钮还在用）');
  ok(t.errs.length===0, '无脚本错误 '+t.errs.join(';'));
}

// ===== 6. 【1010-K2】停下淡出那套随 ✕ 去掉了（1023-O）：滑动、翻月都不会冒出来 =====
(async()=>{
  const t=await boot({ records:recs, budgets:B });
  t.toStats(); t.w.JiwenStats.stepMonth(-1);
  ok(!t.fab(), '翻月后没有');
  ok(!html.includes('id="statTodayFab"'), '页面里没有这个按钮');
  ok(!/statTodayFab/.test(html), '代码、样式里也不再提它');
  t.w.dispatchEvent(new t.w.Event('scroll'));
  ok(!t.fab(), '滑动不出现');
  ok(t.$('statMonthLabel').textContent==='2026年09月', '滑动不改月份');
  t.w.JiwenStats.stepMonth(1);
  t.w.dispatchEvent(new t.w.Event('scroll'));
  ok(!t.fab(), '在本月时滑动不出现');
  t.d.querySelector('.tab-btn[data-tab="ledger"]').click(); t.w.dispatchEvent(new t.w.Event('scroll'));
  ok(!t.fab(), '记账页滑动不出现');
  ok(t.errs.length===0, '无脚本错误 '+t.errs.join(';'));
  console.log(`\n1010-I3 专项：${pass} 通过，${fail} 失败`); process.exit(fail?1:0);
})();
})();
