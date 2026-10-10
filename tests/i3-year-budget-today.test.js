// 1010-I3 专项：年度预算 + 月度进度 + 统计页「回到本月」。node test12.js <html>
const fs=require('fs'); const {JSDOM}=require('jsdom');
const html=fs.readFileSync(process.argv[2]||require('path').join(__dirname,'..','www','index.html'),'utf8');
let pass=0, fail=0; const ok=(c,n)=>{ if(c) pass++; else { fail++; console.log('  ✗ '+n); } };
const R=(id,time,money,type,cat,remark,extra)=>Object.assign({id,time,money,type,cat,remark:remark||''},extra||{});
function boot(arc, now){
  now=now||'2026-10-10T14:00:00';
  const a=Object.assign({ cats:['未分类','餐饮','游戏','出行','存款'], records:[] }, arc||{});
  const store={archives:{'默认存档':a},last:'默认存档'};
  const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/',beforeParse(w){
    const ls=w.localStorage; ls.setItem('app_logged_in_user','小明'); ls.setItem('store_小明',JSON.stringify(store)); ls.setItem('app_time_repaired_小明','1');
    w.scrollTo=()=>{}; w.HTMLElement.prototype.scrollIntoView=function(){};
    w.Date=class extends Date{constructor(...x){x.length?super(...x):super(now);}static now(){return new Date(now).getTime();}};}});
  const errs=[]; dom.window.addEventListener('error',e=>errs.push(e.message));
  const d=dom.window.document,$=id=>d.getElementById(id);
  const toStats=()=>d.querySelector('.tab-btn[data-tab="stats"]').click();
  const toBudget=()=>{ toStats(); $('statTabSeg').querySelector('[data-v="budget"]').click(); };
  const yrow=()=>$('bgOverview').querySelector('.bgy-head');
  const mrows=()=>[...$('bgOverview').querySelectorAll('.bgy-row')];
  const fab=()=>$('statTodayFab').classList.contains('show');
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

// ===== 1. 年度预算：从第一次有记录的月份起算 =====
{
  const t=boot({ records:recs, budgets:B });
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
  const t=boot({ records:recs, budgets:B });
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
  ok(t.$('bgMonthLabel').textContent==='2026年07月' && t.$('statPaneBudget').style.display==='', '点 7 月 → 预算页签切到 7 月');
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
  const t=boot({ records:r2, budgets:{'餐饮':1000} });
  t.toBudget();
  const sub=t.yrow().querySelector('.bgo-sub');
  // 全年 7000，已用 11000；至今应花 5000 → 已超 6000；全年已用完
  ok(sub.textContent==='至今应花 5000.00（5 个月），已超 6000.00 · 全年预算已用完', '超支：'+sub.textContent);
  ok(sub.querySelector('.over') && t.yrow().querySelector('.bgo-v .over'), '超出部分标红');
}

// ===== 4. 往年：不显示「每月可花」；今年还没开始记的空年 =====
{
  const t=boot({ records:[R('a','2025-03-01T10:00',100,'expense','餐饮'), R('b','2026-10-01T10:00',10,'expense','餐饮')], budgets:{'餐饮':1000} });
  t.toBudget();
  t.w.eval('statYear=2025; statMonth=5; renderStats()');
  const y=t.yrow();
  ok(y.querySelector('.bgo-k').textContent==='年度预算（3–12月）›', '2025 年从 3 月起');
  ok(y.querySelector('.bgo-sub').textContent==='至今应花 10000.00（10 个月），结余 9900.00', '往年只有至今应花：'+y.querySelector('.bgo-sub').textContent);
  t.w.eval('statYear=2027; statMonth=0; renderStats()');
  ok(t.yrow() && t.yrow().querySelector('.bgo-v').textContent==='0 / 12000 · 0%' && !t.d.querySelectorAll('.bgy-row').length, '未来年份：全年预算、无月度列表');
  ok(t.errs.length===0, '无脚本错误 '+t.errs.join(';'));
}

// ===== 5. 回到本月浮钮 =====
{
  const t=boot({ records:recs, budgets:B });
  ok(!t.fab(), '记账页不显示');
  t.toStats();
  ok(!t.fab(), '统计页、本月：不显示');
  t.$('statPrevM').click();
  ok(t.fab() && t.$('statTodayFab').textContent==='✕' && t.$('statTodayFab').className.includes('clear-filter-fab'), '翻到上月：出现，与筛选 ✕ 同款');
  t.$('statTodayFab').click();
  ok(t.$('statMonthLabel').textContent==='2026年10月' && !t.fab(), '点了回到本月并隐藏');
  // 预算页签同样生效
  t.$('statTabSeg').querySelector('[data-v="budget"]').click();
  t.$('bgPrevM').click(); t.$('bgPrevM').click();
  ok(t.fab() && t.$('bgMonthLabel').textContent==='2026年08月', '预算页签翻月也出现');
  t.$('statTodayFab').click();
  ok(t.$('bgMonthLabel').textContent==='2026年10月' && t.$('statPaneBudget').style.display==='' && !t.fab(), '预算页签里回到本月，仍在预算页签');
  // 月度列表点月份也触发
  t.yrow().click(); t.mrows()[0].click();
  ok(t.fab(), '从年度列表跳到 6 月：出现');
  // 切走统计页：隐藏；切回来：仍不在本月 → 再出现
  t.d.querySelector('.tab-btn[data-tab="ledger"]').click();
  ok(!t.fab(), '切到记账页隐藏');
  t.toStats();
  ok(t.fab(), '回到统计页（还在 6 月）再出现');
  // 跨年
  t.w.eval('statYear=2025; statMonth=9; renderStats()');
  ok(t.fab(), '去年同月也算不在本月');
  ok(/body\.kb-open \.clear-filter-fab/.test(html), '键盘弹出时一并隐藏（共用样式）');
  ok(t.errs.length===0, '无脚本错误 '+t.errs.join(';'));
}

// ===== 6. 【1010-K2】停下 1.5 秒自动淡出，滑动再出现 =====
(async()=>{
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const t=boot({ records:recs, budgets:B });
  t.toStats(); t.$('statPrevM').click();
  ok(t.fab(), '翻月后立即出现');
  await sleep(800);
  ok(t.fab(), '0.8 秒时还在（来得及点）');
  await sleep(900);
  ok(!t.fab(), '1.7 秒后淡出');
  t.w.dispatchEvent(new t.w.Event('scroll'));
  ok(t.fab(), '滑动再出现');
  await sleep(1700);
  ok(!t.fab(), '停下又淡出');
  t.$('statNextM').click();             // 回到本月：滑动也不出现
  t.w.dispatchEvent(new t.w.Event('scroll'));
  ok(!t.fab(), '在本月时滑动不出现');
  t.d.querySelector('.tab-btn[data-tab="ledger"]').click(); t.w.dispatchEvent(new t.w.Event('scroll'));
  ok(!t.fab(), '记账页滑动不出现');
  ok(t.errs.length===0, '无脚本错误 '+t.errs.join(';'));
  console.log(`\n1010-I3 专项：${pass} 通过，${fail} 失败`); process.exit(fail?1:0);
})();
