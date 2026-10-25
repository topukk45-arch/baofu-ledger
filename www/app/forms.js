(function(){
        const { $, MODE_HINT, pad, addBill, billCat, billMoney, billRemark, billTime, billType, cancelEdit, editCat, editMask, editMoney, editRemark, editTime, editType, escapeHtml, fillSelect, normMoney, nowDtValue, parseRecTime, recMode, round2, safeNum, sanitizeMoney, saveEdit, setRecMode } = window.JiwenBase;   // 用到前面模块的
        const { TPL_MAX, TPL_NAME_MAX, __ledger, recentCats, budgetPhrase, budgetSpentIn, charLen, curArchive, genId, getBudgets, getCats, getUserData, isRefund, loadStore, refundedTotal, refundsOf, saveStoreSafe, saveUserData, storeKey, syncRefunds, tplName, tplSame } = window.JiwenStore;   // 用到前面模块的
        const { customAlert, customChoose, customConfirm, customPrompt } = window.JiwenAsk;   // 用到前面模块的
        const { getDtInput, openDtPicker, setDtInput } = window.JiwenDate;   // 用到前面模块的
        const { loadImportUI } = window.JiwenImportEntry;   // 用到前面模块的

        // ===== 1010-K5：点「备注」后，把保存按钮也露出来 =====
        // 键盘弹起时弹窗被压到半屏，WebView 只把备注框本身滚进视野，紧挨着的「添加记录 / 保存」
        // 正好卡在下沿外，得手动再滑一下。这里在备注聚焦后，把弹窗内部再往上滚一点。
        // 只滚弹窗自己（scrollTop），不用 scrollIntoView，免得连带滚动整个页面。
        (function(){
            const PAIRS = [['billRemark','addBill'], ['editRemark','saveEdit']];
            function revealSave(ta, btn){
                const dlg = ta && ta.closest('.edit-dialog');
                if(!dlg || !btn) return;
                const d = dlg.getBoundingClientRect(), b = btn.getBoundingClientRect(), t = ta.getBoundingClientRect();
                let delta = b.bottom + 12 - d.bottom;          // 按钮底边离弹窗可视下沿还差多少
                if(delta <= 0) return;                          // 已经看得见，不动
                delta = Math.min(delta, t.top - d.top - 8);     // 屏幕再小也别把备注框本身滚出顶部
                if(delta > 0) dlg.scrollTop += delta;
            }
            window.__revealSave = revealSave;   // 给测试用
            // 1019-O：备注改成点了弹文字输入小面板，大面板在输入时不动；写完（小面板点「确定」）才让保存按钮露出来（见 txtOk）
            if(false && window.visualViewport){
                window.visualViewport.addEventListener('resize', ()=>{
                    const a = document.activeElement;
                    PAIRS.forEach(([taId, btnId])=>{ if(a && a.id===taId) revealSave(a, document.getElementById(btnId)); });
                });
            }
        })();
        // ===== 悬浮按钮：打开/关闭记账弹窗 =====
        const addMask=$('addMask');

        // ===== 1020-G：分类一行 4 个「最近常用」+「更多」那一行（分类抽屉）=====
        //   最近常用照 recentCats：最近 60 天用得最多的 4 个，选了收支就按那一种算、没选不分收支；不够 4 个的用分类管理里排在前面的补齐。
        //   打开面板时算一次；开着的时候点分类、从抽屉里选都不挪位置（只有换收支时按那一种重算一次）。
        //   选的是这 4 个以外的：「更多」那一行右边写这个分类名（加粗）；选的是这 4 个之一：右边空着。
        //   不默认选中任何分类——分类为必选项，由用户主动点选
        let billCatSel='';
        const recentOf={ bill:[], edit:[], tplEdit:[] };
        const catBoxOf=p=>$(p==='tplEdit' ? 'tplEditCats' : p+'CatChips');   // 模板面板的分类块原来就叫 tplEditCats
        function paintCatRow(p, sel){
            catBoxOf(p).querySelectorAll('.cc').forEach(el=>el.classList.toggle('sel', el.textContent===sel));
            const out = sel && !recentOf[p].includes(sel);
            const v=$(p+'CatMoreVal'); v.textContent = out ? sel : ''; v.classList.toggle('on', !!out);
        }
        function renderRecentChips(p, type, onPick){
            recentOf[p]=recentCats(type, 4);
            const box=catBoxOf(p);
            box.innerHTML='';
            recentOf[p].forEach(c=>{
                const b=document.createElement('div');
                b.className='cc';
                { const sp=document.createElement('span'); sp.className='cc-t'; sp.textContent=c; b.appendChild(sp); }   // 1020-H：字包一层，好按字形裁掉上下留白居中
                b.setAttribute('role','button');
                b.onclick=()=>onPick(c);
                box.appendChild(b);
            });
        }
        function pickBillCat(c){
            const prevCat=billCatSel;
            billCatSel=c; billCat.value=c;
            paintCatRow('bill', c);
            autoModeOnCat($('billMode'), prevCat, c);
            autoTypeOnCat(c);
        }
        // 1025-UX：选了分类、还没亲手选收支时，按这个分类以前记的收支自动选上（以前八成以上是支出就选支出；退款不算；没记过的照旧不选，保存时再问）。
        //   自动选的（billTypeAuto）再换分类时跟着重新看；亲手点过收支就不再动。最近常用那 4 个不重排（刚点的那格不会在手指下面挪走）
        const TYPE_GUESS_SHARE=0.8;
        let billTypeAuto=false;
        function guessTypeOfCat(c){
            let e=0, i=0;
            getUserData().forEach(r=>{ if(r.cat!==c || isRefund(r)) return; if(r.type==='expense') e++; else if(r.type==='income') i++; });
            const n=e+i; if(!n) return '';
            return e/n>=TYPE_GUESS_SHARE ? 'expense' : (i/n>=TYPE_GUESS_SHARE ? 'income' : '');
        }
        function autoTypeOnCat(c){
            if(billTypeSel && !billTypeAuto) return;
            const t=c ? guessTypeOfCat(c) : '';
            if(!t){ if(billTypeAuto) setBillTypeQuiet(''); return; }
            setBillTypeQuiet(t); billTypeAuto=true;
        }
        function setBillTypeQuiet(v){
            billTypeSel=v; billType.value=v; billTypeAuto=false;
            $('billTypeChips').querySelectorAll('.cc').forEach(el=>{
                el.classList.remove('sel-out','sel-in');
                if(v && el.dataset.v===v) el.classList.add(v==='expense' ? 'sel-out' : 'sel-in');
            });
        }
        function renderBillCatChips(keep){
            const cats=getCats();
            billCatSel='';               // 每次渲染都重置为「未选」
            billCat.value='';
            fillSelect(billCat, cats, null); billCat.value='';
            renderRecentChips('bill', billTypeSel, pickBillCat);
            if(keep && cats.includes(keep)){ billCatSel=keep; billCat.value=keep; }
            paintCatRow('bill', billCatSel);
        }
        // 分类抽屉（共用底部面板 JiwenSheet.cats）：点一个就选好、关掉，回到记一笔 / 修改；「管理分类」打开分类管理，关了回到抽屉
        function openCatDrawer(p){
            const type = p==='bill' ? billTypeSel : p==='edit' ? editTypeSel : tplEditType;
            const pick = p==='bill' ? pickBillCat : p==='edit' ? pickEditCat : pickTplCat;
            const again=()=>openCatDrawer(p);
            const maskId = p==='bill' ? 'addMask' : p==='edit' ? 'editMask' : 'tplEditMask';
            window.JiwenSheet.cats({ type, value: p==='bill' ? billCatSel : p==='edit' ? editCatSel : tplEditCat, recent: recentOf[p], onPick: pick,
                onManage: ()=>{
                    window.JiwenCats.openCatManager();
                    const m=$('catMask');
                    const ob=new MutationObserver(()=>{ if(m.style.display==='none'){ ob.disconnect(); if($(maskId).style.display==='flex') again(); } });
                    ob.observe(m, { attributes:true, attributeFilter:['style'] });
                } });
        }
        $('billCatMore').addEventListener('click', ()=>openCatDrawer('bill'));
        $('editCatMore').addEventListener('click', ()=>openCatDrawer('edit'));
        $('tplEditCatMore').addEventListener('click', ()=>openCatDrawer('tplEdit'));
        // 备注那一行：右边写已经写好的备注（一行，太长省略），没写空着；点了弹文字小面板（备注框本身藏着，值还在它身上）
        function paintRemarkRow(p){ const t=$(p+'Remark').value.replace(/\s+/g,' ').trim(); $(p+'RemarkVal').textContent=t; }
        ['bill','edit','tplEdit'].forEach(p=>{
            $(p+'RemarkRow').addEventListener('click', ()=>window.openTextPanel($(p+'Remark')));
            $(p+'Remark').addEventListener('input', ()=>paintRemarkRow(p));
        });
        // 别处直接改了备注框的值（模板、期初余额、接着填）以后，调这个把那一行跟上
        function syncRecRows(){ paintRemarkRow('bill'); paintRemarkRow('edit'); paintRemarkRow('tplEdit'); paintRemarkRow('refund'); }

        // 分类增删改/排序后调用：若记账弹窗正开着，重渲染标签使其立即反映最新分类。
        // 尽量保留用户当前已选的分类（若它还存在）。
        function refreshBillCatChipsIfOpen(){
            if($('addMask').style.display!=='flex') return;
            renderTplChips();
            renderBillCatChips(billCatSel);
        }

        // 修改账单弹窗若正开着，分类增删改/排序后同步重渲染其 chips，
        // 尽量保留当前已选分类（若它仍存在）。与记账弹窗的同步逻辑对称，补齐此前遗漏。
        function refreshEditCatChipsIfOpen(){
            if($('editMask').style.display!=='flex') return;
            const keep=editCatSel;
            renderEditCatChips(getCats().includes(keep) ? keep : '', editTypeSel);
        }

        // 渲染收支标签：支出/收入，必选、不默认选中。1020-G 起两个一样大的按钮，选中的主色实心（不用红绿；类名照旧 sel-out / sel-in）
        let billTypeSel='';
        function renderBillTypeChips(){
            billTypeSel='';
            billType.value='';
            billTypeAuto=false;
            const box=$('billTypeChips');
            box.innerHTML='';
            const opts=[ {v:'expense', t:'支出', cls:'sel-out'},
                         {v:'income',  t:'收入', cls:'sel-in'} ];
            opts.forEach(o=>{
                const b=document.createElement('div');
                b.className='cc'; b.dataset.v=o.v;
                { const sp=document.createElement('span'); sp.className='cc-t'; sp.textContent=o.t; b.appendChild(sp); }   // 1020-H：字包一层，好按字形裁掉上下留白居中
                b.setAttribute('role','radio');
                b.onclick=()=>{
                    const changed=billTypeSel!==o.v || billTypeAuto;   // 1025-UX：自动选上的那个再亲手点一下也算选了，最近常用按它重算
                    billTypeSel=o.v; billType.value=o.v; billTypeAuto=false;
                    box.querySelectorAll('.cc').forEach(el=>{
                        el.classList.remove('sel-out','sel-in');
                    });
                    b.classList.add(o.cls);
                    if(changed) renderBillCatChips(billCatSel);   // 最近常用按这一种收支重算（选好的分类留着）
                };
                box.appendChild(b);
            });
        }

        // ===== 统计选择：计入 / 不计 / 往来 =====
        // 1020-F 改叫法（老叫法：统计口径，三种叫计入 / 只算结余 / 不计入），存的值 normal / skip / flow 不变。
        // 选「转账」分类时自动切到「不计」——只在**切换到**转账的那一下、且当前还是「计入」时触发。
        // 自动切的会打 data-auto 标记：切走到别的分类时恢复「计入」，免得一笔餐饮被悄悄带成不计。
        // 用户手动点过就清掉标记，之后完全听用户的。
        const SKIP_DEFAULT_CATS=['转账'];
        const MODE_OPTS=[ {v:'normal', t:'计入'}, {v:'skip', t:'不计'}, {v:'flow', t:'往来'} ];
        const REC_MODE_NAME={ normal:'计入', skip:'不计', flow:'往来' };
        function paintModeChips(box){
            const cur=box.dataset.mode||'normal';
            box.querySelectorAll('.cc').forEach(el=>el.classList.toggle('sel', el.dataset.v===cur));
            const v=box.querySelector('.rec-row-v'); if(v) v.textContent=REC_MODE_NAME[cur];   // 1020-G：列表卡里「统计」那一行右边写现在的
            const hint=$(box.id+'Hint'); if(hint) hint.textContent=MODE_HINT[cur];
        }
        // 1020-G：点「统计」那一行弹统计面板（三行，名字 + 说明，选中的打勾，点一下就选好并关掉）
        function openModeSheet(box){
            window.JiwenSheet.modes({ value:getModeChips(box), names:REC_MODE_NAME, hints:MODE_HINT,
                onPick:v=>{ box.dataset.mode=v; delete box.dataset.auto; paintModeChips(box); } });
        }
        function setModeChips(box, mode){
            if(!box) return;
            box.dataset.mode = (mode==='flow'||mode==='skip') ? mode : 'normal';
            delete box.dataset.auto;
            paintModeChips(box);
        }
        function getModeChips(box){ return (box && box.dataset.mode) || 'normal'; }
        function autoModeOnCat(box, prev, next){
            if(!box || prev===next) return;
            if(SKIP_DEFAULT_CATS.includes(next)){
                if(getModeChips(box)==='normal'){ box.dataset.mode='skip'; box.dataset.auto='1'; paintModeChips(box); }
            } else if(box.dataset.auto==='1'){
                box.dataset.mode='normal'; delete box.dataset.auto; paintModeChips(box);
            }
        }
        ['billMode','editMode','tplEditMode'].forEach(id=>{
            const box=$(id); if(!box) return;
            if(box.classList.contains('rec-row')){ box.addEventListener('click', ()=>openModeSheet(box)); setModeChips(box, 'normal'); return; }
            MODE_OPTS.forEach(o=>{
                const b=document.createElement('div');
                b.className='cc'; b.textContent=o.t; b.dataset.v=o.v;
                b.onclick=()=>{ box.dataset.mode=o.v; delete box.dataset.auto; paintModeChips(box); };
                box.appendChild(b);
            });
            setModeChips(box, 'normal');
        });

        // 把记账表单恢复到「空白初始态」：空金额/空备注、不选收支、不选分类、时间为此刻
        // 1023-P：这一笔记成期初余额（导入结果页「补一笔期初余额」打开时设上；保存时还是往来才写 ob:1）
        let billOb=false;
        function resetBillForm(){
            billOb=false;
            billMoney.value='';
            billRemark.value='';
            setModeChips($('billMode'), 'normal');
            renderBillTypeChips();
            renderBillCatChips();
            syncRecRows();
            billTplSel=null; renderTplChips();
            setDtInput(billTime, nowDtValue());
        }
        function getTpls(){
            const a=curArchive(loadStore());
            return (a && Array.isArray(a.tpls)) ? a.tpls : [];
        }
        // 1020-J：常用模板收进列表卡「常用」那一行（原来是分类上面两排胶囊）：右边灰字「选择常用模板」，点过一个写它的名字；
        //   点了拉出常用模板列表（JiwenSheet.tpls）：点一个照模板填好、关掉列表；底部「取消 | 管理常用」，管理常用关了回到这个列表。
        let billTplSel=null;
        function renderTplChips(){
            const v=$('billTplVal'); if(!v) return;
            const t=billTplSel && getTpls().find(x=>x.id===billTplSel);
            if(!t) billTplSel=null;
            v.textContent = t ? tplName(t) : '';
        }
        const TPL_MODE_TXT={ flow:'往来', skip:'不计' };
        function openTplList(){
            const cats=getCats();
            const list=getTpls().map(t=>{
                const sub=[t.cat, t.type==='expense'?'支出':'收入'];
                if(TPL_MODE_TXT[t.mode]) sub.push(TPL_MODE_TXT[t.mode]);
                const rm=(t.remark||'').replace(/\s+/g,' ').trim();
                if(rm && rm!==tplName(t)) sub.push('备注：'+rm);
                return { id:t.id, c:String(t.cat||'?').slice(0, 1), name:tplName(t), sub:sub.join(' · '),
                         money: t.money!=null ? '¥'+safeNum(t.money).toFixed(2).replace(/\.00$/,'') : '' };
            });
            window.JiwenSheet.tpls({ list, value:billTplSel,
                onPick:id=>{
                    const t=getTpls().find(x=>x.id===id); if(!t) return;
                    applyTpl(t, cats);
                    billTplSel=t.id; renderTplChips();
                    // 【1013-E】带金额的模板点完表单就填全了，直接把弹窗滚到「保存」。不带金额的还得填金额，留在原处（applyTpl 已对着金额框）。
                    if(t.money!=null) revealAddBtn();
                },
                onManage:()=>{
                    openTplManager();
                    const m=$('tplMask');
                    const ob=new MutationObserver(()=>{ if(m.style.display==='none' && $('tplEditMask').style.display!=='flex'){ ob.disconnect(); if($('addMask').style.display==='flex') openTplList(); } });
                    ob.observe(m, { attributes:true, attributeFilter:['style'] });
                } });
        }
        $('billTplRow').addEventListener('click', openTplList);
        // 把「记一笔」弹窗自己往下滚，露出「保存」按钮（只滚弹窗，不动整个页面）。
        //   键盘刚收起时弹窗会变高，过一会儿再滚一次。
        function revealAddBtn(){
            const go=()=>{
                const dlg=$('addBill').closest('.edit-dialog'), btn=$('addBill');
                if(!dlg || !btn || $('addMask').style.display==='none') return;
                const d=dlg.getBoundingClientRect(), b=btn.getBoundingClientRect();
                const delta=b.bottom + 16 - d.bottom;
                if(delta<=0) return;
                const top=dlg.scrollTop + delta;
                try{ dlg.scrollTo({ top, behavior:'smooth' }); }catch(_){ dlg.scrollTop=top; }
            };
            go();
            setTimeout(go, 350);
        }
        // 把模板填进「记一笔」表单。时间不动（仍是此刻 / 用户已选的时间）。
        function applyTpl(t, cats){
            const ioTxt = t.type==='expense' ? '支出' : '收入';
            const io=[...$('billTypeChips').querySelectorAll('.cc')].find(el=>el.textContent===ioTxt);
            if(io) io.click();
            if((cats||getCats()).includes(t.cat)) pickBillCat(t.cat);
            // 分类点击可能触发「转账 → 自动不计」，模板里存的口径优先，放在分类之后设
            setModeChips($('billMode'), t.mode||'normal');
            billRemark.value=t.remark||''; syncRecRows();
            billMoney.value = t.money!=null ? String(round2(t.money)) : '';
            // 带金额：表单已填全，收起键盘露出「添加记录」；要改金额再点输入框。
            // 不带金额：金额还得填，直接聚焦弹键盘。
            try{
                if(t.money!=null){ billMoney.blur(); if(document.activeElement && document.activeElement.blur) document.activeElement.blur(); }
                else billMoney.focus();
            }catch(_){}
        }
        // 把表单当前内容存成模板。src: { type, cat, remark, money(字符串), mode }；after: 存完后的回调
        function saveTplFrom(src, after){
            if(!src.type || !src.cat){ customAlert('先选好分类和收支，再存为常用。'); return; }
            if(getTpls().length>=TPL_MAX){ customAlert(`常用模板最多 ${TPL_MAX} 个，先去「设置 → 管理常用模板」删掉几个吧。`); return; }
            const base={ type:src.type, cat:src.cat, remark:(src.remark||'').trim().slice(0,5000),
                         mode:(src.mode==='flow'||src.mode==='skip') ? src.mode : 'normal' };
            const m=normMoney(src.money);
            const doSave=(withMoney)=>{
                const t=Object.assign({ id:genId(), money: withMoney ? m.val : null }, base);
                if(getTpls().some(o=>tplSame(o,t))){ customAlert('这个已经在常用里了。'); return; }
                const store=loadStore(); const a=curArchive(store);
                a.tpls=(Array.isArray(a.tpls) ? a.tpls.slice() : []).concat([t]);
                if(!saveTplStore(store)) return;
                if(after) after();
                customAlert(`已存为常用：${tplName(t)}${withMoney?' '+m.val.toFixed(2):''}`);
            };
            if(String(src.money||'').trim()==='' || !m.ok){ doSave(false); return; }
            customChoose('金额要一起存吗？', [
                { value:'with',    label:`带上金额 ${m.val.toFixed(2)}`, desc:'固定价的：订阅、房贷、话费' },
                { value:'without', label:'不带金额', desc:'每次金额不一样的：吃饭、打车' },
            ], (v)=>doSave(v==='with'), '存为常用', null, { layout:'list' });
        }
        $('billSaveTpl').addEventListener('click', ()=>{
            saveTplFrom({ type:billTypeSel, cat:billCatSel, remark:billRemark.value, money:billMoney.value,
                          mode:getModeChips($('billMode')) }, ()=>{
                // 只刷新胶囊，不动用户已填的表单
                renderTplChips();
            });
        });
        // ===== 退款弹窗（1010-J）=====
        let refundOrigId=null, refundKindSel='all';
        function refundRemain(data, o){ return round2(safeNum(o.money)-refundedTotal(data, o.id)); }
        function setRefundKind(kind, rem){
            refundKindSel=kind;
            $('refundKind').querySelectorAll('.cc').forEach(el=>el.classList.toggle('sel', el.dataset.v===kind));
            const inp=$('refundMoney');
            // 1020-I：全额时金额只读（数字键盘不弹）；部分退款弹 App 的数字键盘（设置里选了系统键盘的照旧弹系统的）
            const kpOn=window.JiwenKeypad && window.JiwenKeypad.kpOn();
            if(kind==='all'){
                inp.value=rem.toFixed(2); inp.readOnly=true; inp.classList.add('ro'); inp.dataset.kpLock='1';
                if(window.JiwenKeypad && window.JiwenKeypad.kpTarget===inp) window.kpClose();
                try{ inp.blur(); }catch(_){}
            } else {
                inp.value=''; inp.readOnly=!!kpOn; inp.classList.remove('ro'); delete inp.dataset.kpLock;
                inp.placeholder=`最多 ${rem.toFixed(2)}`;
                if(kpOn){ if($('refundMask').style.display==='flex') window.kpOpen(inp); }
                else { try{ inp.focus(); }catch(_){} }
            }
        }
        function openRefund(id){
            const data=getUserData();
            const o=data.find(r=>r.id===id);
            if(!o || o.type!=='expense'){ customAlert('只有支出能退款。'); return; }
            const done=refundedTotal(data, id), rem=refundRemain(data, o);
            if(rem<=0){ customAlert('这笔已经全额退款了。'); return; }
            refundOrigId=id;
            $('refundSum').innerHTML=
                `<div class="rs-what">${escapeHtml(o.cat||'未分类')}${(o.remark||'').trim()?` · ${escapeHtml(o.remark.trim())}`:''}`
                + ` <span class="rs-when">${String(o.time).replace('T',' ')}</span></div>`
                + `<div class="rs-nums"><span>原金额 <b>${safeNum(o.money).toFixed(2)}</b></span>`
                + `<span>已退 <b>${done.toFixed(2)}</b></span><span>还能退 <b class="pos">${rem.toFixed(2)}</b></span></div>`;
            $('refundRemark').value=''; paintRemarkRow('refund');
            const now=nowDtValue();
            setDtInput($('refundTime'), now<o.time ? o.time : now);
            $('refundMask').style.display='flex';
            setRefundKind('all', rem);
        }
        function closeRefund(){ $('refundMask').style.display='none'; refundOrigId=null; }
        $('refundKind').addEventListener('click', e=>{
            const el=e.target.closest('.cc[data-v]'); if(!el || !refundOrigId) return;
            const data=getUserData(); const o=data.find(r=>r.id===refundOrigId); if(!o) return;
            setRefundKind(el.dataset.v, refundRemain(data, o));
        });
        $('refundTime').addEventListener('click', ()=>openDtPicker($('refundTime')));
        // 1020-I：时间、备注是列表行：点了弹日期选择 / 文字小面板，选好了那一行跟着变（时间那一行是 refundTimeTxt，setDtInput 顺手写）
        $('refundTimeRow').addEventListener('click', ()=>openDtPicker($('refundTime')));
        $('refundRemarkRow').addEventListener('click', ()=>window.openTextPanel($('refundRemark')));
        $('refundRemark').addEventListener('input', ()=>paintRemarkRow('refund'));
        $('refundCancel').addEventListener('click', closeRefund);
        $('refundOk').addEventListener('click', ()=>{
            const data=getUserData();
            const o=data.find(r=>r.id===refundOrigId);
            if(!o){ closeRefund(); customAlert('原账单已不存在。'); return; }
            const rem=refundRemain(data, o);
            let amt;
            if(refundKindSel==='all') amt=rem;
            else {
                const m=normMoney($('refundMoney').value.trim());
                if(!m.ok){ customAlert(m.why); return; }
                amt=m.val;
            }
            if(amt>rem){ customAlert(`最多能退 ${rem.toFixed(2)}。\n如果拿回来的比付出去的多（比如赔付、补偿），多出的部分请另记一笔收入。`); return; }
            const time=getDtInput($('refundTime'));
            if(!time){ customAlert('选一下退款时间吧～'); return; }
            if(time<o.time){ customAlert(`退款时间不能早于原账单（${o.time.replace('T',' ')}）。`); return; }
            const rec={ id:genId(), time, money:amt, type:'income', cat:o.cat,
                        remark:$('refundRemark').value.trim().slice(0,5000), refundOf:o.id };
            setRecMode(rec, recMode(o));
            data.push(rec);
            if(!saveUserData(data)) return;
            closeRefund();
            window.JiwenTabs.refreshAllViews();
            const left=round2(rem-amt);
            customAlert(left>0 ? `已退款 ${amt.toFixed(2)}，这笔还能再退 ${left.toFixed(2)}。` : `已退款 ${amt.toFixed(2)}，这笔已全额退款。`, '退款完成');
        });
        $('editSaveTpl').addEventListener('click', ()=>{
            saveTplFrom({ type:editTypeSel, cat:editCatSel, remark:$('editRemark').value, money:$('editMoney').value,
                          mode:getModeChips($('editMode')) });
        });
        // —— 管理：只有「往前挪」和「删除」，不做拖动（模板最多 12 个，够用且不容易误操作）——
        function openTplManager(){
            const list=$('tplList'); list.innerHTML='';
            const tpls=getTpls();
            if(!tpls.length){
                list.innerHTML='<div class="tpl-empty">还没有常用模板。<br>点下面的「新建模板」，或者记一笔、修改账单时点底部的「存为常用」，就能加进来。</div>';
            }
            const MODE_TXT={ flow:' · 往来', skip:' · 不计' };
            tpls.forEach((t,i)=>{
                const div=document.createElement('div'); div.className='cat-item tpl-item';
                const left=document.createElement('div'); left.className='cat-left';
                const nm=document.createElement('span'); nm.className='cat-name'; nm.textContent=tplName(t);
                const sub=document.createElement('span'); sub.className='tpl-sub';
                sub.textContent=`${t.type==='expense'?'支出':'收入'} · ${t.cat} · ${t.money!=null ? safeNum(t.money).toFixed(2) : '不带金额'}${MODE_TXT[t.mode]||''}`;
                left.appendChild(nm); left.appendChild(sub);
                const wrap=document.createElement('div'); wrap.style.flexShrink='0';
                const up=document.createElement('button'); up.textContent='↑'; up.style.marginRight='6px';
                up.disabled = i===0;
                up.onclick=()=>moveTpl(t.id, -1);
                const del=document.createElement('button'); del.textContent='删除';
                del.onclick=()=>removeTpl(t.id);
                wrap.appendChild(up); wrap.appendChild(del);
                div.appendChild(left); div.appendChild(wrap);
                // 1019-K：点行（不是 ↑ / 删除）打开模板面板改它
                div.dataset.id=t.id; div.setAttribute('role','button'); div.style.cursor='pointer';
                div.addEventListener('click', e=>{ if(e.target.closest('button')) return; openTplEditor(t.id); });
                list.appendChild(div);
            });
            $('tplMask').style.display='flex';
        }
        function moveTpl(id, dir){
            const store=loadStore(); const a=curArchive(store);
            const arr=Array.isArray(a.tpls) ? a.tpls.slice() : [];
            const i=arr.findIndex(t=>t.id===id), j=i+dir;
            if(i<0 || j<0 || j>=arr.length) return;
            [arr[i], arr[j]]=[arr[j], arr[i]];
            a.tpls=arr;
            if(saveTplStore(store)) openTplManager();
        }
        function removeTpl(id){
            const store=loadStore(); const a=curArchive(store);
            a.tpls=(Array.isArray(a.tpls) ? a.tpls : []).filter(t=>t.id!==id);
            if(saveTplStore(store)) openTplManager();
        }
        $('manageTplSetting').addEventListener('click', openTplManager);
        // 1019-K：「新建模板」不再借用记一笔（原来点「添加记录」会往账本里真记一笔），单独一个模板面板（openTplEditor）
        $('tplNew').addEventListener('click', ()=>{
            if(getTpls().length>=TPL_MAX){ customAlert(`常用模板最多 ${TPL_MAX} 个，先删掉几个吧。`); return; }
            openTplEditor(null);
        });
        $('closeTpl').addEventListener('click', ()=>{ $('tplMask').style.display='none'; });
        // ===== 1019-K：模板面板（新建 / 编辑都用它）=====
        //   只填模板要的：名字（可不填）、分类、收支、口径、备注、固定金额（可不填）；没有记账时间。
        //   保存只改存档里的 tpls：不写记录、不改账本版本（saveTplStore），回到模板列表。
        let tplEditId=null, tplEditCat='', tplEditType='';
        // 1020-I：照记一笔方案 D：分类 4 个最近常用（按选的收支算）+「更多」那一行（分类抽屉），收支两个一样大的按钮
        function pickTplCat(c){
            const prev=tplEditCat; tplEditCat=c;
            paintCatRow('tplEdit', c);
            autoModeOnCat($('tplEditMode'), prev, c);
        }
        function tplEditChips(){
            renderRecentChips('tplEdit', tplEditType, pickTplCat);
            paintCatRow('tplEdit', tplEditCat);
            const tb=$('tplEditTypes'); tb.innerHTML='';
            [{v:'expense', t:'支出', cls:'sel-out'}, {v:'income', t:'收入', cls:'sel-in'}].forEach(o=>{ const b=document.createElement('div'); b.className='cc'+(o.v===tplEditType?' '+o.cls:''); b.setAttribute('role','radio');
                { const sp=document.createElement('span'); sp.className='cc-t'; sp.textContent=o.t; b.appendChild(sp); }
                b.onclick=()=>{ const changed=tplEditType!==o.v; tplEditType=o.v; tb.querySelectorAll('.cc').forEach(x=>x.classList.remove('sel-out','sel-in')); b.classList.add(o.cls);
                    if(changed){ renderRecentChips('tplEdit', tplEditType, pickTplCat); paintCatRow('tplEdit', tplEditCat); } }; tb.appendChild(b); });
        }
        function openTplEditor(id){
            const t=id ? getTpls().find(x=>x.id===id) : null;
            if(id && !t){ customAlert('这个模板已经不在了。'); openTplManager(); return; }
            tplEditId=t ? t.id : null;
            tplEditCat=t && getCats().includes(t.cat) ? t.cat : '';
            tplEditType=t ? t.type : '';
            $('tplEditTitle').textContent=t ? '编辑模板' : '新建模板';
            $('tplEditName').value=t ? (t.name||'') : '';
            $('tplEditRemark').value=t ? (t.remark||'') : ''; paintRemarkRow('tplEdit');
            $('tplEditMoney').value=t && t.money!=null ? safeNum(t.money).toFixed(2) : '';
            setModeChips($('tplEditMode'), t ? t.mode : 'normal');
            tplEditChips();
            $('tplEditDelete').style.display=t ? '' : 'none';
            $('tplEditErr').style.display='none';
            $('tplEditMask').style.display='flex';
        }
        function closeTplEditor(){ $('tplEditMask').style.display='none'; tplEditId=null; }
        // 只改模板：照常写存档（云备份里也有模板），但不把账本版本往上加（导入确认页不会因此说「账本变了」）
        function saveTplStore(store){
            const e=__ledger.get(storeKey()), v=e ? e.ver : null;
            const ok=saveStoreSafe(store);
            if(ok && e && v!==null) e.ver=v;
            return ok;
        }
        function tplEditErr(msg){ const el=$('tplEditErr'); el.textContent=msg; el.style.display='block'; }
        $('tplEditSave').addEventListener('click', ()=>{
            if(!tplEditCat) return tplEditErr('选一个分类');
            if(!tplEditType) return tplEditErr('选支出还是收入');
            const name=$('tplEditName').value.trim();
            if(charLen(name)>TPL_NAME_MAX) return tplEditErr(`名字最多 ${TPL_NAME_MAX} 个字`);
            const mv=$('tplEditMoney').value.trim(); let money=null;
            if(mv!==''){ const m=normMoney(mv); if(!m.ok) return tplEditErr('固定金额：'+m.why); money=m.val; }
            const t={ id:tplEditId || genId(), type:tplEditType, cat:tplEditCat, remark:$('tplEditRemark').value.trim().slice(0,5000), money, mode:getModeChips($('tplEditMode')) };
            if(name) t.name=name;
            const store=loadStore(); const a=curArchive(store);
            const arr=Array.isArray(a.tpls) ? a.tpls.slice() : [];
            if(arr.some(o=>o.id!==t.id && tplSame(o, t))) return tplEditErr('已经有一个一样的模板了');
            const i=arr.findIndex(o=>o.id===t.id);
            if(i>=0) arr[i]=t; else { if(arr.length>=TPL_MAX) return tplEditErr(`常用模板最多 ${TPL_MAX} 个`); arr.push(t); }
            a.tpls=arr;
            if(!saveTplStore(store)) return;
            closeTplEditor();
            renderTplChips();
            openTplManager();
        });
        $('tplEditCancel').addEventListener('click', closeTplEditor);
        $('tplEditDelete').addEventListener('click', ()=>{
            const id=tplEditId; if(!id) return;
            const t=getTpls().find(x=>x.id===id);
            customConfirm(`删除模板「${t ? tplName(t) : ''}」。记过的账不受影响。`, ()=>{
                const store=loadStore(); const a=curArchive(store);
                a.tpls=(Array.isArray(a.tpls) ? a.tpls : []).filter(x=>x.id!==id);
                if(!saveTplStore(store)) return;
                closeTplEditor(); renderTplChips(); openTplManager();
            }, '删除模板', { danger:true, okText:'删除这个模板' });
        });
        $('tplEditMoney').addEventListener('input', ()=>{ const el=$('tplEditMoney'), v=sanitizeMoney(el.value); if(v!==el.value) el.value=v; });
        function openAddModal(opt){
            resetBillForm();
            // 1023-C：账单页「补一笔」：日期设成那天（钟点照现在）
            if(opt && /^\d{4}-\d{2}-\d{2}$/.test(opt.day||'')){ const n=new Date(); setDtInput(billTime, `${opt.day}T${pad(n.getHours())}:${pad(n.getMinutes())}`); }
            // 1023-D：详情里「再记一笔」：收支、分类、统计、备注照这一笔填好，金额空着、时间是现在（照模板那一套填）
            if(opt && opt.from) applyTpl({ type:opt.from.type, cat:opt.from.cat, mode:recMode(opt.from), remark:opt.from.remark||'', money:null });
            if(opt && opt.opening) billOb=true;
            if(window.__openModalAfterKeyboard){
                // 键盘先出来，弹窗再淡入（消除被键盘顶起的闪动）
                window.__openModalAfterKeyboard(addMask, billMoney);
            } else {
                // 不支持 visualViewport 的环境：保持原行为
                addMask.style.display='flex';
                setTimeout(()=>billMoney.focus(), 60);
            }
        }
        $('fabAdd').addEventListener('click', ()=>openAddModal());
        $('closeAdd').addEventListener('click', ()=>{ addMask.style.display='none'; });

        addBill.addEventListener('click', () => {
            const time=getDtInput(billTime), money=billMoney.value;
            // 分类/收支一律以 chips 的选中状态(billCatSel/billTypeSel)为准，不读隐藏 select 的 value。
            // 原因：<select> 没有空 option 时，赋 '' 是无效操作，value 会保持在第一个 option 上，
            // 导致「未选分类」被误判为「已选第一个分类」，必选校验形同虚设、静默入账。
            const cat=billCatSel, remark=billRemark.value.trim();
            const type=billTypeSel;
            // ===== 保底机制：点「添加记录」时若有项没填，弹窗就地补这一项 =====
            // 正常从上往下填完根本走不到这里；漏填时按顺序找第一个缺的项，
            // 弹对应控件让用户当场补：金额→输入框，分类/收支→可点选标签。
            // 补完写回原表单，再自动重新触发本提交，接着检查下一个缺项，直到补齐入账。
            // 用户在补全弹窗点「取消」则中止，原表单保持打开、已填内容不丢。
            if(!time){
                customAlert('先选一下记账时间吧～');   // 时间靠日期选择器选，这里只提示
                billTime.focus();
                return;
            }
            // 金额：空、或已填但格式不对（字母/0/负数等），都走同一个补全弹窗。
            // 补全框自带就地校验，填错会当场提示、不会入账；合法填入后接力检查后续项。
            if(money==='' || !normMoney(money).ok){
                billMoney.value='';   // 清掉非法值，避免补全框带进上次的错值
                customPrompt('', '', (v)=>{
                    billMoney.value=v.trim();
                    addBill.click();                 // 写回后重新提交，继续检查后续项
                }, '金额',
                   (v)=>{ const t=normMoney(v.trim()); return t.ok ? '' : t.why; },  // 就地校验金额
                   { inputmode:'decimal' });
                return;
            }
            const m = normMoney(money);
            if(!cat){
                // 1020-G：没选分类：弹分类抽屉补上，选好接着保存
                window.JiwenSheet.cats({ type, value:'', recent:recentOf.bill, onPick:(v)=>{ pickBillCat(v); addBill.click(); } });
                return;
            }
            if(!type){
                const opts=[ {value:'expense', label:'支出', cls:'sel-out'},
                             {value:'income',  label:'收入', cls:'sel-in'} ];
                customChoose('', opts, (v)=>{
                    billTypeSel=v; billType.value=v;
                    const box=$('billTypeChips');
                    box.querySelectorAll('.cc').forEach(el=>el.classList.remove('sel-out','sel-in'));
                    box.querySelectorAll('.cc').forEach(el=>{
                        if((el.textContent==='支出'&&v==='expense')||(el.textContent==='收入'&&v==='income'))
                            el.classList.add(v==='expense'?'sel-out':'sel-in');
                    });
                    addBill.click();
                }, '收支');
                return;
            }
            const data=getUserData();
            const newId=genId();
            const newRec={ id:newId, time, money:m.val, cat, remark, type };
            setRecMode(newRec, getModeChips($('billMode')));
            if(billOb && recMode(newRec)==='flow') newRec.ob=1;   // 1023-P
            data.push(newRec);
            // 保存失败（如存储配额满）时 saveUserData 已弹出失败提示，这里必须提前返回：
            // 否则会继续弹「记账成功」，造成「提示成功但实际没存上」的丢账假象。
            if(!saveUserData(data)) return;
            JiwenBase.curPage = 1;            // 新记录在最前，回到第 1 页才看得到
            window.JiwenTabs.refreshAllViews();
            // 1025-UX：关掉记账弹窗，底部浮一条小条「已记下 吃饭 12.00」+「再记一笔」（没写备注再加「补备注」），4 秒自己收；
            //   原来弹「记账成功，要再记一笔吗？」，每记一笔都要多点一下才回得到账本
            addMask.style.display='none';
            // 这笔落在有预算的分类上（且是计入的支出）：小条第二行带一句当月预算情况
            let bHint='';
            const bLimit=getBudgets()[cat];
            if(bLimit>0 && newRec.type==='expense' && recMode(newRec)==='normal'){
                const tt=parseRecTime(time);
                const spentNow=budgetSpentIn(data, cat, tt.getFullYear(), tt.getMonth());
                bHint=`${tt.getMonth()+1}月「${cat}」预算：${budgetPhrase(spentNow, bLimit)}`;
            }
            const acts=[];
            if(!remark) acts.push({ id:'snackRemark', text:'补备注', onClick:()=>addRemarkToRecord(newId) });
            acts.push({ id:'snackAgain', text:'再记一笔', primary:true, onClick:()=>openAddModal() });   // 重新打开，且为全新空白表单（不带上次数据）
            window.JiwenPanel.snack({ text:`已记下 ${cat} ${type==='income' ? '+' : ''}${m.val.toFixed(2)}`, sub:bHint, actions:acts });
            flashRow(newId);
        });
        // 1025-UX：改好一笔也告诉一声：底部小条「已改好 吃饭 12.00」（没有按钮），那一行闪一下
        function savedSnack(what, r, id){
            window.JiwenPanel.snack({ text:`${what} ${isRefund(r) ? '退款' : (r.cat||'未分类')} ${r.type==='income' && !isRefund(r) ? '+' : ''}${safeNum(r.money).toFixed(2)}` });
            flashRow(id);
        }
        // 1025-UX：记完一笔，账单页里新记的那一行闪一下（看得出记到哪了）；不在屏幕上就不滚，免得打断
        function flashRow(id){
            requestAnimationFrame(()=>{
                const row=[...document.querySelectorAll('#billList .bl-row[data-id]')].find(r=>r.dataset.id===id);
                if(!row) return;
                row.classList.remove('row-flash'); void row.offsetWidth; row.classList.add('row-flash');
                setTimeout(()=>row.classList.remove('row-flash'), 1300);
            });
        }

        // 给某条记录补备注（用于「记账成功」弹窗的「添加备注」按钮）。
        // 弹输入框拿到内容后按 id 找回那条记录写回、保存、刷新。
        // 用户点取消（返回 null）则不动数据。记完已是最新存档，直接操作当前数据即可。
        function addRemarkToRecord(id){
            customPrompt('', '', (v)=>{
                const text=(v||'').trim();
                if(!text) return;                 // 空内容不写（理论上 prompt 已拦空，双保险）
                const data=getUserData();
                const i=data.findIndex(r=>r.id===id);
                if(i<0) return;                   // 记录意外不存在则放弃
                data[i]=Object.assign({}, data[i], { remark:text.slice(0, 5000) });   // 与记账表单一致的长度上限；换成新对象（1013-G）
                saveUserData(data);               // 写失败时 saveUserData 内部已提示
                window.JiwenTabs.refreshAllViews();
            }, '备注', null, { maxlen:5000 });
        }

        window.viewRemark=function(id){
            const item=getUserData().find(r=>r.id===id);
            if(!item) return;
            customAlert(item.remark || '（无备注）', '备注详情', 'left');
        };

        // ===== 修改弹窗的分类/收支标签（与记账弹窗同款，但打开时预选记录原有值）=====
        let editCatSel='', editTypeSel='';
        // selected: 要预选中的分类；不传或不存在则不选中。1020-G 起照记一笔：4 个最近常用（按这条记录的收支算）+「更多」那一行；
        //   这条记录现在的分类不在 4 个里的，写在「更多」那一行
        function pickEditCat(c){
            const prevCat=editCatSel;
            editCatSel=c; editCat.value=c;
            paintCatRow('edit', c);
            autoModeOnCat($('editMode'), prevCat, c);
        }
        function renderEditCatChips(selected, type){
            const cats=getCats();
            // 隐藏 select 需含每个分类的 option，否则 editCat.value=c 不生效
            fillSelect(editCat, cats, null);
            editCatSel = (selected && cats.includes(selected)) ? selected : '';
            editCat.value=editCatSel;
            renderRecentChips('edit', type || editTypeSel, pickEditCat);
            paintCatRow('edit', editCatSel);
        }
        function renderEditTypeChips(selected){
            editTypeSel = (selected==='expense'||selected==='income') ? selected : '';
            editType.value=editTypeSel;
            const box=$('editTypeChips');
            box.innerHTML='';
            const opts=[ {v:'expense', t:'支出', cls:'sel-out'},
                         {v:'income',  t:'收入', cls:'sel-in'} ];
            opts.forEach(o=>{
                const b=document.createElement('div');
                b.className='cc'+(o.v===editTypeSel?' '+o.cls:'');
                { const sp=document.createElement('span'); sp.className='cc-t'; sp.textContent=o.t; b.appendChild(sp); }   // 1020-H：字包一层，好按字形裁掉上下留白居中
                b.setAttribute('role','radio');
                b.onclick=()=>{
                    const changed=editTypeSel!==o.v;
                    editTypeSel=o.v; editType.value=o.v;
                    box.querySelectorAll('.cc').forEach(el=>el.classList.remove('sel-out','sel-in'));
                    b.classList.add(o.cls);
                    if(changed) renderEditCatChips(editCatSel, o.v);
                };
                box.appendChild(b);
            });
        }

        let editId=null;
        window.openEdit=function(id, opts){
            opts=opts||{};
            editId=id;
            const item=getUserData().find(r=>r.id===id);
            if(!item){ customAlert('未找到该记录'); return; }
            // 从详情进入时提一层（z-index 1030），保证盖过任何可能还开着的内容层。
            // 确认记录存在、确实要显示后再加，避免上面早退(记录不存在)时类残留。
            editMask.classList.toggle('over-detail', !!opts.fromDetail);
            setDtInput(editTime, item.time); editMoney.value=item.money; editRemark.value=item.remark||'';
            // 预选记录原有的分类与收支（标签式）
            renderEditTypeChips(item.type||'income');
            renderEditCatChips(item.cat||'未分类', item.type||'income');
            setModeChips($('editMode'), recMode(item));
            syncRecRows();
            paintEditRefund(item);
            editMask.style.display='flex';
        };
        // 修改弹窗里与退款相关的显示（1010-J）
        //   退款记录：分类 / 收支 / 口径三栏隐藏（跟着原账单走），顶部写明原账单；不能退款、不能存为常用
        //   支出：显示「退款」按钮（已退完则置灰）；有退款时顶部列出
        //   普通收入：没有退款按钮
        function paintEditRefund(item){
            const data=getUserData();
            const rf=isRefund(item);
            editMask.classList.toggle('is-refund', rf);
            const note=$('editRefundNote');
            if(rf){
                const o=data.find(r=>r.id===item.refundOf);
                note.innerHTML=`<b>这是一笔退款</b>，分类「${escapeHtml(item.cat||'未分类')}」和统计跟着原账单走。`
                    + (o ? `<br>原账单：${String(o.time).replace('T',' ')} · ${escapeHtml((o.remark||'').trim()||o.cat)} · −${safeNum(o.money).toFixed(2)}`
                         + `，还能退 ${round2(safeNum(o.money)-refundedTotal(data,o.id,item.id)).toFixed(2)}（含这笔）` : '');
                note.style.display='';
            } else if(item.type==='expense' && refundsOf(data,item.id).length){
                const dn=refundedTotal(data,item.id), rm=round2(safeNum(item.money)-dn);
                const rs=refundsOf(data,item.id).sort((a,b)=>a.time<b.time?-1:1);
                note.innerHTML=`<b>${rm<=0?'已全额退款':`已退 ${dn.toFixed(2)}，还能退 ${rm.toFixed(2)}`}</b>`
                    + `<div class="detail-refund">${rs.map(r=>refundLineHtml(r,1)).join('')}</div>`;
                note.style.display='';
            } else { note.innerHTML=''; note.style.display='none'; }
            $('editSaveTpl').style.display = rf ? 'none' : '';   // 1023-D：「退款」挪到账单详情里（「这笔要退款」那一行小字）
        }
        // 修改弹窗的唯一退出口。所有关闭路径（保存 / 取消 / 删除 / 记录已不存在）都走这里，
        // 保证复位动作只写一遍、不会漏。
        //
        // 【为什么要收口】此前四个出口各自手写复位，已经出现不一致：saveEdit 成功分支
        //   调了 afterEditClosed() 却没清 editId，而其余三处都清了。当下无害（openEdit 每次都会
        //   重新赋值），但这类「加一条新路径就得记得在 N 处补复位」的结构，漏一个就是幽灵状态
        //   ——不崩不报错，只是某次点击后层级错了、或高光留在了错的行上，极难复现。
        //
        // opts.refresh  为真则刷新账单/统计视图（保存、删除后需要；单纯取消不需要）
        function closeEditModal(opts){
            opts=opts||{};
            // —— 复位全部相关状态（一处写全，别处不再各自维护）——
            editMask.style.display='none';
            editMask.classList.remove('over-detail');   // 复位层级，不影响下次普通调用
            editId=null;
            if(opts.refresh) window.JiwenTabs.refreshAllViews();
        }

        cancelEdit.addEventListener('click', ()=>closeEditModal());
        $('deleteInEdit').addEventListener('click', ()=>{
            const id=editId;
            if(id==null) return;
            const cur=getUserData();
            const me=cur.find(r=>r.id===id);
            const rs=me && me.type==='expense' ? refundsOf(cur, id) : [];
            // 删原账单：挂在上面的退款一起删，确认框里列出来（1010-J）
            // 1017-T：底部面板里写清删的是哪一笔、会连带什么；按钮写「删除这条记录」，警示色
            const what = me ? `${String(me.time||'').replace('T',' ')} · ${me.cat||'未分类'} · ${safeNum(me.money).toFixed(2)}${me.remark ? ' · '+String(me.remark).split('\n')[0].slice(0, 20) : ''}` : '';
            const msg = (me && isRefund(me)) ? `${what}\n\n删除这笔退款以后，原账单的「还能退」金额会恢复。删掉的找不回来（除非用备份恢复）。`
                : (rs.length ? `${what}\n\n这笔账单有 ${rs.length} 笔退款（共 ${refundedTotal(cur,id).toFixed(2)}），会跟它一起删除。删掉的找不回来（除非用备份恢复）。` : `${what}\n\n删掉的找不回来（除非用备份恢复）。`);
            const okText = (me && isRefund(me)) ? '删除这笔退款' : (rs.length ? `删除这条和 ${rs.length} 笔退款` : '删除这条记录');
            // 导入简化 4b：导入的（或已和账单对过账的）记录：分「只删这条」「删掉，以后也不导入」，另给「改成不计」「撤销整批导入」（开发开关开着才有）
            const iapp=me && !isRefund(me) && me.src && EDIT_WARN_APP[me.src.app];
            let dev=false; try{ dev=localStorage.getItem('app_dev_import')==='1'; }catch(_){}
            if(iapp && dev){
                const opts=[
                    { value:'one', label:'只删这条', desc:`下次导入这段时间的${iapp}账单，这笔会再导进来` },
                    { value:'forget', label:'删掉，以后也不导入', desc:`单号表里记成「不要了」，以后再导同一段${iapp}账单也跳过它` },
                    { value:'skip', label:'改成不计', desc:'记录留着，哪里都不算（信用卡还款、重复记录这类）' },
                ];
                if(me.batch) opts.push({ value:'undo', label:'撤销整批导入', desc:'这一次导入的全部撤掉（先确认，能看清会动哪些）' });
                customChoose(`${what}\n\n${me.src.merged ? `这笔已经和${iapp}账单对过账。` : `这笔是${iapp}账单导入的。`}${rs.length ? `挂着 ${rs.length} 笔退款，删的话一起删。` : ''}`, opts, act=>{
                    if(act==='one'){
                        const data=getUserData().filter(r=>r.id!==id && !(isRefund(r) && r.refundOf===id));
                        if(!saveUserData(data, true)){ customAlert('删除未能保存，这条记录仍然存在，请稍后重试。', '删除失败'); return; }
                        closeEditModal({ refresh:true });
                    } else if(act==='forget'){
                        window.JiwenImportStore.forgetRecord(id).then(()=>closeEditModal({ refresh:true }), e=>customAlert('没删成：' + (e && (e.code || e.message) || e) + '。账本没有动。', '删除失败'));
                    } else if(act==='skip'){
                        const data=getUserData(), i=data.findIndex(r=>r.id===id); if(i<0) return;
                        const n=Object.assign({}, data[i]); setRecMode(n, 'skip'); if(n.ob) delete n.ob; data[i]=n; syncRefunds(data, n);
                        if(!saveUserData(data)) return;
                        closeEditModal({ refresh:true });
                    } else if(act==='undo'){
                        closeEditModal();
                        loadImportUI().then(ui=>ui.undoFromLedger(me.batch)).catch(e=>customAlert('导入模块没加载上：' + (e && e.message || e), '撤销导入'));
                    }
                }, '删除导入的记录', null, { layout:'list' });
                return;
            }
            customConfirm(msg, ()=>{
                const data=getUserData().filter(r=>r.id!==id && !(isRefund(r) && r.refundOf===id));
                // 删除写盘失败时记录其实仍在。这里用 silent 保存：抑制通用提示，只弹一条
                // 对症的、保持弹窗打开不刷新，避免同一次失败连弹两个弹窗、也避免用户误以为已删除。
                if(!saveUserData(data, true)){
                    customAlert('删除未能保存，这条记录仍然存在，请稍后重试。', '删除失败');
                    return;
                }
                closeEditModal({ refresh:true });
            }, '删除记录', { danger:true, okText });
        });
        // 禁止点击遮罩外部关闭，仅按钮可关闭
        // 导入简化 4a：改导入的（或已和账单对过账的）记录的金额 / 时间：先提醒一句「改了以后和账单对不上」，可以继续；能勾「以后不再提醒」
        //   （只在这台手机上记住，localStorage 的 app_imp_edit_warn_off）。改分类、备注不提醒。开发开关开着才有
        const IMP_EDIT_WARN_OFF='app_imp_edit_warn_off', EDIT_WARN_APP={ wechat:'微信', alipay:'支付宝' };
        function impEditWarn(old, time, money){
            const s=old && old.src; if(!s || typeof s!=='object' || !EDIT_WARN_APP[s.app]) return '';
            try{ if(localStorage.getItem('app_dev_import')!=='1' || localStorage.getItem(IMP_EDIT_WARN_OFF)==='1') return ''; }catch(_){ return ''; }
            const moneyChg=round2(safeNum(old.money))!==round2(money), timeChg=String(old.time||'')!==String(time||'');
            if(!moneyChg && !timeChg) return '';
            const what=moneyChg && timeChg ? '金额和时间' : moneyChg ? '金额' : '时间', app=EDIT_WARN_APP[s.app];
            return (s.merged ? `这笔已经和${app}账单对过账` : `这笔是${app}账单导入的`) + `，改了${what}以后和账单对不上（下次导入同一段账单时不会再导一遍，但核对会差这一笔）。\n\n确定要改吗？`;
        }
        // 导入简化第 5 版（原方案三-3）：改了导入的记录的分类，问一句「以后「某某」的都记成「X」吗？」：选了存一条分类规则（importRules.cat，
        //   同一个关键词已有的改掉），以后导入直接照办；「只改这一条」什么都不存。关键词先用对方名（名单里的原文，最多 32 字）。开发开关开着才问
        function askCatRule(rec, cat, done){
            done=done||(()=>{});
            const S=window.JiwenImportStore;
            let dev=false; try{ dev=localStorage.getItem('app_dev_import')==='1'; }catch(_){}
            if(!dev || !S || !S.archiveInfo || !rec || !rec.src || isRefund(rec) || !Number.isInteger(rec.cp) || !cat || cat==='未分类'){ done(); return; }
            let info; try{ info=S.archiveInfo(); }catch(_){ done(); return; }
            const kw=String((info.cps||[])[rec.cp]||'').trim().slice(0, 32);
            if(kw.length<2 || (info.catRules||[]).some(r=>r.kw===kw && r.cat===cat)){ done(); return; }
            customConfirm(`以后「${kw}」的账单都记成「${cat}」吗？\n\n选了以后，导入时直接照这个分类（在「管理导入规则」里能改、能删）。`, ()=>{
                const rules={ cat:(info.catRules||[]).filter(r=>r.kw!==kw).concat([{ kw, cat }]), type:info.typeRules||[], map:info.catMaps||[], big:info.bigRules||[], sum:info.sumRules||[] };
                S.rulesSave(rules).then(()=>done(), ()=>done());
            }, '以后也这么记？', { okText:'以后都这样记', cancelText:'只改这一条', onCancel:done });
        }
        saveEdit.addEventListener('click', () => doSaveEdit(false));
        function doSaveEdit(force){
            const time=getDtInput(editTime), money=editMoney.value;
            // 与记账弹窗同理：以 chips 选中态为准，避免隐藏 select 无空 option 时
            // 「未选」被误读成「已选第一项」。
            const cat=editCatSel, remark=editRemark.value.trim();
            const type=editTypeSel;
            if(!time || money===''){ customAlert('时间和金额不能为空！'); return; }
            if(!cat){ customAlert('请选择一个分类～'); return; }
            if(!type){ customAlert('请选择收支（支出或收入）～'); return; }
            const m = normMoney(money);
            if(!m.ok){ customAlert(m.why); return; }
            const data=getUserData();
            const idx=data.findIndex(r=>r.id===editId);
            if(idx>=0 && !force){
                const w=impEditWarn(data[idx], time, m.val);
                if(w){
                    customConfirm(w, ()=>doSaveEdit(true), '改了导入的记录', { okText:'继续保存',
                        extra:{ text:'继续保存，以后不再提醒', onClick:()=>{ try{ localStorage.setItem(IMP_EDIT_WARN_OFF, '1'); }catch(_){} doSaveEdit(true); } } });
                    return;
                }
            }
            if(idx>=0){
                const old=data[idx];
                let next;
                if(isRefund(old)){
                    // 退款记录：只改时间、金额、备注；分类 / 收支 / 口径保持跟原账单一致
                    const o=data.find(r=>r.id===old.refundOf);
                    if(o){
                        const max=round2(safeNum(o.money)-refundedTotal(data, o.id, old.id));
                        if(m.val>max){ customAlert(`这笔退款最多 ${max.toFixed(2)}（原账单 ${safeNum(o.money).toFixed(2)}，其他退款已退 ${refundedTotal(data,o.id,old.id).toFixed(2)}）。`); return; }
                        if(time<o.time){ customAlert(`退款时间不能早于原账单（${o.time.replace('T',' ')}）。`); return; }
                    }
                    next=Object.assign({}, old, { time, money:m.val, remark });
                    data[idx]=next;
                    if(!saveUserData(data)) return;
                    const rid=editId;
                    closeEditModal({ refresh:true });
                    savedSnack('已改好', next, rid);
                    return;
                }
                const done=refundedTotal(data, editId);
                if(done>0 && type!=='expense'){ customAlert(`这笔已经有 ${done.toFixed(2)} 的退款，不能改成收入。\n要改的话，先把它的退款记录删掉。`); return; }
                if(done>0 && m.val<done){ customAlert(`这笔已经退了 ${done.toFixed(2)}，金额不能改得比这还少。`); return; }
                if(done>0){
                    const late=refundsOf(data, editId).find(r=>r.time<time);
                    if(late){ customAlert(`有一笔退款在 ${late.time.replace('T',' ')}，原账单的时间不能晚于它。`); return; }
                }
                // 在原记录上合并，而不是整条重建：重建会把表单里没有的字段（skip，以及以后的新字段）悄悄丢掉
                next=Object.assign({}, old, { id:editId, time, money:m.val, cat, remark, type });
                if(next.rv && cat!==(old.cat||'未分类')) delete next.rv;   // 1021-T13：改了分类就不用再确认
                setRecMode(next, getModeChips($('editMode')));
                if(next.ob && recMode(next)!=='flow') delete next.ob;   // 1023-P：改成不是往来了，期初余额的标记也去掉
                data[idx]=next;
                syncRefunds(data, next);           // 分类 / 口径变了，退款跟着改
                // 保存失败时 saveUserData 已弹失败提示；提前返回，保持弹窗打开、不刷新，
                // 避免「提示失败但弹窗已关、看似已保存」的不一致。
                if(!saveUserData(data)) return;
                closeEditModal({ refresh:true });
                savedSnack('已改好', next, next.id);
                if(cat!==(old.cat||'未分类')) askCatRule(next, cat);   // 第 5 版：改了导入的记录的分类，问以后要不要也这么记
            } else {
                // 找不到原记录（例如保存前存档被切换/记录已被删）：先复位关闭，再明确提示。
                closeEditModal({ refresh:true });
                customAlert('未找到要保存的记录，可能已被删除或切换了存档。');
            }
        }
        // 一笔关联记录的一行：时间 / 备注 / 金额（详情与修改弹窗共用）
        function refundLineHtml(r, sign){
            return `<div class="dr-line"><span class="dr-when">${String(r.time).slice(5,16).replace('T',' ')}</span>`
                + `<span class="dr-what">${escapeHtml((r.remark||'').trim()||r.cat||'未分类')}</span>`
                + `<span class="dr-amt ${sign>0?'pos':'neg'}">${sign>0?'+':'−'}${safeNum(r.money).toFixed(2)}</span></div>`;
        }
        const formSnaps={};
        // 表单现在的样子：输入框、日期、选中的标签、开关（打开时记一份，关的时候比一比）
        function formState(id){
            const m=$(id); if(!m) return '';
            const parts=[];
            m.querySelectorAll('input,textarea,select').forEach(e=>parts.push(e.value));
            m.querySelectorAll('.dt-input').forEach(e=>parts.push(e.dataset.day||'', e.dataset.value||'', e.value||'', e.textContent));
            m.querySelectorAll('.cc, .day-switch').forEach(e=>parts.push(e.className));
            return JSON.stringify(parts);
        }
        window.JiwenForms = { askCatRule, get billCatSel(){ return billCatSel; }, get billTypeSel(){ return billTypeSel; }, closeEditModal, closeRefund, closeTplEditor, get editCatSel(){ return editCatSel; }, get editId(){ return editId; }, get editTypeSel(){ return editTypeSel; }, formSnaps, formState, getModeChips, openAddModal, openRefund, refreshBillCatChipsIfOpen, refreshEditCatChipsIfOpen, refundLineHtml, renderEditCatChips, renderEditTypeChips, resetBillForm, setModeChips, pickBillCat, pickEditCat, syncRecRows, openCatDrawer, openModeSheet };   // forms 模块对外只有这一个入口（get / set 的是会变的变量，读写的时候才去取）
})();
