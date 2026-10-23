// 1010-J 专项：退款。node test13.js <html>
const fs=require('fs'); const {JSDOM}=require('jsdom'); const IDB=require('./helpers/idb');
const RC=require('./helpers/rec');   // 1020-G：选分类（不在最近常用 4 个里的从抽屉选）、选统计（面板）
const html=fs.readFileSync(process.argv[2]||require('path').join(__dirname,'..','www','index.html'),'utf8');
let pass=0, fail=0; const ok=(c,n)=>{ if(c) pass++; else { fail++; console.log('  ✗ '+n); } };
const R=(id,time,money,type,cat,remark,extra)=>Object.assign({id,time,money,type,cat,remark:remark||''},extra||{});
const NOW='2026-10-10T14:00:00';
function base(){ return [
  R('buy','2026-10-02T10:00',100,'expense','购物','鞋子'),
  R('eat','2026-10-03T12:00',30,'expense','餐饮','午饭'),
  R('pay','2026-10-01T09:00',5000,'income','工资','工资'),
  R('cc','2026-10-05T09:00',800,'expense','转账','信用卡还款',{skip:true}),
];}
let __lastW=null, __phone=null, __lastPhone=null;
async function boot(...a){ const t=bootSync(...a); const __w=__lastW, __p=__lastPhone; t.idle=()=>IDB.idle(__w); t.phone=__p; t.db=async()=>{ await IDB.idle(__w); return IDB.dumpDb(__p); }; await IDB.idle(__w); return t; }
function bootSync(records, arcExtra){
  const a=Object.assign({ cats:['未分类','餐饮','购物','工资','转账','游戏'], records:records||base() }, arcExtra||{});
  const store={archives:{'默认存档':a},last:'默认存档'};
  const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/',beforeParse(w){ __lastW=w; __lastPhone=IDB.install(w, __phone);
    const ls=w.localStorage; ls.setItem('app_logged_in_user','小明'); ls.setItem('store_小明',JSON.stringify(store)); ls.setItem('app_time_repaired_小明','1');
    w.scrollTo=()=>{}; w.HTMLElement.prototype.scrollIntoView=function(){};
    w.Date=class extends Date{constructor(...x){x.length?super(...x):super(NOW);}static now(){return new Date(NOW).getTime();}};}});
  const errs=[]; dom.window.addEventListener('error',e=>errs.push(e.message));
  const d=dom.window.document,$=id=>d.getElementById(id);
  const recs=()=>JSON.parse(dom.window.JiwenStore.ledgerGet(dom.window.JiwenStore.storeKey())).archives['默认存档'].records;
  const refunds=()=>recs().filter(r=>r.refundOf);
  const kind=v=>$('refundKind').querySelector(`[data-v="${v}"]`).click();
  // 从修改弹窗走一次退款
  const refund=(id, opts)=>{
    opts=opts||{};
    dom.window.openEdit(id); $('editRefundBtn').click();
    if(opts.part!=null){ kind('part'); $('refundMoney').value=String(opts.part); }
    if(opts.time){ $('refundTime').dataset.value=opts.time; }
    if(opts.remark!=null) $('refundRemark').value=opts.remark;
    $('refundOk').click();
  };
  const q=sel=>$('summaryOverall').querySelector(sel).textContent;
  const toStats=()=>d.querySelector('.tab-btn[data-tab="stats"]').click();
  // 1023-A：分类汇总搬去统计页：切过去读一眼再切回账单页
  const catRows=()=>{ const back=dom.window.JiwenBase.currentTab; toStats(); const r=[...$('catStats').querySelectorAll('.cs-row')]; if(back==='ledger') d.querySelector('.tab-btn[data-tab="ledger"]').click(); return r; };
  return {w:dom.window,d,$,errs,recs,refunds,kind,refund,q,toStats,catRows};
}

