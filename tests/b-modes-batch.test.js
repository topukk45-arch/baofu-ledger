// 1010-C 回归（原 1010-B 用例）测试：node test2.js <html>
const fs = require('fs');
const { JSDOM } = require('jsdom'); const IDB=require('./helpers/idb');
const html = fs.readFileSync(process.argv[2] || require('path').join(__dirname,'..','www','index.html'), 'utf8');
let pass=0, fail=0;
const ok=(c,n)=>{ if(c) pass++; else { fail++; console.log('  ✗ '+n); } };
const R=(id,time,money,type,cat,remark,extra)=>Object.assign({id,time,money,type,cat,remark:remark||''},extra||{});

function baseRecords(){
    const rs=[
        R('a1','2026-08-02T14:01',4351.09,'expense','转账','信用卡还款'),
        R('a2','2026-08-31T15:19',7575.94,'expense','其他','信用卡还款'),
        R('a3','2026-09-01T12:00',14,'expense','餐饮','午饭'),
        R('a4','2026-09-10T19:43',5200,'income','其他','工资'),
        R('a5','2026-09-12T10:00',100,'expense','转账','只有不计入的一天',{skip:true}),
    ];
    // 20 条「游戏充值」散在 3 个分类，用来测批量跨页
    for(let i=0;i<20;i++) rs.push(R('g'+i,`2026-09-${String(13+(i%10)).padStart(2,'0')}T2${i%10}:00`,10+i,'expense',['其他','购物','餐饮'][i%3],'游戏充值'));
    return rs;
}
let __lastW=null, __phone=null, __lastPhone=null;
async function boot(...a){ const t=bootSync(...a); const __w=__lastW, __p=__lastPhone; t.idle=()=>IDB.idle(__w); t.phone=__p; t.db=async()=>{ await IDB.idle(__w); return IDB.dumpDb(__p); }; await IDB.idle(__w); return t; }
function bootSync(records, extra){
    const store={ archives:{ '默认存档':{ cats:['未分类','餐饮','购物','转账','其他','游戏'], records: records||baseRecords() } }, last:'默认存档' };
    const dom=new JSDOM(html,{ runScripts:'dangerously', pretendToBeVisual:true, url:'https://localhost/',
        beforeParse(w){ __lastW=w; __lastPhone=IDB.install(w, __phone);
            const ls=w.localStorage;
            ls.setItem('app_logged_in_user','小明'); ls.setItem('store_小明',JSON.stringify(store));
            ls.setItem('app_time_repaired_小明','1');
            (extra||[]).forEach(([k,v])=>ls.setItem(k,v));
            w.scrollTo=()=>{}; w.HTMLElement.prototype.scrollIntoView=function(){};
            w.Date=class extends Date{constructor(...a){a.length?super(...a):super('2026-09-20T10:00:00');}static now(){return new Date('2026-09-20T10:00:00').getTime();}};
            w.Capacitor={ isNativePlatform:()=>true, Plugins:{ OneDriveLink:{ writeText:async()=>{}, pickFile:async()=>({}), forget:async()=>{} } } };
        }});
    const errs=[]; dom.window.addEventListener('error',e=>errs.push(e.message));
    const d=dom.window.document, $=id=>d.getElementById(id);
    const recs=()=>JSON.parse(dom.window.JiwenStore.ledgerGet(dom.window.JiwenStore.storeKey())).archives['默认存档'].records;
    const byId=id=>recs().find(r=>r.id===id);
    const chip=(boxId,text)=>[...$(boxId).querySelectorAll('.cc')].find(e=>(e.querySelector('.cc-label')||e).textContent===text);
    const choose=text=>{ chip('askChoices',text).click(); $('askOk').click(); };
    const filterKw=kw=>{ $('filterFab').click(); $('searchKeyword').value=kw; $('sheetApply').click(); };
    return { w:dom.window, d, $, recs, byId, chip, choose, filterKw, errs };
}

