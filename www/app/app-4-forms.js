        // ===== 悬浮按钮：打开/关闭记账弹窗 =====
        const addMask=$('addMask');

        // 渲染记账弹窗的分类标签：按存档里 cats 的固定顺序显示（顺序由「管理分类」页拖动决定）
        // 不默认选中任何分类——分类为必选项，由用户主动点选
        let billCatSel='';
        function renderBillCatChips(){
            const cats=getCats();
            billCatSel='';               // 每次渲染都重置为「未选」
            billCat.value='';
            const box=$('billCatChips');
            box.innerHTML='';
            cats.forEach(c=>{
                const b=document.createElement('div');
                b.className='cc';
                b.textContent=c;
                b.onclick=()=>{
                    const prevCat=billCatSel;
                    billCatSel=c; billCat.value=c;
                    box.querySelectorAll('.cc').forEach(el=>el.classList.toggle('sel', el===b));
                    autoModeOnCat($('billMode'), prevCat, c);
                };
                box.appendChild(b);
            });
        }

        // 分类增删改/排序后调用：若记账弹窗正开着，重渲染标签使其立即反映最新分类。
        // 尽量保留用户当前已选的分类（若它还存在）。
        function refreshBillCatChipsIfOpen(){
            if($('addMask').style.display!=='flex') return;
            renderTplChips();
            const keep=billCatSel;
            renderBillCatChips();
            if(keep && getCats().includes(keep)){
                billCatSel=keep; billCat.value=keep;
                $('billCatChips').querySelectorAll('.cc').forEach(el=>{
                    el.classList.toggle('sel', el.textContent===keep);
                });
            }
        }

        // 修改账单弹窗若正开着，分类增删改/排序后同步重渲染其 chips，
        // 尽量保留当前已选分类（若它仍存在）。与记账弹窗的同步逻辑对称，补齐此前遗漏。
        function refreshEditCatChipsIfOpen(){
            if($('editMask').style.display!=='flex') return;
            const keep=editCatSel;
            renderEditCatChips(getCats().includes(keep) ? keep : '');
        }

        // 渲染收支标签：支出/收入，必选、不默认选中。选中态用语义色（支出红/收入绿）
        let billTypeSel='';
        function renderBillTypeChips(){
            billTypeSel='';
            billType.value='';
            const box=$('billTypeChips');
            box.innerHTML='';
            const opts=[ {v:'expense', t:'支出', cls:'sel-out'},
                         {v:'income',  t:'收入', cls:'sel-in'} ];
            opts.forEach(o=>{
                const b=document.createElement('div');
                b.className='cc';
                b.textContent=o.t;
                b.onclick=()=>{
                    billTypeSel=o.v; billType.value=o.v;
                    box.querySelectorAll('.cc').forEach(el=>{
                        el.classList.remove('sel-out','sel-in');
                    });
                    b.classList.add(o.cls);
                };
                box.appendChild(b);
            });
        }

        // ===== 统计口径选择：计入 / 只算结余 / 不计入 =====
        // 选「转账」分类时自动切到「不计入」——只在**切换到**转账的那一下、且当前还是「计入」时触发。
        // 自动切的会打 data-auto 标记：切走到别的分类时恢复「计入」，免得一笔餐饮被悄悄带成不计入。
        // 用户手动点过就清掉标记，之后完全听用户的。
        const SKIP_DEFAULT_CATS=['转账'];
        const MODE_OPTS=[ {v:'normal', t:'计入'}, {v:'flow', t:'只算结余'}, {v:'skip', t:'不计入'} ];
        function paintModeChips(box){
            const cur=box.dataset.mode||'normal';
            box.querySelectorAll('.cc').forEach(el=>el.classList.toggle('sel', el.dataset.v===cur));
            const hint=$(box.id+'Hint'); if(hint){ hint.textContent=MODE_HINT[cur]; if(box.classList.contains('mode-mini')) hint.style.display = cur==='normal' ? 'none' : ''; }   // 1019-Z：一行小按钮的，计入时不写说明
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
            MODE_OPTS.forEach(o=>{
                const b=document.createElement('div');
                b.className='cc'; b.textContent=o.t; b.dataset.v=o.v;
                b.onclick=()=>{ box.dataset.mode=o.v; delete box.dataset.auto; paintModeChips(box); };
                box.appendChild(b);
            });
            setModeChips(box, 'normal');
        });

        // 把记账表单恢复到「空白初始态」：空金额/空备注、不选收支、不选分类、时间为此刻
        function resetBillForm(){
            billMoney.value='';
            billRemark.value='';
            setModeChips($('billMode'), 'normal');
            renderBillTypeChips();
            renderBillCatChips();
            renderTplChips();
            setDtInput(billTime, nowDtValue());
        }
        function getTpls(){
            const a=curArchive(loadStore());
            return (a && Array.isArray(a.tpls)) ? a.tpls : [];
        }
        function renderTplChips(){
            const field=$('billTplField'), box=$('billTplChips');
            if(!field || !box) return;
            const cats=getCats();
            const list=getTpls();
            box.innerHTML='';
            field.style.display = list.length ? '' : 'none';
            list.forEach(t=>{
                const b=document.createElement('div');
                b.className='cc';
                b.dataset.tpl=t.id;
                const nm=document.createElement('span'); nm.textContent=tplName(t);
                b.appendChild(nm);
                if(t.money!=null){
                    const am=document.createElement('span'); am.className='tpl-amt'; am.textContent=safeNum(t.money).toFixed(2).replace(/\.00$/,'');
                    b.appendChild(am);
                }
                b.onclick=()=>{
                    applyTpl(t, cats);
                    box.querySelectorAll('.cc').forEach(el=>el.classList.toggle('sel', el===b));
                    // 【1013-E】带金额的模板点完表单就填全了，直接把弹窗滚到「添加记录」。
                    //   不带金额的还得填金额，留在原处（applyTpl 已聚焦金额框）。
                    if(t.money!=null) revealAddBtn();
                };
                box.appendChild(b);
            });
        }
        // 把「记一笔」弹窗自己往下滚，露出「添加记录」按钮（只滚弹窗，不动整个页面）。
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
            if((cats||getCats()).includes(t.cat)){
                const c=[...$('billCatChips').querySelectorAll('.cc')].find(el=>el.textContent===t.cat);
                if(c) c.click();
            }
            // 分类点击可能触发「转账 → 自动不计入」，模板里存的口径优先，放在分类之后设
            setModeChips($('billMode'), t.mode||'normal');
            billRemark.value=t.remark||'';
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
            if(kind==='all'){
                inp.value=rem.toFixed(2); inp.readOnly=true; inp.classList.add('ro');
                try{ inp.blur(); }catch(_){}
            } else {
                inp.value=''; inp.readOnly=false; inp.classList.remove('ro');
                inp.placeholder=`最多 ${rem.toFixed(2)}`;
                try{ inp.focus(); }catch(_){}
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
            $('refundRemark').value='';
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
            refreshAllViews();
            const left=round2(rem-amt);
            customAlert(left>0 ? `已退款 ${amt.toFixed(2)}，这笔还能再退 ${left.toFixed(2)}。` : `已退款 ${amt.toFixed(2)}，这笔已全额退款。`, '退款完成');
        });
        // 修改弹窗里点「退款」：有没保存的改动先问一句，避免悄悄丢掉
        $('editRefundBtn').addEventListener('click', ()=>{
            const id=editId; if(id==null) return;
            const item=getUserData().find(r=>r.id===id); if(!item) return;
            const dirty = getDtInput(editTime)!==item.time || normMoney(editMoney.value).val!==round2(safeNum(item.money))
                || editRemark.value.trim()!==(item.remark||'') || editCatSel!==(item.cat||'未分类')
                || editTypeSel!==item.type || getModeChips($('editMode'))!==recMode(item);
            const go=()=>{ closeEditModal(); openRefund(id); };
            if(dirty) customConfirm('这笔账单的修改还没保存。去退款的话，这些修改都不要了。', go, '去退款', { okText:'放弃修改去退款', danger:true, cancelText:'回去接着改' });
            else go();
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
            const MODE_TXT={ flow:' · 只算结余', skip:' · 不计入' };
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
        function tplEditChips(){
            const cb=$('tplEditCats'); cb.innerHTML='';
            getCats().forEach(c=>{ const b=document.createElement('div'); b.className='cc'+(c===tplEditCat?' sel':''); b.textContent=c;
                b.onclick=()=>{ const prev=tplEditCat; tplEditCat=c; cb.querySelectorAll('.cc').forEach(x=>x.classList.toggle('sel', x===b)); autoModeOnCat($('tplEditMode'), prev, c); }; cb.appendChild(b); });
            const tb=$('tplEditTypes'); tb.innerHTML='';
            [{v:'expense', t:'支出', cls:'sel-out'}, {v:'income', t:'收入', cls:'sel-in'}].forEach(o=>{ const b=document.createElement('div'); b.className='cc'+(o.v===tplEditType?' '+o.cls:''); b.textContent=o.t;
                b.onclick=()=>{ tplEditType=o.v; tb.querySelectorAll('.cc').forEach(x=>x.classList.remove('sel-out','sel-in')); b.classList.add(o.cls); }; tb.appendChild(b); });
        }
        function openTplEditor(id){
            const t=id ? getTpls().find(x=>x.id===id) : null;
            if(id && !t){ customAlert('这个模板已经不在了。'); openTplManager(); return; }
            tplEditId=t ? t.id : null;
            tplEditCat=t && getCats().includes(t.cat) ? t.cat : '';
            tplEditType=t ? t.type : '';
            $('tplEditTitle').textContent=t ? '编辑模板' : '新建模板';
            $('tplEditName').value=t ? (t.name||'') : '';
            $('tplEditRemark').value=t ? (t.remark||'') : '';
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
        function openAddModal(){
            resetBillForm();
            if(window.__openModalAfterKeyboard){
                // 键盘先出来，弹窗再淡入（消除被键盘顶起的闪动）
                window.__openModalAfterKeyboard(addMask, billMoney);
            } else {
                // 不支持 visualViewport 的环境：保持原行为
                addMask.style.display='flex';
                setTimeout(()=>billMoney.focus(), 60);
            }
        }
        $('fabAdd').addEventListener('click', openAddModal);
        // 1016-T：导入结果页「接下来」的三个去处（import/ui.js 调）：去看统计、去设预算、补一笔期初余额（只算结余的收入）
        window.JiwenImportNext={
            stats(){ const b=document.querySelector('.tab-btn[data-tab="stats"]'); if(b) b.click(); setStatTab('flow'); },
            budget(){ bgSuggestOpen=true; const b=document.querySelector('.tab-btn[data-tab="stats"]'); if(b) b.click(); setStatTab('budget'); },   // 1016-Z9：直接打开预算建议
            opening(){
                const b=document.querySelector('.tab-btn[data-tab="ledger"]'); if(b) b.click();
                openAddModal();
                const inc=[...$('billTypeChips').children].find(x=>x.textContent==='收入'); if(inc) inc.click();
                setModeChips($('billMode'), 'flow');
                billRemark.value='期初余额';
            }
        };
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
                const opts=getCats().map(c=>({ value:c, label:c }));
                customChoose('', opts, (v)=>{
                    billCatSel=v; billCat.value=v;
                    $('billCatChips').querySelectorAll('.cc')
                        .forEach(el=>el.classList.toggle('sel', el.textContent===v));
                    addBill.click();
                }, '分类');
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
            data.push(newRec);
            // 保存失败（如存储配额满）时 saveUserData 已弹出失败提示，这里必须提前返回：
            // 否则会继续弹「记账成功」，造成「提示成功但实际没存上」的丢账假象。
            if(!saveUserData(data)) return;
            curPage = 1;            // 新记录在最前，回到第 1 页才看得到
            refreshAllViews();
            // 关闭记账弹窗，弹出「再记一笔 / 关闭」二选一
            addMask.style.display='none';
            // 这一笔没填备注 → 成功弹窗额外给个「添加备注」按钮，方便当场补；填了则不显示。
            const confirmOpts={ okText:'再记一笔', cancelText:'关闭' };
            if(!remark){
                confirmOpts.extra={ text:'添加备注', onClick:()=>addRemarkToRecord(newId) };
            }
            // 这笔落在有预算的分类上（且是计入的支出）：成功提示里带一句当月预算情况
            let bHint='';
            const bLimit=getBudgets()[cat];
            if(bLimit>0 && newRec.type==='expense' && recMode(newRec)==='normal'){
                const tt=parseRecTime(time);
                const spentNow=budgetSpentIn(data, cat, tt.getFullYear(), tt.getMonth());
                bHint=`${tt.getMonth()+1}月「${cat}」预算：${budgetPhrase(spentNow, bLimit)}\n\n`;
            }
            customConfirm(bHint+'已记下这一笔，要再记一笔吗？', ()=>{
                openAddModal();     // 重新打开，且为全新空白表单（不带上次数据）
            }, '记账成功', confirmOpts);
        });

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
                refreshAllViews();
            }, '备注', null, { maxlen:5000 });
        }

        window.viewRemark=function(id){
            const item=getUserData().find(r=>r.id===id);
            if(!item) return;
            customAlert(item.remark || '（无备注）', '备注详情', 'left');
        };

        // ===== 修改弹窗的分类/收支标签（与记账弹窗同款，但打开时预选记录原有值）=====
        let editCatSel='', editTypeSel='';
        // selected: 要预选中的分类；不传或不存在则不选中
        function renderEditCatChips(selected){
            const cats=getCats();
            // 隐藏 select 需含每个分类的 option，否则 editCat.value=c 不生效
            fillSelect(editCat, cats, null);
            editCatSel = (selected && cats.includes(selected)) ? selected : '';
            editCat.value=editCatSel;
            const box=$('editCatChips');
            box.innerHTML='';
            cats.forEach(c=>{
                const b=document.createElement('div');
                b.className='cc'+(c===editCatSel?' sel':'');
                b.textContent=c;
                b.onclick=()=>{
                    const prevCat=editCatSel;
                    editCatSel=c; editCat.value=c;
                    box.querySelectorAll('.cc').forEach(el=>el.classList.toggle('sel', el===b));
                    autoModeOnCat($('editMode'), prevCat, c);
                };
                box.appendChild(b);
            });
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
                b.textContent=o.t;
                b.onclick=()=>{
                    editTypeSel=o.v; editType.value=o.v;
                    box.querySelectorAll('.cc').forEach(el=>el.classList.remove('sel-out','sel-in'));
                    b.classList.add(o.cls);
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
            renderEditCatChips(item.cat||'未分类');
            renderEditTypeChips(item.type||'income');
            setModeChips($('editMode'), recMode(item));
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
                note.innerHTML=`<b>这是一笔退款</b>，分类「${escapeHtml(item.cat||'未分类')}」和统计口径跟着原账单走。`
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
            const btn=$('editRefundBtn');
            $('editSaveTpl').style.display = rf ? 'none' : '';
            if(item.type!=='expense'){ btn.style.display='none'; return; }
            btn.style.display='';
            const done=refundedTotal(data, item.id);
            const rem=round2(safeNum(item.money)-done);
            btn.disabled = rem<=0;
            btn.textContent = rem<=0 ? '已全额退款' : (done>0 ? `退款（已退 ${done.toFixed(2)}，还能退 ${rem.toFixed(2)}）` : '退款');
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
            if(opts.refresh) refreshAllViews();
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
        saveEdit.addEventListener('click', () => {
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
                    closeEditModal({ refresh:true });
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
                setRecMode(next, getModeChips($('editMode')));
                data[idx]=next;
                syncRefunds(data, next);           // 分类 / 口径变了，退款跟着改
                // 保存失败时 saveUserData 已弹失败提示；提前返回，保持弹窗打开、不刷新，
                // 避免「提示失败但弹窗已关、看似已保存」的不一致。
                if(!saveUserData(data)) return;
                closeEditModal({ refresh:true });
            } else {
                // 找不到原记录（例如保存前存档被切换/记录已被删）：先复位关闭，再明确提示。
                closeEditModal({ refresh:true });
                customAlert('未找到要保存的记录，可能已被删除或切换了存档。');
            }
        });

        // ===== 弹窗打开时锁定背景滚动，防止滚动穿透到主页面 =====
        (function(){
            const masks=Array.from(document.querySelectorAll('.mask'));
            let savedScrollY=0, locked=false;

            function anyMaskOpen(){
                return masks.some(m=>{
                    const d=getComputedStyle(m).display;
                    return d && d!=='none';
                });
            }
            function lock(){
                if(locked) return;
                savedScrollY=window.scrollY || window.pageYOffset || 0;
                document.body.style.position='fixed';
                document.body.style.top=`-${savedScrollY}px`;
                document.body.style.left='0';
                document.body.style.right='0';
                document.body.style.width='100%';
                locked=true;
            }
            function unlock(){
                if(!locked) return;
                document.body.style.position='';
                document.body.style.top='';
                document.body.style.left='';
                document.body.style.right='';
                document.body.style.width='';
                window.scrollTo(0, savedScrollY);
                locked=false;
            }
            function update(){ anyMaskOpen()?lock():unlock(); }

            // 监听每个弹窗的显示状态变化
            masks.forEach(m=>{
                new MutationObserver(update).observe(m, {attributes:true, attributeFilter:['style']});
            });

            // 弹窗内列表（可滚动区域）到顶/到底时，阻止滚动冒泡到背景，进一步防穿透
            document.querySelectorAll('.cat-list, .ask-msg, .edit-dialog, .dt-dialog').forEach(el=>{
                el.addEventListener('touchmove', e=>{ e.stopPropagation(); }, {passive:true});
            });
        })();

        // 页面初始化逻辑见脚本末尾 initApp()（在所有函数与外观主题就绪后执行）

        // ===== 外观：主题色（全局，所有账号共用，存 localStorage）=====
        (function(){
            const DEFAULT_PRIMARY='#3f6f6b';
            // 预设：每套只给一个主色，其余色由算法从主色推导，保证整体协调
            const PRESETS=[
                { name:'雾松青', color:'#3f6f6b' },
                { name:'素墨米', color:'#8a7f66' },
                { name:'黛紫烟', color:'#6b5a82' },
                { name:'宣纸灰', color:'#5f5b54' },
                { name:'赭石红', color:'#a8553f' },
                { name:'黛蓝', color:'#3a5a7a' },
                { name:'橄榄绿', color:'#6b7245' },
                { name:'豆沙粉', color:'#9c5b63' }
            ];

            // —— 颜色工具：hex<->hsl，按亮度派生整套变量 ——
            function hexToRgb(h){ h=h.replace('#',''); if(h.length===3)h=h.split('').map(c=>c+c).join('');
                return { r:parseInt(h.slice(0,2),16), g:parseInt(h.slice(2,4),16), b:parseInt(h.slice(4,6),16) }; }
            function rgbToHex(r,g,b){ const f=v=>Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,'0'); return '#'+f(r)+f(g)+f(b); }
            function rgbToHsl({r,g,b}){ r/=255;g/=255;b/=255; const mx=Math.max(r,g,b),mn=Math.min(r,g,b); let h,s,l=(mx+mn)/2;
                if(mx===mn){h=s=0;}else{const d=mx-mn; s=l>0.5?d/(2-mx-mn):d/(mx+mn);
                    switch(mx){case r:h=(g-b)/d+(g<b?6:0);break;case g:h=(b-r)/d+2;break;default:h=(r-g)/d+4;}h/=6;}
                return { h:h*360, s:s*100, l:l*100 }; }
            function hslToHex(h,s,l){ h=(h%360+360)%360; s=Math.max(0,Math.min(100,s))/100; l=Math.max(0,Math.min(100,l))/100;
                const c=(1-Math.abs(2*l-1))*s, x=c*(1-Math.abs((h/60)%2-1)), m=l-c/2; let r,g,b;
                if(h<60)[r,g,b]=[c,x,0];else if(h<120)[r,g,b]=[x,c,0];else if(h<180)[r,g,b]=[0,c,x];
                else if(h<240)[r,g,b]=[0,x,c];else if(h<300)[r,g,b]=[x,0,c];else[r,g,b]=[c,0,x];
                return rgbToHex((r+m)*255,(g+m)*255,(b+m)*255); }
            // 相对亮度 & 与白色的对比度（用于兜底压暗）
            function _lum(hex){ const {r,g,b}=hexToRgb(hex); const a=[r,g,b].map(v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);}); return 0.2126*a[0]+0.7152*a[1]+0.0722*a[2]; }
            function _whiteContrast(hex){ const l=_lum(hex); return (1.0+0.05)/(l+0.05); }
            function _contrast(a,b){ const l1=_lum(a),l2=_lum(b); return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05); }

            // 从一个主色推导整套主题变量（保证浅底深字、对比足够）
            function buildPalette(primaryHex){
                let { h,s,l } = rgbToHsl(hexToRgb(primaryHex));
                if(s<12) s=12;                       // 太灰会显脏，给个下限
                // 主色亮度收进可读区间：上限 56
                let pL=Math.min(l,56);
                // 关键兜底：黄/青等高亮色相即使压到 56 白字仍可能发虚，
                // 逐步压暗直到「白字 / 主色」对比≥2.4，保证按钮文字任何选色下都看得清
                let primary=hslToHex(h,s,pL);
                let guard=0;
                while(_whiteContrast(primary) < 2.4 && pL > 20 && guard++ < 40){
                    pL -= 2; primary=hslToHex(h,s,pL);
                }
                const primaryMid=hslToHex(h,Math.min(s+4,90),Math.min(pL+6,60));
                // 主色按钮上的文字：黑/白哪个对主色对比更高就用哪个（比单纯按亮度判断更稳）
                const {r,g,b}=hexToRgb(primary);
                const onPrimary = _contrast(primary,'#ffffff') >= _contrast(primary,'#2a2200')
                    ? '#ffffff' : '#2a2200';
                return {
                    '--c-primary':       primary,
                    '--c-primary-mid':   primaryMid,
                    '--c-primary-dark':  hslToHex(h,Math.min(s+6,90),Math.max(pL-14,26)),
                    '--c-primary-deep':  hslToHex(h,Math.min(s+10,92),Math.max(pL-26,20)),
                    '--c-accent':        hslToHex(h,Math.min(s+20,100),Math.min(pL+10,68)),
                    '--c-accent-soft':   hslToHex(h,Math.min(s+8,80),88),
                    // 底栏重点笔画：同色相、提高饱和度。宣纸灰这类低饱和主题，主色和选中深色几乎一样，
                    // 直接用主色这一笔会看不出来；提饱和后变成赭金 / 亮青这类「同族但跳得出来」的颜色。
                    '--c-tab-accent':    hslToHex(h,Math.min(Math.max(s+28,42),60),44),
                    '--c-text':          hslToHex(h,Math.min(s+8,85),28),
                    '--c-text-soft':     hslToHex(h,Math.min(s+4,70),38),
                    '--c-border':        hslToHex(h,Math.min(s,55),78),
                    '--c-border-mid':    hslToHex(h,Math.min(s+4,60),68),
                    '--c-surface':       hslToHex(h,40,98),
                    '--c-surface-2':     hslToHex(h,45,98.5),
                    '--c-bg':            hslToHex(h,42,96),
                    '--c-card-1':        hslToHex(h,55,95),
                    '--c-card-2':        hslToHex(h,62,88),
                    '--c-sheet':         hslToHex(h,60,91.5),   // 1019-T：底部面板底色（卡片两头渐变色的中间）
                    '--c-chip':          hslToHex(h,70,92),
                    '--c-on-primary':    onPrimary,
                    '--c-shadow-rgb':    `${r},${g},${b}`,
                    // 选中态：底色取中浅染（亮度 82，明显深于未选中的 --c-chip≈92），
                    // 纯色块即可清晰区分，无需边框；文字用深主色保证可读。
                    '--c-sel-bg':        hslToHex(h,Math.min(s+14,74),82),
                    '--c-sel-border':    primary,
                    '--c-sel-text':      hslToHex(h,Math.min(s+10,92),Math.max(pL-22,22))
                };
            }
            function applyPrimary(primaryHex){
                const pal=buildPalette(primaryHex);
                const root=document.documentElement;
                Object.keys(pal).forEach(k=>root.style.setProperty(k, pal[k]));
                // 同步「键盘弹起兜底底色」：把当前主题背景钉到 html inline 背景 + theme-color，
                // 否则换肤后键盘弹起会闪一下旧底色。
                const bg=pal['--c-bg'];
                if(bg){
                    root.style.backgroundColor=bg;
                    let tc=document.querySelector('meta[name="theme-color"]');
                    if(tc) tc.setAttribute('content', bg);
                }
            }

            // —— 读写持久化 ——
            function loadPrefs(){
                try{ return JSON.parse(localStorage.getItem('app_appearance')||'{}'); }catch(_){ return {}; }
            }
            function savePrefs(p){ localStorage.setItem('app_appearance', JSON.stringify(p)); try{ snapDrop(); }catch(_){} }   // 1019-U：换了主题，快照作废

            // —— 弹窗交互 ——
            const themeMask=$('themeMask');
            function renderPresets(activeColor){
                const box=$('themePresets'); box.innerHTML='';
                PRESETS.forEach(p=>{
                    const sw=document.createElement('div');
                    sw.className='theme-swatch';
                    sw.style.background=`linear-gradient(135deg, ${p.color}, ${hslToHex(rgbToHsl(hexToRgb(p.color)).h, rgbToHsl(hexToRgb(p.color)).s, Math.max(rgbToHsl(hexToRgb(p.color)).l-16,22))})`;
                    sw.title=p.name;
                    if(activeColor && p.color.toLowerCase()===activeColor.toLowerCase()) sw.classList.add('active');
                    sw.onclick=()=>{
                        applyPrimary(p.color);
                        const pf=loadPrefs(); pf.primary=p.color; savePrefs(pf);
                        renderPresets(p.color);
                        $('customColor').value=p.color;
                    };
                    box.appendChild(sw);
                });
            }
            function openTheme(){
                const pf=loadPrefs();
                const cur=pf.primary||DEFAULT_PRIMARY;
                $('customColor').value = /^#[0-9a-fA-F]{6}$/.test(cur)?cur:DEFAULT_PRIMARY;
                renderPresets(cur);
                themeMask.style.display='flex';
            }
            $('themeBtn').addEventListener('click', openTheme);
            $('closeTheme').addEventListener('click', ()=>{ themeMask.style.display='none'; });

            $('applyCustomBtn').addEventListener('click', ()=>{
                const c=$('customColor').value;
                applyPrimary(c);
                const pf=loadPrefs(); pf.primary=c; savePrefs(pf);
                renderPresets(c);
            });
            $('resetThemeBtn').addEventListener('click', ()=>{
                applyPrimary(DEFAULT_PRIMARY);
                const pf=loadPrefs(); pf.primary=DEFAULT_PRIMARY; savePrefs(pf);
                $('customColor').value=DEFAULT_PRIMARY;
                renderPresets(DEFAULT_PRIMARY);
            });

            // —— 启动时应用已保存的外观 ——
            const pf=loadPrefs();
            if(pf.primary) applyPrimary(pf.primary);
        })();

        // ===== 点击按下反馈：用事件委托给可点元素加 .pressed（WebView 里 :active 不稳，故用 JS）=====
        (function(){
            const SEL = 'button, .mini-btn, .link-btn, .cs-display, .dt-day, .dt-now, '
                      + '.pager button, .user-chip, .login-btn, .add-btn, .save, .cancel, '
                      + '.operate-btn, .logout, .cat-item button, .archive-bar select';
            let cur=null;
            function press(e){
                const t=e.target.closest(SEL);
                if(!t || t.disabled) return;
                cur=t; t.classList.add('pressed');
            }
            function release(){
                if(cur){ cur.classList.remove('pressed'); cur=null; }
            }
            // 有 PointerEvent 就只用 pointer 一套（覆盖鼠标/触摸/触控笔），
            // 否则回退 touch；避免同一次按压在触屏上被 pointer+touch 触发两次。
            if(window.PointerEvent){
                document.addEventListener('pointerdown', press, {passive:true});
                document.addEventListener('pointerup', release, {passive:true});
                document.addEventListener('pointercancel', release, {passive:true});
            } else {
                document.addEventListener('touchstart', press, {passive:true});
                document.addEventListener('touchend', release, {passive:true});
                document.addEventListener('touchcancel', release, {passive:true});
            }
            // 滚动时若手指离开按钮，确保还原
            document.addEventListener('scroll', release, {passive:true, capture:true});
        })();
        // ============================================================
        // ===== 底部标签切换 =====
        // ============================================================
        // 默认进入页面（存全局偏好，所有用户共用此设置）
        // 1019-L：多一个「上次停留的页面」（存 'last'）：选它才回到上次的页签、页码、滚动位置（resumeTake）；
        //   别的选项永远照设置进（原来 1019-F 不管设置、2 小时内都回到上次的页面，把设置盖掉了）
        function getDefaultTabPref(){
            const v=localStorage.getItem('app_default_tab');
            return (v==='stats'||v==='ledger'||v==='settings'||v==='last') ? v : 'ledger';
        }
        function getDefaultTab(){ const v=getDefaultTabPref(); return v==='last' ? 'ledger' : v; }
        function setDefaultTab(v){ localStorage.setItem('app_default_tab', v); snapDrop(); }   // 1019-U：打开时进哪页变了，快照作废

        // 记一笔按钮位置偏好（全局，左撇子可设为「左」）。默认 right=记一笔在右、筛选在左。
        function getAddSide(){
            const v=localStorage.getItem('app_add_side');
            return (v==='left'||v==='right') ? v : 'right';
        }
        function setAddSide(v){ localStorage.setItem('app_add_side', v); }
        // 应用到底部操作栏：选「左」时整行 row-reverse，记一笔挪到左、筛选挪到右
        function applyAddSide(){
            const bar=$('actionBar');
            if(bar) bar.style.flexDirection = (getAddSide()==='left') ? 'row-reverse' : 'row';
        }

        // 收支按钮顺序偏好（左撇子可设为「收入在左」）。默认 out=支出在左、收入在右。
        function getIoSide(){
            const v=localStorage.getItem('app_io_side');
            return (v==='out'||v==='in') ? v : 'out';
        }
        function setIoSide(v){ localStorage.setItem('app_io_side', v); }
        // 应用到记一笔/修改账单弹窗的收支标签：选「收入在左」时 row-reverse 对调左右
        function applyIoSide(){
            const rev = getIoSide()==='in';
            ['billTypeChips','editTypeChips'].forEach(id=>{
                const box=$(id); if(box) box.classList.toggle('io-rev', rev);
            });
        }

        // 1016-V：设置里「存储已用 x%」，超过 70% 提醒。按浏览器给这个 App 的配额算（navigator.storage.estimate，账本在 IndexedDB 里）。
        //   这一版只在开发开关开着时显示（入口先不放出去）；拿不到配额时不显示
        const STORAGE_WARN=0.7;
        var __storageSeq=0;
        function renderStorageUse(){
            const my=++__storageSeq;
            let on=false; try{ on=localStorage.getItem('app_dev_import')==='1'; }catch(_){}
            const old=$('storageUse'), oldW=$('storageUseWarn');
            if(!on || !navigator.storage || !navigator.storage.estimate){ if(old) old.remove(); if(oldW) oldW.remove(); return; }
            Promise.resolve().then(()=>navigator.storage.estimate()).then(q=>{
                if(my!==__storageSeq) return;
                // 1019-I：用量挪到设置页最底下、版本号上面，一行灰色小字，只写占用多少，不写百分比、不写上限
                //   （系统给网页的上限很大，写出来像记问要占 10 个 G）；超过上限 70% 才在原来的位置放一张提醒卡，也不提上限数字
                let b=$('storageUse'), w=$('storageUseWarn');
                if(!q || !q.quota){ if(b) b.remove(); if(w) w.remove(); return; }
                const used=q.usage||0, pct=used/q.quota;
                if(!b){
                    b=document.createElement('div'); b.id='storageUse'; b.className='storage-use';
                    const sb=$('setBuild'); sb.parentNode.insertBefore(b, sb);
                }
                b.textContent='';
                const l1=document.createElement('span'); l1.id='storageUsePct';
                l1.textContent=`账本和备份占用约 ${Math.max(used/1048576, used ? 0.1 : 0).toFixed(1)} MB`;
                b.appendChild(l1);
                if(pct>STORAGE_WARN){
                    if(!w){
                        w=document.createElement('div'); w.id='storageUseWarn'; w.className='set-item set-static storage-warn';
                        const anchor=$('devLogsBtn'); anchor.parentNode.insertBefore(w, anchor.nextSibling);
                    }
                    w.textContent='';
                    const t1=document.createElement('b'); t1.textContent='手机存储空间不多了，记问可能存不下新的备份';
                    const t2=document.createElement('span'); t2.textContent='可以先导出备份，再删掉不用的存档或旧的备份。满了以后记账也会存不进去。';
                    w.appendChild(t1); w.appendChild(t2);
                } else if(w) w.remove();
            }).catch(()=>{ if(my===__storageSeq){ const b=$('storageUse'), w=$('storageUseWarn'); if(b) b.remove(); if(w) w.remove(); } });
        }
        // ===== 1019-F：切到后台被系统杀掉，回来看不出来 =====
        //   切到后台（visibilitychange hidden / pagehide / 原生 pause）时，把停在哪个页签、账单页第几页、滚到哪，
        //   和记一笔 / 修改账单填到一半的（和打开时比变了才算）存在这台手机的 localStorage（不进备份）；
        //   下次打开 App 自动登录、离开不到 RESUME_MAX_MS（2 小时）就直接回去，填到一半的重新打开接着填。
        //   正常回到前台（没被杀）什么都不用做。表单关掉（保存、取消、放弃）就把它的草稿删掉。
        const RESUME_MAX_MS=2*3600*1000;
        const resumeKey=id=>'app_resume_'+id, formDraftKey=id=>'app_formdraft_'+id;
        // ===== 1019-U：首屏快照 =====
        //   切到后台时（resumeSave）把打开 App 时会看到的那一页原样存一份：只在「现在屏幕上的样子就是下次打开会看到的样子」时存，
        //   对不上（翻到了第 2 页、开着筛选、统计页不在这个月……）就删掉，宁可慢一点也不画错。
        //   账本一改（saveStore）、换账号 / 存档、恢复、导入、撤销、换主题、改默认页都删（snapDrop），下次切后台再存。
        const SNAP_MAX=400000;
        const SNAP_BODY_SKIP=['kb-open','login-mode','days-selecting'];
        function snapDrop(){
            try{ Object.keys(localStorage).forEach(k=>{ if(k.indexOf('app_snap_')===0) localStorage.removeItem(k); }); }catch(_){}
        }
        function snapBootState(tab, pref){
            if($('pageDays') && $('pageDays').style.display!=='none' && $('pageDays').style.display!=='') return false;   // 日子管理页开着
            if(document.getElementById('impPage') && document.getElementById('impPage').offsetParent!==null) return false;
            if(tab==='ledger'){
                if(window.__filterActive && window.__filterActive()) return false;   // 打开时会清掉筛选
                if(pref!=='last' && curPage!==1) return false;                      // 打开时回第 1 页
                return true;
            }
            if(tab==='stats'){
                if(tab!==currentTab) return false;   // 统计页不在屏幕上，内容不一定是最新的
                const n=new Date();
                return statYear===n.getFullYear() && statMonth===n.getMonth() && statSelDay==null && statTab==='flow' && statMonthCatMode==='expense';
            }
            if(tab==='settings') return tab===currentTab;
            return false;
        }
        function snapPrune(orig, copy, page){
            const a=orig.querySelectorAll('*'), b=copy.querySelectorAll('*');
            if(a.length!==b.length) return;
            const vh=window.innerHeight||0; if(!vh) return;
            const clipCache=new Map();
            const clipOf=el=>{   // 往上找最近的会把内容裁掉的框（overflow 不是 visible），返回它的下沿；没有就是屏幕下沿
                const p=el.parentElement;
                if(!p || p===page || !page.contains(p)) return vh;
                if(clipCache.has(p)) return clipCache.get(p);
                const cs=getComputedStyle(p);
                const v=(cs.overflowY!=='visible') ? Math.min(p.getBoundingClientRect().bottom, clipOf(p)) : clipOf(p);
                clipCache.set(p, v); return v;
            };
            const drop=[];
            for(let i=0;i<a.length;i++){
                if(!page.contains(a[i]) || a[i]===page) continue;
                const r=a[i].getBoundingClientRect();
                if(r.top > clipOf(a[i]) + 8) drop.push(b[i]);
            }
            drop.forEach(x=>{ if(x.isConnected || x.parentNode) x.remove(); });
        }
        function snapSave(){
            try{
                if(!currentUser || $('mainBox').style.display!=='block'){ snapDrop(); return; }
                const pref=getDefaultTabPref(), tab=pref==='last' ? currentTab : pref;
                if(!snapBootState(tab, pref)){ snapDrop(); return; }
                const pageId={ ledger:'pageLedger', stats:'pageStats', settings:'pageSettings' }[tab];
                // 只要主界面（只留要进的那一页）、底栏、记账页的底部操作栏；登录框、各个弹窗（都在 .container 里、都藏着）不要
                const c=document.querySelector('body > .container').cloneNode(false);
                const mb=$('mainBox').cloneNode(true);
                // 只留一屏看得见的：这一页正显示着时，屏幕下沿以下的、框里滚出去看不见的都不要（东西越少，打开时画得越快；
                //   下面那些反正看不见，真的那页画好就换掉了）
                if(tab===currentTab) snapPrune($('mainBox'), mb, $(pageId));
                mb.querySelectorAll('.tab-page').forEach(pg=>{ if(pg.id!==pageId) pg.remove(); else pg.style.display='block'; });
                const pd=mb.querySelector('#pageDays'); if(pd) pd.remove();
                mb.querySelectorAll('input, textarea').forEach(x=>{ if(x.type!=='checkbox' && x.type!=='radio') x.setAttribute('value', x.value||''); });
                c.appendChild(mb);
                const tb=$('tabBar').cloneNode(true); tb.style.display='flex';
                tb.querySelectorAll('.tab-btn').forEach(b=>b.classList.toggle('active', b.dataset.tab===tab));
                c.appendChild(tb);
                if(tab==='ledger'){ const ab=$('actionBar').cloneNode(true); ab.style.display='flex'; c.appendChild(ab); }
                const html=c.outerHTML;
                if(html.length>SNAP_MAX){ snapDrop(); return; }
                const n=new Date();
                const bodyCls=String(document.body.className||'').split(/\s+/).filter(k=>k && SNAP_BODY_SKIP.indexOf(k)<0)
                    .filter(k=>k!=='tab-ledger' && k!=='tab-stats').concat(tab==='ledger' ? ['tab-ledger'] : tab==='stats' ? ['tab-stats'] : []).join(' ');
                snapDrop();
                localStorage.setItem('app_snap_'+currentUser, JSON.stringify({ v:1, build:$('loginBuild').textContent, day:`${n.getFullYear()}-${n.getMonth()+1}-${n.getDate()}`,
                    pref, tab, page:curPage, y:(tab==='ledger' && pref==='last') ? (window.scrollY||document.documentElement.scrollTop||0) : 0,
                    w:window.innerWidth, at:Date.now(), archive:currentArchive, root:document.documentElement.getAttribute('style')||'', body:bodyCls, html }));
            }catch(_){ snapDrop(); }
        }
        // 真的首屏画好了：下一帧拿掉快照（这一帧真的那页已经排好，拿掉看不出变化）；没有快照时告诉原生层可以收启动画面了
        function snapUnveil(){
            const el=document.getElementById('bootSnap');
            // 1019-X：告诉原生层收启动画面不再等一帧（有快照时早就说过了，这里再说一次没关系）
            try{ const c=window.Capacitor, p=c&&c.Plugins&&c.Plugins.Launch; if(p&&p.ready) p.ready(); }catch(_){}
            const go=()=>{ const x=document.getElementById('bootSnap'); if(x) x.remove(); };
            if(el && window.requestAnimationFrame) requestAnimationFrame(go); else go();
        }
        window.snapSave=snapSave; window.snapDrop=snapDrop;   // 给测试用
        function resumeSave(){
            if(!currentUser || $('mainBox').style.display!=='block') return;
            saveLedgerScroll();
            try{ localStorage.setItem(resumeKey(currentUser), JSON.stringify({ tab:currentTab, page:curPage, y:ledgerScrollY, archive:currentArchive, at:Date.now() })); }catch(_){}
            try{
                const f=formDraftNow();
                if(f) localStorage.setItem(formDraftKey(currentUser), JSON.stringify(Object.assign(f, { archive:currentArchive, at:Date.now() })));
                else localStorage.removeItem(formDraftKey(currentUser));
            }catch(_){}
            snapSave();
        }
        function resumeTake(id){
            let r=null;
            try{ r=JSON.parse(localStorage.getItem(resumeKey(id))||'null'); }catch(_){ r=null; }
            if(!r || r.archive!==currentArchive) return null;
            if(['ledger','stats','settings'].indexOf(r.tab)<0) return null;
            // 1019-L：选了「上次停留」就回到上次的页签（不限多久）；页码、滚动位置只在离开不到 2 小时时放回
            if(!(Date.now()-r.at < RESUME_MAX_MS)) return { tab:r.tab, page:1, y:0 };
            const pages=Math.max(1, Math.ceil(getUserData().length/PAGE_SIZE));
            return { tab:r.tab, page:Math.min(Math.max(1, Math.floor(r.page)||1), pages), y:Math.max(0, +r.y||0) };
        }
        // 记一笔 / 修改账单开着、填过东西：记下填了什么
        function formDraftNow(){
            if($('addMask').style.display==='flex' && window.__formDirty && window.__formDirty('addMask'))
                return { kind:'add', v:{ time:getDtInput(billTime), money:billMoney.value, cat:billCatSel, type:billTypeSel, mode:getModeChips($('billMode')), remark:billRemark.value } };
            if(editMask.style.display==='flex' && editId!=null && window.__formDirty && window.__formDirty('editMask'))
                return { kind:'edit', id:editId, v:{ time:getDtInput(editTime), money:editMoney.value, cat:editCatSel, type:editTypeSel, mode:getModeChips($('editMode')), remark:editRemark.value } };
            return null;
        }
        function formDraftRestore(id){
            let f=null;
            try{ f=JSON.parse(localStorage.getItem(formDraftKey(id))||'null'); }catch(_){ f=null; }
            if(!f || !(Date.now()-f.at < RESUME_MAX_MS) || f.archive!==currentArchive || !f.v) return;
            const v=f.v, cats=getCats();
            if(f.kind==='add'){
                openAddModal();
                const blank=formState('addMask');
                if(v.time) setDtInput(billTime, v.time);
                billMoney.value=v.money||'';
                const cc=[...$('billCatChips').children].find(c=>c.textContent===v.cat && cats.includes(v.cat)); if(cc) cc.click();
                const tc=[...$('billTypeChips').children].find(c=>c.textContent===(v.type==='expense'?'支出':v.type==='income'?'收入':'')); if(tc) tc.click();
                if(v.mode) setModeChips($('billMode'), v.mode);
                billRemark.value=v.remark||'';
                Promise.resolve().then(()=>{ formSnaps.addMask=blank; });   // 恢复出来的算「填过」，关的时候照样问
            } else if(f.kind==='edit'){
                const rec=getUserData().find(r=>r.id===f.id);
                if(!rec) return;
                window.openEdit(f.id);
                if(editMask.style.display!=='flex') return;
                const blank=formState('editMask');
                if(v.time) setDtInput(editTime, v.time);
                editMoney.value=v.money||'';
                if(!rec.refundOf){   // 退款记录的分类 / 收支 / 口径跟着原账单，不动
                    renderEditCatChips(cats.includes(v.cat) ? v.cat : '');
                    renderEditTypeChips(v.type);
                    if(v.mode) setModeChips($('editMode'), v.mode);
                }
                editRemark.value=v.remark||'';
                Promise.resolve().then(()=>{ formSnaps.editMask=blank; });
            }
        }
        document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='hidden') resumeSave(); });
        window.addEventListener('pagehide', ()=>resumeSave());
        try{ const cap=window.Capacitor; if(cap && cap.Plugins && cap.Plugins.App && cap.Plugins.App.addListener) cap.Plugins.App.addListener('pause', ()=>resumeSave()); }catch(_){}
        // 1017-F：离开账单页时记下滚到哪了，回来放回原处（以前切回来先回到顶上，安卓上还会再自己往下滑一段，看着跳一下）
        let ledgerScrollY=0;
        let tabShownOnce=false;   // 1019-U：打开 App 第一次切页签时不读滚动位置（读了会逼浏览器多排一次版）
        function saveLedgerScroll(){
            if(!tabShownOnce) return;
            const pl=$('pageLedger');
            if(currentTab==='ledger' && pl && pl.style.display!=='none') ledgerScrollY=window.scrollY||document.documentElement.scrollTop||0;
        }
        function switchTab(tab){
            closeAllCs();   // 收起可能展开的下拉：其面板已传送到 body，切页隐藏容器不会带走它
            saveLedgerScroll();
            tabShownOnce=true;
            currentTab=tab;
            // 「日子」管理页是记账页的子页，不属于任何 tab。切 tab 时必须把它关掉，
            // 否则从子页点底栏会出现「子页与目标页同时显示」。
            const pd=$('pageDays'); if(pd) pd.style.display='none';
            $('pageLedger').style.display   = tab==='ledger'   ? 'block':'none';
            $('pageStats').style.display    = tab==='stats'    ? 'block':'none';
            $('pageSettings').style.display = tab==='settings' ? 'block':'none';
            // 底部操作栏（筛选 + 记一笔）只在记账页显示
            $('actionBar').style.display = tab==='ledger' ? 'flex':'none';
            if(tab!=='ledger'){
                const tt=$('toTopBtn'); if(tt) tt.classList.remove('show');
                const cf=$('clearFilterFab'); if(cf) cf.classList.remove('show');
            }
            if(tab!=='stats'){ const sf=$('statTodayFab'); if(sf) sf.classList.remove('show'); }
            document.body.classList.toggle('tab-ledger', tab==='ledger');
            document.body.classList.toggle('tab-stats', tab==='stats');
            document.querySelectorAll('.tab-btn').forEach(b=>{
                b.classList.toggle('active', b.dataset.tab===tab);
            });
            // 进入记账页时按当前筛选状态决定清除浮钮显隐
            if(tab==='ledger' && window.syncFilterFab) window.syncFilterFab();
            if(tab==='stats') renderStats();
            if(tab==='settings') renderStorageUse();
            // 切换标签后回到顶部：延到布局完成后执行，避免在 display 切换同帧里失效
            // 1017-F：回到账单页时不回顶上，直接放回离开时的位置（同一帧里放一次、布局完成后再放一次，中间不经过顶上）
            const y = tab==='ledger' ? ledgerScrollY : 0;
            window.scrollTo(0,y);
            requestAnimationFrame(()=>{ window.scrollTo(0,y); document.documentElement.scrollTop=y; if(!y) document.body.scrollTop=0; });
        }
        document.querySelectorAll('.tab-btn').forEach(b=>{
            b.addEventListener('click', ()=>switchTab(b.dataset.tab));
        });

        // 回到顶部：滚动超过一屏且在记账页时显示
        (function(){
            const btn=$('toTopBtn');
            function onScroll(){
                const y = window.scrollY||document.documentElement.scrollTop;
                let show;
                if(currentTab==='ledger'){
                    // 回顶落点是「账单标题」而非页顶。用标题相对视口的位置判断：标题被滚到视口上方
                    // 一段距离后才显示按钮；回顶到标题处时它 rect.top≈0，不再满足条件 → 按钮消失。
                    const head=$('billHead');
                    if(head){
                        show = head.getBoundingClientRect().top < -60;
                    } else {
                        show = y > 400;
                    }
                } else if(currentTab==='stats'){
                    show = y > 400;
                } else {
                    show = false;
                }
                fabWake(btn, show);   // 1017-N：滑动时出现，停下 1.5 秒淡出
                // 账单页滑动时 ✕ 也跟着出现、停下一起淡出
                if(currentTab==='ledger' && window.syncFilterFab) window.syncFilterFab();
            }
            fabHold(btn); fabHold($('clearFilterFab')); fabHold($('statTodayFab'));
            window.addEventListener('scroll', onScroll, {passive:true});
            btn.addEventListener('click', ()=>{
                // 记账页：落到账单标题处（其下方就是翻页条），方便随手翻页——而非滚到整页最顶的「日子」卡片。
                // 其他页（统计）：仍回到整页顶部。
                const head = currentTab==='ledger' ? $('billHead') : null;
                if(head){ head.scrollIntoView({ behavior:'smooth', block:'start' }); }
                else { window.scrollTo({top:0, behavior:'smooth'}); }
            });
            onScroll();

            // 清除筛选浮钮：一键清空全部筛选并刷新列表
            const clearFab=$('clearFilterFab');
            if(clearFab) clearFab.addEventListener('click', ()=>{ clearAllFilters(); });
        })();

        // 默认进入页面：分段选择器
        (function(){
            const seg=$('defaultTabSeg');
            function paint(){
                const cur=getDefaultTabPref();
                seg.querySelectorAll('button').forEach(b=>b.classList.toggle('on', b.dataset.v===cur));
            }
            seg.querySelectorAll('button').forEach(b=>{
                b.addEventListener('click', ()=>{ setDefaultTab(b.dataset.v); paint(); });
            });
            paint();
        })();

        // 记一笔按钮位置：分段选择器（左/右）
        (function(){
            const seg=$('addSideSeg');
            function paint(){
                const cur=getAddSide();
                seg.querySelectorAll('button').forEach(b=>b.classList.toggle('on', b.dataset.v===cur));
            }
            seg.querySelectorAll('button').forEach(b=>{
                b.addEventListener('click', ()=>{ setAddSide(b.dataset.v); applyAddSide(); paint(); });
            });
            paint();
            applyAddSide();   // 启动即按偏好摆放
        })();

        // 收支按钮顺序：分段选择器（支出在左 / 收入在左）
        (function(){
            const seg=$('ioSideSeg');
            function paint(){
                const cur=getIoSide();
                seg.querySelectorAll('button').forEach(b=>b.classList.toggle('on', b.dataset.v===cur));
            }
            seg.querySelectorAll('button').forEach(b=>{
                b.addEventListener('click', ()=>{ setIoSide(b.dataset.v); applyIoSide(); paint(); });
            });
            paint();
            applyIoSide();   // 启动即按偏好对调
        })();

