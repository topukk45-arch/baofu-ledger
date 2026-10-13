// 逐字节回归：用同一份假账单，对比两个版本的页面输出（账单、分类汇总、筛选、统计、当日明细、AI 导出）。
// 用法：node tests/regress.js <旧版 index.html> <新版 index.html>
// 与上一次提交对比：git show HEAD~1:www/index.html > /tmp/old.html && node tests/regress.js /tmp/old.html www/index.html
// 纯重构（不该改变行为）时应「全部一致」；有意的改动只允许预期的那几项不一致。
const fs=require('fs'); const {JSDOM}=require('jsdom'); const IDB=require('./helpers/idb');
// 1013-D 起账本在 IndexedDB、启动是异步的：装上 IndexedDB，等页面准备好再取（老版本没有 ledgerIdle，直接取）
const records=require('./fixtures/sample-records');
const store={archives:{'默认存档':{cats:['未分类','餐饮','购物','出行','其他','红包','工资'],records}},last:'默认存档'};
async function snap(file){
  const dom=new JSDOM(fs.readFileSync(file,'utf8'),{runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/',
    beforeParse(w){IDB.install(w);w.localStorage.setItem('app_logged_in_user','小明');w.localStorage.setItem('store_小明',JSON.stringify(store));
      w.localStorage.setItem('app_time_repaired_小明','1');w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=function(){};
      w.Date=class extends Date{constructor(...a){a.length?super(...a):super('2026-09-15T10:00:00');}static now(){return new Date('2026-09-15T10:00:00').getTime();}};}});
  await IDB.idle(dom.window);
  const d=dom.window.document, $=id=>d.getElementById(id), out={};
  out.overall=$('summaryOverall').innerHTML; out.cats=$('catStats').innerHTML;
  const pages=[]; for(let p=0;p<10;p++){ pages.push($('billList').innerHTML); const nx=[...$('pager').querySelectorAll('button')].pop(); if(!nx||nx.disabled)break; nx.click(); }
  out.pages=pages.join('|');
  // 有命中的筛选
  $('filterFab').click(); $('searchKeyword').value='游戏充值'; $('sheetApply').click();
  out.filter=$('summaryFilter').innerHTML.replace(/<button class="filter-batch"[^>]*>批量<\/button>/,'')+$('billList').innerHTML;
  // 统计页
  d.querySelector('.tab-btn[data-tab="stats"]').click();
  out.stats=$('statCal').innerHTML+$('statMonthIn').textContent+$('statMonthOut').textContent+$('statMonthCatList').innerHTML;
  [...$('statCal').querySelectorAll('.day.has')][5].click(); out.day=$('statFlowList').innerHTML;
  // AI 导出（直接调构建函数）
  out.ai=dom.window.buildAiText(records.filter(r=>r.time.startsWith('2026-09')),'2026年9月','按月');
  return out;
}
(async()=>{
const a=await snap(process.argv[2]), b=await snap(process.argv[3]); let diff=0;
for(const k in a){ const same=a[k]===b[k]; if(!same)diff++; console.log((same?'一致':'不一致')+'  '+k+'  ('+a[k].length+' 字符)'); }
console.log('记录数',records.length, diff? '有差异':'全部一致'); process.exit(diff?1:0);
})();
