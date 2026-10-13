// 1010-I 专项：常用模板 + 预算总览「预算外 / 今年至今」。node test11.js <html>
const fs=require('fs'); const {JSDOM}=require('jsdom'); const IDB=require('./helpers/idb');
const html=fs.readFileSync(process.argv[2]||require('path').join(__dirname,'..','www','index.html'),'utf8');
let pass=0, fail=0; const ok=(c,n)=>{ if(c) pass++; else { fail++; console.log('  ✗ '+n); } };
const R=(id,time,money,type,cat,remark,extra)=>Object.assign({id,time,money,type,cat,remark:remark||''},extra||{});
const NOW='2026-10-10T14:00:00';
let __lastW=null, __phone=null, __lastPhone=null;
async function boot(...a){ const t=bootSync(...a); const __w=__lastW, __p=__lastPhone; t.idle=()=>IDB.idle(__w); t.phone=__p; t.db=async()=>{ await IDB.idle(__w); return IDB.dumpDb(__p); }; await IDB.idle(__w); return t; }
function bootSync(arc, extraArchives){
  const a=Object.assign({ cats:['未分类','餐饮','游戏','订阅','出行','其他','转账'], records:[] }, arc||{});
  const store={archives:Object.assign({'默认存档':a}, extraArchives||{}),last:'默认存档'};
  const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/',beforeParse(w){ __lastW=w; __lastPhone=IDB.install(w, __phone);
    const ls=w.localStorage; ls.setItem('app_logged_in_user','小明'); ls.setItem('store_小明',JSON.stringify(store)); ls.setItem('app_time_repaired_小明','1');
    w.scrollTo=()=>{}; w.HTMLElement.prototype.scrollIntoView=function(){};
    w.Date=class extends Date{constructor(...x){x.length?super(...x):super(NOW);}static now(){return new Date(NOW).getTime();}};}});
  const errs=[]; dom.window.addEventListener('error',e=>errs.push(e.message));
  const d=dom.window.document,$=id=>d.getElementById(id);
  const st=()=>JSON.parse(dom.window.ledgerGet(dom.window.storeKey()));
  const arcOf=()=>st().archives['默认存档'];
  const chipTxt=box=>[...$(box).querySelectorAll('.cc')].map(e=>e.textContent);
  const clickChip=(box,txt)=>[...$(box).querySelectorAll('.cc')].find(e=>e.textContent===txt).click();
  const choose=label=>{ [...$('askChoices').querySelectorAll('.cc')].find(e=>(e.querySelector('.cc-label')||e).textContent.startsWith(label)).click(); $('askOk').click(); };
  const openAdd=()=>$('fabAdd').click();
  return {w:dom.window,d,$,errs,st,arcOf,chipTxt,clickChip,choose,openAdd};
}

