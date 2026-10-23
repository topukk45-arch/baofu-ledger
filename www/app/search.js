(function(){
        const { $, MODE_HINT, escapeHtml, isFlow, isSkip, parseRecTime, recMode, round2, safeNum, setRecMode } = window.JiwenBase;   // 用到前面模块的
        const { getCats, getUserData, isRefund, recentCats, saveUserData } = window.JiwenStore;   // 用到前面模块的
        const { bindSheetDrag } = window.JiwenPanel;   // 用到前面模块的
        const { askCancel, customAlert, customChoose, customConfirm } = window.JiwenAsk;   // 用到前面模块的
        const { openDtPickerDate } = window.JiwenDate;   // 用到前面模块的
        const { cal, openDay, openDetail, openWeek, sumFen } = window.JiwenDetail;   // 用到前面模块的
        const { listHtml, makePainter } = window.JiwenLedger;   // 用到前面模块的

        // ===== 搜索状态：备注 / 金额 / 日期 / 收支 / 统计 / 分类（1023-F 定的口径，1023-G 从账单页搬到搜一笔）=====
        // 金额存数字（null 表示不限）；日期存 'YYYY-MM-DD'（null 表示不限）；关键词存小写串，按空白分成几个词，都要包含。
        // 收支、统计、分类都能多选：ios（'expense' / 'income'，两个都选等于全部）、modes（'normal' / 'flow' / 'skip'）、cats（分类名）；空数组 = 不限
        // rv：1021-T13 只看待确认分类
        const searchState={ keyword:'', min:null, max:null, from:null, to:null, modes:[], rv:false, ios:[], cats:[] };
        const MODE_NAME={ normal:'计入', skip:'不计', flow:'往来' };
        const MODE_ORDER=['normal', 'skip', 'flow'];
        function searchWords(){ return (searchState.keyword||'').split(/\s+/).filter(Boolean); }
        // 有没有任何条件（含分类）。收支两个都选不算
        function hasFilter(){
            const s=searchState;
            return !!(s.keyword || s.min!=null || s.max!=null || s.from || s.to || s.modes.length || s.rv || s.ios.length===1 || s.cats.length);
        }
        // 单条记录是否命中当前搜索条件（分类不在这里，见 filterMatch）
        function searchMatch(r){
            const ws=searchWords();
            if(ws.length){
                const rk=(r.remark||'').toLowerCase();
                if(!ws.every(w=>rk.includes(w))) return false;
            }
            // 金额区间：按绝对金额比较（与收支无关）
            const amt=safeNum(r.money);
            if(searchState.min!=null && amt < searchState.min) return false;
            if(searchState.max!=null && amt > searchState.max) return false;
            // 日期范围：取记录日期部分（YYYY-MM-DD）做字符串比较即可（格式定长可比）
            if(searchState.from || searchState.to){
                const day=(r.time||'').slice(0,10);
                if(searchState.from && day < searchState.from) return false;
                if(searchState.to && day > searchState.to) return false;
            }
            if(searchState.modes.length && !searchState.modes.includes(recMode(r))) return false;
            if(searchState.rv && r.rv!==1) return false;
            if(searchState.ios.length===1 && r.type!==searchState.ios[0]) return false;   // 退款算收入；两个都选 = 全部
            return true;
        }
        // 「当前搜到的」的唯一判定：结果页列表、条数、「看这 N 笔」、批量操作都调它——两边各写一套，早晚会出现「列表显示 12 条，实际改了 13 条」
        function filterMatch(r){
            const cs=searchState.cats;
            return (!cs.length || cs.includes(r.cat)) && searchMatch(r);
        }
        // 给外面（测试）看现在的条件，拿的是一份副本
        function searchNow(){ return JSON.parse(JSON.stringify(searchState)); }
        function clearState(){ Object.assign(searchState, { keyword:'', min:null, max:null, from:null, to:null, modes:[], rv:false, ios:[], cats:[] }); }
        function toggleIn(arr, v){ const i=arr.indexOf(v); if(i<0) arr.push(v); else arr.splice(i, 1); }

        // ===== 1023-G：搜一笔的结果页 =====
        //   账单页底栏「搜一笔」：从右边滑进来，同时自动拉出筛选条件抽屉；抽屉收起就是结果页。
        //   条件一改，后面的结果页、抽屉底部「看这 N 笔」都跟着变（不再有「点完成才生效」的草稿）。
        //   结果页：顶上生效的条件一个一个深色小标签（点 × 去掉）、条数 + 支出 / 收入合计（右边「批量改 ›」，批量的范围就是这里列出来的）、
        //   列表（和账单页同一份画法，不显示没记账的日子）；底部「回到账单 | 改条件」。没条件时列全部记录；没结果时缺省页
        const page=$('pageSearch'), list=$('searchList'), painter=makePainter(list);
        let pageOpen=false, closeT=null;
        function spNoMotion(){ try{ return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(_){ return false; } }
        function isOpen(){ return pageOpen; }
        function openSearch(o){
            o=o||{};
            if(o.rv){ clearState(); searchState.rv=true; }   // 账单页「待确认分类 N 条 ›」：只看待确认分类
            clearTimeout(closeT);
            pageOpen=true; page.hidden=false;
            page.classList.remove('sp-out'); page.classList.remove('sp-in');
            if(!spNoMotion()){ void page.offsetWidth; page.classList.add('sp-in'); }
            document.body.classList.add('search-open');
            $('searchBody').scrollTop=0;
            render();
            if(!o.noSheet) openSheet();
        }
        function closeSearch(){
            closeSheet();
            if(!pageOpen) return;
            pageOpen=false;
            document.body.classList.remove('search-open');
            if(spNoMotion()){ page.hidden=true; return; }
            page.classList.remove('sp-in'); page.classList.add('sp-out');
            clearTimeout(closeT); closeT=setTimeout(()=>{ if(!pageOpen){ page.hidden=true; page.classList.remove('sp-out'); } }, 240);
        }
        function sortedRecs(){
            return getUserData().map((r, i)=>({ r, i, ts:parseRecTime(r.time).getTime() })).sort((a, b)=>(a.ts-b.ts) || (a.i-b.i)).map(x=>x.r);
        }
        function hits(){ return getUserData().filter(filterMatch); }
        function dayLabel(k){ const y=+k.slice(0,4); return (y!==new Date().getFullYear() ? y+'年' : '')+cal.mdText(k); }
        // 生效的条件：一个一个小标签，每个带「去掉」
        function condTags(){
            const s=searchState, out=[];
            if(s.from || s.to) out.push({ t: s.from && s.to ? (s.from===s.to ? dayLabel(s.from) : `${dayLabel(s.from)}–${dayLabel(s.to)}`) : (s.from ? `${dayLabel(s.from)}起` : `到${dayLabel(s.to)}`), drop(){ s.from=null; s.to=null; } });
            if(s.min!=null || s.max!=null) out.push({ t: s.min!=null && s.max!=null ? `¥${s.min}–${s.max}` : (s.min!=null ? `¥${s.min} 起` : `¥${s.max} 以内`), drop(){ s.min=null; s.max=null; } });
            if(s.ios.length===1) out.push({ t: s.ios[0]==='expense' ? '支出' : '收入', drop(){ s.ios=[]; } });
            s.cats.forEach(c=>out.push({ t:c, drop(){ s.cats=s.cats.filter(x=>x!==c); } }));
            MODE_ORDER.filter(m=>s.modes.includes(m)).forEach(m=>out.push({ t:MODE_NAME[m], drop(){ s.modes=s.modes.filter(x=>x!==m); } }));
            if(s.keyword) out.push({ t:'备注：'+s.keyword, drop(){ s.keyword=''; } });
            if(s.rv) out.push({ t:'待确认分类', drop(){ s.rv=false; } });
            return out;
        }
        let tagList=[];
        function render(){
            if(!pageOpen) return;
            const asc=sortedRecs().filter(filterMatch), any=hasFilter();
            tagList=condTags();
            $('searchTags').innerHTML = tagList.length
                ? tagList.map((x, i)=>`<button type="button" class="sp-tag" data-i="${i}" aria-label="去掉条件：${escapeHtml(x.t)}"><span class="sp-tag-t">${escapeHtml(x.t)}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>`).join('')
                : `<span class="sp-nocond">还没设条件，下面是全部账单</span>`;
            $('searchCount').textContent=`${asc.length} 笔`;
            const s=sumFen(asc);
            let nSkip=0, nFlow=0; asc.forEach(r=>{ if(isSkip(r)) nSkip++; else if(isFlow(r)) nFlow++; });
            const ex=[]; if(nSkip) ex.push(`${nSkip} 笔不计`); if(nFlow) ex.push(`${nFlow} 笔往来`);
            const sum=$('summaryFilter');
            sum.innerHTML = asc.length
                ? `<span class="sp-n">找到 <b>${asc.length}</b> 笔${ex.length ? `<em>（其中 ${ex.join('、')}）</em>` : ''}</span>`
                    + `<span class="sp-s">支出 <b>${s.exp.toFixed(2)}</b>${s.inc ? ` · 收入 <b class="pos">${s.inc.toFixed(2)}</b>` : ''}</span>`
                    // 批量：有条件、搜到了才有（没条件就等于全部记录，一不小心就改了整本账）；范围 = 这里列出来的全部
                    + (any ? `<button type="button" class="sp-batch" id="batchBar" data-act="batch">批量改 ›</button>` : '')
                : '';
            sum.hidden=!asc.length;
            const empty=!asc.length;
            $('searchEmpty').hidden=!empty;
            if(empty){
                $('searchEmpty').querySelector('.sp-empty-t').textContent = any ? '没有找到相关的账' : '账本里还没有记录';
                $('searchEmpty').querySelector('.sp-empty-s').textContent = any ? '点上面的条件把它去掉，或者回去改条件' : '记了账以后，在这里按条件找';
                painter.paint([]);
            } else painter.paint(listHtml(asc, {}));
            paintSheet();
        }
        function searchFlush(){ painter.flush(); }
        $('searchTags').addEventListener('click', e=>{
            const b=e.target.closest('.sp-tag'); if(!b) return;
            const x=tagList[+b.dataset.i]; if(!x) return;
            x.drop(); render();
        });
        $('summaryFilter').addEventListener('click', e=>{ if(e.target.closest('[data-act="batch"]')) openBatchMenu(); });
        list.addEventListener('click', e=>{
            const row=e.target.closest('.bl-row[data-id]'); if(row){ openDetail(row.dataset.id); return; }
            const wk=e.target.closest('.lg-wk[data-mon]'); if(wk){ openWeek(wk.dataset.mon); return; }
            const dh=e.target.closest('.lg-dh[data-day]'); if(dh){ openDay(dh.dataset.day); }
        });
        $('searchBack').addEventListener('click', closeSearch);
        $('searchToLedger').addEventListener('click', closeSearch);
        $('searchEdit').addEventListener('click', ()=>openSheet());
        $('filterFab').addEventListener('click', ()=>openSearch());
        // 账单页的「待确认分类 N 条 ›」（ledger.js 画的）：打开结果页，只看待确认分类
        $('pageLedger').addEventListener('click', e=>{ if(e.target.closest('#rvChip')) openSearch({ rv:true, noSheet:true }); });

        // ===== 1023-G：筛选条件抽屉（样子照记一笔：拖动条 + 标题，最高约屏幕八成）=====
        //   日期范围（两个带日历图标的按钮 + 不限 / 本月 / 上月 / 近 7 天）、金额范围（大字，App 的数字键盘）、收入 | 支出（能都选）、
        //   常用分类 4 个（最近用得多的，多选）、列表卡：分类 ›（点开展开全部分类，多选）、统计 ›（计入 / 不计 / 往来，多选）、备注（空格隔开的几个词都要包含）、
        //   开发开关开着、有待确认分类时多一行「待确认分类」开关。底部「看这 N 笔」（N 跟着条件变）、「回到账单 | 清空条件」。
        //   往下拉、点暗处、返回键收起，条件留着（收起就是结果页）。这个抽屉点暗处能关，是用户点名要的（别的面板照旧不做）
        const mask=$('filterSheetMask'), sheet=$('filterSheet');
        const from=$('searchFrom'), to=$('searchTo'), kw=$('searchKeyword'), min=$('searchMin'), max=$('searchMax');
        let quickCats=[], catOpen=false, modeOpen=false;
        function sheetOpen(){ return mask.style.display==='flex'; }
        function openSheet(){
            if(!pageOpen){ openSearch({ noSheet:true }); }
            quickCats=recentCats(searchState.ios.length===1 ? searchState.ios[0] : undefined, 4);   // 打开时定下来，开着时不挪位置
            catOpen=false; modeOpen=false;
            kw.value=searchState.keyword;
            min.value = searchState.min!=null ? String(searchState.min) : '';
            max.value = searchState.max!=null ? String(searchState.max) : '';
            renderFilterChips(); paintSheet();
            mask.style.display='flex';
            sheetDrag.reset();
            requestAnimationFrame(()=>mask.classList.add('open'));
        }
        function closeSheet(){
            if(!sheetOpen() && !mask.classList.contains('open')) return;
            if(window.kpClose) window.kpClose();
            mask.classList.remove('open'); sheetDrag.reset();
            mask.style.display='none';   // 1019-N：当场关掉，滑走的动画由共用的「影子」做
        }
        window.closeFilterSheet = closeSheet;   // 老入口：返回键表按名字找它
        // 一个条件改了：结果页、抽屉一起跟着变
        function changed(){ render(); if(!pageOpen) paintSheet(); }
        function quickRange(q){
            const n=new Date(), k=cal.dk;
            if(q==='month') return [k(new Date(n.getFullYear(), n.getMonth(), 1)), k(new Date(n.getFullYear(), n.getMonth()+1, 0))];
            if(q==='last') return [k(new Date(n.getFullYear(), n.getMonth()-1, 1)), k(new Date(n.getFullYear(), n.getMonth(), 0))];
            if(q==='7d') return [k(new Date(n.getFullYear(), n.getMonth(), n.getDate()-6)), k(n)];
            return ['', ''];
        }
        function catsText(){ return searchState.cats.length ? searchState.cats.join('、') : ''; }
        function paintSheet(){
            from.dataset.day=searchState.from||''; from.value = searchState.from ? dayLabel(searchState.from) : '';
            to.dataset.day=searchState.to||''; to.value = searchState.to ? dayLabel(searchState.to) : '';
            $('filterDateQuick').querySelectorAll('[data-q]').forEach(b=>{ const [a, z]=quickRange(b.dataset.q); const on=(searchState.from||'')===a && (searchState.to||'')===z; b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); });
            const io=$('filterIoChips');
            if(!io.children.length) io.innerHTML=[['income', '收入'], ['expense', '支出']].map(([v, t])=>`<button type="button" class="sf-btn cc" data-v="${v}" aria-pressed="false">${t}</button>`).join('');
            io.querySelectorAll('[data-v]').forEach(b=>{ const on=searchState.ios.includes(b.dataset.v); b.classList.toggle('sel', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
            const qc=$('filterQuickCats');
            qc.innerHTML=quickCats.map(c=>`<button type="button" class="sf-btn cc${searchState.cats.includes(c) ? ' sel' : ''}" data-cat="${escapeHtml(c)}" aria-pressed="${searchState.cats.includes(c)}">${escapeHtml(c)}</button>`).join('');
            const cv=$('filterCatVal'); cv.textContent=catsText() || '全部分类'; cv.classList.toggle('sf-ph', !searchState.cats.length);
            $('filterCatRow').setAttribute('aria-expanded', catOpen ? 'true' : 'false'); $('filterCatRow').classList.toggle('open', catOpen);
            $('filterChips').hidden=!catOpen; paintCatChips();
            const mv=$('filterModeVal'); mv.textContent = searchState.modes.length ? MODE_ORDER.filter(m=>searchState.modes.includes(m)).map(m=>MODE_NAME[m]).join('、') : '全部'; mv.classList.toggle('sf-ph', !searchState.modes.length);
            $('filterModeRow').setAttribute('aria-expanded', modeOpen ? 'true' : 'false'); $('filterModeRow').classList.toggle('open', modeOpen);
            const mc=$('filterModeChips'); mc.hidden=!modeOpen;
            if(!mc.children.length) mc.innerHTML=MODE_ORDER.map(m=>`<button type="button" class="sf-btn cc" data-v="${m}">${MODE_NAME[m]}</button>`).join('');
            mc.querySelectorAll('[data-v]').forEach(b=>{ const on=searchState.modes.includes(b.dataset.v); b.classList.toggle('sel', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
            // 待确认分类（开发开关开着、账本里有，或者已经选了）
            let dev=false; try{ dev=localStorage.getItem('app_dev_import')==='1'; }catch(_){}
            const rvN=dev ? getUserData().filter(r=>r.rv===1).length : 0;
            $('filterRvRow').hidden=!(searchState.rv || rvN);
            $('filterRvVal').textContent = `${rvN} 条`;
            $('filterRvSw').classList.toggle('on', !!searchState.rv);
            $('sheetApply').textContent=`看这 ${hits().length} 笔`;
        }
        // 全部分类（点「分类 ›」展开），多选；分类改名 / 删掉以后不在分类表里的不再算条件
        function renderFilterChips(){
            const all=getCats(); searchState.cats=searchState.cats.filter(c=>all.includes(c));
            const box=$('filterChips'); if(!box) return;
            box.innerHTML=all.map(c=>`<button type="button" class="sf-btn cc" data-v="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join('');
            paintCatChips();
        }
        function paintCatChips(){ $('filterChips').querySelectorAll('[data-v]').forEach(b=>{ const on=searchState.cats.includes(b.dataset.v); b.classList.toggle('sel', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }); }
        function pickCat(c){ toggleIn(searchState.cats, c); searchState.cats=getCats().filter(x=>searchState.cats.includes(x)); changed(); }   // 按分类管理里的顺序存
        $('filterIoChips').addEventListener('click', e=>{ const b=e.target.closest('[data-v]'); if(!b) return; toggleIn(searchState.ios, b.dataset.v); if(searchState.ios.length===2) searchState.ios=['expense', 'income']; changed(); });
        $('filterQuickCats').addEventListener('click', e=>{ const b=e.target.closest('[data-cat]'); if(b) pickCat(b.dataset.cat); });
        $('filterChips').addEventListener('click', e=>{ const b=e.target.closest('[data-v]'); if(b) pickCat(b.dataset.v); });
        $('filterModeChips').addEventListener('click', e=>{ const b=e.target.closest('[data-v]'); if(!b) return; toggleIn(searchState.modes, b.dataset.v); changed(); });
        $('filterCatRow').addEventListener('click', ()=>{ catOpen=!catOpen; paintSheet(); });
        $('filterModeRow').addEventListener('click', ()=>{ modeOpen=!modeOpen; paintSheet(); });
        $('filterRvRow').addEventListener('click', ()=>{ searchState.rv=!searchState.rv; changed(); });
        $('filterDateQuick').addEventListener('click', e=>{
            const b=e.target.closest('[data-q]'); if(!b) return;
            const [a, z]=quickRange(b.dataset.q);
            searchState.from=a||null; searchState.to=z||null; changed();
        });
        $('searchFromBtn').addEventListener('click', ()=>openDtPickerDate(searchState.from || '', day=>{ searchState.from=day; if(searchState.to && searchState.to<day) searchState.to=day; changed(); }));
        $('searchToBtn').addEventListener('click', ()=>openDtPickerDate(searchState.to || searchState.from || '', day=>{ searchState.to=day; if(searchState.from && searchState.from>day) searchState.from=day; changed(); }));
        function readMoney(el){ const v=String(el.value||'').trim(), n=Number(v); return (v!=='' && isFinite(n)) ? n : null; }
        [min, max].forEach(el=>el.addEventListener('input', ()=>{ searchState.min=readMoney(min); searchState.max=readMoney(max); changed(); }));
        ['input', 'change'].forEach(ev=>kw.addEventListener(ev, ()=>{ const v=(kw.value||'').trim().toLowerCase(); if(v!==searchState.keyword){ searchState.keyword=v; changed(); } }));
        // 「看这 N 笔」：先把框里写着的再读一遍（输入框没发 input 的时候也算数），再收起
        function readInputs(){ searchState.keyword=(kw.value||'').trim().toLowerCase(); searchState.min=readMoney(min); searchState.max=readMoney(max); }
        $('sheetApply').addEventListener('click', ()=>{ readInputs(); render(); closeSheet(); });
        $('filterBack').addEventListener('click', closeSearch);
        $('sheetClear').addEventListener('click', ()=>{ clearState(); kw.value=''; min.value=''; max.value=''; changed(); });
        // 往下拉关闭（和别的面板共用 bindSheetDrag）；点暗处也关（只这一个抽屉）
        const sheetDrag=bindSheetDrag(mask, sheet, $('filterSheetGrip'), ()=>closeSheet());
        mask.addEventListener('click', e=>{ if(e.target===mask) closeSheet(); });

        // 换账号 / 存档：条件清掉、结果页关掉
        function resetSearch(){
            clearState();
            kw.value=''; min.value=''; max.value='';
            if(pageOpen) closeSearch(); else closeSheet();
        }
        window.__filterActive = ()=>pageOpen;   // 1019-U：首屏快照看要不要存（搜一笔开着时不存）

        // ===== 批量操作（基于当前筛选结果）=====
        // 范围 = 当前筛选命中的**全部**记录（不只是当前页），判定与列表共用 filterMatch。
        // 不可逆操作的保护：确认框写明条数并列出样例；完成后给一次「撤销」。
        // 撤销只记被改记录的旧分类和口径（体积很小），只在完成弹窗里提供一次。
        let batchUndo=null;
        function openBatchMenu(){
            const hit=getUserData().filter(r=>filterMatch(r));
            if(!hit.length){ customAlert('当前筛选没有命中任何记录。'); return; }
            // 退款记录的分类 / 口径永远跟原账单走，不单独改（1010-J）
            const list=hit.filter(r=>!isRefund(r));
            const rfN=hit.length-list.length;
            if(!list.length){ customAlert(`命中的 ${rfN} 条都是退款记录。退款的分类和统计跟着原账单走，请改原账单。`); return; }
            customChoose(`对搜到的这 ${list.length} 条记录：${rfN?`\n另有 ${rfN} 条退款记录不参与，会跟着各自的原账单一起变。`:''}`, [
                // 说明文字与记一笔里的口径说明（MODE_HINT）同源，两处永远一致
                { value:'cat',    label:'改分类',       desc:'把这些记录统一改到同一个分类，比如把「永劫无间」归到「游戏」' },
                { value:'normal', label:'恢复计入',     desc:'取消「不计」「往来」：'+MODE_HINT.normal },
                { value:'skip',   label:'标为不计',     desc:MODE_HINT.skip },
                { value:'flow',   label:'标为往来',     desc:MODE_HINT.flow }
            ], (act)=>{
                if(act==='cat'){
                    const onCat=(cat)=>{
                        const targets=list.filter(r=>r.cat!==cat);
                        if(!targets.length){ customAlert(`这 ${list.length} 条已经都是「${cat}」了。`); return; }
                        customConfirm(`把下面这 ${targets.length} 条记录的分类改成「${cat}」（挂在上面的退款跟着改）。改完可以马上「撤销这次操作」。`,
                            ()=>applyBatch(targets.map(r=>r.id), { cat }), '批量改分类',
                            { okText:`改这 ${targets.length} 条`, list:targets, danger:true, onCancel:pickCat });   // 1019-S：取消回到选分类
                    };
                    const pickCat=()=>window.JiwenSheet.cats({ title:'改成哪个分类', value:'', onPick:onCat, onCancel:openBatchMenu });   // 1020-I：用分类抽屉；取消回到批量操作
                    pickCat();
                } else {
                    const NAME={ normal:'计入', skip:'不计', flow:'往来' };
                    const targets=list.filter(r=>recMode(r)!==act);   // 已经是目标口径的不重复改
                    if(!targets.length){ customAlert(`这 ${list.length} 条已经都是「${NAME[act]}」了。`); return; }
                    customConfirm(`把下面这 ${targets.length} 条记录改成「${NAME[act]}」（挂在上面的退款跟着改）。改完可以马上「撤销这次操作」。`,
                        ()=>applyBatch(targets.map(r=>r.id), { mode:act }), '批量修改统计',
                        { okText:`改这 ${targets.length} 条`, list:targets, danger:true, onCancel:openBatchMenu });   // 1019-S：取消回到批量操作
                }
            }, '批量操作', null, { layout:'list' });
        }
        function applyBatch(ids, change){
            const idSet=new Set(ids);
            const data=getUserData();
            const prev=[];
            const byId=new Map();
            // 【1013-G】账本里的记录是冻结的：改过的换成新对象
            data.forEach((r,i)=>{
                if(!idSet.has(r.id) || isRefund(r)) return;
                prev.push({ id:r.id, cat:r.cat, mode:recMode(r) });
                const n=Object.assign({}, r);
                if(change.cat!==undefined){ n.cat=change.cat; if(n.rv){ prev[prev.length-1].rv=1; delete n.rv; } }   // 1021-T13：改了分类就去掉「待确认分类」，撤销时放回
                if(change.mode!==undefined) setRecMode(n, change.mode);
                data[i]=n;
                byId.set(n.id, n);
            });
            if(!prev.length) return;
            const mainN=prev.length;
            // 挂在这些原账单上的退款跟着改；旧值一并记下，撤销时一起还原
            data.forEach((r,i)=>{
                if(!isRefund(r) || !byId.has(r.refundOf)) return;
                const o=byId.get(r.refundOf);
                prev.push({ id:r.id, cat:r.cat, mode:recMode(r), follow:true });
                const n=Object.assign({}, r); n.cat=o.cat; setRecMode(n, recMode(o)); data[i]=n;
            });
            if(!saveUserData(data)) return;      // 一次写盘、一次同步；失败已有提示
            // 按分类筛选时改了分类：命中的记录全部离开当前分类，列表会瞬间变空，看着像数据没了。
            // 把筛选分类切到新分类，让刚改的这批仍在眼前（1023-F 起分类能多选：新分类不在里面就换成只选它）。
            const prevFilter=searchState.cats.slice();
            if(change.cat!==undefined && prevFilter.length && !prevFilter.includes(change.cat)){
                searchState.cats=[change.cat];
            }
            window.JiwenTabs.refreshAllViews(); render();
            batchUndo={ prev, prevFilter, archive:JiwenBase.currentArchive };
            customConfirm(`已处理 ${mainN} 条记录。`, null, '批量操作完成',
                { okText:'好的', extra:{ text:'撤销这次操作', onClick:undoBatch } });
            askCancel.style.display='none';      // 「好的」「取消」意思一样，只留一个
        }
        function undoBatch(){
            const u=batchUndo; batchUndo=null;
            if(!u || u.archive!==JiwenBase.currentArchive) return;
            const map=new Map(u.prev.map(p=>[p.id, p]));
            const data=getUserData();
            data.forEach((r,i)=>{
                const p=map.get(r.id); if(!p) return;
                const n=Object.assign({}, r);
                n.cat=p.cat;
                if(p.rv) n.rv=1;
                setRecMode(n, p.mode);
                data[i]=n;
            });
            if(!saveUserData(data)) return;
            searchState.cats=u.prevFilter.slice();   // 分类表没变，原筛选值一定还在
            window.JiwenTabs.refreshAllViews(); render();
            customAlert(`已撤销，${u.prev.filter(p=>!p.follow).length} 条记录恢复原样。`);
        }
        window.JiwenSearch = { applyBatch, closeSearch, filterMatch, isOpen, openBatchMenu, openSearch, openSheet, render, renderFilterChips, resetSearch, searchFlush, searchNow, undoBatch };   // search 模块对外只有这一个入口
})();