(async()=>{
// ===== 1. 记一笔：三选一 + 转账自动切不计入 =====
{
    const t=await boot(); const box=t.$('billMode'); const mode=()=>box.dataset.mode;
    const pick=txt=>[...box.querySelectorAll('.cc')].find(e=>(e.querySelector('.cc-label')||e).textContent===txt).click();
    t.$('fabAdd').click();
    ok(mode()==='normal' && box.querySelector('.cc.sel').textContent==='计入', '新表单默认「计入」');
    ok(t.$('billModeHint').textContent.includes('正常计入'), '下方有口径说明');
    t.chip('billCatChips','转账').click();
    ok(mode()==='skip', '选转账自动切到不计入');
    t.chip('billCatChips','餐饮').click();
    ok(mode()==='normal', '自动切的，换分类会恢复计入');
    t.chip('billCatChips','转账').click(); pick('计入');
    t.chip('billCatChips','转账').click();
    ok(mode()==='normal', '手动改回计入后再点转账不强制切');
    t.chip('billCatChips','餐饮').click(); pick('只算结余');
    t.chip('billCatChips','转账').click();
    ok(mode()==='flow', '已手动选只算结余时，选转账不覆盖');
    ok(t.$('billModeHint').textContent.includes('资金往来'), '说明随选项变化');
    pick('不计入');
    t.$('billMoney').value='1234.56'; t.chip('billTypeChips','支出').click(); t.$('billRemark').value='信用卡';
    t.$('addBill').click();
    const added=t.recs().find(r=>r.money===1234.56);
    ok(added && added.skip===true && !('flow' in added), '保存为 skip');
    t.$('askCancel').click();
    t.$('fabAdd').click();
    ok(mode()==='normal', '再记一笔时复位为计入');
    pick('只算结余'); t.$('billMoney').value='4500'; t.chip('billCatChips','其他').click(); t.chip('billTypeChips','收入').click(); t.$('addBill').click();
    const f=t.recs().find(r=>r.money===4500);
    ok(f && f.flow===true && !('skip' in f), '保存为 flow');
    t.$('askCancel').click();
    t.$('fabAdd').click(); t.$('billMoney').value='1'; t.chip('billCatChips','餐饮').click(); t.chip('billTypeChips','支出').click(); t.$('addBill').click();
    const n=t.recs().find(r=>r.money===1);
    ok(n && !('flow' in n) && !('skip' in n), '计入时不写任何口径字段');
    ok(t.errs.length===0, '无脚本错误 '+t.errs.join(';'));
}

// ===== 2. 修改：保留 skip 与未知字段，开关可关掉 =====
{
    const recs=baseRecords(); recs[2].foo='keep';
    const t=await boot(recs);
    t.w.openEdit('a5');
    ok(t.$('editMode').dataset.mode==='skip', '修改弹窗回显 skip');
    t.$('saveEdit').click();
    ok(t.byId('a5').skip===true, '原样保存后 skip 还在');
    t.w.openEdit('a3'); t.$('editMoney').value='15'; t.$('saveEdit').click();
    ok(t.byId('a3').foo==='keep' && t.byId('a3').money===15, '修改不丢未知字段');
    ok(!('skip' in t.byId('a3')), '未开启时不写 skip 字段');
    t.w.openEdit('a5'); [...t.$('editMode').querySelectorAll('.cc')].find(e=>e.textContent==='只算结余').click(); t.$('saveEdit').click();
    ok(!('skip' in t.byId('a5')) && t.byId('a5').flow===true, '改成只算结余：skip 删除、flow 写入');
    t.w.openEdit('a5'); [...t.$('editMode').querySelectorAll('.cc')].find(e=>e.textContent==='计入').click(); t.$('saveEdit').click();
    ok(!('skip' in t.byId('a5')) && !('flow' in t.byId('a5')), '改回计入：两个字段都删除');
}

// ===== 3. 导入保留 skip =====
{
    const t=await boot();
    const txt=JSON.stringify({ app:'记问', user:'小明', archive:'导入测试', cats:['转账'],
        data:[ R('x','2026-09-01T10:00',50,'expense','转账','还款',{skip:true}), R('y','2026-09-01T11:00',5,'expense','转账','',{skip:'yes'}) ] });
    t.w.JiwenStore.importArchiveFromText(txt, t.w.localStorage.getItem('app_logged_in_user'));
    const arc=JSON.parse(t.w.JiwenStore.ledgerGet(t.w.JiwenStore.storeKey())).archives['导入测试'].records;
    ok(arc[0].skip===true, '导入保留 skip:true');
    ok(!('skip' in arc[1]), '非严格 true 的 skip 不导入');
}

// ===== 4. 账单页口径 =====
{
    const recs=baseRecords(); recs[0].skip=true; recs[1].skip=true;
    const t=await boot(recs);
    const ov=t.$('summaryOverall').textContent;
    const out=14+100*0+[...Array(20).keys()].reduce((s,i)=>s+10+i,0); // 午饭 + 20 条游戏
    const q=c=>t.$('summaryOverall').querySelector(c).textContent;
    ok(ov.includes('共 25 条') && q('.ov-out')==='−'+out.toFixed(2) && q('.ov-in')==='+5200.00', '总览不含不计入：'+ov);
    ok(!t.$('catStats').textContent.includes('转账'), '全部不计入的「转账」不出现在分类汇总');
    const rows=[...t.$('billList').querySelectorAll('tr')];
    // 找到 a5（09-12 只有不计入）与其前一笔（时间正序前一笔）的结余应相同
    const balOf=time=>{ const tr=rows.find(r=>r.textContent.includes(time)); return tr && tr.querySelector('[data-label="结余"]').textContent; };
    t.filterKw('信用卡');
    ok([...t.$('billList').querySelectorAll('tr')].filter(r=>r.querySelector('.io-skip') && r.querySelector('.amt-skip')).length===2, '不计入行有灰色标签和灰色金额');
    const sf=t.$('summaryFilter').textContent;
    ok(sf.includes('命中 2 条（其中 2 条不计入）') && sf.includes('支出 0.00'), '筛选小计说明不计入条数：'+sf);
    ok(t.$('batchBar').querySelector('[data-act="batch"]'), '筛选生效时有批量按钮');
    // 结余：a5（100 不计入）那一行结余应等于它前一笔
    const t2=await boot(baseRecords());
    const all=[...t2.$('billList').querySelectorAll('tr')].map(r=>({ t:r.querySelector('[data-label="记账时间"]').textContent, b:r.querySelector('[data-label="结余"]').textContent }));
    // 第一页是最新 15 条，a5 在 09-12，翻页找
    let found=null; const pages=[all];
    for(let k=0;k<5 && !found;k++){
        const rowsNow=[...t2.$('billList').querySelectorAll('tr')].map(r=>({ t:r.querySelector('[data-label="记账时间"]').textContent, b:r.querySelector('[data-label="结余"]').textContent }));
        const i=rowsNow.findIndex(x=>x.t==='2026-09-12 10:00');
        if(i>=0 && rowsNow[i+1]) found=[rowsNow[i].b, rowsNow[i+1].b];
        const nx=[...t2.$('pager').querySelectorAll('button')].pop(); if(nx && !nx.disabled) nx.click(); else break;
    }
    ok(found && found[0]===found[1], '不计入那一行结余与上一笔相同：'+JSON.stringify(found));
}

// ===== 5. 统计页 =====
{
    const recs=baseRecords(); recs[1].skip=true;
    const t=await boot(recs);
    t.d.querySelector('.tab-btn[data-tab="stats"]').click();
    const cells=[...t.$('statCal').querySelectorAll('.day')];
    const c12=cells.find(c=>c.querySelector('.dn') && c.querySelector('.dn').textContent==='12');
    ok(c12.classList.contains('has') && !c12.querySelector('.da'), '只有不计入的那天可点、但不显示金额');
    ok(!c12.innerHTML.includes('NaN'), '不出现 NaN');
    ok(!t.$('statMonthCatList').textContent.includes('转账'), '饼图不含不计入');
    c12.click();
    ok(t.$('statFlowList').querySelector('.sf-io.skip'), '当日明细标出不计入');
    ok(t.$('statMonthOut').textContent==='−'+(14+[...Array(20).keys()].reduce((s,i)=>s+10+i,0)).toFixed(2), '当月支出不含不计入：'+t.$('statMonthOut').textContent);
}

// ===== 6. AI 导出 =====
{
    const recs=baseRecords(); recs[0].skip=true; recs[1].skip=true;
    const t=await boot(recs);
    const aug=recs.filter(r=>r.time.startsWith('2026-08'));
    const txt=t.w.JiwenAiExport.buildAiText(aug,'2026年8月','按月');
    ok(txt.includes('支出 0.00 元') && txt.includes('共 2 笔（其中 2 笔不计入收支）'), 'AI 总览排除不计入');
    ok(txt.includes('已从总览和分类占比中排除') && (txt.match(/【不计入收支】/g)||[]).length===2+1, 'AI 提示语与明细标注');
    ok(txt.includes('（本期无支出）'), '全部不计入时分类占比为空');
}

// ===== 7. 批量操作 =====
{
    const t=await boot();
    t.filterKw('信用卡');
    t.$('batchBar').querySelector('[data-act="batch"]').click();
    t.choose('标为不计入');
    ok(t.$('askMsg').textContent.includes('把下面这 2 条') && t.$('askOk').textContent==='改这 2 条' && t.$('askOk').classList.contains('warn'), '确认框写明条数');
    t.$('askOk').click();
    ok(t.byId('a1').skip===true && t.byId('a2').skip===true, '批量标记成功');
    ok(!('skip' in t.byId('a3')), '未命中的不受影响');
    t.$('askExtra').click();   // 撤销
    ok(!('skip' in t.byId('a1')) && !('skip' in t.byId('a2')), '撤销恢复原样');

    // 跨页：20 条游戏充值，每页 15 条
    const t2=await boot();
    t2.filterKw('游戏充值');
    t2.$('batchBar').querySelector('[data-act="batch"]').click();
    t2.choose('改分类'); t2.choose('游戏');
    ok(t2.$('askMsg').textContent.includes('把下面这 20 条') && t2.$('askOk').textContent==='改这 20 条', '跨页批量：20 条');
    t2.$('askOk').click();
    ok(t2.recs().filter(r=>r.remark==='游戏充值').every(r=>r.cat==='游戏'), '20 条全部改为游戏');
    ok(t2.recs().filter(r=>r.cat==='游戏').length===20, '没有误改其他记录');

    // 按分类筛选时改分类：筛选跟到新分类
    const t3=await boot();
    t3.$('filterFab').click(); t3.chip('filterChips','其他').click(); t3.$('searchKeyword').value='游戏充值'; t3.$('sheetApply').click();
    const n=t3.recs().filter(r=>r.cat==='其他' && r.remark==='游戏充值').length;
    t3.$('batchBar').querySelector('[data-act="batch"]').click();
    t3.choose('改分类'); t3.choose('游戏'); t3.$('askOk').click();
    ok(t3.w.document.getElementById('filterCat').value==='游戏', '筛选分类跟到新分类');
    ok(t3.$('summaryFilter').textContent.includes(`命中 ${n} 条`), '列表仍显示刚改的那批');
    t3.$('askExtra').click();
    ok(t3.$('filterCat').value==='其他' && t3.recs().filter(r=>r.cat==='游戏').length===0, '撤销后分类与筛选都还原');

    // 没筛选时没有批量入口
    const t4=await boot();
    ok(t4.$('summaryFilter').style.display==='none', '无筛选时不显示批量入口');
    ok(t.errs.length+t2.errs.length+t3.errs.length===0, '批量无脚本错误');
}

// ===== 8. 详情 + 云备份文件名说明 =====
{
    const t=await boot(null,[['onedrive_link_小明__默认存档', JSON.stringify({uri:'u',name:'记问存档_小明.json',lastSyncAt:1,lastError:null,blocked:false,lastCount:1})]]);
    t.w.openDetail('a5');
    ok(t.$('detailType').textContent.includes('不计入收支') && t.$('detailMoney').querySelector('.amt-skip'), '详情显示不计入');
    ok(t.$('odStatus').textContent.includes('（云盘文件名不随存档改名）'), '文件名对不上时有说明');
    const t2=await boot(null,[['onedrive_link_小明__默认存档', JSON.stringify({uri:'u',name:'记问存档_默认存档.json',lastSyncAt:1,lastError:null,blocked:false,lastCount:1})]]);
    ok(!t2.$('odStatus').textContent.includes('不随存档改名'), '文件名一致时不显示说明');
}

console.log(`\n1010-C 回归（原 1010-B 用例）：${pass} 通过，${fail} 失败`);
process.exit(fail?1:0);
})();
