// 1010-G 预算页签专项：node test9.js <html>
const fs=require('fs'); const {JSDOM}=require('jsdom');
const html=fs.readFileSync(process.argv[2]||require('path').join(__dirname,'..','www','index.html'),'utf8');
let pass=0, fail=0; const ok=(c,n)=>{ if(c) pass++; else { fail++; console.log('  ✗ '+n); } };
const R=(id,time,money,type,cat,remark,extra)=>Object.assign({id,time,money,type,cat,remark},extra||{});
const recs=()=>[
  R('g1','2026-10-04T16:20',29.91,'expense','游戏','游戏充值'),
  R('g2','2026-10-09T14:14',29.99,'expense','游戏','游戏充值'),
  R('g3','2026-10-09T14:15',98.97,'expense','游戏','游戏充值'),
  R('g4','2026-10-06T10:00',148,'expense','游戏','游戏DLC'),
  R('gs','2026-10-06T10:01',23.8,'expense','游戏','游戏 送人',{skip:true}),
  R('d1','2026-10-01T00:02',16,'expense','餐饮','夜宵'),
  R('d2','2026-10-09T12:01',13,'expense','餐饮','中午饭'),
  R('o1','2026-10-08T10:40',157,'expense','订阅','视频会员'),
  R('t1','2026-10-06T07:19',483,'expense','出行','火车站'),
  R('x1','2026-10-09T14:14',208.8,'expense','其他','日用品'),
  R('sep','2026-09-20T20:00',60,'expense','游戏','九月'),
];
function boot(budgets, records){
  const store={archives:{'默认存档':{cats:['未分类','餐饮','游戏','订阅','出行','其他'],records:records||recs(),budgets}},last:'默认存档'};
  const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/',beforeParse(w){
    const ls=w.localStorage; ls.setItem('app_logged_in_user','小明'); ls.setItem('store_小明',JSON.stringify(store)); ls.setItem('app_time_repaired_小明','1');
    w.scrollTo=()=>{}; w.HTMLElement.prototype.scrollIntoView=function(){};
    w.Date=class extends Date{constructor(...a){a.length?super(...a):super('2026-10-10T14:00:00');}static now(){return new Date('2026-10-10T14:00:00').getTime();}};}});
  const errs=[]; dom.window.addEventListener('error',e=>errs.push(e.message));
  const d=dom.window.document,$=id=>d.getElementById(id);
  const tab=v=>$('statTabSeg').querySelector(`[data-v="${v}"]`).click();
  const groups=()=>[...$('bgGroups').querySelectorAll('.stat-card')].map(c=>({t:c.querySelector('.bg-gtitle').textContent, cats:[...c.querySelectorAll('.bg-row')].map(r=>r.dataset.cat)}));
  const rowOf=c=>[...$('bgGroups').querySelectorAll('.bg-row')].find(r=>r.dataset.cat===c);
  d.querySelector('.tab-btn[data-tab="stats"]').click();
  return {w:dom.window,d,$,errs,tab,groups,rowOf};
}
// 游戏 306.87/300=102% 超；餐饮 29/35=83% 接近；订阅 157/300 正常；出行 483 未设；其他 208.8 未设
const B={'游戏':300,'餐饮':35,'订阅':300};

// ===== 1. 页签切换 =====
{
  const t=boot(B);
  ok([...t.$('statTabSeg').querySelectorAll('button')].map(b=>b.textContent).join()==='收支,预算', '页签：收支 | 预算');
  ok(t.$('statPaneFlow').style.display==='' && t.$('statPaneBudget').style.display==='none', '默认在收支');
  const entry=t.$('statBudgetCard');
  ok(entry.style.display==='' && entry.querySelector('.bg-entry-sum').textContent==='超支 1 · 接近 1 · 正常 1', '收支页签只留一行入口：'+entry.textContent);
  ok(!entry.querySelector('.bg-row'), '收支页签不再重复完整列表');
  entry.querySelector('[data-act="toBudget"]').click();
  ok(t.$('statPaneBudget').style.display==='' && t.$('statPaneFlow').style.display==='none' && t.$('statTabSeg').querySelector('.on').dataset.v==='budget', '点入口切到预算页签');
  t.tab('flow');
  ok(t.$('statPaneFlow').style.display==='', '切回收支');
  // 共用月份
  t.$('statPrevM').click(); t.tab('budget');
  ok(t.$('bgMonthLabel').textContent==='2026年09月', '收支翻到 9 月，预算也是 9 月');
  t.$('bgNextM').click(); t.tab('flow');
  ok(t.$('statMonthLabel').textContent==='2026年10月', '预算翻回 10 月，收支也是 10 月');
  ok(t.errs.length===0, '无脚本错误 '+t.errs.join(';'));
}

