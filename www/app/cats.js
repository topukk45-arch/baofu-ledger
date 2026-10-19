(function(){
        const { $, round2, safeNum } = window.JiwenBase;   // 用到前面模块的
        const { charLen, curArchive, getBudgets, impRulesDropCat, impRulesRenameCat, loadStore, saveStoreSafe } = window.JiwenStore;   // 用到前面模块的
        const { customAlert, customConfirm, customPrompt } = window.JiwenAsk;   // 用到前面模块的
        const { scrollChipIntoView } = window.JiwenImportEntry;   // 用到前面模块的
        const { refreshBillCatChipsIfOpen, refreshEditCatChipsIfOpen } = window.JiwenForms;   // 用到前面模块的
        function showCatErr(msg){
            const el=$('catErr');
            el.textContent=msg||'';
            el.style.display = msg ? 'block' : 'none';
        }
        $('newCatName').addEventListener('input', ()=>showCatErr(''));
        $('addCatBtn').addEventListener('click', () => {
            const name=$('newCatName').value.trim();
            if(!name){ showCatErr('请输入分类名'); return; }
            if(charLen(name) > 8){ showCatErr('分类名最多 8 个字～'); return; }
            const store=loadStore(); const a=curArchive(store);
            if(a.cats.includes(name)){ showCatErr('该分类已存在'); return; }
            a.cats.push(name); saveStoreSafe(store);
            $('newCatName').value=''; showCatErr('');
            window.JiwenTabs.refreshCatSelectors(); openCatManager(); window.JiwenTabs.refreshAllViews(); refreshBillCatChipsIfOpen(); refreshEditCatChipsIfOpen();
            // 新分类排在末尾，若标签条已需横滑则它在最右看不到——主动滚到可见，给用户「确实加上了」的反馈
            const fbox=$('filterChips');
            if(fbox){
                const newChip=[...fbox.querySelectorAll('.cc')].find(el=>el.textContent===name);
                if(newChip) scrollChipIntoView(fbox, newChip);
            }
        });
        function openCatManager(){
            showCatErr('');
            const store=loadStore(); const a=curArchive(store);
            const list=$('catList'); list.innerHTML='';
            a.cats.forEach(c=>{
                const div=document.createElement('div'); div.className='cat-item';
                div.dataset.cat=c;

                const left=document.createElement('div'); left.className='cat-left';
                const handle=document.createElement('span'); handle.className='drag-handle';
                handle.textContent='⠿'; handle.title='长按拖动排序';
                const span=document.createElement('span'); span.className='cat-name'; span.textContent=c;
                left.appendChild(handle); left.appendChild(span);
                const bv=(a.budgets && a.budgets[c]>0) ? a.budgets[c] : null;
                if(bv!=null){
                    const bs=document.createElement('span'); bs.className='cat-budget';
                    bs.textContent=`每月预算 ${safeNum(bv).toFixed(0)}`;
                    left.appendChild(bs);
                }
                // 1019-C：行里不再塞「预算 / 改名 / 删除」三个小按钮，整行点开一个面板（拖动手柄除外）
                const more=document.createElement('span'); more.className='cat-more'; more.textContent='›'; more.setAttribute('aria-hidden','true');
                div.appendChild(left); div.appendChild(more);
                div.setAttribute('role','button');
                div.addEventListener('click', e=>{
                    if(e.target.closest('.drag-handle') || div.classList.contains('dragging') || (div.__dragEnd && Date.now()-div.__dragEnd<400)) return;
                    openCatActions(c);
                });
                attachCatDrag(div, handle);
                list.appendChild(div);
            });
            $('catMask').style.display='flex';
        }

        // ===== 分类长按拖动排序（pointer/touch 手写，避免 WebView 原生 draggable 不稳）=====
        // 在手柄上按住约 250ms 触发拖动；跟手移动，越过相邻项中线即交换位置；松手落位并存盘。
        function attachCatDrag(item, handle){
            let holdTimer=null, dragging=false;
            let startY=0, curY=0, placeholder=null, listEl=null, items=[];
            const HOLD_MS=250, MOVE_CANCEL=10;

            function onDown(e){
                const pt=e.touches?e.touches[0]:e;
                startY=pt.clientY; curY=startY;
                holdTimer=setTimeout(()=>startDrag(pt), HOLD_MS);
                document.addEventListener('pointermove', onMovePre, {passive:true});
                document.addEventListener('touchmove', onMovePre, {passive:true});
                document.addEventListener('pointerup', cancelPre, {passive:true});
                document.addEventListener('touchend', cancelPre, {passive:true});
                document.addEventListener('pointercancel', cancelPre, {passive:true});
                document.addEventListener('touchcancel', cancelPre, {passive:true});
            }
            // 长按未触发前若手指明显移动，判为滚动，取消长按
            function onMovePre(e){
                const pt=e.touches?e.touches[0]:e;
                if(Math.abs(pt.clientY-startY)>MOVE_CANCEL){ clearHold(); }
            }
            function cancelPre(){ clearHold(); }
            function clearHold(){
                if(holdTimer){ clearTimeout(holdTimer); holdTimer=null; }
                if(!dragging){
                    document.removeEventListener('pointermove', onMovePre);
                    document.removeEventListener('touchmove', onMovePre);
                    document.removeEventListener('pointerup', cancelPre);
                    document.removeEventListener('touchend', cancelPre);
                    document.removeEventListener('pointercancel', cancelPre);
                    document.removeEventListener('touchcancel', cancelPre);
                }
            }

            function startDrag(pt){
                dragging=true;
                clearHold();
                listEl=item.parentNode;
                items=Array.from(listEl.children);
                const rect=item.getBoundingClientRect();
                // 占位：保留原高度，避免后面项跳动
                placeholder=document.createElement('div');
                placeholder.className='cat-item drag-placeholder';
                placeholder.style.height=rect.height+'px';
                placeholder.style.marginBottom=getComputedStyle(item).marginBottom;
                listEl.insertBefore(placeholder, item);
                // 把被拖项变为绝对定位浮层，跟手
                item.classList.add('dragging');
                item.style.position='fixed';
                item.style.left=rect.left+'px';
                item.style.top=rect.top+'px';
                item.style.width=rect.width+'px';
                item.style.margin='0';
                item.style.pointerEvents='none';
                if(navigator.vibrate) try{ navigator.vibrate(15); }catch(_){}

                document.addEventListener('pointermove', onMove, {passive:false});
                document.addEventListener('touchmove', onMove, {passive:false});
                document.addEventListener('pointerup', onUp, {passive:true});
                document.addEventListener('touchend', onUp, {passive:true});
                document.addEventListener('pointercancel', onUp, {passive:true});
                document.addEventListener('touchcancel', onUp, {passive:true});
            }

            function onMove(e){
                if(!dragging) return;
                if(e.cancelable) e.preventDefault();      // 阻止页面滚动
                const pt=e.touches?e.touches[0]:e;
                curY=pt.clientY;
                const rect=item.getBoundingClientRect();
                item.style.top=(rect.top + (curY - (rect.top+rect.height/2)))+'px';
                // 找占位应插入的位置：以指针 Y 与各兄弟项中线比较
                const siblings=Array.from(listEl.children)
                    .filter(el=>el!==item && el!==placeholder);
                let inserted=false;
                for(const sib of siblings){
                    const r=sib.getBoundingClientRect();
                    if(curY < r.top + r.height/2){
                        listEl.insertBefore(placeholder, sib); inserted=true; break;
                    }
                }
                if(!inserted) listEl.appendChild(placeholder);
            }

            function onUp(){
                if(!dragging){ clearHold(); return; }
                dragging=false;
                // 落位：把拖项放回占位处
                listEl.insertBefore(item, placeholder);
                placeholder.remove(); placeholder=null;
                item.classList.remove('dragging');
                item.style.position=''; item.style.left=''; item.style.top='';
                item.style.width=''; item.style.margin=''; item.style.pointerEvents='';

                document.removeEventListener('pointermove', onMove);
                document.removeEventListener('touchmove', onMove);
                document.removeEventListener('pointerup', onUp);
                document.removeEventListener('touchend', onUp);
                document.removeEventListener('pointercancel', onUp);
                document.removeEventListener('touchcancel', onUp);

                item.__dragEnd=Date.now();   // 1019-C：刚拖完松手带出来的那一下点击不算「点开」
                persistCatOrder();
            }

            // 支持 PointerEvent 的设备只绑 pointerdown，避免触屏上 pointer+touch 双触发
            // 导致重复计时器/重复挂监听；老设备回退 touchstart。
            if(window.PointerEvent){
                handle.addEventListener('pointerdown', onDown, {passive:true});
            } else {
                handle.addEventListener('touchstart', onDown, {passive:true});
            }
        }

        // 把当前 DOM 里 cat-item 的顺序写回存档的 cats 数组
        function persistCatOrder(){
            const order=Array.from($('catList').children)
                .map(el=>el.dataset && el.dataset.cat)
                .filter(Boolean);
            if(!order.length) return;
            const store=loadStore(); const a=curArchive(store);
            // 以新顺序重排，遗漏的（理论上不会有）补在末尾
            const set=new Set(order);
            a.cats=order.concat(a.cats.filter(c=>!set.has(c)));
            saveStoreSafe(store);
            window.JiwenTabs.refreshCatSelectors(); refreshBillCatChipsIfOpen(); refreshEditCatChipsIfOpen();
        }
        // 设置 / 修改 / 取消某分类的每月预算。填 0 = 取消（customPrompt 不接受空串，用 0 表示「不要了」）。
        // opts.fromStats：从统计页「未设预算」里点的，存完只刷新统计页，不弹出分类管理
        // 1019-C：分类的操作面板：标题是分类名，「设预算」「改名」「删除这个分类」（警示色）竖排，「取消」在最下面
        function openCatActions(c){
            const a=curArchive(loadStore());
            if(!a.cats.includes(c)) return;
            const used=a.records.filter(r=>r.cat===c).length;
            const bv=(a.budgets && a.budgets[c]>0) ? a.budgets[c] : null;
            const sub=(bv!=null ? `每月预算 ${safeNum(bv).toFixed(0)} · ` : '') + (used ? `${used} 条记录` : '还没有记录');
            const btn=(id, text, cls, fn)=>{ const b=document.createElement('button'); b.type='button'; b.id=id; b.className='ui-btn block '+(cls||''); b.textContent=text; b.addEventListener('click', fn); return b; };
            window.JiwenSheet.open({ title:c, sub,
                body(box, done){
                    const st=document.createElement('div'); st.className='ui-stack'; st.id='catActList';
                    // 1019-S：设预算 / 改名的输入框存好、取消、返回、往下拉都回到这个分类的面板（改了名就是新名字的面板），再按返回才回列表；
                    //   删除的确认框取消也回这个面板，删掉了回列表
                    const back=name=>openCatActions(name||c);
                    st.appendChild(btn('catActBudget', bv!=null ? '改预算' : '设预算', '', ()=>{ done(); editBudget(c, { back }); }));
                    st.appendChild(btn('catActRename', '改名', '', ()=>{ done(); renameCat(c, { back }); }));
                    if(c!=='未分类') st.appendChild(btn('catActDelete', '删除这个分类', 'warn', ()=>{ done(); deleteCat(c, { back }); }));
                    else { const p=document.createElement('div'); p.className='ui-msg ui-msg-soft'; p.textContent='「未分类」是保留分类，不能删除。'; st.appendChild(p); }
                    box.appendChild(st);
                },
                foot(box, done){
                    const st=document.createElement('div'); st.className='ui-stack';
                    st.appendChild(btn('catActCancel', '取消', '', ()=>done()));
                    box.appendChild(st);
                } });
        }
        function editBudget(cat, opts){
            const cur=getBudgets()[cat];
            customPrompt(`给「${cat}」设一个每月预算（元）。填 0 表示取消预算。`, cur>0 ? String(cur) : '', (v)=>{
                const n=round2(Number(v));
                const store=loadStore(); const a=curArchive(store);
                a.budgets=Object.assign({}, a.budgets||{});
                if(n>0) a.budgets[cat]=n; else delete a.budgets[cat];
                if(!saveStoreSafe(store)) return;
                if(!(opts && opts.fromStats)) openCatManager();
                if(JiwenBase.currentTab==='stats') window.JiwenStats.renderStats();
                if(opts && opts.back) opts.back(cat);
            }, '分类预算', (v)=>{
                const n=Number(v);
                if(!isFinite(n) || n<0) return '请输入 0 或正数金额';
                if(n>99999999) return '金额太大啦，确认一下没多打几个 0？';
                return '';
            }, { inputmode:'decimal', placeholder:'例如 200', kpOk:'保存', onCancel:(opts && opts.back) ? ()=>opts.back(cat) : null });
        }

        function renameCat(oldName, opts){
            const back=opts && opts.back;
            customPrompt('', oldName, (name)=>{
                name=name.trim();
                if(!name || name===oldName){ if(back) back(oldName); return; }
                const store=loadStore(); const a=curArchive(store);
                a.cats=a.cats.map(c=>c===oldName?name:c);
                a.records=a.records.map(r=>r.cat===oldName ? Object.assign({}, r, { cat:name }) : r);
                // 预算跟着分类改名，否则改名后预算悄悄失效
                if(a.budgets && a.budgets[oldName]!=null){
                    a.budgets=Object.assign({}, a.budgets);
                    a.budgets[name]=a.budgets[oldName]; delete a.budgets[oldName];
                }
                // 常用模板也跟着改名
                if(Array.isArray(a.tpls)) a.tpls.forEach(t=>{ if(t.cat===oldName) t.cat=name; });
                // 【1015-B】导入的分类规则也跟着改名
                impRulesRenameCat(a, oldName, name);
                saveStoreSafe(store);
                window.JiwenTabs.refreshCatSelectors(); openCatManager(); window.JiwenTabs.refreshAllViews(); refreshBillCatChipsIfOpen(); refreshEditCatChipsIfOpen();
                if(back) back(name);
            }, '重命名分类', (name)=>{
                name=name.trim();
                if(!name) return '分类名不能为空';
                if(name===oldName) return '';
                if(charLen(name) > 8) return '分类名最多 8 个字～';
                if(curArchive(loadStore()).cats.includes(name)) return '该分类已存在';
                return '';
            }, { placeholder:'输入新分类名（最多 8 字）', maxchars:8, onCancel:back ? ()=>back(oldName) : null });
        }
        function deleteCat(name, opts){
            if(name==='未分类'){ customAlert('「未分类」是保留分类，不能删除哦～'); return; }
            const store=loadStore(); const a=curArchive(store);
            if(a.cats.length<=1){ customAlert('至少保留一个分类！'); return; }
            const used=a.records.filter(r=>r.cat===name).length;
            const nTpl=(Array.isArray(a.tpls) ? a.tpls : []).filter(t=>t.cat===name).length;
            const hasBudget=!!(a.budgets && a.budgets[name]>0);
            const lines=[used>0 ? `有 ${used} 条记录用着这个分类，删了以后这些记录会变成「未分类」，金额和备注都不动。` : '没有记录用着这个分类。'];
            if(nTpl) lines.push(`${nTpl} 个常用模板也会变成「未分类」。`);
            if(hasBudget) lines.push('这个分类的每月预算会一起删掉。');
            customConfirm(`删除分类「${name}」。\n\n${lines.join('\n')}`, ()=>{
                const s=loadStore(); const ar=curArchive(s);
                ar.cats=ar.cats.filter(c=>c!==name);
                if(!ar.cats.includes('未分类')) ar.cats.unshift('未分类');
                ar.records=ar.records.map(r=>r.cat===name ? Object.assign({}, r, { cat:'未分类' }) : r);
                if(ar.budgets && ar.budgets[name]!=null){ ar.budgets=Object.assign({}, ar.budgets); delete ar.budgets[name]; }
                // 常用模板与记录一致：归入「未分类」
                if(Array.isArray(ar.tpls)) ar.tpls.forEach(t=>{ if(t.cat===name) t.cat='未分类'; });
                // 【1015-B】导入的分类规则：指向这个分类的直接删（「关键词 → 未分类」没有意义）
                impRulesDropCat(ar, name);
                saveStoreSafe(s);
                window.JiwenTabs.refreshCatSelectors(); openCatManager(); window.JiwenTabs.refreshAllViews(); refreshBillCatChipsIfOpen(); refreshEditCatChipsIfOpen();
            }, '删除分类', { danger:true, okText:`删除分类「${name}」`, onCancel:(opts && opts.back) ? ()=>opts.back(name) : null });
        }
        window.JiwenCats = { deleteCat, editBudget, openCatManager, renameCat };   // cats 模块对外只有这一个入口
})();