(async()=>{
// ===== 1. 退款按钮：只有支出有；退款弹窗内容 =====
{
  const t=await boot();
  t.w.openEdit('pay');
  ok(t.$('editRefundBtn').style.display==='none', '收入没有退款按钮');
  t.$('cancelEdit').click();
  t.w.openEdit('buy');
  ok(t.$('editRefundBtn').style.display==='' && t.$('editRefundBtn').textContent==='退款' && !t.$('editRefundBtn').disabled, '支出有退款按钮');
  t.$('editRefundBtn').click();
  ok(t.$('editMask').style.display==='none' && t.$('refundMask').style.display==='flex', '修改弹窗关、退款弹窗开');
  const sum=t.$('refundSum').textContent;
  ok(sum.includes('购物 · 鞋子') && sum.includes('原金额 100.00') && sum.includes('已退 0.00') && sum.includes('还能退 100.00'), '退款弹窗写明原账单与可退：'+sum);
  ok(t.$('refundKind').querySelector('.sel').dataset.v==='all' && t.$('refundMoney').value==='100.00' && t.$('refundMoney').readOnly, '默认全额：金额填好且只读');
  ok(t.$('refundTime').dataset.value==='2026-10-10T14:00', '退款时间默认现在');
  t.kind('part');
  ok(t.$('refundMoney').value==='' && !t.$('refundMoney').classList.contains('ro') && !t.$('refundMoney').dataset.kpLock && t.$('refundMoney').placeholder==='最多 100.00', '部分退款：清空可填（1020-I 起用数字键盘填）');
  t.$('refundCancel').click();
  ok(t.$('refundMask').style.display==='none' && !t.refunds().length, '取消不产生记录');
}

// ===== 2. 部分退款 → 统计 =====
{
  const t=await boot();
  t.refund('buy', { part:30, remark:'差价' });
  const rf=t.refunds();
  ok(rf.length===1 && rf[0].money===30 && rf[0].type==='income' && rf[0].cat==='购物' && rf[0].refundOf==='buy' && rf[0].remark==='差价' && rf[0].time==='2026-10-10T14:00', '生成退款记录：'+JSON.stringify(rf[0]));
  ok(t.$('askTitle').textContent==='退款完成' && t.$('askMsg').textContent==='已退款 30.00，这笔还能再退 70.00。', '完成提示');
  t.$('askOk').click();
  // 总览：收入不变 5000；支出 100+30-30=100；结余 5000-100-30+30=4900
  ok(t.q('.ov-in')==='5000.00' && t.q('.ov-out')==='100.00', '总览：收入不加、支出扣掉：'+t.q('.ov-in')+' '+t.q('.ov-out'));
  ok(t.q('.ov-net')==='4900.00', '结余 +30：'+t.q('.ov-net'));
  const cs=t.catRows().map(r=>r.textContent).join('|');
  ok(cs.includes('购物−70.00'), '分类汇总：购物 −70：'+cs);
  // 列表
  const rows=[...t.$('billList').querySelectorAll('.bl-row')];
  const rRow=rows.find(r=>r.textContent.includes('差价')), bRow=rows.find(r=>r.textContent.includes('鞋子'));
  ok(rRow.querySelector('.io-refund').textContent==='退款' && rRow.querySelector('.bl-amt').textContent==='+30.00' && rRow.querySelector('.pos'), '退款行：退款标签、+30 绿色');
  ok(bRow.querySelector('.io-refunded').textContent==='已退 30.00' && bRow.querySelector('.bl-amt').textContent==='−100.00', '原账单：金额不变，标已退 30');
  rRow.click(); ok(t.$('detailBal').textContent==='4900.00', '退款行结余（1023-A 起在详情里）'); t.$('detailClose').click();
  // 统计页
  t.toStats();
  ok(t.$('statMonthIn').textContent==='+5000.00' && t.$('statMonthOut').textContent==='−100.00', '统计页当月收支');
  const cell=n=>[...t.$('statCal').querySelectorAll('.day')].find(c=>c.querySelector('.dn')&&c.querySelector('.dn').textContent===String(n));
  ok(cell(10).querySelector('.da').textContent==='+30', '10 号日历 +30');
  cell(10).click();
  ok(t.$('statFlowList').querySelector('.sf-io.refund').textContent==='退款' && t.$('statFlowList').querySelector('.sf-amt').textContent.trim()==='+30.00', '当日明细：退款');
  const pie=[...t.$('statMonthCatList').querySelectorAll('.sc-item')].map(it=>it.querySelector('.sc-cat-name').textContent+it.querySelector('.sc-amt').textContent).join('|');
  ok(pie.includes('购物−70.00') && pie.includes('餐饮−30.00'), '饼图按净额：'+pie);
  // 收入口径饼图不含退款
  t.$('statMonthCatSeg').querySelector('[data-v="income"]').click();
  ok([...t.$('statMonthCatList').querySelectorAll('.sc-cat-name')].map(e=>e.textContent).join()==='工资', '收入饼图不含退款');
  ok(t.errs.length===0, '无脚本错误 '+t.errs.join(';'));
}

// ===== 3. 多次退、全额、超额、时间早于原账单 =====
{
  const t=await boot();
  t.refund('buy', { part:30 }); t.$('askOk').click();
  t.refund('buy', { part:80 });
  ok(t.$('askMsg').textContent.startsWith('最多能退 70.00') && t.$('askMsg').textContent.includes('另记一笔收入') && t.refunds().length===1, '超额拦下并提示另记收入');
  t.$('askOk').click(); t.$('refundCancel').click();
  t.refund('buy', { part:20, time:'2026-10-01T08:00' });
  ok(t.$('askMsg').textContent.startsWith('退款时间不能早于原账单') && t.refunds().length===1, '时间早于原账单拦下');
  t.$('askOk').click(); t.$('refundCancel').click();
  t.refund('buy', { part:'abc' });
  ok(t.refunds().length===1, '金额非法拦下');
  t.$('askOk').click(); t.$('refundCancel').click();
  t.w.openEdit('buy');
  ok(t.$('editRefundBtn').textContent==='退款（已退 30.00，还能退 70.00）', '按钮写明已退/可退：'+t.$('editRefundBtn').textContent);
  t.$('editRefundBtn').click();
  ok(t.$('refundMoney').value==='70.00', '全额 = 剩下的 70');
  t.$('refundOk').click();
  ok(t.$('askMsg').textContent==='已退款 70.00，这笔已全额退款。' && t.refunds().length===2, '全额退完');
  t.$('askOk').click();
  const bRow=[...t.$('billList').querySelectorAll('.bl-row')].find(r=>r.textContent.includes('鞋子'));
  ok(bRow.querySelector('.io-refunded').textContent==='已全退', '标「已全退」');
  t.w.openEdit('buy');
  ok(t.$('editRefundBtn').disabled && t.$('editRefundBtn').textContent==='已全额退款', '按钮置灰');
  ok(t.$('editRefundNote').style.display==='' && t.$('editRefundNote').querySelectorAll('.dr-line').length===2, '修改弹窗顶部列出两笔退款');
  ok(t.q('.ov-out')==='30.00', '全退后购物支出为 0：'+t.q('.ov-out'));
  const cs=t.catRows().map(r=>r.textContent).join('|');
  ok(cs.includes('购物+0.00') || !cs.includes('购物−'), '分类汇总购物净 0：'+cs);
  t.toStats();
  ok(![...t.$('statMonthCatList').querySelectorAll('.sc-cat-name')].some(e=>e.textContent==='购物'), '退完的分类不进饼图');
}

// ===== 4. 修改退款记录：只能改时间/金额/备注 =====
{
  const t=await boot();
  t.refund('buy', { part:30 }); t.$('askOk').click();
  t.refund('buy', { part:50 }); t.$('askOk').click();
  const rid=t.refunds()[0].id;
  t.w.openEdit(rid);
  ok(t.$('editMask').classList.contains('is-refund'), '退款记录：锁定模式');
  const hidden=[...t.$('editMask').querySelectorAll('.lock-on-refund')].every(f=>t.w.getComputedStyle(f).display==='none');
  ok(hidden, '分类 / 收支 / 口径三栏隐藏');
  ok(t.$('editRefundBtn').style.display==='none' && t.$('editSaveTpl').style.display==='none', '没有退款、存为常用按钮');
  ok(t.$('editRefundNote').textContent.includes('这是一笔退款') && t.$('editRefundNote').textContent.includes('还能退 50.00（含这笔）'), '顶部说明：'+t.$('editRefundNote').textContent);
  t.$('editMoney').value='60'; t.$('saveEdit').click();
  ok(t.$('askMsg').textContent.startsWith('这笔退款最多 50.00') && t.refunds()[0].money===30, '改成超额拦下');
  t.$('askOk').click();
  t.$('editMoney').value='45'; t.$('editRemark').value='改了'; t.$('saveEdit').click();
  const r=t.refunds()[0];
  ok(r.money===45 && r.remark==='改了' && r.type==='income' && r.cat==='购物' && r.refundOf==='buy', '改金额与备注，其他不变');
  ok(t.q('.ov-out')==='35.00', '支出 100+30-45-50 = 35：'+t.q('.ov-out'));
  // 删退款：可退恢复
  t.w.openEdit(rid); t.$('deleteInEdit').click();
  ok(t.$('askMsg').textContent.includes('原账单的「还能退」金额会恢复'), '删退款的确认文案');
  t.$('askOk').click();
  ok(t.refunds().length===1, '删掉一笔退款');
  t.w.openEdit('buy');
  ok(t.$('editRefundBtn').textContent==='退款（已退 50.00，还能退 50.00）', '可退恢复');
}

// ===== 5. 修改原账单的约束与联动 =====
{
  const t=await boot();
  t.refund('buy', { part:40 }); t.$('askOk').click();
  t.w.openEdit('buy');
  t.$('editMoney').value='30'; t.$('saveEdit').click();
  ok(t.$('askMsg').textContent==='这笔已经退了 40.00，金额不能改得比这还少。' && t.recs().find(r=>r.id==='buy').money===100, '金额不能低于已退');
  t.$('askOk').click();
  t.$('editMoney').value='100';
  [...t.$('editTypeChips').querySelectorAll('.cc')].find(e=>e.textContent==='收入').click();
  t.$('saveEdit').click();
  ok(t.$('askMsg').textContent.startsWith('这笔已经有 40.00 的退款，不能改成收入') && t.recs().find(r=>r.id==='buy').type==='expense', '有退款不能改收入');
  t.$('askOk').click(); t.$('cancelEdit').click();
  t.w.openEdit('buy');
  t.$('editTime').dataset.value='2026-10-11T10:00'; t.$('saveEdit').click();
  ok(t.$('askMsg').textContent.includes('原账单的时间不能晚于它'), '原账单时间不能晚于退款');
  t.$('askOk').click(); t.$('cancelEdit').click();
  // 改分类 + 口径：退款跟着改
  t.w.openEdit('buy');
  RC.chip(t.d, 'editCatChips', '游戏').click();
  RC.pickMode(t.d, 'editMode', '往来');
  t.$('saveEdit').click();
  const rf=t.refunds()[0];
  ok(rf.cat==='游戏' && rf.flow===true, '退款跟着改分类和口径：'+JSON.stringify(rf));
  ok(t.q('.ov-out')==='30.00', '只算结余后，原账单和退款都不进支出');
  ok(t.errs.length===0, '无脚本错误 '+t.errs.join(';'));
}

// ===== 6. 删原账单：退款一起删 =====
{
  const t=await boot();
  t.refund('buy', { part:40 }); t.$('askOk').click();
  t.refund('buy', { part:10 }); t.$('askOk').click();
  t.w.openEdit('buy'); t.$('deleteInEdit').click();
  // 1017-T：确认框先写是哪一笔，再写会连带删的退款；按钮写清楚、警示色
  ok(/\n\n这笔账单有 2 笔退款（共 50\.00），会跟它一起删除。/.test(t.$('askMsg').textContent) && t.$('askOk').textContent==='删除这条和 2 笔退款' && t.$('askOk').classList.contains('warn'), '确认文案：'+t.$('askMsg').textContent);
  t.$('askOk').click();
  ok(!t.recs().some(r=>r.id==='buy') && !t.refunds().length && t.recs().length===3, '原账单与退款一起删掉');
  ok(t.q('.ov-net')==='4970.00', '结余回到 5000-30：'+t.q('.ov-net'));
}

// ===== 7. 没保存的修改：先问 =====
{
  const t=await boot();
  t.w.openEdit('buy'); t.$('editRemark').value='改了没保存';
  t.$('editRefundBtn').click();
  ok(t.$('askMsg').textContent.includes('修改还没保存') && t.$('refundMask').style.display!=='flex', '有改动先确认');
  t.$('askOk').click();
  ok(t.$('refundMask').style.display==='flex' && t.recs().find(r=>r.id==='buy').remark==='鞋子', '放弃修改去退款，原记录不变');
}

// ===== 8. 原账单是「不计入」：退款也不计入 =====
{
  const t=await boot();
  t.refund('cc', { part:100 }); t.$('askOk').click();
  const rf=t.refunds()[0];
  ok(rf.skip===true && rf.cat==='转账', '退款跟着原账单不计入');
  ok(t.q('.ov-net')==='4870.00', '不计入的退款不进结余：'+t.q('.ov-net'));
}

// ===== 9. 预算 / 年度 / 环比 / AI =====
{
  const recs=base().concat([ R('sep','2026-09-02T10:00',100,'expense','购物','九月') ]);
  const t=await boot(recs, { budgets:{'购物':200} });
  t.refund('buy', { part:30, remark:'差价' }); t.$('askOk').click();
  t.toStats(); t.$('statTabSeg').querySelector('[data-v="budget"]').click();
  const row=[...t.$('bgGroups').querySelectorAll('.bg-row')].find(r=>r.dataset.cat==='购物');
  ok(row.querySelector('.bg-num').textContent==='70.00 / 200.00', '预算已花扣掉退款：'+row.querySelector('.bg-num').textContent);
  row.click();
  const det=t.$('bgGroups').querySelector('.bg-detail');
  ok(det.querySelectorAll('.sf-item').length===2 && det.querySelector('.sf-io.refund') && det.textContent.includes('+30.00'), '预算明细列出退款');
  ok(t.$('bgOverview').querySelector('.bgy-head .bgo-v').textContent.startsWith('170 /'), '年度已用 100+70：'+t.$('bgOverview').querySelector('.bgy-head .bgo-v').textContent);
  t.$('statTabSeg').querySelector('[data-v="flow"]').click();
  const it=[...t.$('statMonthCatList').querySelectorAll('.sc-item')].find(i=>i.querySelector('.sc-cat-name').textContent==='购物');
  ok(it.querySelector('.sc-delta').textContent==='较上月 ↓30%', '环比按净额：'+it.querySelector('.sc-delta').textContent);
  const txt=t.w.JiwenAiExport.buildAiText(t.recs().filter(r=>r.time.startsWith('2026-10')),'2026年10月','按月');
  ok(txt.includes('支出 100.00 元') && txt.includes('含退款 1 笔共 30.00 元，已冲抵支出'), 'AI 总览');
  ok(txt.includes('购物：70.00 元') && txt.includes('退款 购物 30.00 元（备注：差价）【退款】'), 'AI 分类净额与明细标注');
  ok(txt.includes('标注【退款】的记录'), 'AI 提示语说明退款');
  // 记账成功的预算提示也扣退款
  ok(t.w.JiwenStore.budgetSpentIn(t.recs(), '购物', 2026, 9)===70, 'budgetSpentIn 扣退款');
  ok(t.errs.length===0, '无脚本错误 '+t.errs.join(';'));
}

// ===== 10. 批量：退款不参与，跟着原账单 =====
{
  const t=await boot();
  t.refund('buy', { part:30, remark:'鞋子退差价' }); t.$('askOk').click();
  t.$('filterFab').click(); t.$('searchKeyword').value='鞋子'; t.$('sheetApply').click();
  t.$('batchBar').querySelector('[data-act="batch"]').click();
  ok(t.$('askMsg').textContent.startsWith('对当前筛选命中的 1 条记录') && t.$('askMsg').textContent.includes('另有 1 条退款记录不参与'), '菜单说明：'+t.$('askMsg').textContent);
  const choose=label=>RC.choose(t.d, label);   // 1020-I：批量改分类在分类抽屉里选
  choose('改分类'); choose('游戏');
  ok(t.$('askList').querySelectorAll('.al-row').length===1, '确认清单只有原账单');
  t.$('askOk').click();
  ok(t.$('askMsg').textContent==='已处理 1 条记录。', '完成提示只数原账单');
  ok(t.recs().find(r=>r.id==='buy').cat==='游戏' && t.refunds()[0].cat==='游戏', '退款跟着改到游戏');
  t.$('askExtra').click();
  ok(t.recs().find(r=>r.id==='buy').cat==='购物' && t.refunds()[0].cat==='购物' && t.$('askMsg').textContent==='已撤销，1 条记录恢复原样。', '撤销一起还原');
  // 只命中退款
  const t2=await boot(); t2.refund('buy',{part:5, remark:'独有备注'}); t2.$('askOk').click();
  t2.$('filterFab').click(); t2.$('searchKeyword').value='独有备注'; t2.$('sheetApply').click();
  t2.$('batchBar').querySelector('[data-act="batch"]').click();
  ok(t2.$('askMsg').textContent.startsWith('命中的 1 条都是退款记录'), '只命中退款时提示');
  // 筛选小计按净额
  ok(t.$('summaryFilter').textContent.includes('支出 70.00'), '筛选小计支出 = 100 − 30：'+t.$('summaryFilter').textContent);
}

// ===== 11. 详情 =====
{
  const t=await boot();
  t.refund('buy', { part:30, remark:'差价' }); t.$('askOk').click();
  const rid=t.refunds()[0].id;
  t.w.JiwenStats.openDetail(rid);
  ok(t.$('detailType').textContent==='退款', '收支栏只放标签：'+t.$('detailType').textContent);
  ok(t.$('detailRefundField').style.display==='' && t.$('detailRefundLabel').textContent==='原账单'
     && t.$('detailRefundVal').textContent==='10-02 10:00鞋子−100.00', '单独一栏写原账单：'+t.$('detailRefundVal').textContent);
  t.$('detailClose').click();
  t.w.JiwenStats.openDetail('buy');
  ok(t.$('detailType').textContent==='支出已退 30.00', '原账单收支栏：'+t.$('detailType').textContent);
  ok(t.$('detailRefundLabel').textContent==='退款记录 · 还能退 70.00' && t.$('detailRefundVal').textContent==='10-10 14:00差价+30.00', '原账单单独一栏列退款');
  t.$('detailClose').click(); t.w.JiwenStats.openDetail('eat');
  ok(t.$('detailRefundField').style.display==='none', '没有关联时整栏隐藏');
  // 日历：有退款的日子标「退款」
  t.$('detailClose').click(); t.toStats();
  const c10=[...t.$('statCal').querySelectorAll('.day')].find(c=>c.querySelector('.dn')&&c.querySelector('.dn').textContent==='10');
  ok(c10.querySelector('.dtag.refund') && c10.querySelector('.dtag.refund').textContent==='退款', '日历 10 号标「退款」');
  const c2=[...t.$('statCal').querySelectorAll('.day')].find(c=>c.querySelector('.dn')&&c.querySelector('.dn').textContent==='2');
  ok(!c2.querySelector('.dtag'), '原账单那天不标');
}

// ===== 12. 导入 / 导出 / 旧数据兼容 =====
{
  const t=await boot();
  t.refund('buy', { part:30 }); t.$('askOk').click();
  const payload=t.w.eval('JiwenStore.odBuildPayload()');
  ok(payload.data.some(r=>r.refundOf==='buy'), '云备份带 refundOf');
  t.w.JiwenStore.importArchiveFromText(JSON.stringify({ archive:'导入', cats:['未分类','购物'], data:[
    R('o1','2026-10-01T10:00',100,'expense','购物','原'),
    R('r1','2026-10-02T10:00',60,'income','其他','退1',{refundOf:'o1'}),           // 分类被纠正为原账单的
    R('r2','2026-10-03T10:00',50,'income','购物','退2超额',{refundOf:'o1'}),       // 累计 110 > 100 → 普通收入
    R('r3','2026-10-03T10:00',10,'income','购物','找不到原账单',{refundOf:'zzz'}),  // → 普通收入
    R('o2','2026-10-01T10:00',20,'income','购物','收入不能被退'),
    R('r4','2026-10-03T10:00',5,'income','购物','挂在收入上',{refundOf:'o2'}),      // → 普通收入
    R('r5','2026-10-03T10:00',5,'expense','购物','支出带标记',{refundOf:'o1'}),     // 支出不认
  ]}), t.w.localStorage.getItem('app_logged_in_user'));
  const im=JSON.parse(t.w.JiwenStore.ledgerGet(t.w.JiwenStore.storeKey())).archives['导入'].records;
  const by=rk=>im.find(r=>r.remark===rk);
  const o1=by('原');
  ok(by('退1').refundOf===o1.id && o1.id!=='o1' && by('退1').cat==='购物', '退款挂回新 id，分类跟原账单');
  ok(!by('退2超额').refundOf && !by('找不到原账单').refundOf && !by('挂在收入上').refundOf && !by('支出带标记').refundOf, '不合法的退化为普通记录');
  // 旧数据（没有 refundOf）：所有数字与 1010-I3 一致由 regress.js 保证；这里补一条「普通收入」不受影响
  const t2=await boot(base().concat([R('x','2026-10-06T10:00',12,'income','购物','普通收入')]));
  ok(t2.q('.ov-in')==='5012.00' && t2.q('.ov-out')==='130.00', '普通收入照旧算收入');
  ok(t.errs.length+t2.errs.length===0, '无脚本错误');
}

// ===== 13. 返回键：退款弹窗先关 =====
{
  ok(/isOpen\('refundMask'\)/.test(html) && html.indexOf("isOpen('refundMask')") < html.indexOf("isOpen('editMask'),   close"), '返回键层级：退款弹窗在修改弹窗之前');
}

console.log(`\n1010-J 退款专项：${pass} 通过，${fail} 失败`); process.exit(fail?1:0);
})();
