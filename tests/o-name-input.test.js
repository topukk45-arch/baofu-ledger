// 1013-C 专项：名字输入。node o-name-input.test.js <html>
// 覆盖：撞上「已移走」账号名字时的提示；名字类输入框按实际字数限长（emoji 不再被算成 2 个字）。
const fs=require('fs'); const {JSDOM}=require('jsdom');
const html=fs.readFileSync(process.argv[2]||require('path').join(__dirname,'..','www','index.html'),'utf8');
let pass=0, fail=0; const ok=(c,n)=>{ if(c) pass++; else { fail++; console.log('  ✗ '+n); } };
const NOW='2026-10-10T14:00:00';

function boot(){
  const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/',beforeParse(w){
    w.scrollTo=()=>{}; w.HTMLElement.prototype.scrollIntoView=function(){};
    w.Date=class extends Date{constructor(...x){x.length?super(...x):super(NOW);}static now(){return new Date(NOW).getTime();}};}});
  const errs=[]; dom.window.addEventListener('error',e=>errs.push(e.message));
  const w=dom.window, d=w.document, $=id=>d.getElementById(id), ls=w.localStorage;
  const accts=()=>JSON.parse(ls.getItem('accounts')||'[]');
  const chip=n=>[...$('recentUsers').querySelectorAll('.user-chip')].find(c=>c.querySelector('span').textContent===n);
  const inMain=()=>$('mainBox').style.display==='block';
  const open=()=>$('askMask').style.display!=='none';
  const err=()=>$('askErr').style.display!=='none' ? $('askErr').textContent : '';
  const prompt=v=>{ $('askInput').value=v; $('askOk').click(); };
  const maxlen=()=>+$('askInput').getAttribute('maxlength');
  // 输入框自带的上限按 UTF-16 编码单位数；这里按真机的规则判断「能不能打进去」
  const fits=v=>v.length<=maxlen();
  return {w,d,$,ls,errs,accts,chip,inMain,open,err,prompt,maxlen,fits};
}
const EMOJI8='😀😁😂🤣😃😄😅😆', EMOJI9=EMOJI8+'😉';

// ===== 1. 新建账号撞上已移走的账号 =====
{
  const t=boot();
  t.$('newAccountBtn').click(); t.prompt('小红');
  t.$('logoutBtn').click();
  t.chip('小红').querySelector('.u-del').click(); t.$('askOk').click();
  ok(!t.chip('小红'), '1 小红移走了');
  t.$('newAccountBtn').click(); t.prompt('小红');
  ok(t.open() && t.err().includes('已移走的账号') && t.err().includes('找回'), '1 提示名字在「已移走的账号」里，可以找回');
  t.prompt('小刚');
  ok(t.inMain(), '1 换个名字就能建');
  // 没移走的同名账号：照旧的提示
  t.$('logoutBtn').click();
  t.$('newAccountBtn').click(); t.prompt('小刚');
  ok(t.err().includes('已经有叫这个名字的账号') && !t.err().includes('已移走'), '1 撞上列表里看得见的账号，提示照旧');
  t.$('askCancel').click();
  // 改名撞上已移走的账号
  t.chip('小刚').click();
  t.$('editNameBtn').click(); t.prompt('小红');
  ok(t.err().includes('已移走的账号'), '1 改名撞上已移走的账号，同样提示');
  t.$('askCancel').click();
  ok(!t.errs.length, '1 无报错 '+t.errs.join('|'));
}

// ===== 2. emoji 名字：8 个能打进去也能建，9 个被拦 =====
{
  const t=boot();
  t.$('newAccountBtn').click();
  ok(t.fits(EMOJI8), '2 新建账号的输入框装得下 8 个 emoji（上限 '+t.maxlen()+'）');
  t.prompt(EMOJI9);
  ok(t.err().includes('8'), '2 9 个 emoji 提示最多 8 个字');
  t.prompt(EMOJI8);
  ok(t.inMain() && t.accts()[0].name===EMOJI8, '2 8 个 emoji 的账号建好了');
  // 中文照旧：超过 8 个字点确定会提示（输入框不再在第 8 个字处卡住）
  t.$('editNameBtn').click();
  ok(t.fits(EMOJI8), '2 改名的输入框也装得下 8 个 emoji');
  t.prompt('一二三四五六七八九');
  ok(t.err().includes('8'), '2 改名超过 8 个字提示');
  t.$('askCancel').click();
}

// ===== 3. 存档名、分类名、日子名称也一样 =====
{
  const t=boot();
  t.$('newAccountBtn').click(); t.prompt('测试');
  t.$('newArchive').click();
  ok(t.fits(EMOJI8+EMOJI8), '3 新建存档的输入框装得下 16 个 emoji');
  t.$('askCancel').click();
  ok(t.$('newCatName').maxLength>=16 && t.$('dayName').maxLength>=16, '3 新分类、日子名称的输入框也放宽了');
  ok(!t.errs.length, '3 无报错 '+t.errs.join('|'));
}

console.log(`${pass} 通过，${fail} 失败`);
process.exit(fail?1:0);
