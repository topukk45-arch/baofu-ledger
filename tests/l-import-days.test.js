// 1010-K6 专项：导入存档时的倒数日。node l-import-days.test.js <html>
// 文件里的账号和要导进的账号一样 → 自动合并；不一样 → 问一句，点头才导。
const fs=require('fs'); const {JSDOM}=require('jsdom');
const html=fs.readFileSync(process.argv[2]||require('path').join(__dirname,'..','www','index.html'),'utf8');
let pass=0, fail=0; const ok=(c,n)=>{ if(c) pass++; else { fail++; console.log('  ✗ '+n); } };
const NOW='2026-10-10T14:00:00';

// 虚构的导出文件：账号「小红」，两条账单、三个日子
const DAYS=[
  { id:'d1', name:'元旦', date:'2027-01-01', pin:true },
  { id:'d2', name:'春节回家', date:'2027-02-06', pin:false },
  { id:'d3', name:'驾照考试', date:'2026-11-20', pin:false },
];
function fileText(user, days){
  const f={ app:'记问', archive:'旧手机', cats:['未分类','餐饮'], budgets:{}, tpls:[],
    data:[ {id:'a',time:'2026-10-01T12:00',money:20,type:'expense',cat:'餐饮',remark:'午饭'},
           {id:'b',time:'2026-10-02T12:00',money:18,type:'expense',cat:'餐饮',remark:'午饭'} ] };
  if(user!==undefined) f.user=user;
  if(days!==undefined) f.days=days;
  return JSON.stringify(f);
}

// loggedIn：已登录的账号（走「设置 → 导入存档」）；不传则停在登录页
function boot(loggedIn, existingDays){
  const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/',beforeParse(w){
    const ls=w.localStorage;
    if(loggedIn){
      ls.setItem('app_logged_in_user',loggedIn);
      ls.setItem('store_'+loggedIn,JSON.stringify({archives:{'默认存档':{records:[],cats:['未分类','餐饮']}},last:'默认存档'}));
      ls.setItem('app_time_repaired_'+loggedIn,'1');
    }
    if(existingDays) ls.setItem('days_'+(loggedIn||'小红'),JSON.stringify(existingDays));
    w.scrollTo=()=>{}; w.HTMLElement.prototype.scrollIntoView=function(){};
    w.Date=class extends Date{constructor(...x){x.length?super(...x):super(NOW);}static now(){return new Date(NOW).getTime();}};}});
  const errs=[]; dom.window.addEventListener('error',e=>errs.push(e.message));
  const w=dom.window, d=w.document, $=id=>d.getElementById(id);
  const open=()=>$('askMask').style.display==='flex';
  const msg=()=>$('askMsg').textContent;
  const title=()=>$('askTitle').textContent;
  // 1010-K7：数据按账号编号存。按名字找到编号再读
  const idOf=u=>{ const a=JSON.parse(w.localStorage.getItem('accounts')||'[]').find(x=>x.name===u); return a?a.id:null; };
  const days=u=>JSON.parse(w.localStorage.getItem('days_'+idOf(u))||'[]');
  const choose=label=>[...$('askChoices').querySelectorAll('.cc')].find(e=>e.textContent.startsWith(label)).click();
  // 模拟选文件：FileReader 是异步的，等它读完
  const pick=async(inputId, text)=>{
    const input=$(inputId);
    const file=new w.File([text],'备份.json',{type:'application/json'});
    Object.defineProperty(input,'files',{value:[file],configurable:true});
    input.dispatchEvent(new w.Event('change'));
    for(let i=0;i<50 && !open();i++) await new Promise(r=>setTimeout(r,10));
  };
  return {w,d,$,errs,open,msg,title,days,pick,idOf,choose};
}

