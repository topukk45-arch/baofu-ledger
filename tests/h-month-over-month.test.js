// 1010-H 专项：分类占比「较上月」。node test10.js <html>
const fs=require('fs'); const {JSDOM}=require('jsdom'); const IDB=require('./helpers/idb');
const html=fs.readFileSync(process.argv[2]||require('path').join(__dirname,'..','www','index.html'),'utf8');
let pass=0, fail=0; const ok=(c,n)=>{ if(c) pass++; else { fail++; console.log('  ✗ '+n); } };
const R=(id,time,money,type,cat,remark,extra)=>Object.assign({id,time,money,type,cat,remark:remark||''},extra||{});
let __lastW=null, __phone=null, __lastPhone=null;
async function boot(...a){ const t=bootSync(...a); const __w=__lastW, __p=__lastPhone; t.idle=()=>IDB.idle(__w); t.phone=__p; t.db=async()=>{ await IDB.idle(__w); return IDB.dumpDb(__p); }; await IDB.idle(__w); t.d.querySelector('.tab-btn[data-tab="stats"]').click(); return t; }
function bootSync(records, now){
  now=now||'2026-10-31T14:00:00';   // 1023-O：这个月没过完时比「上月同期」，这里放在月底，比的是整个上月（同期那套在 zZzZzG 里测）
  const store={archives:{'默认存档':{cats:['未分类','餐饮','游戏','订阅','出行','其他','工资','a','b','c','d','e','f','g','h'],records}},last:'默认存档'};
  const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/',beforeParse(w){ __lastW=w; __lastPhone=IDB.install(w, __phone);
    const ls=w.localStorage; ls.setItem('app_logged_in_user','小明'); ls.setItem('store_小明',JSON.stringify(store)); ls.setItem('app_time_repaired_小明','1');
    w.scrollTo=()=>{}; w.HTMLElement.prototype.scrollIntoView=function(){};
    w.Date=class extends Date{constructor(...a){a.length?super(...a):super(now);}static now(){return new Date(now).getTime();}};}});
  const errs=[]; dom.window.addEventListener('error',e=>errs.push(e.message));
  const d=dom.window.document,$=id=>d.getElementById(id);
  const items=()=>[...$('statMonthCatList').querySelectorAll('.sc-item')].map(it=>{
    const dl=it.querySelector('.sc-delta');
    return { name:it.querySelector('.sc-cat-name').textContent, delta:dl?dl.textContent:'', cls:dl?dl.className:'', amt:it.querySelector('.sc-amt').textContent };
  });
  const find=(n)=>items().find(i=>i.name===n);
  return {w:dom.window,d,$,errs,items,find};
}