// ===== 2. 总览与分组 =====
{
  const t=boot(B); t.tab('budget');
  const ov=t.$('bgOverview');
  ok(ov.querySelector('.bgo-num').textContent==='492.87 / 635.00' && ov.querySelector('.bgo-pct').textContent==='78%', '总览：已花 / 预算合计：'+ov.querySelector('.bgo-num').textContent);
  ok([...ov.querySelectorAll('.bgc')].map(e=>e.textContent).join()==='超支 1,接近上限 1,正常 1', '三类计数');
  ok(ov.querySelector('.bgo-legend').textContent.startsWith('竖线是今天（10/31）'), '时间进度说明');
  const g=t.groups();
  ok(g.length===3 && g[0].t==='已超支 · 1' && g[0].cats.join()==='游戏' && g[1].cats.join()==='餐饮' && g[2].cats.join()==='订阅', '分组：超支 → 接近 → 正常：'+JSON.stringify(g));
  // 某组为空时不出现
  const t2=boot({'订阅':300}); t2.tab('budget');
  ok(t2.groups().length===1 && t2.groups()[0].t==='正常 · 1', '空组不显示');
}

// ===== 3. 展开明细 =====
{
  const t=boot(B); t.tab('budget');
  t.rowOf('游戏').click();
  const det=t.$('bgGroups').querySelector('.bg-detail');
  const items=[...det.querySelectorAll('.sf-item')];
  ok(t.rowOf('游戏').classList.contains('open') && items.length===4, '展开：4 笔计入预算的游戏消费');
  ok(items.map(i=>i.querySelector('.sf-time').textContent).join()==='10-09 14:15,10-09 14:14,10-06 10:00,10-04 16:20', '时间倒序');
  ok(items[0].querySelector('.sf-remark').textContent==='游戏充值' && items[0].querySelector('.sf-amt').textContent==='−98.97', '备注与金额');
  ok(det.querySelector('.bg-detail-foot span').textContent==='4 笔；另有 1 笔不计入 / 只算结余，未算在内', '说明另有不计入的');
  ok(!det.textContent.includes('九月'), '不混入别的月份');
  items[0].click();
  ok(t.$('detailMask').style.display==='flex' && t.$('detailRemark').textContent==='游戏充值' && t.$('detailEdit').style.display==='', '点一笔看详情，可修改');
  // 在详情里改金额 → 预算即时更新
  t.$('detailEdit').click(); t.$('editMoney').value='8.97'; t.$('saveEdit').click();
  ok(t.rowOf('游戏').querySelector('.bg-num').textContent==='216.87 / 300.00' && t.rowOf('游戏').classList.contains('open'), '改完金额，预算重算、仍保持展开');
  ok(t.groups()[0].t==='正常 · 2' || t.groups().some(x=>x.cats.includes('游戏') && x.t.startsWith('正常')), '游戏从超支移到正常');
  // 再点收起
  t.rowOf('游戏').click();
  ok(!t.$('bgGroups').querySelector('.bg-detail'), '再点收起');
  // 一次只展开一个
  t.rowOf('餐饮').click(); t.rowOf('订阅').click();
  ok(t.$('bgGroups').querySelectorAll('.bg-detail').length===1 && t.rowOf('订阅').classList.contains('open'), '一次只展开一个');
}