(async()=>{
// ===== 1. 设置页导入，账号一样：自动合并，不问 =====
{
  const t=boot('小红');
  await t.pick('importFile', fileText('小红', DAYS));
  ok(t.title()==='导入成功', '1 直接弹导入成功，不问日子');
  ok(t.msg().includes('同时导入了 3 个日子'), '1 提示带上 3 个日子');
  ok(t.days('小红').length===3, '1 日子已存进账号');
  ok(!t.errs.length, '1 无报错 '+t.errs.join('|'));
}

// ===== 2. 设置页导入，账号不一样：先问，点「一起导入」=====
{
  const t=boot('小明');
  await t.pick('importFile', fileText('小红', DAYS));
  ok(t.title()==='一起导入日子？', '2 先问要不要导日子');
  ok(t.msg().includes('3 个日子') && t.msg().includes('账号「小红」') && t.msg().includes('「小明」'), '2 问句写清条数和两个账号');
  ok(t.$('askOk').textContent==='一起导入' && t.$('askCancel').textContent==='不用了', '2 按钮文字');
  ok(t.days('小明').length===0, '2 点之前还没导');
  t.$('askOk').click();
  ok(t.days('小明').length===3, '2 点了一起导入：3 个日子进来了');
  ok(t.title()==='导入成功' && t.msg().includes('同时导入了 3 个日子'), '2 最后的提示带上日子');
  ok(t.$('daysEntryRows').textContent.includes('元旦'), '2 记账页日子卡片已刷新');
  ok(!t.errs.length, '2 无报错 '+t.errs.join('|'));
}

// ===== 3. 账号不一样，点「不用了」=====
{
  const t=boot('小明');
  await t.pick('importFile', fileText('小红', DAYS));
  t.$('askCancel').click();
  ok(t.days('小明').length===0, '3 不用了：日子没导');
  ok(t.open() && t.title()==='导入成功', '3 仍然弹出导入成功');
  ok(!t.msg().includes('日子'), '3 提示里不提日子');
  const st=JSON.parse(t.w.localStorage.getItem(t.w.storeKey()));
  ok(st.archives['旧手机'] && st.archives['旧手机'].records.length===2, '3 账单照常导入');
}

// ===== 4. 目标账号已有其中一个：只问剩下的 2 个 =====
{
  const t=boot('小明', [{ id:'x', name:'元旦', date:'2027-01-01', pin:false }]);
  await t.pick('importFile', fileText('小红', DAYS));
  ok(t.msg().includes('2 个日子'), '4 重复的不算，问 2 个');
  t.$('askOk').click();
  ok(t.days('小明').length===3, '4 合并后共 3 个，不重复');
  ok(t.msg().includes('同时导入了 2 个日子'), '4 提示 2 个');
}

// ===== 5. 全都已经有了：不问 =====
{
  const t=boot('小明', DAYS.map(x=>Object.assign({},x)));
  await t.pick('importFile', fileText('小红', DAYS));
  ok(t.title()==='导入成功', '5 全重复：直接导入成功，不问');
  ok(!t.msg().includes('日子'), '5 提示里不提日子');
}

// ===== 6. 文件里没有日子 / 旧文件没有账号名：都不问 =====
{
  const t=boot('小明');
  await t.pick('importFile', fileText('小红', []));
  ok(t.title()==='导入成功', '6a 没有日子：不问');
  const t2=boot('小明');
  await t2.pick('importFile', fileText(undefined, DAYS));
  ok(t2.title()==='导入成功' && t2.days('小明').length===0, '6b 旧文件没有账号名：不问也不导');
}

// ===== 7. 登录页、手机上还没有账号：直接新建，名字默认用备份里的；起了别的名字 → 先问日子，再问进不进 =====
{
  const t=boot();
  await t.pick('loginImportFile', fileText('测试', DAYS));
  ok(t.title()==='新建账号' && t.$('askInput').value==='测试', '7 没有账号时直接新建，名字默认是备份里的');
  t.$('askInput').value='小刚'; t.$('askOk').click();
  ok(t.title()==='一起导入日子？' && t.msg().includes('「小刚」') && t.msg().includes('账号「测试」'), '7 再问日子');
  t.$('askOk').click();
  ok(t.days('小刚').length===3, '7 日子进了小刚');
  ok(t.title()==='导入成功' && t.msg().includes('同时导入了 3 个日子') && t.msg().includes('现在进入该账号吗'), '7 最后问进不进账号，带上日子');
  t.$('askOk').click();
  ok(t.$('mainBox').style.display==='block', '7 进入账号');
  ok(t.$('daysEntryRows').textContent.includes('春节回家'), '7 进去就能看到日子');
  ok(!t.errs.length, '7 无报错 '+t.errs.join('|'));
}

// ===== 8. 登录页，点「不用了」后照样问进不进账号 =====
{
  const t=boot();
  await t.pick('loginImportFile', fileText('测试', DAYS));
  t.$('askInput').value='小刚'; t.$('askOk').click();
  t.$('askCancel').click();
  ok(t.open() && t.title()==='导入成功' && t.msg().includes('现在进入该账号吗'), '8 不用了之后仍问进不进账号');
  ok(!t.msg().includes('日子') && t.days('小刚').length===0, '8 日子没导，也不提');
}

// ===== 9. 旧备份（没有账号编号），新账号名字和备份里一样：当作自己的，日子自动带上 =====
{
  const t=boot();
  await t.pick('loginImportFile', fileText('测试', DAYS));
  t.$('askOk').click();   // 默认名字「测试」
  ok(t.title()==='导入成功' && t.msg().includes('同时导入了 3 个日子'), '9 自导自：不问，自动带上');
}

// ===== 10. 新版备份带账号编号：新建账号沿用这个编号，就算起了别的名字也是同一个账号 =====
{
  const t=boot();
  const f=JSON.parse(fileText('测试', DAYS)); f.accountId='u1790000000000123456';
  await t.pick('loginImportFile', JSON.stringify(f));
  t.$('askInput').value='新手机上的我'; t.$('askOk').click();
  ok(t.idOf('新手机上的我')==='u1790000000000123456', '10 新账号沿用备份里的编号');
  ok(t.title()==='导入成功' && t.msg().includes('同时导入了 3 个日子'), '10 编号一样：日子自动带上，不问');
}

// ===== 11. 已有账号：从列表里选导到哪个；编号一样的那个会标出来 =====
{
  const t=boot('小明');
  t.$('logoutBtn').click();
  const id=t.idOf('小明');
  const f=JSON.parse(fileText('小明换过名', DAYS)); f.accountId=id;
  await t.pick('loginImportFile', JSON.stringify(f));
  ok(t.title()==='导入到账号', '11 先选导到哪个账号');
  const items=[...t.$('askChoices').querySelectorAll('.cc')].map(e=>e.textContent);
  ok(items.some(x=>x.startsWith('小明') && x.includes('原来就是这个账号')) && items.some(x=>x.includes('新建账号')), '11 列出已有账号，标出原账号，可新建');
  t.choose('小明'); t.$('askOk').click();
  ok(t.title()==='导入成功' && t.days('小明').length===3, '11 编号一样：名字不同也自动带上日子');
}

// ===== 12. 编号不一样、名字碰巧一样（两台手机各自建的「小明」）：要问 =====
{
  const t=boot('小明');
  t.$('logoutBtn').click();
  const f=JSON.parse(fileText('小明', DAYS)); f.accountId='u1790000000000999999';
  await t.pick('loginImportFile', JSON.stringify(f));
  t.choose('小明'); t.$('askOk').click();
  ok(t.title()==='一起导入日子？', '12 编号不同就算重名也要问');
}

console.log(`\n${pass} 通过，${fail} 失败`);
process.exit(fail?1:0);
})();