(async()=>{
// ===== 1. 支出：涨/跌/持平/上月无，颜色正确 =====
{
  const t=await boot([
    R('a1','2026-10-02T10:00',120,'expense','游戏'), R('a0','2026-09-02T10:00',100,'expense','游戏'),   // +20%
    R('b1','2026-10-02T10:00',50,'expense','餐饮'),  R('b0','2026-09-05T10:00',200,'expense','餐饮'),   // -75%
    R('c1','2026-10-02T10:00',157,'expense','订阅'), R('c0','2026-09-08T10:00',157,'expense','订阅'),   // 持平
    R('d1','2026-10-03T10:00',483,'expense','出行'),                                                     // 上月无
    R('e0','2026-08-03T10:00',999,'expense','出行'),                                                     // 8 月的不算进 9 月
  ]);
  const g=t.find('游戏'), f=t.find('餐饮'), s=t.find('订阅'), x=t.find('出行');
  ok(g.delta==='较上月 ↑20%' && g.cls.includes('bad'), '支出涨 → 红：'+g.delta+' '+g.cls);
  ok(f.delta==='较上月 ↓75%' && f.cls.includes('good'), '支出降 → 绿：'+f.delta);
  ok(s.delta==='与上月持平' && !s.cls.includes('bad') && !s.cls.includes('good'), '持平：灰');
  ok(x.delta==='上月无', '上月没有 → 上月无（不拿 8 月比）：'+x.delta);
  ok(g.amt==='−120.00' || g.amt.endsWith('120.00'), '金额照旧：'+g.amt);
  ok(t.errs.length===0, '无脚本错误 '+t.errs.join(';'));
}

// ===== 2. 上月只按「计入」口径：上月的不计入/只算结余不参与对比 =====
{
  const t=await boot([
    R('a1','2026-10-02T10:00',100,'expense','游戏'),
    R('a0','2026-09-02T10:00',50,'expense','游戏'),
    R('as','2026-09-03T10:00',500,'expense','游戏','送人',{skip:true}),
    R('af','2026-09-04T10:00',500,'expense','游戏','往来',{flow:true}),
    R('ai','2026-09-04T10:00',500,'income','游戏','收入类不混入'),
  ]);
  ok(t.find('游戏').delta==='较上月 ↑100%', '上月只算计入的 50：'+t.find('游戏').delta);
}

// ===== 3. 跨年：1 月和去年 12 月比 =====
{
  const t=await boot([ R('j','2027-01-05T10:00',90,'expense','餐饮'), R('dz','2026-12-20T10:00',100,'expense','餐饮'),
                 R('old','2026-01-20T10:00',10,'expense','餐饮') ], '2027-01-31T10:00:00');
  ok(t.find('餐饮').delta==='较上月 ↓10%', '1 月对比去年 12 月：'+t.find('餐饮').delta);
}

// ===== 4. 收入口径：颜色反过来 =====
{
  const t=await boot([ R('w1','2026-10-10T10:00',6000,'income','工资'), R('w0','2026-09-10T10:00',5000,'income','工资'),
                 R('o1','2026-10-10T10:00',50,'income','其他'),   R('o0','2026-09-10T10:00',100,'income','其他') ]);
  t.$('statMonthCatSeg').querySelector('[data-v="income"]').click();
  const w=t.find('工资'), o=t.find('其他');
  ok(w.delta==='较上月 ↑20%' && w.cls.includes('good'), '收入涨 → 绿：'+w.delta+' '+w.cls);
  ok(o.delta==='较上月 ↓50%' && o.cls.includes('bad'), '收入降 → 红');
}

// ===== 5. 超过 6 类：合并项名字不与「其他」分类撞名，且合并项也有对比 =====
{
  const cats=['餐饮','游戏','订阅','出行','其他','a','b','c'];
  const rs=[];
  cats.forEach((c,i)=>{ rs.push(R('n'+i,'2026-10-02T10:00',100-i,'expense',c)); });
  rs.push(R('p6','2026-09-02T10:00',10,'expense','b'), R('p7','2026-09-02T10:00',10,'expense','c'));  // 合并的两类上月共 20
  const t=await boot(rs);
  const names=t.items().map(i=>i.name);
  ok(names.length===7 && names.includes('其他') && names[6]==='其余 2 类', '前 6 + 其余 2 类：'+names.join(','));
  // 合并项本月 = (100-6)+(100-7)=187，上月 20 → ↑835%
  ok(t.find('其余 2 类').delta==='较上月 ↑835%', '合并项也算对比：'+t.find('其余 2 类').delta);
  ok(t.$('statMonthPie').innerHTML.length>0, '饼图照常画');
}

// ===== 6. 切到上个月看：用再上一个月比 =====
{
  const t=await boot([ R('a','2026-10-02T10:00',1,'expense','餐饮'), R('b','2026-09-02T10:00',30,'expense','餐饮'), R('c','2026-08-02T10:00',60,'expense','餐饮') ]);
  t.w.JiwenStats.stepMonth(-1);   // 1023-H 起用月份浮条切
  ok(t.find('餐饮').delta==='较上月 ↓50%', '9 月对比 8 月：'+t.find('餐饮').delta);
}

console.log(`\n1010-H 环比专项：${pass} 通过，${fail} 失败`); process.exit(fail?1:0);
})();
