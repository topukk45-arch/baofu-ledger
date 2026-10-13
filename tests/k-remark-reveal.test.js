// 1010-K5 专项：点「备注」后，弹窗自动往上滚，露出「添加记录 / 保存」
// node k-remark-reveal.test.js [html]
// jsdom 没有真实排版，这里手工给出各元素的位置（模拟键盘弹起、弹窗只剩半屏的情形）。
const fs=require('fs'); const {JSDOM}=require('jsdom'); const IDB=require('./helpers/idb');
const html=fs.readFileSync(process.argv[2]||require('path').join(__dirname,'..','www','index.html'),'utf8');
let pass=0, fail=0; const ok=(c,n)=>{ if(c) pass++; else { fail++; console.log('  ✗ '+n); } };

let __lastW=null, __phone=null, __lastPhone=null;
async function boot(...a){ const t=bootSync(...a); const __w=__lastW, __p=__lastPhone; t.idle=()=>IDB.idle(__w); t.phone=__p; t.db=async()=>{ await IDB.idle(__w); return IDB.dumpDb(__p); }; await IDB.idle(__w); return t; }
function bootSync(){
  const store={archives:{'默认存档':{cats:['未分类','餐饮','购物','其他'],records:[
    {id:'a',time:'2026-10-05T12:00',money:14,type:'expense',cat:'餐饮',remark:'午饭'}]}},last:'默认存档'};
  const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/',beforeParse(w){ __lastW=w; __lastPhone=IDB.install(w, __phone);
    const ls=w.localStorage; ls.setItem('app_logged_in_user','小明'); ls.setItem('store_小明',JSON.stringify(store)); ls.setItem('app_time_repaired_小明','1');
    w.scrollTo=()=>{}; w.HTMLElement.prototype.scrollIntoView=function(){};
    w.Date=class extends Date{constructor(...a){a.length?super(...a):super('2026-10-10T10:00:00');}};}});
  const errs=[]; dom.window.addEventListener('error',e=>errs.push(e.message));
  const d=dom.window.document,$=id=>d.getElementById(id);
  return {w:dom.window,d,$,errs};
}
// 给元素一个假位置；弹窗的 scrollTop 改动会让里面的元素整体上移
function fakeLayout(dlg, items){
  let st=0;
  Object.defineProperty(dlg,'scrollTop',{get:()=>st,set:v=>{st=v;},configurable:true});
  dlg.getBoundingClientRect=()=>({top:items.dlg[0],bottom:items.dlg[1]});
  for(const [el,[top,bottom]] of items.inner) el.getBoundingClientRect=()=>({top:top-st,bottom:bottom-st});
  return ()=>st;
}
const wait=ms=>new Promise(r=>setTimeout(r,ms));

(async()=>{
  // ===== 1. 记一笔：按钮在下沿外 → 聚焦备注后自动滚上来 =====
  {
    const t=await boot();
    t.$('fabAdd').click();
    const dlg=t.$('addMask').querySelector('.edit-dialog');
    // 弹窗可视区 60~620（键盘顶上来后只剩这么高）；备注 540~610，添加记录 630~680
    const getSt=fakeLayout(dlg,{dlg:[60,620],inner:[[t.$('billRemark'),[540,610]],[t.$('addBill'),[630,680]]]});
    t.$('billRemark').focus();
    await wait(450);
    ok(getSt()===72, '滚动量刚好让「添加记录」露出（680+12-620=72）：'+getSt());
    const b=t.$('addBill').getBoundingClientRect(), r=t.$('billRemark').getBoundingClientRect();
    ok(b.bottom<=620, '「添加记录」在可视区内');
    ok(r.top>=60, '备注框没被滚出顶部');
    ok(t.errs.length===0, '无脚本错误 '+t.errs.join(';'));
  }

  // ===== 2. 按钮本来就看得见 → 不乱动 =====
  {
    const t=await boot();
    t.$('fabAdd').click();
    const dlg=t.$('addMask').querySelector('.edit-dialog');
    const getSt=fakeLayout(dlg,{dlg:[60,900],inner:[[t.$('billRemark'),[540,610]],[t.$('addBill'),[630,680]]]});
    t.$('billRemark').focus();
    await wait(450);
    ok(getSt()===0, '键盘没弹 / 屏幕够高时不滚动');
  }

  // ===== 3. 屏幕特别矮 → 宁可按钮露一半，也不把备注框滚没 =====
  {
    const t=await boot();
    t.$('fabAdd').click();
    const dlg=t.$('addMask').querySelector('.edit-dialog');
    // 需要滚 240+12-200=52，但备注框顶部离弹窗顶只有 100-60-8=32 的余量
    const getSt=fakeLayout(dlg,{dlg:[60,200],inner:[[t.$('billRemark'),[100,170]],[t.$('addBill'),[190,240]]]});
    t.$('billRemark').focus();
    await wait(450);
    ok(getSt()===32, '滚动量被备注框顶部卡住，只滚 32：'+getSt());
    ok(t.$('billRemark').getBoundingClientRect().top>=60, '备注框仍在可视区');
  }

  // ===== 4. 修改账单：同样露出「保存」 =====
  {
    const t=await boot();
    t.d.querySelector('#billList [data-act="edit"]').click();
    ok(t.$('editMask').style.display!=='none' && t.$('editMask').style.display!=='', '打开了修改弹窗');
    const dlg=t.$('editMask').querySelector('.edit-dialog');
    const getSt=fakeLayout(dlg,{dlg:[60,620],inner:[[t.$('editRemark'),[530,600]],[t.$('saveEdit'),[625,665]]]});
    t.$('editRemark').focus();
    await wait(450);
    ok(getSt()===57, '修改弹窗滚到「保存」可见（665+12-620=57）：'+getSt());
  }

  // ===== 5. 聚焦金额等其它输入框 → 不触发 =====
  {
    const t=await boot();
    t.$('fabAdd').click();
    const dlg=t.$('addMask').querySelector('.edit-dialog');
    const getSt=fakeLayout(dlg,{dlg:[60,620],inner:[[t.$('billRemark'),[540,610]],[t.$('addBill'),[630,680]]]});
    t.$('billMoney').focus();
    await wait(450);
    ok(getSt()===0, '聚焦金额不滚动');
  }

  console.log(`${pass} 通过，${fail} 失败`);
  process.exit(fail?1:0);
})();