// ===== 4. 【1010-I2】去掉「在账单里查看」；未设预算的分类也能点开明细 =====
{
  const t=boot(B); t.tab('budget');
  t.rowOf('游戏').click();
  ok(!t.$('statPaneBudget').querySelector('[data-act="bgJump"]') && !t.$('statPaneBudget').textContent.includes('在账单里查看'), '明细里不再有「在账单里查看」');
  ok(t.$('bgGroups').querySelector('.bg-detail-foot').textContent==='4 笔；另有 1 笔不计入 / 只算结余，未算在内', '明细底部说明：'+t.$('bgGroups').querySelector('.bg-detail-foot').textContent);
  // 未设预算：展开列表 → 点「出行」行
  t.$('bgUnsetCard').querySelector('[data-act="bgUnsetToggle"]').click();
  const urow=c=>[...t.$('bgUnsetCard').querySelectorAll('.bgu-row')].find(r=>r.dataset.cat===c);
  urow('出行').click();
  const det=t.$('bgUnsetCard').querySelector('.bg-detail');
  ok(det && det.querySelectorAll('.sf-item').length===1 && det.textContent.includes('火车站') && det.textContent.includes('−483.00'), '未设预算的出行可展开看明细');
  ok(urow('出行').classList.contains('open') && !t.$('bgGroups').querySelector('.bg-detail'), '与上面的已设预算共用「一次只展开一个」');
  det.querySelector('.sf-item').click();
  ok(t.$('detailMask').style.display==='flex' && t.$('detailRemark').textContent==='火车站', '明细条目点开详情');
  t.$('detailClose').click();
  // 点「设预算」不会顺带展开/收起这一行
  urow('其他').querySelector('[data-act="bgSet"]').click();
  ok(t.$('askTitle').textContent==='分类预算' && !urow('其他').classList.contains('open'), '点「设预算」只弹设预算');
  t.$('askCancel').click();
  urow('出行').click();
  ok(!t.$('bgUnsetCard').querySelector('.bg-detail'), '再点收起');
  ok(t.errs.length===0, '无脚本错误 '+t.errs.join(';'));
}

// ===== 5. 未设预算的分类 =====
{
  const t=boot(B); t.tab('budget');
  const uc=t.$('bgUnsetCard');
  ok(uc.style.display==='' && uc.querySelector('.stat-day-title').textContent==='未设预算的分类 · 2' && !uc.querySelector('.bgu-list'), '默认折叠，写明个数');
  uc.querySelector('[data-act="bgUnsetToggle"]').click();
  const rows=[...t.$('bgUnsetCard').querySelectorAll('.bgu-row')].map(r=>r.querySelector('.bgu-name').textContent+r.querySelector('.bgu-amt').textContent);
  ok(rows.join()==='出行›−483.00,其他›−208.80', '按金额从大到小：'+rows.join());
  t.$('bgUnsetCard').querySelector('[data-act="bgSet"][data-cat="出行"]').click();
  t.$('askInput').value='500'; t.$('askOk').click();
  ok(t.$('catMask').style.display!=='flex', '从统计页设预算不弹出分类管理');
  ok(t.rowOf('出行') && t.$('bgUnsetCard').querySelector('.stat-day-title').textContent==='未设预算的分类 · 1', '设完立刻出现在预算列表里');
}

// ===== 6. 空状态 =====
{
  const t=boot(undefined); t.tab('budget');
  ok(t.$('bgOverview').textContent.includes('还没有给任何分类设预算') && t.$('bgGroups').innerHTML==='', '没设预算时给出说明');
  ok(t.$('statBudgetCard').style.display==='none', '收支页签不显示入口');
  t.$('bgOverview').querySelector('[data-act="bgSetup"]').click();
  ok(t.$('catMask').style.display==='flex', '「去设置预算」打开分类管理');
  ok(t.$('bgUnsetCard').style.display==='', '仍列出未设预算的分类，方便挑着设');
  ok(t.errs.length===0, '无脚本错误 '+t.errs.join(';'));
}
console.log(`\n1010-G 预算页签：${pass} 通过，${fail} 失败`); process.exit(fail?1:0);
