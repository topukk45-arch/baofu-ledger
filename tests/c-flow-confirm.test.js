// 1010-C 专项：只算结余 + 确认弹窗清单。node test4.js <html>
const fs=require('fs'); const {JSDOM}=require('jsdom'); const IDB=require('./helpers/idb');
const html=fs.readFileSync(process.argv[2]||require('path').join(__dirname,'..','www','index.html'),'utf8');
let pass=0, fail=0; const ok=(c,n)=>{ if(c) pass++; else { fail++; console.log('  ✗ '+n); } };
const R=(id,time,money,type,cat,remark,extra)=>Object.assign({id,time,money,type,cat,remark:remark||''},extra||{});
function oct(){ return [
    R('dep','2026-07-01T00:00',50000.00,'income','存款','期初存款'),
    R('cc1','2026-10-01T10:33',1234.56,'expense','其他','信用卡'),
    R('cc2','2026-10-01T10:33',600.00,'expense','其他','信用卡'),
    R('food','2026-10-01T00:02',16,'expense','餐饮','夜宵'),
    R('lpo','2026-10-04T16:30',3999.00,'expense','购物','笔记本'),
    R('lpi','2026-10-04T16:30',4500,'income','其他','笔记本'),
    R('par','2026-10-07T10:31',800,'expense','其他','借给朋友'),
    R('ecard','2026-10-08T20:40',100,'income','其他','购物卡'),
    R('xss','2026-10-09T12:00',13,'expense','餐饮','<img src=x onerror="window.__pwn=1">'),
];}
let __lastW=null, __phone=null, __lastPhone=null;
async function boot(...a){ const t=bootSync(...a); const __w=__lastW, __p=__lastPhone; t.idle=()=>IDB.idle(__w); t.phone=__p; t.db=async()=>{ await IDB.idle(__w); return IDB.dumpDb(__p); }; await IDB.idle(__w); return t; }
function bootSync(records){
    const store={ archives:{ '默认存档':{ cats:['未分类','餐饮','购物','其他','存款','转账'], records } }, last:'默认存档' };
    const dom=new JSDOM(html,{ runScripts:'dangerously', pretendToBeVisual:true, url:'https://localhost/',
        beforeParse(w){ __lastW=w; __lastPhone=IDB.install(w, __phone); const ls=w.localStorage;
            ls.setItem('app_logged_in_user','小明'); ls.setItem('store_小明',JSON.stringify(store)); ls.setItem('app_time_repaired_小明','1');
            w.scrollTo=()=>{}; w.HTMLElement.prototype.scrollIntoView=function(){};
            w.Date=class extends Date{constructor(...a){a.length?super(...a):super('2026-10-10T10:00:00');}static now(){return new Date('2026-10-10T10:00:00').getTime();}}; }});
    const errs=[]; dom.window.addEventListener('error',e=>errs.push(e.message));
    const d=dom.window.document, $=id=>d.getElementById(id);
    const recs=()=>JSON.parse(dom.window.ledgerGet(dom.window.storeKey())).archives['默认存档'].records;
    const chip=(box,txt)=>[...$(box).querySelectorAll('.cc')].find(e=>(e.querySelector('.cc-label')||e).textContent===txt);
    const choose=txt=>{ chip('askChoices',txt).click(); $('askOk').click(); };
    const filterKw=kw=>{ $('filterFab').click(); $('searchKeyword').value=kw; $('sheetApply').click(); };
    return { w:dom.window, d, $, recs, chip, choose, filterKw, errs };
}
const mark=(rs, ids, k)=>rs.map(r=>ids.includes(r.id)?Object.assign({},r,{[k]:true}):r);

