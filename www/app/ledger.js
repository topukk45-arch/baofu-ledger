(function(){
        const { $, MODE_HINT, billList, escapeHtml, fabWake, filterCat, isFlow, isSkip, pad, parseRecTime, recMode, round2, safeNum, setRecMode } = window.JiwenBase;   // 用到前面模块的
        const { getCats, getUserData, impGetJson, impLogKey, impTarget, isRefund, modeAmtCls, modeTag, refundedMap, refundedTag, saveUserData, statContrib } = window.JiwenStore;   // 用到前面模块的
        const { bindSheetDrag } = window.JiwenPanel;   // 用到前面模块的
        const { askCancel, customAlert, customChoose, customConfirm } = window.JiwenAsk;   // 用到前面模块的
        const { openDtPickerDate } = window.JiwenDate;   // 用到前面模块的
        const { loadImportUI, scrollChipIntoView } = window.JiwenImportEntry;   // 用到前面模块的
        const { openAddModal } = window.JiwenForms;   // 用到前面模块的
        const { cal, openDetail } = window.JiwenDetail;   // 用到前面模块的
        // 账单表事件委托：备注查看 / 修改。用 data-act + data-id 取代内联 onclick，
        // 既杜绝把记录 id 拼进 HTML 属性的注入隐患，也避免每行绑定监听。
        billList.addEventListener('click', e => {
            const el = e.target.closest('[data-act]');
            if(!el || !billList.contains(el)) return;
            const id = el.dataset.id;
            if(el.dataset.act==='remark'){ window.viewRemark && window.viewRemark(id); }
            else if(el.dataset.act==='edit'){ window.openEdit && window.openEdit(id); }
            else if(el.dataset.act==='detail'){ openDetail(id); }   // 1023-A：一条一行，点整行进详情（修改在详情里）
        });

        // 渲染筛选分类标签：「全部」固定第一个，其后按存档 cats 顺序。
        // 草稿模式：点击只更新草稿分类 draftCat + 切换高亮，不提交、不刷新列表；
        //   要点 sheet 的「完成」才会把 draftCat 提交进 filterCat 并筛选。
        function renderFilterChips(){
            const box=$('filterChips'); if(!box) return;
            // 草稿当前值：sheet 打开时用 draftCat；若 sheet 未开（如分类管理触发的重渲染），
            // 以已提交的 filterCat 为准并同步给 draftCat，避免下次打开时草稿是旧值
            const sheetOpen = $('filterSheetMask') && $('filterSheetMask').classList.contains('open');
            let cur;
            if(sheetOpen && window.getDraftCat){
                cur = window.getDraftCat();
            } else {
                cur = filterCat.value || '__all';
                if(window.setDraftCat) window.setDraftCat(cur);
            }
            const prevScroll=box.scrollLeft;
            box.innerHTML='';
            const items=[{v:'__all', t:'全部'}].concat(getCats().map(c=>({v:c, t:c})));
            items.forEach(it=>{
                const b=document.createElement('div');
                b.className='cc'+(it.v===cur?' sel':'');
                b.textContent=it.t;
                b.onclick=()=>{
                    if(window.setDraftCat) window.setDraftCat(it.v);   // 只改草稿
                    box.querySelectorAll('.cc').forEach(el=>el.classList.toggle('sel', el===b));
                    scrollChipIntoView(box, b);
                };
                box.appendChild(b);
            });
            box.scrollLeft=prevScroll;
        }

        // ===== 筛选浮层（bottom sheet）控件绑定 =====
        // 草稿模式：sheet 内所有改动只写进控件（草稿），不动列表。
        //   完成 → 提交草稿到 searchState/filterCat 并刷新列表；
        //   下滑 / 点遮罩 → 丢弃草稿，列表不变；
        //   清除全部 → 只清草稿，要点完成才生效。
        // draftCat 暂存分类选择，避免直接改 filterCat（filterCat 是已提交状态，renderBill 读它）。
        let draftCat='__all';
        // 统计筛选的草稿值：'' 全部 / 'normal' / 'flow' / 'skip'。与 draftCat 同一套草稿规则：
        // 面板里点只改草稿，点「完成」才提交进 searchState.mode。
        let draftMode='';
        const FILTER_MODE_OPTS=[ {v:'', t:'全部'}, {v:'normal', t:'计入'}, {v:'skip', t:'不计'}, {v:'flow', t:'往来'} ];
        // 1023-A：收支筛选（全部 / 支出 / 收入），和统计筛选同一套草稿规则
        let draftIo='';
        const FILTER_IO_OPTS=[ {v:'', t:'全部'}, {v:'expense', t:'支出'}, {v:'income', t:'收入'} ];
        function renderFilterIoChips(){
            const box=$('filterIoChips'); if(!box) return;
            if(!box.children.length){
                FILTER_IO_OPTS.forEach(o=>{
                    const b=document.createElement('div');
                    b.className='cc'; b.textContent=o.t; b.dataset.v=o.v; b.setAttribute('role', 'radio');
                    b.onclick=()=>{ draftIo=o.v; renderFilterIoChips(); };
                    box.appendChild(b);
                });
            }
            box.querySelectorAll('.cc').forEach(el=>{ const on=el.dataset.v===draftIo; el.classList.toggle('sel', on); el.setAttribute('aria-checked', on?'true':'false'); });
        }
        // 1023-A：日期快捷：本月 / 上月 / 近 7 天（只填起止两个框，照旧点「完成」才生效）；起止正好是它时高亮，再点一下清掉
        function quickRange(q){
            const n=new Date(), k=x=>`${x.getFullYear()}-${pad(x.getMonth()+1)}-${pad(x.getDate())}`;
            if(q==='month') return [k(new Date(n.getFullYear(), n.getMonth(), 1)), k(new Date(n.getFullYear(), n.getMonth()+1, 0))];
            if(q==='last') return [k(new Date(n.getFullYear(), n.getMonth()-1, 1)), k(new Date(n.getFullYear(), n.getMonth(), 0))];
            return [k(new Date(n.getFullYear(), n.getMonth(), n.getDate()-6)), k(n)];
        }
        function paintDateQuick(){
            const box=$('filterDateQuick'); if(!box) return;
            const f=$('searchFrom').dataset.day||'', t=$('searchTo').dataset.day||'';
            box.querySelectorAll('[data-q]').forEach(b=>{ const [a, z]=quickRange(b.dataset.q); b.classList.toggle('on', f===a && t===z); });
        }
        function renderFilterModeChips(){
            const box=$('filterModeChips'); if(!box) return;
            if(!box.children.length){
                FILTER_MODE_OPTS.forEach(o=>{
                    const b=document.createElement('div');
                    b.className='cc'; b.textContent=o.t; b.dataset.v=o.v;
                    b.onclick=()=>{ draftMode=o.v; renderFilterModeChips(); };
                    box.appendChild(b);
                });
            }
            box.querySelectorAll('.cc').forEach(el=>el.classList.toggle('sel', el.dataset.v===draftMode));
        }
        (function(){
            const kw=$('searchKeyword'), min=$('searchMin'), max=$('searchMax'),
                  from=$('searchFrom'), to=$('searchTo'),
                  fab=$('filterFab'), sheetMask=$('filterSheetMask'),
                  sheet=$('filterSheet'),
                  clearBtn=$('sheetClear'), applyBtn=$('sheetApply');

            // 把当前「已提交」状态回填到控件（打开时初始化草稿，或丢弃时还原）
            function loadCommittedIntoControls(){
                kw.value = searchState.keyword || '';
                min.value = (searchState.min!=null) ? String(searchState.min) : '';
                max.value = (searchState.max!=null) ? String(searchState.max) : '';
                from.value = searchState.from || ''; from.dataset.day = searchState.from || '';
                to.value   = searchState.to   || ''; to.dataset.day   = searchState.to   || '';
                draftCat = filterCat.value || '__all';
                draftMode = searchState.mode || '';
                renderFilterModeChips();
                draftIo = searchState.io || '';
                renderFilterIoChips(); paintDateQuick();
            }
            // 完成：把控件草稿提交为正式筛选条件，刷新列表
            function commitDraft(){
                searchState.keyword=(kw.value||'').trim().toLowerCase();
                const mn=Number(min.value), mx=Number(max.value);
                searchState.min = (min.value!=='' && isFinite(mn)) ? mn : null;
                searchState.max = (max.value!=='' && isFinite(mx)) ? mx : null;
                searchState.from = from.dataset.day || null;
                searchState.to   = to.dataset.day || null;
                searchState.mode = draftMode || null;
                searchState.io = draftIo || null;
                filterCat.value = draftCat;
                JiwenBase.curPage=1;
                renderBill();
                window.syncFilterFab();
            }
            // 暴露给分类标签点击用：只更新草稿分类，不提交
            window.setDraftCat = function(v){ draftCat = v; };
            window.getDraftCat = function(){ return draftCat; };

            // 筛选图标高亮 + 清除浮钮显隐：搜索条件或分类筛选任一生效都算「正在筛选」（基于已提交状态）
            window.__filterActive = ()=>!!(hasActiveSearch() || (filterCat.value && filterCat.value!=='__all'));   // 1019-U：首屏快照看要不要存
            window.syncFilterFab = function(){
                const active = hasActiveSearch() || (filterCat.value && filterCat.value!=='__all');
                fab.classList.toggle('active-filter', active);
                // 主页面「清除/重置」浮钮：记账页且「有筛选生效 或 不在第 1 页」时浮现（1017-N 起停下 1.5 秒淡出、滑动时再出来）。
                // 翻页也是「偏离默认视图」的一种，点 ✕ 一并回到第 1 页 + 清筛选（clearAllFilters 已含 curPage=1）。
                const cf=$('clearFilterFab');
                if(cf) fabWake(cf, (active || JiwenBase.curPage>1) && JiwenBase.currentTab==='ledger');   // 1017-N：停下 1.5 秒淡出
            };

            // 打开：先把已提交状态灌进控件作为草稿起点，再渲染分类标签（高亮草稿分类），滑入
            function openSheet(){
                loadCommittedIntoControls();
                renderFilterChips();
                sheetMask.style.display='flex';
                resetSheetDrag();
                requestAnimationFrame(()=>sheetMask.classList.add('open'));
            }
            // 关闭（不提交）：丢弃草稿——把控件还原回已提交状态，列表保持不变
            function closeSheetDiscard(){
                sheetMask.classList.remove('open');
                resetSheetDrag();
                sheetMask.style.display='none'; loadCommittedIntoControls();   // 1019-N：当场关掉，滑走的动画由共用的「影子」做（和别的面板一样）
            }
            // 暴露给系统返回键处理器：它在这个 IIFE 之外，但必须走这个正规出口
            // ——只 remove('open') 会漏掉 display 复位和拖拽 transform 复位，
            // 下次再开就会闪一下旧位置。
            window.closeFilterSheet = closeSheetDiscard;
            // 完成：提交后关闭
            function closeSheetApply(){
                commitDraft();
                sheetMask.classList.remove('open');
                resetSheetDrag();
                sheetMask.style.display='none';   // 1019-N：同上
            }
            fab.addEventListener('click', openSheet);
            applyBtn.addEventListener('click', closeSheetApply);
            // 点浮层外的遮罩区域 = 丢弃关闭
            // 【不做「点遮罩关闭」】全应用统一：所有浮层只能通过明确的按钮/手势关闭。
            //   误触遮罩把已填的筛选条件丢掉，代价远大于省下的一次点击；
            //   而且此前只有这一个浮层能点外部关闭，行为不一致本身就是坑。
            //   这里保留 grip 下拉手势和「关闭」按钮两条正规出口，足够了。

            // 日期：选定后只写控件草稿（显示值 + dataset.day），不提交、不刷新列表
            from.addEventListener('click', ()=>{
                openDtPickerDate(from.dataset.day || '', (day)=>{
                    from.value=day; from.dataset.day=day; paintDateQuick();
                });
            });
            to.addEventListener('click', ()=>{
                openDtPickerDate(to.dataset.day || '', (day)=>{
                    to.value=day; to.dataset.day=day; paintDateQuick();
                });
            });
            $('filterDateQuick').addEventListener('click', e=>{
                const b=e.target.closest('[data-q]'); if(!b) return;
                const [a, z]=b.classList.contains('on') ? ['', ''] : quickRange(b.dataset.q);
                from.value=a; from.dataset.day=a; to.value=z; to.dataset.day=z;
                paintDateQuick();
            });

            // 清除全部：只清草稿（控件 + 草稿分类），不动已提交状态、不刷新列表
            clearBtn.addEventListener('click', ()=>{
                kw.value=''; min.value=''; max.value='';
                from.value=''; from.dataset.day=''; to.value=''; to.dataset.day='';
                draftCat='__all';
                draftMode=''; renderFilterModeChips();
                draftIo=''; renderFilterIoChips(); paintDateQuick();
                renderFilterChips();   // 重渲染让分类高亮回到「全部」
            });

            // 往下拉关闭：和导入页的选择面板共用 bindSheetDrag（1017-UI1 抽出去的，逻辑一字未改）
            const sheetDrag=bindSheetDrag(sheetMask, sheet, $('filterSheetGrip'), ()=>closeSheetDiscard());
            function resetSheetDrag(){ sheetDrag.reset(); }
        })();

        // ===== 搜索状态：记账页顶部的备注/金额/日期筛选，与分类标签筛选叠加 =====
        // 金额存数字（null 表示不限）；日期存 'YYYY-MM-DD'（null 表示不限）；关键词存小写串。
        // mode：统计筛选，null 表示不限，否则为 'normal' / 'flow' / 'skip'
        const searchState={ keyword:'', min:null, max:null, from:null, to:null, mode:null, rv:false, io:null };   // io：1023-A 收支筛选（'expense' / 'income'）   // rv：1021-T13 只看待确认分类
        const MODE_NAME={ normal:'计入', skip:'不计', flow:'往来' };

        // 是否有任意搜索条件生效（用于显示「清除」入口、高亮筛选按钮、空结果提示文案）
        function hasActiveSearch(){
            return !!(hasTextSearch() || searchState.mode || searchState.rv || searchState.io);
        }
        // 只看关键词 / 金额 / 日期（不含口径），用来决定徽标里写不写「搜索」
        function hasTextSearch(){
            return !!(searchState.keyword || searchState.min!=null || searchState.max!=null
                      || searchState.from || searchState.to);
        }

        // 重置搜索状态与界面控件（切换存档/登录时调用，避免筛选条件跨存档残留）
        function resetSearch(){
            searchState.keyword=''; searchState.min=null; searchState.max=null;
            searchState.from=null; searchState.to=null; searchState.mode=null; searchState.rv=false; searchState.io=null;
            draftMode=''; renderFilterModeChips();
            draftIo=''; renderFilterIoChips();
            lgYM=null;   // 1023-C：回到这个月
            const kw=$('searchKeyword'), min=$('searchMin'), max=$('searchMax'),
                  from=$('searchFrom'), to=$('searchTo');
            if(kw) kw.value='';
            if(min) min.value='';
            if(max) max.value='';
            if(from){ from.value=''; from.dataset.day=''; }
            if(to){ to.value=''; to.dataset.day=''; }
            paintDateQuick();
            if(window.setDraftCat) window.setDraftCat('__all');   // 草稿分类也归零，避免跨存档残留
            if(window.syncFilterFab) window.syncFilterFab();
        }

        // 一键清除全部筛选（主页面浮钮用）：搜索条件 + 分类一并归零，立即刷新列表。
        // 与 sheet 内「清除全部」不同——那个只清草稿、要点完成才生效；这个在浮层外，直接生效。
        function clearAllFilters(){
            resetSearch();                 // 清搜索条件 + 控件 + 草稿分类
            filterCat.value='__all';       // 分类筛选也归零（resetSearch 不动分类，这里补上）
            JiwenBase.curPage=1;
            if(window.syncFilterFab) window.syncFilterFab();            // 先同步浮钮/图标状态
            if($('filterChips')) renderFilterChips();                  // sheet 若开着，分类高亮回「全部」
            renderBill();                                              // 再刷新列表
            // ✕ 是「一键回到默认」：数据回退（清筛选+回第 1 页）后，视图也回到账单顶部，
            // 与翻页/起飞同一落点（billHead），避免只回数据、视口却停在半空。
            scrollListTop();
        }

        // 单条记录是否命中当前搜索条件（分类筛选不在这里，单独处理）
        function searchMatch(r){
            // 关键词：匹配备注（不区分大小写）
            if(searchState.keyword){
                const rk=(r.remark||'').toLowerCase();
                if(!rk.includes(searchState.keyword)) return false;
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
            // 统计
            if(searchState.mode && recMode(r)!==searchState.mode) return false;
            if(searchState.rv && r.rv!==1) return false;
            if(searchState.io && r.type!==searchState.io) return false;   // 1023-A：收支（退款算收入）
            return true;
        }

        // 「当前筛选命中」的唯一判定。列表渲染和批量操作都调它——两边各写一套，
        // 早晚会出现「列表显示 12 条，实际改了 13 条」。filterVal 不传则读已提交的 filterCat。
        function filterMatch(r, filterVal){
            const fv = (filterVal===undefined) ? filterCat.value : filterVal;
            return (fv==='__all' ? true : r.cat===fv) && searchMatch(r);
        }

        // 1016-R：空账本的小入口「有微信、支付宝账单？可以一次导进来 ›」。只在开发开关开着、账本少于 IMP_EMPTY_MAX 条时出现，
        //   记了几条以后消失；开关关着时不生成任何东西
        const IMP_EMPTY_MAX=5;
        // 第二期（1016-Z7）：月初导入提醒，只在 App 里（不发系统通知）。每月前 IMP_REMIND_DAYS 天，这个存档导入过账单、
        //   而最后一次导到的日子还没到上个月月底，就在账单上方放一条「上个月的账单可以导了」；点「这个月不提醒」只在这台手机上记住
        //   （localStorage 的 app_imp_remind_<账号>__<存档> = 年-月，不进备份）。开发开关开着才有
        const IMP_REMIND_DAYS=10;
        var __remindSeq=0;
        function renderImpRemind(){
            const my=++__remindSeq;
            let on=false; try{ on=localStorage.getItem('app_dev_import')==='1'; }catch(_){}
            const old=$('impRemind');
            let t=null; if(on){ try{ t=impTarget(); }catch(_){ t=null; } }
            const now=new Date(), ym=`${now.getFullYear()}-${pad(now.getMonth()+1)}`;
            const rk=`app_imp_remind_${JiwenBase.currentUser}__${JiwenBase.currentArchive}`;
            let dismissed=false; try{ dismissed=localStorage.getItem(rk)===ym; }catch(_){}
            if(!t || now.getDate()>IMP_REMIND_DAYS || dismissed){ if(old) old.remove(); return; }
            const pm=new Date(now.getFullYear(), now.getMonth(), 0), pmEnd=`${pm.getFullYear()}-${pad(pm.getMonth()+1)}-${pad(pm.getDate())}`;
            impGetJson(t.e, impLogKey(t.e.id, t.aid)).then(o=>{
                if(my!==__remindSeq) return;
                const logs=((o && o.list) || []).filter(l=>!l.only && l.kind!=='ai');
                let last=''; logs.forEach(l=>{ if(l.to && l.to>last) last=l.to; });
                let b=$('impRemind');
                if(!logs.length || last>=pmEnd){ if(b) b.remove(); return; }
                if(!b){
                    b=document.createElement('div'); b.id='impRemind'; b.className='stat-pend-banner';
                    const head=$('billHead'); head.parentNode.insertBefore(b, head);
                }
                b.textContent='';
                const tx=document.createElement('span'); tx.textContent=`${pm.getMonth()+1} 月的微信、支付宝账单可以导了（上次导到 ${last}）`;
                const go=document.createElement('button'); go.type='button'; go.id='impRemindGo'; go.textContent='去导入';
                go.addEventListener('click', ()=>{ loadImportUI().then(ui=>ui.open()).catch(e=>customAlert('导入模块没加载上：' + (e && e.message || e), '导入')); });
                const no=document.createElement('button'); no.type='button'; no.id='impRemindOff'; no.textContent='这个月不提醒';
                no.addEventListener('click', ()=>{ try{ localStorage.setItem(rk, ym); }catch(_){} const x=$('impRemind'); if(x) x.remove(); });
                b.appendChild(tx); b.appendChild(go); b.appendChild(no);
            }).catch(()=>{ if(my===__remindSeq){ const x=$('impRemind'); if(x) x.remove(); } });
        }
        // 1021-T13（实测 10-20）：账单页顶上「待确认分类 N」小胶囊（开发开关开着、有 rv 标记的记录时才有）：点了等于一个筛选，
        //   再用现成的多选、批量改分类慢慢改（改了分类就去掉标记）；开着时写「只看待确认分类 · N ✕」，再点回到全部
        function renderRvChip(raw){
            let on=false; try{ on=localStorage.getItem('app_dev_import')==='1'; }catch(_){}
            const n=on ? raw.filter(r=>r.rv===1).length : 0;
            let b=$('rvChip');
            if(!on || (!n && !searchState.rv)){ if(b) b.remove(); if(!on) searchState.rv=false; return; }
            if(!b){
                b=document.createElement('button'); b.type='button'; b.id='rvChip'; b.className='rv-chip';
                b.addEventListener('click', ()=>{ searchState.rv=!searchState.rv; JiwenBase.curPage=1; if(window.syncFilterFab) window.syncFilterFab(); renderBill(); if(searchState.rv) scrollListTop(); });
                const head=$('billHead'); head.parentNode.insertBefore(b, head);
            }
            b.classList.toggle('on', !!searchState.rv);
            b.textContent = searchState.rv ? `只看待确认分类 · ${n} 条  ✕` : `待确认分类 ${n} 条 ›`;
        }
        function renderImpEmptyEntry(n){
            let on=false; try{ on=localStorage.getItem('app_dev_import')==='1'; }catch(_){}
            let b=$('impEmptyEntry');
            if(!on || n>=IMP_EMPTY_MAX){ if(b) b.remove(); return; }
            if(b) return;
            b=document.createElement('button'); b.type='button'; b.id='impEmptyEntry'; b.className='imp-empty-entry';
            b.textContent='有微信、支付宝账单？可以一次导进来 ›';
            b.addEventListener('click', ()=>{ loadImportUI().then(ui=>ui.open()).catch(e=>customAlert('导入模块没加载上：' + (e && e.message || e), '导入')); });
            const head=$('billHead'); head.parentNode.insertBefore(b, head);
        }
        // ===== 1023-C：账单页按月显示 =====
        //   顶上一条细条「10月 支出 x 收入 y 统计 ›」吸在顶上（点了去统计页同一个月，绑定在外壳 tabs 里）；
        //   下面这个月的记录全部一直往下排（不分页）：每周开头一条周小计、每天一张卡片、每笔两行；
        //   没记账的日子：今天还没记单独一条「记一笔」，过去连着没记的几天合成一条虚线框「补一笔」（按周断开），只到今天、不早于账本第一笔。
        //   有筛选时（1023-G 之前的老筛选浮层）不按月：全部命中的照同样的周 / 天排，不显示没记账的日子。
        //   月份由底栏上方的月份浮条切（JiwenMonthStrip，停 1.5 秒收起，滑列表时出来）。lgYM：null = 这个月，别的是 'YYYY-MM'
        let lgYM=null;
        const CHEV='<svg class="lg-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
        function ymNow(){ const n=new Date(); return `${n.getFullYear()}-${pad(n.getMonth()+1)}`; }
        function curYM(){ return lgYM || ymNow(); }
        function ymLabel(ym){ const y=+ym.slice(0,4); return (y!==new Date().getFullYear() ? y+'年' : '')+(+ym.slice(5,7))+'月'; }
        const lgStrip=window.JiwenMonthStrip.create({ id:'lgStrip', onPick:ym=>setYM(ym) });
        function setYM(ym){
            lgYM = (!ym || ym===ymNow()) ? null : ym;
            renderBill();
            const bar=$('billHead'), y=bar ? bar.getBoundingClientRect().top + window.scrollY : 0;
            if(window.scrollY > y) window.scrollTo({ top:y, behavior:'instant' });   // 切了月份：停在细条那里，新月份从头看
        }
        function stripWake(){
            if(hasActiveSearch() || (filterCat.value && filterCat.value!=='__all')){ lgStrip.hide(); return; }   // 筛选时列的是全部月份里命中的，月份浮条不出
            if(JiwenBase.currentTab==='ledger' && $('pageLedger').style.display!=='none') lgStrip.wake();
        }
        window.addEventListener('scroll', stripWake, { passive:true });
        function ovOff(){ return lgYM!=null; }   // 首屏快照：看的不是这个月就不存（名字是 1023-A 留下来的）
        function sumFen(list){ let i=0, e=0; list.forEach(r=>{ const c=statContrib(r); i+=Math.round(c.inc*100); e+=Math.round(c.exp*100); }); return { inc:i/100, exp:e/100 }; }
        function sumHtml(s, emptyText){
            if(!s.exp && !s.inc) return emptyText ? `<span class="lg-sum-e">${emptyText}</span>` : '';
            return (s.exp ? `<span>支出 <b>${s.exp.toFixed(2)}</b></span>` : '') + (s.inc ? `<span>收入 <b class="pos">${s.inc.toFixed(2)}</b></span>` : '');
        }
        function rowHtml(r, rMap){
            const isExp=r.type==='expense', amt=safeNum(r.money).toFixed(2);
            const tags=(isRefund(r) ? '<span class="io-tag io-refund">退款</span>' : '') + modeTag(r) + refundedTag(r, rMap);
            const remark=(r.remark||'').trim(), cat=r.cat||'未分类';
            return `<div class="bl-row" data-act="detail" data-id="${escapeHtml(r.id)}" role="button">`
                + `<div class="bl-main"><div class="bl-t"><span class="bl-t-x">${escapeHtml(remark || cat)}</span>${tags}</div>`
                + `<div class="bl-sub"><span class="bl-cat-t">${escapeHtml(cat)}</span> · <span class="bl-time">${escapeHtml((r.time||'').slice(11,16))}</span></div></div>`
                + `<span class="bl-amt ${isExp ? 'out' : 'pos'}${modeAmtCls(r)}">${isExp ? '−' : '+'}${amt}</span></div>`;
        }
        function gapHtml(a, b, today){
            const C=cal;
            if(a===b && a===today) return `<div class="lg-gap lg-gap-today" data-a="${a}" data-b="${b}"><span class="lg-gap-t">今天 · ${C.mdText(a)} ${C.wdText(a)}，还没记账</span><button type="button" class="lg-gap-btn" data-add="${a}">记一笔</button></div>`;
            const t = a===b ? `${C.mdText(a)} ${C.wdText(a)}，没记账` : `${C.rangeText(a, b)}，${Math.round((C.kd(b)-C.kd(a))/86400000)+1} 天没记`;
            return `<div class="lg-gap" data-a="${a}" data-b="${b}"><span class="lg-gap-t">${t}</span><button type="button" class="lg-gap-btn" data-add="${b}">补一笔</button></div>`;
        }
        // recs：要显示的记录（时间正序）。opt.ym：按月显示的那个月（带没记账的日子）；不传 = 筛选结果（不带）
        //   opt.first：账本第一笔的日子（没记账的日子不往前超过它）
        function listHtml(recs, opt){
            const C=cal, today=C.todayKey(), rMap=refundedMap(getUserData());
            const byDay=new Map();
            const noDay=[];   // 时间不是正常日子的（老数据里没写时间的）：单独一张卡片放最后
            recs.forEach(r=>{ const k=(r.time||'').slice(0,10); if(!/^\d{4}-\d{2}-\d{2}$/.test(k)){ noDay.push(r); return; } if(!byDay.has(k)) byDay.set(k, []); byDay.get(k).push(r); });
            let days;
            if(opt.ym){
                const a=opt.ym+'-01', z=C.monthEnd(opt.ym);
                let hi = z<today ? z : today, lo = opt.first && opt.first>a ? opt.first : a;
                if(byDay.size){ const ks=[...byDay.keys()].sort(); if(ks[ks.length-1]>hi) hi=ks[ks.length-1]; if(ks[0]<lo) lo=ks[0]; }   // 记在今天以后的照样列出来
                days=[]; for(let k=hi; k>=lo; k=C.addDay(k, -1)) days.push(k);
            } else days=[...byDay.keys()].sort().reverse();
            const todayMon = C.kd(today).getDay()===1;
            const parts=[];   // 一块一块（周小计、没记账那条、一张日卡片），n 是这块里有几笔：给分批画用
            const put=(h, n)=>parts.push({ h, n:n||0 });
            let wkKey=null, run=null;
            const flush=()=>{ if(run){ put(gapHtml(run.lo, run.hi, today)); run=null; } };
            days.forEach(k=>{
                const mon=C.monOf(k), key=mon+'|'+k.slice(0,7);
                if(key!==wkKey){
                    flush(); wkKey=key;
                    const ym=k.slice(0,7), ma=ym+'-01', mz=C.monthEnd(ym);
                    const a = mon<ma ? ma : mon, z0=C.addDay(mon, 6), z = z0>mz ? mz : z0;
                    const inWk=recs.filter(r=>{ const d=(r.time||'').slice(0,10); return d>=a && d<=z; });
                    if(!(mon===C.monOf(today) && todayMon)){
                        put(`<button type="button" class="lg-wk" data-mon="${mon}" data-a="${a}" data-b="${z}"><span class="lg-wk-n">${C.weekName(mon)}</span><span class="lg-wk-r">${C.rangeText(a, z)}</span><span class="lg-sum">${sumHtml(sumFen(inWk), inWk.length ? '' : '这周一笔没记')}</span>${CHEV}</button>`);
                    }
                }
                const list=byDay.get(k);
                if(!list){
                    if(k===today){ flush(); put(gapHtml(k, k, today)); return; }
                    if(run) run.lo=k; else run={ hi:k, lo:k };
                    return;
                }
                flush();
                const desc=list.slice().reverse();
                put(`<div class="lg-dc" data-day="${k}"><button type="button" class="lg-dh bl-day" data-day="${k}"><span class="bl-day-d">${escapeHtml(C.dayTitle(k))}</span><span class="lg-sum bl-day-sum">${sumHtml(sumFen(list))}</span>${CHEV}</button>`
                    + desc.map(r=>rowHtml(r, rMap)).join('') + `</div>`, list.length);
            });
            flush();
            if(noDay.length) put(`<div class="lg-dc lg-dc-noday"><div class="lg-dh bl-day"><span class="bl-day-d">没写时间的</span><span class="lg-sum bl-day-sum">${sumHtml(sumFen(noDay))}</span></div>`
                + noDay.slice().reverse().map(r=>rowHtml(r, rMap)).join('') + `</div>`, noDay.length);
            return parts;
        }
        // 月份浮条的月份表：账本第一笔的月份到这个月，每格是那个月的支出
        function stripMonths(allAsc){
            const now=ymNow(), exp=new Map();
            let first=now;
            allAsc.forEach(r=>{ const ym=(r.time||'').slice(0,7); if(!/^\d{4}-\d{2}$/.test(ym)) return; if(ym<first) first=ym; exp.set(ym, (exp.get(ym)||0)+statContrib(r).exp); });
            const out=[];
            for(let ym=first; ym<=now; ){ out.push({ ym, v:round2(Math.max(0, exp.get(ym)||0)) }); let y=+ym.slice(0,4), m=+ym.slice(5,7)+1; if(m>12){ m=1; y++; } ym=`${y}-${pad(m)}`; }
            return out;
        }
        // 账单页的点击：周小计 / 日期抬头（1023-D 接详情抽屉）、没记账那条的「记一笔 / 补一笔」
        billList.addEventListener('click', e=>{
            const add=e.target.closest('[data-add]');
            if(add){ e.stopPropagation(); openAddModal({ day:add.dataset.add }); return; }
        });

        // 一个月几百上千笔时分批画：先画前 LIST_FIRST 笔左右（整张日卡片为单位，一屏多），剩下的每次 LIST_CHUNK 笔、让浏览器喘口气再接着画；
        //   重画时没画完的作废。要用到整页高度的（被杀回来放回滚动位置）先 listFlush() 一次画完
        const LIST_FIRST=300, LIST_CHUNK=400;
        let listRest=[], listT=null;
        function takeParts(max){ let h='', n=0; while(listRest.length && (n<max || !h)){ const p=listRest.shift(); h+=p.h; n+=p.n; } return h; }
        function listPaint(parts){
            clearTimeout(listT); listT=null;
            listRest=parts.slice();
            billList.innerHTML=takeParts(LIST_FIRST);
            if(listRest.length) listT=setTimeout(listStep, 0);
        }
        function listStep(){ listT=null; if(!listRest.length) return; billList.insertAdjacentHTML('beforeend', takeParts(LIST_CHUNK)); if(listRest.length) listT=setTimeout(listStep, 16); }
        function listFlush(){ clearTimeout(listT); listT=null; if(listRest.length) billList.insertAdjacentHTML('beforeend', takeParts(Infinity)); }

        function renderBill(){
            const filterVal=filterCat.value;
            const raw=getUserData();
            renderImpEmptyEntry(raw.length); renderImpRemind(); renderRvChip(raw);
            // 【为什么先算时间戳再排序】排序要做 O(n log n) 次比较，比较器里每次 parseRecTime 太贵：先给每条只解析一次（Schwartzian transform）
            //   同一分钟多笔按存储里的原始顺序（稳定且唯一）
            const allAsc=raw
                .map((r,origIdx)=>({ r, origIdx, ts:parseRecTime(r.time).getTime() }))
                .sort((a,b)=>{ const t=a.ts-b.ts; return t!==0 ? t : a.origIdx-b.origIdx; })
                .map(x=>x.r);
            const filtering = filterVal!=='__all' || hasActiveSearch();
            const ym=curYM();
            lgStrip.set(stripMonths(allAsc), ym);
            if(filtering) lgStrip.hide();
            // 顶上的细条：这个月的支出、收入（统计页同一口径 statContrib）；筛选时藏起来（下面是全部命中的，不是一个月）
            const bar=$('billHead');
            const isNow=ym===ymNow();
            const mon=allAsc.filter(r=>{ const m=(r.time||'').slice(0,7); return m===ym || (isNow && !/^\d{4}-\d{2}$/.test(m)); });   // 没写时间的放在这个月里
            const ms=sumFen(mon);
            bar.innerHTML=`<span class="lg-bar-m" id="lgMonth">${ymLabel(ym)}</span><span class="lg-bar-s">支出 <b class="lg-out ov-out">${ms.exp.toFixed(2)}</b></span><span class="lg-bar-s">收入 <b class="pos lg-in ov-in">${ms.inc.toFixed(2)}</b></span><span class="lg-bar-go">统计 ›</span>`;
            bar.setAttribute('aria-label', `到统计页看${ymLabel(ym)}`);
            bar.style.display = filtering ? 'none' : '';
            const asc=filtering ? allAsc.filter(r=>filterMatch(r, filterVal)) : mon;
            // 筛选小计和批量入口（1023-G 搬去搜一笔的结果页）
            const fBar=$('summaryFilter'), bBar=$('batchBar');
            if(filtering){
                let fIn=0, fOut=0, fSkip=0, fFlow=0;
                asc.forEach(item=>{ const c=statContrib(item); fIn+=c.inc; fOut+=c.exp; if(isSkip(item)) fSkip++; else if(isFlow(item)) fFlow++; });
                const fEx=[];
                if(fSkip) fEx.push(`${fSkip} 条不计`);
                if(fFlow) fEx.push(`${fFlow} 条往来`);
                fIn=round2(fIn); fOut=round2(fOut);
                const bp=[];
                if(filterVal!=='__all') bp.push(filterVal);
                if(hasTextSearch()) bp.push('搜索');
                if(searchState.io) bp.push(searchState.io==='expense' ? '支出' : '收入');
                if(searchState.mode) bp.push(MODE_NAME[searchState.mode]);
                const badge=bp.join('·')||'搜索';
                fBar.innerHTML=
                    `<span class="filter-badge">${escapeHtml(badge)}</span>`+
                    `<span class="filter-nums">`+
                        `<span class="fn-seg">命中 <b>${asc.length}</b> 条${fEx.length?`<em class="fn-ex">（其中 ${fEx.join('、')}）</em>`:''}</span>`+
                        `<span class="fn-seg">收入 <b class="pos">${fIn.toFixed(2)}</b></span>`+
                        `<span class="fn-seg">支出 <b class="neg">${fOut.toFixed(2)}</b></span>`+
                    `</span>`;
                fBar.style.display='flex';
            } else fBar.style.display='none';
            // 批量入口只在筛选生效且有命中时出现——没有筛选就等于「全部记录」，一不小心就改了整本账
            if(filtering && asc.length){
                bBar.innerHTML=`<button class="batch-btn" data-act="batch"><span>批量操作</span><span class="bb-sub">当前筛选命中 ${asc.length} 条 ›</span></button>`;
                bBar.style.display='';
            } else { bBar.innerHTML=''; bBar.style.display='none'; }

            if(filtering && !asc.length){
                listPaint([]); billList.innerHTML=`<div class="empty-tip">没有符合条件的记录<div class="empty-sub">换个条件试试，或点右下角 ✕ 清掉筛选</div></div>`;
                return;
            }
            const first=allAsc.length ? (allAsc[0].time||'').slice(0,10) : cal.todayKey();   // 一笔都没有：只有今天那条
            listPaint(filtering ? listHtml(asc, {}) : listHtml(asc, { ym, first }));
        }

        // ===== 批量操作（基于当前筛选结果）=====
        // 范围 = 当前筛选命中的**全部**记录（不只是当前页），判定与列表共用 filterMatch。
        // 不可逆操作的保护：确认框写明条数并列出样例；完成后给一次「撤销」。
        // 撤销只记被改记录的旧分类和口径（体积很小），只在完成弹窗里提供一次。
        let batchUndo=null;
        $('batchBar').addEventListener('click', e=>{
            if(e.target.closest('[data-act="batch"]')) openBatchMenu();
        });
        function openBatchMenu(){
            const hit=getUserData().filter(r=>filterMatch(r));
            if(!hit.length){ customAlert('当前筛选没有命中任何记录。'); return; }
            // 退款记录的分类 / 口径永远跟原账单走，不单独改（1010-J）
            const list=hit.filter(r=>!isRefund(r));
            const rfN=hit.length-list.length;
            if(!list.length){ customAlert(`命中的 ${rfN} 条都是退款记录。退款的分类和统计跟着原账单走，请改原账单。`); return; }
            customChoose(`对当前筛选命中的 ${list.length} 条记录（不只是这一页）：${rfN?`\n另有 ${rfN} 条退款记录不参与，会跟着各自的原账单一起变。`:''}`, [
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
            // 把筛选分类切到新分类，让刚改的这批仍在眼前。
            const prevFilter=filterCat.value;
            if(change.cat!==undefined && prevFilter!=='__all' && prevFilter!==change.cat){
                filterCat.value=change.cat;
            }
            JiwenBase.curPage=1;
            window.JiwenTabs.refreshAllViews(); renderFilterChips(); if(window.syncFilterFab) window.syncFilterFab();
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
            filterCat.value=u.prevFilter;         // 分类表没变，原筛选值一定还在
            JiwenBase.curPage=1;
            window.JiwenTabs.refreshAllViews(); renderFilterChips(); if(window.syncFilterFab) window.syncFilterFab();
            customAlert(`已撤销，${u.prev.filter(p=>!p.follow).length} 条记录恢复原样。`);
        }
        function scrollListTop(){
            const t=$('billHead') || document.querySelector('table');
            if(t) t.scrollIntoView({ behavior:'smooth', block:'start' });
        }
        window.JiwenLedger = { applyBatch, clearAllFilters, curYM, listFlush, openBatchMenu, ovOff, renderBill, setYM, stripWake, renderFilterChips, resetSearch, undoBatch };   // ledger 模块对外只有这一个入口
})();