(async()=>{
// ===== 1. 没有模板：记一笔里「常用」整行隐藏 =====
{
  const t=await boot();
  t.openAdd();
  ok(t.$('billTplField').style.display==='none', '无模板时隐藏常用行');
}

// ===== 2. 从记一笔存模板：带金额 / 不带金额 =====
{
  const t=await boot();
  t.openAdd();
  t.$('billMoney').value='157'; t.clickChip('billCatChips','订阅'); t.clickChip('billTypeChips','支出'); t.$('billRemark').value='视频会员';
  t.$('billSaveTpl').click();
  ok(t.$('askTitle').textContent==='存为常用', '有金额时问要不要带金额');
  t.choose('带上金额');
  ok(t.$('askMsg').textContent.includes('已存为常用：视频会员 157.00'), '提示已存：'+t.$('askMsg').textContent);
  t.$('askOk').click();
  let tp=t.arcOf().tpls;
  ok(tp.length===1 && tp[0].money===157 && tp[0].cat==='订阅' && tp[0].type==='expense' && tp[0].remark==='视频会员' && tp[0].mode==='normal', '模板内容正确');
  ok(t.$('addMask').style.display==='flex' && t.$('billMoney').value==='157', '存完记一笔表单还在、内容不丢');
  ok(t.$('billTplField').style.display==='' && t.chipTxt('billTplChips').join()==='视频会员157', '胶囊立刻出现：'+t.chipTxt('billTplChips').join());
  // 重复存：拦下
  t.$('billSaveTpl').click(); t.choose('带上金额');
  ok(t.$('askMsg').textContent==='这个已经在常用里了。' && t.arcOf().tpls.length===1, '完全相同的不重复存');
  t.$('askOk').click();
  // 不带金额
  t.$('billMoney').value='13'; t.clickChip('billCatChips','餐饮'); t.$('billRemark').value='中午饭';
  t.$('billSaveTpl').click(); t.choose('不带金额'); t.$('askOk').click();
  tp=t.arcOf().tpls;
  ok(tp.length===2 && tp[1].money===null && tp[1].remark==='中午饭', '不带金额存为 null');
  // 金额空：不问，直接存成不带金额
  t.$('billMoney').value=''; t.$('billRemark').value='打车'; t.clickChip('billCatChips','出行');
  t.$('billSaveTpl').click();
  ok(t.$('askMsg').textContent.startsWith('已存为常用：打车') && t.arcOf().tpls[2].money===null, '金额空直接存');
  t.$('askOk').click();
  ok(t.errs.length===0, '无脚本错误 '+t.errs.join(';'));
}

// ===== 3. 没选分类 / 收支：拦下 =====
{
  const t=await boot();
  t.openAdd(); t.$('billMoney').value='5';
  t.$('billSaveTpl').click();
  ok(t.$('askMsg').textContent.includes('先选好分类和收支') && !t.arcOf().tpls, '缺分类收支不存');
}

// ===== 4. 点模板填表：类型 / 分类 / 口径 / 备注 / 金额，不直接入账；时间不动 =====
{
  const tpls=[
    {id:'a', type:'expense', cat:'订阅', remark:'视频会员', money:157, mode:'normal'},
    {id:'b', type:'expense', cat:'转账', remark:'信用卡还款', money:null, mode:'normal'},   // 转账会自动切不计入，模板口径要优先
    {id:'c', type:'income', cat:'其他', remark:'借出还回', money:500, mode:'flow'},
  ];
  const t=await boot({ tpls });
  t.openAdd();
  ok(t.chipTxt('billTplChips').join('|')==='视频会员157|信用卡还款|借出还回500', '顺序固定，带金额的显示金额');
  const before=t.arcOf().records.length;
  const time0=t.$('billTime').dataset.value || t.$('billTime').textContent;
  // 【1010-I2】常用在金额下面
  const fields=[...t.$('addMask').querySelectorAll('.form-box > .field')].map(f=>f.querySelector('.field-label').textContent);
  ok(fields.slice(0,3).join()==='记账时间,金额,常用', '常用排在金额下面：'+fields.join());
  t.$('billMoney').focus();
  t.clickChip('billTplChips','视频会员157');
  ok(t.$('billMoney').value==='157' && t.$('billRemark').value==='视频会员', '金额与备注已填');
  ok(t.d.activeElement!==t.$('billMoney'), '带金额：收起键盘（金额框失焦）');
  ok(t.$('billCatChips').querySelector('.cc.sel').textContent==='订阅' && t.$('billTypeChips').querySelector('.sel-out'), '分类、支出已选');
  ok(t.$('billMode').dataset.mode==='normal', '口径计入');
  ok(t.arcOf().records.length===before, '只填表，不入账');
  ok((t.$('billTime').dataset.value || t.$('billTime').textContent)===time0, '时间不动');
  t.clickChip('billTplChips','信用卡还款');
  ok(t.$('billMoney').value==='' && t.$('billMode').dataset.mode==='normal', '不带金额 → 金额清空；口径以模板为准（不被转账自动改成不计入）');
  ok(t.d.activeElement===t.$('billMoney'), '不带金额：聚焦金额弹键盘');
  t.clickChip('billTplChips','借出还回500');
  ok(t.$('billTypeChips').querySelector('.sel-in') && t.$('billMode').dataset.mode==='flow', '收入 + 只算结余');
  ok(t.$('billTplChips').querySelectorAll('.cc.sel').length===1, '只高亮当前模板');
  t.$('addBill').click();
  const r=t.arcOf().records.at(-1);
  ok(r.money===500 && r.type==='income' && r.cat==='其他' && r.flow===true && r.remark==='借出还回', '点添加后按模板内容入账');
  ok(t.errs.length===0, '无脚本错误 '+t.errs.join(';'));
}

// ===== 5. 从修改弹窗存 =====
{
  const t=await boot({ records:[ R('r1','2026-10-08T10:40',30,'expense','订阅','云盘会员') ] });
  t.w.openEdit('r1');
  t.$('editSaveTpl').click(); t.choose('带上金额'); t.$('askOk').click();
  const tp=t.arcOf().tpls;
  ok(tp && tp.length===1 && tp[0].remark==='云盘会员' && tp[0].money===30, '修改弹窗里也能存');
  ok(t.$('editMask').style.display==='flex', '存完修改弹窗还开着');
}

// ===== 6. 管理：往前挪 / 删除 / 返回键关闭 =====
{
  const tpls=[ {id:'a',type:'expense',cat:'餐饮',remark:'早饭',money:null,mode:'normal'},
               {id:'b',type:'expense',cat:'订阅',remark:'VPN',money:20,mode:'normal'},
               {id:'c',type:'expense',cat:'转账',remark:'',money:null,mode:'skip'} ];
  const t=await boot({ tpls });
  t.$('manageTplSetting').click();
  const rows=()=>[...t.$('tplList').querySelectorAll('.tpl-item')];
  ok(t.$('tplMask').style.display==='flex' && rows().length===3, '管理弹窗列出 3 个');
  ok(rows()[0].querySelector('button').disabled, '第一个的 ↑ 不可点');
  ok(rows()[2].querySelector('.cat-name').textContent==='转账' && rows()[2].querySelector('.tpl-sub').textContent==='支出 · 转账 · 不带金额 · 不计入', '没备注用分类名；副标题写全');
  rows()[1].querySelector('button').click();
  ok(t.arcOf().tpls.map(x=>x.id).join()==='b,a,c', '往前挪');
  [...rows()[1].querySelectorAll('button')].pop().click();
  ok(t.arcOf().tpls.map(x=>x.id).join()==='b,c', '删除');
  t.w.dispatchEvent(new t.w.Event('backbutton'));
  if(t.w.__handleBack) t.w.__handleBack();
  // 返回键：直接调 LAYERS 不方便，退而检查已注册
  ok(/isOpen\('tplMask'\)/.test(html), '返回键层级里有 tplMask');
  // 空态
  t.$('closeTpl').click();
  const t2=await boot(); t2.$('manageTplSetting').click();
  ok(t2.$('tplList').textContent.includes('还没有常用模板'), '空态提示');
}

// ===== 7. 分类改名 / 删除：模板跟着走 =====
{
  const tpls=[ {id:'a',type:'expense',cat:'游戏',remark:'游戏充值',money:null,mode:'normal'} ];
  const t=await boot({ tpls });
  t.w.eval("renameCat('游戏')"); t.$('askInput').value='娱乐'; t.$('askOk').click();
  ok(t.arcOf().tpls[0].cat==='娱乐', '分类改名，模板跟着改');
  t.w.eval("deleteCat('娱乐')"); t.$('askOk').click();
  ok(t.arcOf().tpls[0].cat==='未分类', '分类删除，模板归未分类');
}

// ===== 8. 导出 / 云备份 / 导入 =====
{
  const tpls=[ {id:'a',type:'expense',cat:'订阅',remark:'视频会员',money:157,mode:'normal'} ];
  const t=await boot({ tpls, records:[R('r','2026-10-01T10:00',1,'expense','餐饮')] });
  ok(JSON.stringify(t.w.eval('odBuildPayload()').tpls)===JSON.stringify(tpls), '云备份带模板');
  t.w.importArchiveFromText(JSON.stringify({ archive:'导入', cats:['未分类','订阅','餐饮'], data:[R('x','2026-10-01T10:00',1,'expense','餐饮')],
    tpls:[ {type:'expense',cat:'订阅',remark:'视频会员',money:157,mode:'normal'},
           {type:'expense',cat:'订阅',remark:'视频会员',money:157,mode:'normal'},   // 重复
           {type:'expense',cat:'不存在',remark:'x',money:null},                    // 分类不在表里
           {type:'oops',cat:'订阅'},                                               // 类型非法
           {type:'income',cat:'餐饮',remark:'',money:-3},                          // 金额非法
           {type:'expense',cat:'餐饮',remark:'<b>午饭</b>',money:'',mode:'flow'} ] }), t.w.localStorage.getItem('app_logged_in_user'));
  const im=t.st().archives['导入'].tpls;
  ok(im.length===2 && im[0].money===157 && im[1].money===null && im[1].mode==='flow' && im[0].id && im[0].id!==im[1].id, '导入清洗：'+JSON.stringify(im));
  const t2=await boot(); t2.w.importArchiveFromText(JSON.stringify({ archive:'旧备份', cats:['未分类'], data:[R('x','2026-10-01T10:00',1,'expense','未分类')] }), t2.w.localStorage.getItem('app_logged_in_user'));
  ok(Array.isArray(t2.st().archives['旧备份'].tpls) && t2.st().archives['旧备份'].tpls.length===0, '旧备份没有 tpls → 空数组');
  // XSS：模板名只当文字
  const t3=await boot({ tpls:[{id:'x',type:'expense',cat:'餐饮',remark:'<img src=x onerror="window.__pwn=1">',money:null,mode:'normal'}] });
  t3.openAdd(); t3.$('manageTplSetting').click();
  ok(!t3.$('billTplChips').querySelector('img') && !t3.$('tplList').querySelector('img') && !t3.w.__pwn, '模板名里的 HTML 不执行');
}

// ===== 9. 模板跟存档走：切存档后看到的是另一套 =====
{
  const t=await boot({ tpls:[{id:'a',type:'expense',cat:'餐饮',remark:'早饭',money:null,mode:'normal'}] },
               { '旅行':{ cats:['未分类','出行'], records:[] } });
  const sel=t.$('archiveSelect'); sel.value='旅行'; sel.dispatchEvent(new t.w.Event('change'));
  t.openAdd();
  ok(t.$('billTplField').style.display==='none', '另一个存档没有模板');
}

// ===== 10. 上限 12 =====
{
  const tpls=[]; for(let i=0;i<12;i++) tpls.push({id:'t'+i,type:'expense',cat:'餐饮',remark:'x'+i,money:null,mode:'normal'});
  const t=await boot({ tpls });
  t.openAdd(); t.clickChip('billCatChips','餐饮'); t.clickChip('billTypeChips','支出'); t.$('billRemark').value='第13个';
  t.$('billSaveTpl').click();
  ok(t.$('askMsg').textContent.includes('最多 12 个') && t.arcOf().tpls.length===12, '满 12 个拦下');
}

// ===== 11. 预算总览：预算外 / 今年至今 =====
{
  const recs=[
    R('g10','2026-10-02T10:00',150,'expense','游戏'), R('d10','2026-10-03T10:00',600,'expense','餐饮'),
    R('t10','2026-10-04T10:00',483,'expense','出行'), R('o10','2026-10-05T10:00',208.8,'expense','其他'),
    R('s10','2026-10-05T10:00',99,'expense','订阅','',{skip:true}),            // 不计入：不进预算外
    R('g09','2026-09-02T10:00',250,'expense','游戏'), R('d09','2026-09-03T10:00',1100,'expense','餐饮'),
    R('d01','2026-01-03T10:00',100,'expense','餐饮'),
    R('d25','2025-12-03T10:00',9999,'expense','餐饮'),                         // 去年：不算
  ];
  const t=await boot({ records:recs, budgets:{'游戏':200,'餐饮':1200} });
  t.d.querySelector('.tab-btn[data-tab="stats"]').click();
  t.$('statTabSeg').querySelector('[data-v="budget"]').click();
  const rows=[...t.$('bgOverview').querySelectorAll('.bgo-row')];
  ok(rows.length===2, '总览下两行');
  const out=rows[0];
  ok(out.querySelector('.bgo-k').textContent==='预算外' && out.querySelector('.bgo-v').textContent==='−691.80', '预算外金额：'+out.querySelector('.bgo-v').textContent);
  ok(out.querySelector('.bgo-sub').textContent==='出行、其他 没设预算', '点名没设预算的分类：'+out.querySelector('.bgo-sub').textContent);
  const ytd=rows[1];
  // 【1010-I3】改为年度预算（详细用例见 test12.js）：1 月就有记录 → 1–12 月，1400×12=16800
  ok(ytd.querySelector('.bgo-k').textContent.startsWith('年度预算（1–12月）'), '年度预算标题');
  ok(ytd.querySelector('.bgo-v').textContent==='2200 / 16800 · 13%', '年度数字：'+ytd.querySelector('.bgo-v').textContent);
  // 点预算外：展开未设预算
  ok(!t.$('bgUnsetCard').querySelector('.bgu-list'), '点之前未展开');
  out.click();
  ok(t.$('bgUnsetCard').querySelector('.bgu-list') && t.$('bgUnsetCard').querySelectorAll('.bgu-row').length===2, '点预算外 → 展开未设预算的分类');
  // 没设任何预算：保持原来的空态，不出这两行
  const t3=await boot({ records:recs });
  t3.d.querySelector('.tab-btn[data-tab="stats"]').click(); t3.$('statTabSeg').querySelector('[data-v="budget"]').click();
  ok(t3.$('bgOverview').textContent.includes('还没有给任何分类设预算') && !t3.$('bgOverview').querySelector('.bgo-row'), '无预算时保持空态');
  ok(t.errs.length+t3.errs.length===0, '无脚本错误');
}

// ===== 【1013-E】点常用：带金额的直接滚到「添加记录」；不带金额的留在金额框 =====
{
  const t=await boot({ tpls:[{id:'m',type:'expense',cat:'餐饮',remark:'早餐',money:8,mode:'normal'},
                              {id:'n',type:'expense',cat:'餐饮',remark:'午饭',money:null,mode:'normal'}] });
  t.openAdd();
  const dlg=t.$('addBill').closest('.edit-dialog');
  // jsdom 不排版：手动给弹窗和按钮一个位置——弹窗可视区 0~600，按钮在 900，得往下滚 300 多
  const rect=(top,bottom)=>({top,bottom,left:0,right:300,width:300,height:bottom-top,x:0,y:top});
  dlg.getBoundingClientRect=()=>rect(0,600);
  t.$('addBill').getBoundingClientRect=()=>rect(860-dlg.scrollTop, 900-dlg.scrollTop);
  dlg.scrollTop=0;
  t.clickChip('billTplChips','早餐8');
  ok(dlg.scrollTop===316, '带金额的模板：弹窗滚到「添加记录」露出来（滚了 '+dlg.scrollTop+'）');
  ok(t.$('billMoney').value==='8', '金额照常填好');
  await new Promise(r=>setTimeout(r,400));
  ok(dlg.scrollTop===316, '键盘收起后再滚一次也不会多滚');
  dlg.scrollTop=0;
  t.clickChip('billTplChips','午饭');
  ok(dlg.scrollTop===0 && t.d.activeElement===t.$('billMoney'), '不带金额的模板：不滚，光标在金额框');
  await new Promise(r=>setTimeout(r,400));
  ok(dlg.scrollTop===0, '不带金额的过一会儿也不滚');
  ok(t.errs.length===0, '1013-E 无脚本错误 '+t.errs.join(';'));
}
// ===== 【1013-E】标签选中前后大小不变：选中不再改字重，行高固定 =====
{
  const t=await boot();
  const css=[...t.d.styleSheets].flatMap(sh=>[...sh.cssRules]).filter(r=>r.selectorText);
  const rule=sel=>css.filter(r=>r.selectorText.split(',').map(x=>x.trim()).includes(sel));
  const selRules=[...rule('.cat-chips .cc.sel'), ...rule('.filter-chips .cc.sel')];
  ok(selRules.length>=2 && selRules.every(r=>!r.style.fontWeight), '分类 / 常用 / 口径 / 筛选标签选中时不改字重');
  ok(rule('.cat-chips .cc').some(r=>r.style.lineHeight==='20px') && rule('.filter-chips .cc').some(r=>r.style.lineHeight==='20px'), '标签行高固定，不随字体变化');
}

console.log(`\n1010-I 专项：${pass} 通过，${fail} 失败`); process.exit(fail?1:0);
})();