(async()=>{
// ===== 1. 账单页：只算结余进结余、不进收支 =====
{
    let rs=oct(); rs=mark(rs,['cc1','cc2'],'skip'); rs=mark(rs,['dep','lpo','lpi','par'],'flow');
    const t=await boot(rs);
    const ov=t.$('summaryOverall').textContent;
    // 收入只有 购物卡 100；支出 = 夜宵 16 + xss 13 = 29
    const q=c=>t.$('summaryOverall').querySelector(c).textContent;
    ok(q('.ov-in')==='+100.00' && q('.ov-out')==='−29.00', '总览收支只含「计入」：'+ov);
    // 结余 = 存款 + 4500 - 3999.00 - 800 + 100 - 16 - 13（信用卡不算）
    const bal=(50000.00+4500-3999.00-800+100-16-13).toFixed(2);
    ok(q('.ov-net')===bal, '结余含资金往来、不含不计入：应为 '+bal+'，实际 '+q('.ov-net'));
    ok(!t.$('catStats').textContent.includes('存款') && !t.$('catStats').textContent.includes('购物'), '分类汇总不出现「存款」「购物（全是只算结余）」');
    t.filterKw('笔记本');
    const rows=[...t.$('billList').querySelectorAll('tr')];
    ok(rows.length===2 && rows.every(r=>r.querySelector('.io-flow') && r.querySelector('.amt-flow')), '只算结余行有灰蓝标签与金额');
    ok(t.$('summaryFilter').textContent.includes('（其中 2 条只算结余）'), '小计说明只算结余条数');
    // 结余列：购物卡那行（最新正常记录）的结余应等于总结余
    const t2=await boot(rs);
    const top=[...t2.$('billList').querySelectorAll('tr')][0];
    ok(top.querySelector('[data-label="结余"]').textContent===bal, '列表最新一行结余与总览一致');
}

// ===== 2. 统计页 10 月 =====
{
    let rs=oct(); rs=mark(rs,['cc1','cc2'],'skip'); rs=mark(rs,['lpo','lpi','par'],'flow');
    const t=await boot(rs);
    t.d.querySelector('.tab-btn[data-tab="stats"]').click();
    ok(t.$('statMonthIn').textContent==='+100.00' && t.$('statMonthOut').textContent==='−29.00',
       '10 月收支只剩真实部分：'+t.$('statMonthIn').textContent+' / '+t.$('statMonthOut').textContent);
    const cell=n=>[...t.$('statCal').querySelectorAll('.day')].find(c=>c.querySelector('.dn')&&c.querySelector('.dn').textContent===String(n));
    ok(cell(4).classList.contains('has') && !cell(4).querySelector('.da'), '4 号只有资金往来：可点开、不显示金额');
    ok(cell(1).querySelector('.da').textContent==='-16', '1 号只算夜宵 -16');
    cell(4).click();
    ok(t.$('statFlowList').querySelectorAll('.sf-io.flow').length===2, '当日明细标出只算结余');
    ok(!t.$('statMonthCatList').textContent.includes('购物'), '饼图不含只算结余');
}

// ===== 3. AI 导出 =====
{
    let rs=oct(); rs=mark(rs,['cc1','cc2'],'skip'); rs=mark(rs,['lpo','lpi','par'],'flow');
    const t=await boot(rs);
    const txt=t.w.buildAiText(rs.filter(r=>r.time.startsWith('2026-10')),'2026年10月','按月');
    ok(txt.includes('收入 100.00 元，支出 29.00 元'), 'AI 总览只含计入');
    ok(txt.includes('（其中 2 笔不计入收支、3 笔只算结余）'), 'AI 写明两类排除条数');
    ok((txt.match(/【只算结余】/g)||[]).length===4 && (txt.match(/【不计入收支】/g)||[]).length===3, 'AI 明细逐条标注（含提示语里各一次）');
}

// ===== 4. 批量 + 清单弹窗 =====
{
    const t=await boot(oct());
    t.filterKw('笔记本');
    t.$('batchBar').querySelector('[data-act="batch"]').click();
    const opts=[...t.$('askChoices').querySelectorAll('.cc')].map(e=>(e.querySelector('.cc-label')||e).textContent);
    ok(opts.join('|')==='改分类|标为只算结余|标为不计入|恢复计入', '批量菜单四项：'+opts.join('|'));
    t.choose('标为只算结余');
    const list=t.$('askList'), rows=[...list.querySelectorAll('.al-row')];
    ok(list.style.display!=='none' && rows.length===2, '确认弹窗列出全部 2 条');
    ok(rows.every(r=>['al-time','al-cat','al-remark','al-amt'].every(c=>r.querySelector('.'+c))), '每行固定四列');
    ok(rows[0].querySelector('.al-time').textContent==='10-04 16:30', '时间列格式 MM-DD HH:mm');
    ok(rows.map(r=>r.querySelector('.al-amt').textContent).sort().join(',')==='+4500.00,−3999.00', '金额带正负号与两位小数');
    ok(t.$('askMsg').textContent==='将以下 2 条记录改为「只算结余」：', '标题句不再拼样例文字');
    t.$('askOk').click();
    ok(t.recs().filter(r=>r.flow===true).map(r=>r.id).sort().join()==='lpi,lpo', '批量标为只算结余');
    ok(t.$('askList').style.display==='none', '完成弹窗不带清单');
    t.$('askExtra').click();
    ok(t.recs().every(r=>!('flow' in r) && !('skip' in r)), '撤销后全部恢复计入');

    // 多条：滑动框
    const many=[]; for(let i=0;i<30;i++) many.push(R('m'+i,`2026-09-${String(1+i%28).padStart(2,'0')}T12:00`,10+i,'expense','餐饮','东方树叶'));
    const t2=await boot(many);
    t2.filterKw('东方树叶');
    t2.$('batchBar').querySelector('[data-act="batch"]').click(); t2.choose('改分类'); t2.choose('购物');
    ok(t2.$('askList').querySelectorAll('.al-row').length===30, '30 条全部列出');
    const css=t2.w.getComputedStyle(t2.$('askList'));
    ok(css.overflowY==='auto' && css.maxHeight==='50vh', '清单限高可滑动');
    t2.$('askCancel').click();
    ok(t2.$('askList').style.display==='none' && t2.$('askList').children.length===0, '取消后清单清空隐藏');

    // XSS：备注里的 HTML 只当文字
    const t3=await boot(oct());
    t3.filterKw('img');
    t3.$('batchBar').querySelector('[data-act="batch"]').click(); t3.choose('标为不计入');
    const rk=t3.$('askList').querySelector('.al-remark');
    ok(rk.textContent.includes('<img') && !t3.$('askList').querySelector('img') && !t3.w.__pwn, '备注中的 HTML 不会被执行');
    ok(t.errs.length+t2.errs.length+t3.errs.length===0, '无脚本错误');
}

// ===== 5. 导入保留 flow =====
{
    const t=await boot(oct());
    t.w.importArchiveFromText(JSON.stringify({ user:'小明', archive:'导入', cats:['存款'],
        data:[ R('a','2026-07-01T00:00',100,'income','存款','期初',{flow:true}),
               R('b','2026-07-01T00:00',1,'income','存款','两个都有',{flow:true, skip:true}) ] }), t.w.localStorage.getItem('app_logged_in_user'));
    const arc=JSON.parse(t.w.ledgerGet(t.w.storeKey())).archives['导入'].records;
    ok(arc[0].flow===true && !('skip' in arc[0]), '导入保留 flow');
    ok(arc[1].skip===true && !('flow' in arc[1]), '两者都有时 skip 优先，只留一个');
}

console.log(`\n1010-C 专项：${pass} 通过，${fail} 失败`); process.exit(fail?1:0);
})();
