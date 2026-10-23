// 逐字节回归：用同一份假账单，对比两个版本的页面输出（账单、分类汇总、筛选、统计、当日明细、AI 导出），
// 以及导出的备份文件、云备份内容、用 App 里的数据做的 AI 导出（1013-G 起账本分块存，这三样必须和以前逐字节一样）。
// 用法：node tests/regress.js <旧版 index.html> <新版 index.html>
// 与上一次提交对比：git show HEAD~1:www/index.html > /tmp/old.html && node tests/regress.js /tmp/old.html www/index.html
// 纯重构（不该改变行为）时应「全部一致」；有意的改动只允许预期的那几项不一致。
const fs=require('fs'); const {JSDOM}=require('jsdom'); const IDB=require('./helpers/idb');
require('./tools/inline').installReadHook();   // modules 分支：拆开的 index.html 拼回单文件再比
// 1013-D 起账本在 IndexedDB、启动是异步的：装上 IndexedDB，等页面准备好再取（老版本没有 ledgerIdle，直接取）
const records=require('./fixtures/sample-records');
const store={archives:{'默认存档':{cats:['未分类','餐饮','购物','出行','其他','红包','工资'],records}},last:'默认存档'};
async function snap(file){
  const dom=new JSDOM(fs.readFileSync(file,'utf8'),{runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/',
    beforeParse(w){IDB.install(w);w.localStorage.setItem('app_logged_in_user','小明');w.localStorage.setItem('store_小明',JSON.stringify(store));
      w.localStorage.setItem('app_time_repaired_小明','1');w.scrollTo=()=>{};
      w.__files=[]; w.Capacitor={ isNativePlatform:()=>true, Plugins:{ Filesystem:{ writeFile:async o=>{ w.__files.push(o.data); return {}; } } } };w.HTMLElement.prototype.scrollIntoView=function(){};
      w.Date=class extends Date{constructor(...a){a.length?super(...a):super('2026-09-15T10:00:00');}static now(){return new Date('2026-09-15T10:00:00').getTime();}};}});
  await IDB.idle(dom.window);
  const d=dom.window.document, $=id=>d.getElementById(id), out={};
  // 备份文件、云备份内容、AI 导出：都从 App 里的账本取
  $('exportBtn').click(); for(let i=0;i<20 && !dom.window.__files.length;i++) await new Promise(r=>setTimeout(r,5));
  // 账号编号是新建时随机生成的，两次跑本来就不一样，比之前换成同一个占位
  const noId=x=>x.replace(/"accountId": ?"u\d+"/g, '"accountId":"<编号>"');
  out.backup=noId(dom.window.__files[0]||'');
  out.cloud=noId(JSON.stringify((dom.window.JiwenStore||dom.window).odBuildPayload()));
  out.aiApp=(dom.window.JiwenAiExport || dom.window).buildAiText((dom.window.JiwenStore||dom.window).getUserData().filter(r=>r.time.startsWith('2026-08')),'2026年8月','按月');
  const L=dom.window.JiwenLedger;
  if($('summaryOverall')) out.overall=$('summaryOverall').innerHTML;   // 1023-C 起没有大总览：这个月收支在细条里、总结余在统计页
  else { dom.window.JiwenStats.renderStats(); out.overall=$('billHead').innerHTML+$('statBal').innerHTML; }
  out.cats=$('catStats').innerHTML;   // 1023-A 起分类汇总在统计页，下面切到统计页再读一次
  const pages=[];
  if($('pager') || $('pagerBottom')){ for(let p=0;p<10;p++){ pages.push($('billList').innerHTML); const nx=[...($('pager') || $('pagerBottom')).querySelectorAll('button')].pop(); if(!nx||nx.disabled)break; nx.click(); } }
  else { [...d.querySelectorAll('#lgStrip .ms-item')].map(b=>b.dataset.ym).forEach(ym=>{ L.setYM(ym); L.listFlush(); pages.push($('billList').innerHTML); }); L.setYM(null); }   // 1023-C：按月显示，每个月读一遍
  out.pages=pages.join('|');
  // 有命中的筛选
  $('filterFab').click(); $('searchKeyword').value='游戏充值'; $('sheetApply').click();
  out.filter=$('summaryFilter').innerHTML.replace(/<button class="filter-batch"[^>]*>批量<\/button>/,'')+$('billList').innerHTML;
  // 统计页
  d.querySelector('.tab-btn[data-tab="stats"]').click();
  if(!out.cats) out.cats=$('catStats').innerHTML;
  out.stats=$('statCal').innerHTML+$('statMonthIn').textContent+$('statMonthOut').textContent+$('statMonthCatList').innerHTML;
  [...$('statCal').querySelectorAll('.day.has')][5].click(); out.day=$('statFlowList').innerHTML;
  // AI 导出（直接调构建函数）
  out.ai=(dom.window.JiwenAiExport || dom.window).buildAiText(records.filter(r=>r.time.startsWith('2026-09')),'2026年9月','按月');
  return out;
}
(async()=>{
const a=await snap(process.argv[2]), b=await snap(process.argv[3]); let diff=0;
for(const k in a){ const same=a[k]===b[k]; if(!same)diff++; console.log((same?'一致':'不一致')+'  '+k+'  ('+a[k].length+' 字符)'); }
console.log('记录数',records.length, diff? '有差异':'全部一致'); process.exit(diff?1:0);
})();
