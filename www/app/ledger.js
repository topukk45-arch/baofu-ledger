(function(){
        const { $, MODE_HINT, PAGE_SIZE, billList, escapeHtml, fabHold, fabWake, filterCat, fitNums, isFlow, isSkip, pad, parseRecTime, recMode, round2, safeNum, setRecMode } = window.JiwenBase;   // 用到前面模块的
        const { balContrib, charLen, charSlice, getCats, getUserData, impGetJson, impLogKey, impTarget, isRefund, modeAmtCls, modeTag, refundedMap, refundedTag, saveUserData, statContrib } = window.JiwenStore;   // 用到前面模块的
        const { bindSheetDrag } = window.JiwenPanel;   // 用到前面模块的
        const { askCancel, customAlert, customChoose, customConfirm } = window.JiwenAsk;   // 用到前面模块的
        const { openDtPickerDate } = window.JiwenDate;   // 用到前面模块的
        const { loadImportUI, scrollChipIntoView } = window.JiwenImportEntry;   // 用到前面模块的
        // 账单表事件委托：备注查看 / 修改。用 data-act + data-id 取代内联 onclick，
        // 既杜绝把记录 id 拼进 HTML 属性的注入隐患，也避免每行绑定监听。
        billList.addEventListener('click', e => {
            const el = e.target.closest('[data-act]');
            if(!el || !billList.contains(el)) return;
            const id = el.dataset.id;
            if(el.dataset.act==='remark'){ window.viewRemark && window.viewRemark(id); }
            else if(el.dataset.act==='edit'){ window.openEdit && window.openEdit(id); }
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
                    from.value=day; from.dataset.day=day;
                });
            });
            to.addEventListener('click', ()=>{
                openDtPickerDate(to.dataset.day || '', (day)=>{
                    to.value=day; to.dataset.day=day;
                });
            });

            // 清除全部：只清草稿（控件 + 草稿分类），不动已提交状态、不刷新列表
            clearBtn.addEventListener('click', ()=>{
                kw.value=''; min.value=''; max.value='';
                from.value=''; from.dataset.day=''; to.value=''; to.dataset.day='';
                draftCat='__all';
                draftMode=''; renderFilterModeChips();
                renderFilterChips();   // 重渲染让分类高亮回到「全部」
            });

            // 往下拉关闭：和导入页的选择面板共用 bindSheetDrag（1017-UI1 抽出去的，逻辑一字未改）
            const sheetDrag=bindSheetDrag(sheetMask, sheet, $('filterSheetGrip'), ()=>closeSheetDiscard());
            function resetSheetDrag(){ sheetDrag.reset(); }
        })();

        // ===== 搜索状态：记账页顶部的备注/金额/日期筛选，与分类标签筛选叠加 =====
        // 金额存数字（null 表示不限）；日期存 'YYYY-MM-DD'（null 表示不限）；关键词存小写串。
        // mode：统计筛选，null 表示不限，否则为 'normal' / 'flow' / 'skip'
        const searchState={ keyword:'', min:null, max:null, from:null, to:null, mode:null };
        const MODE_NAME={ normal:'计入', skip:'不计', flow:'往来' };

        // 是否有任意搜索条件生效（用于显示「清除」入口、高亮筛选按钮、空结果提示文案）
        function hasActiveSearch(){
            return !!(hasTextSearch() || searchState.mode);
        }
        // 只看关键词 / 金额 / 日期（不含口径），用来决定徽标里写不写「搜索」
        function hasTextSearch(){
            return !!(searchState.keyword || searchState.min!=null || searchState.max!=null
                      || searchState.from || searchState.to);
        }

        // 重置搜索状态与界面控件（切换存档/登录时调用，避免筛选条件跨存档残留）
        function resetSearch(){
            searchState.keyword=''; searchState.min=null; searchState.max=null;
            searchState.from=null; searchState.to=null; searchState.mode=null;
            draftMode=''; renderFilterModeChips();
            const kw=$('searchKeyword'), min=$('searchMin'), max=$('searchMax'),
                  from=$('searchFrom'), to=$('searchTo');
            if(kw) kw.value='';
            if(min) min.value='';
            if(max) max.value='';
            if(from){ from.value=''; from.dataset.day=''; }
            if(to){ to.value=''; to.dataset.day=''; }
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
        // 【1017-M】opt.pageOnly：翻页时只换列表那几行，总览、分类汇总、日子卡、筛选小计一概不动
        //   （以前翻页也整页重画：先清空列表、中间量字号逼浏览器排一次版，页面那一刻只剩上半截，
        //    滚动位置被夹到 0，再平滑滚回来——看着像整页重播一遍、上下晃）
        function renderBill(opt){
            const pageOnly=!!(opt && opt.pageOnly);
            const filterVal=filterCat.value;
            // 结余必须基于「全部记录」累计，否则筛选时结余列会误导（这正是账对不上的根源）
            // 先对全部记录按时间正序，算出每笔的真实账户累计结余。
            // 时间精度仅到分钟，同分钟多笔用「记录在存储数组里的原始顺序」作次级键——
            // 它天然稳定且唯一，不依赖 id 的字符串大小（旧 id 不定长，字符串比较会乱序）。
            const raw=getUserData();
            if(!pageOnly){ renderImpEmptyEntry(raw.length); renderImpRemind(); pagerPad(0); }
            // 【为什么先算时间戳再排序】比较器里每调一次 parseRecTime 就是一次
            //   正则 + new Date()。而排序要做 O(n log n) 次比较，每次比较调两遍
            //   —— 12000 条记录约 16 万次比较、32 万次解析，实测占掉 renderBill
            //   全部耗时的 96%（253ms 里有 244ms）。
            //   改成先给每条**只解析一次**（O(n)），排序时比较纯数字。
            //   这就是经典的 Schwartzian transform：用一次预计算换掉重复计算。
            const allAsc=raw
                .map((r,origIdx)=>({ r, origIdx, ts:parseRecTime(r.time).getTime() }))
                .sort((a,b)=>{
                    const t=a.ts-b.ts;
                    if(t!==0) return t;
                    return a.origIdx-b.origIdx;   // 同分钟多笔：按存储原始顺序，稳定且唯一
                })
                .map(x=>x.r);

            let running=0;
            // 每笔的累计结余按「记录对象」记在 balOf 里。
            // 后续筛选/反转/分页都带着同一对象走，渲染时按对象取值，不经过 id 查表，
            // 因此旧数据里即便存在偶发重复 id 也绝不会互相覆盖、算错结余。
            //   【1013-G】以前直接挂在记录上（__bal）；现在记录是账本缓存里共用的、冻结的，不能往上挂东西
            const balOf=new Map();
            allAsc.forEach(item=>{
                const c=balContrib(item);        // 结余口径：只有「不计」不算，「往来」照算
                running += c.inc - c.exp;
                running = Math.round(running*100)/100;   // 每步对齐到分，避免浮点误差累积（如 19.99 显示成 20.00）
                balOf.set(item, running);
            });

            // 再按筛选条件取出要显示的子集（仍保持时间正序）：分类标签 + 搜索条件叠加
            const asc=allAsc.filter(r=>filterMatch(r, filterVal));

            // 【1017-M】列表不在这里先清空：新的几行在下面拼好了一次换上，中间不留「列表是空的」那一刻
            // 只有存档里**一条记录都没有**时才隐藏汇总区。
            // 此前是「筛选结果为空」也一并隐藏，导致筛选没命中时顶部总览、分类汇总全没了——
            // 全局总览本不该受筛选影响。现在筛选没命中走下面的正常流程，小计条显示「命中 0 条」。
            if(allAsc.length===0){
                billList.innerHTML=`<tr><td colspan="7" class="empty-tip">暂无记账记录</td></tr>`;
                // 无记录时连同容器一起隐藏，避免留下带底色/内边距的空白色块
                $('summaryOverall').innerHTML=''; $('summaryOverall').style.display='none';
                $('summaryFilter').style.display='none';
                $('batchBar').innerHTML=''; $('batchBar').style.display='none';
                $('catStats').innerHTML=''; $('catStatsCard').style.display='none';
                renderPager(0);
                return;
            }
            if(!pageOnly){
            // 有记录：确保汇总/分类统计容器恢复显示（上次可能被空数据分支隐藏过）
            $('summaryOverall').style.display='';
            $('catStatsCard').style.display='';

            // 汇总：收入/支出/结余。结余始终为全账户净额，不随筛选变化
            let totalIn=0, totalOut=0;
            let balIn=0, balOut=0;
            allAsc.forEach(item=>{
                const c=statContrib(item);
                totalIn+=c.inc; totalOut+=c.exp;
                const b=balContrib(item);
                balIn+=b.inc; balOut+=b.exp;
            });
            totalIn=round2(totalIn); totalOut=round2(totalOut);
            // 结余走结余口径：期初存款这类「往来」不进收入，但必须进结余
            const net=round2(round2(balIn)-round2(balOut));

            // 筛选状态下额外提示当前子集的收支，避免「为什么数字对不上」的疑惑
            // 现在「筛选」= 分类标签筛选 或 搜索条件，任一生效都显示这条小计
            const filtering = filterVal!=='__all' || hasActiveSearch();
            $('summaryOverall').innerHTML=
                `<div class="ov-head"><span class="ov-title">账户总览</span><span class="ov-count">共 <b>${allAsc.length}</b> 条</span></div>`+
                `<div class="ov-bal"><div class="ov-label">结余（元）</div><div class="ov-num ov-net" data-fit>${net.toFixed(2)}</div></div>`+
                `<div class="ov-row">`+
                    `<div class="ov-cell"><div class="ov-label">累计收入</div><div class="ov-num ov-in pos" data-fit>+${totalIn.toFixed(2)}</div></div>`+
                    `<div class="ov-cell"><div class="ov-label">累计支出</div><div class="ov-num ov-out neg" data-fit>−${totalOut.toFixed(2)}</div></div>`+
                `</div>`;
            fitNums($('summaryOverall'));

            const fBar=$('summaryFilter');
            if(filtering){
                let fIn=0, fOut=0, fSkip=0, fFlow=0;
                asc.forEach(item=>{ const c=statContrib(item); fIn+=c.inc; fOut+=c.exp; if(isSkip(item)) fSkip++; else if(isFlow(item)) fFlow++; });
                const fEx=[];
                if(fSkip) fEx.push(`${fSkip} 条不计`);
                if(fFlow) fEx.push(`${fFlow} 条往来`);
                fIn=round2(fIn); fOut=round2(fOut);
                // 徽标文案：有分类显示分类名，否则显示「搜索」；都为真则合并
                // 徽标按「分类 · 搜索 · 口径」拼，有几样写几样
                const bp=[];
                if(filterVal!=='__all') bp.push(filterVal);
                if(hasTextSearch()) bp.push('搜索');
                if(searchState.mode) bp.push(MODE_NAME[searchState.mode]);
                const badge=bp.join('·')||'搜索';
                fBar.innerHTML=
                    `<span class="filter-badge">${escapeHtml(badge)}</span>`+
                    // 「其中 N 条不计」：否则会出现「命中 4 条、支出 0.00」这种看着像 bug 的组合
                    // 分「段」排：命中 / 收入 / 支出各一段，窄屏折行时只在段与段之间断开
                    `<span class="filter-nums">`+
                        `<span class="fn-seg">命中 <b>${asc.length}</b> 条${fEx.length?`<em class="fn-ex">（其中 ${fEx.join('、')}）</em>`:''}</span>`+
                        `<span class="fn-seg">收入 <b class="pos">${fIn.toFixed(2)}</b></span>`+
                        `<span class="fn-seg">支出 <b class="neg">${fOut.toFixed(2)}</b></span>`+
                    `</span>`;
                fBar.style.display='flex';
            } else {
                fBar.style.display='none';
            }
            // 批量入口：日子卡与账单之间的整行按钮。只在筛选生效且有命中时出现——
            // 没有筛选就等于「全部记录」，一不小心就改了整本账。
            const bBar=$('batchBar');
            if(filtering && asc.length){
                bBar.innerHTML=`<button class="batch-btn" data-act="batch"><span>批量操作</span><span class="bb-sub">当前筛选命中 ${asc.length} 条 ›</span></button>`;
                bBar.style.display='';
            } else {
                bBar.innerHTML=''; bBar.style.display='none';
            }

            // 分类统计：始终基于全部记录，按收支净额（收入加、支出减）
            const byCat={};
            allAsc.forEach(r=>{
                if(recMode(r)!=='normal') return;   // 不进收支统计的不进分类汇总，避免「转账：0.00」「存款：206677」
                const c=statContrib(r);
                byCat[r.cat]=(byCat[r.cat]||0)+(c.inc-c.exp);
            });
            renderCatStats(byCat);
            }

            if(asc.length===0){
                billList.innerHTML=`<tr><td colspan="7" class="empty-tip">没有符合条件的记录</td></tr>`;
                renderPager(0);
                return;
            }

            // 显示按时间倒序（最新在上）；结余取自全账户累计
            const desc = asc.slice().reverse();

            // 分页：只渲染当前页，结余/汇总仍按全部记录计算
            const totalPages = Math.max(1, Math.ceil(desc.length / PAGE_SIZE));
            if(JiwenBase.curPage > totalPages) JiwenBase.curPage = totalPages;
            if(JiwenBase.curPage < 1) JiwenBase.curPage = 1;
            const start = (JiwenBase.curPage - 1) * PAGE_SIZE;
            const pageItems = desc.slice(start, start + PAGE_SIZE);

            const rMap=refundedMap(raw);        // 原账单 id → 已退总额（1010-J）
            const frag=document.createDocumentFragment();
            pageItems.forEach(item=>{
                const balance=balOf.get(item);
                const isExp = item.type==='expense';
                const amt=safeNum(item.money);
                const typeTag = (isExp
                    ? '<span class="io-tag io-out">支出</span>'
                    : (isRefund(item) ? '<span class="io-tag io-refund">退款</span>' : '<span class="io-tag io-in">收入</span>'))
                    + modeTag(item) + refundedTag(item, rMap);
                const amtCell = `<span class="${isExp?'neg':'pos'}${modeAmtCls(item)}">${isExp?'−':'+'}${amt.toFixed(2)}</span>`;

                const remarkFull = item.remark || '';
                let remarkCell;
                if(!remarkFull){
                    remarkCell = '<span class="remark-empty">无</span>';
                } else {
                    const shown = escapeHtml(charSlice(remarkFull, 10)) + (charLen(remarkFull) > 10 ? '…' : '');
                    // 用 data-act/data-id + 事件委托，避免把 id 拼进内联 onclick（杜绝属性注入隐患）
                    remarkCell = `<span class="remark-view" data-act="remark" data-id="${escapeHtml(item.id)}" title="点击查看完整备注">${shown}</span>`;
                }
                const tr=document.createElement('tr');
                tr.innerHTML=`
                    <td data-label="记账时间">${item.time.replace('T',' ')}</td>
                    <td data-label="收支">${typeTag}</td>
                    <td data-label="金额">${amtCell}</td>
                    <td data-label="分类"><span class="cat-tag">${escapeHtml(item.cat||'未分类')}</span></td>
                    <td data-label="结余">${balance.toFixed(2)}</td>
                    <td data-label="备注">${remarkCell}</td>
                    <td data-label="" class="ops-cell">
                        <button class="operate-btn edit" data-act="edit" data-id="${escapeHtml(item.id)}">修改</button>
                    </td>`;
                frag.appendChild(tr);
            });
            billList.textContent='';
            billList.appendChild(frag);

            renderPager(totalPages);
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
                if(change.cat!==undefined) n.cat=change.cat;
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
                setRecMode(n, p.mode);
                data[i]=n;
            });
            if(!saveUserData(data)) return;
            filterCat.value=u.prevFilter;         // 分类表没变，原筛选值一定还在
            JiwenBase.curPage=1;
            window.JiwenTabs.refreshAllViews(); renderFilterChips(); if(window.syncFilterFab) window.syncFilterFab();
            customAlert(`已撤销，${u.prev.filter(p=>!p.follow).length} 条记录恢复原样。`);
        }
        window.addEventListener('resize', ()=>fitNums($('summaryOverall')), { passive:true });

        // ===== 分类汇总卡片 =====
        // 排序：按金额绝对值，收支混排时看的是「量级」——工资 +10604 与餐饮 −5347 比的是 10604 与 5347。
        // 偏好是全局的，存 localStorage；读写都包 try/catch，取不到就用默认（按金额）。
        let lastCatStats=null;
        // 只按金额（绝对值）排：从大到小 / 从小到大。旧版存过的 'amount' / 'cat' 一律当「从大到小」。
        function getCatSort(){
            try{ return localStorage.getItem('app_catstats_sort')==='asc' ? 'asc' : 'desc'; }catch(_){ return 'desc'; }
        }
        function renderCatStats(byCat){
            if(byCat) lastCatStats=byCat;          // 切排序时传 null，复用上次结果，不重算整本账
            byCat=lastCatStats||{};
            const sort=getCatSort();
            $('catSortSeg').querySelectorAll('button').forEach(b=>b.classList.toggle('on', b.dataset.v===sort));
            const keys=Object.keys(byCat);
            keys.sort((a,b)=> sort==='asc'
                ? Math.abs(byCat[a])-Math.abs(byCat[b])
                : Math.abs(byCat[b])-Math.abs(byCat[a]));
            if(!keys.length){
                $('catStats').innerHTML='<div class="cs-empty">暂无计入收支的记录</div>';
                return;
            }
            $('catStats').innerHTML=keys.map(c=>{
                const v=round2(byCat[c]);
                const pos=v>=0;
                return `<div class="cs-row"><span class="cs-name">${escapeHtml(c)}</span>`
                    + `<span class="cs-amt ${pos?'pos':'neg'}">${pos?'+':'−'}${Math.abs(v).toFixed(2)}</span></div>`;
            }).join('');
        }
        // ===== 1019-H：分类汇总能滑但看不出来：右下角的小圆钮 =====
        //   分类超过 6 个、框里装不下时才有：卡片每次从屏幕外回到屏幕上冒一次（IntersectionObserver；卡片一直在屏幕上、滑的是整页时不冒）；
        //   在框里滑时出现；停下 HINT_IDLE（0.8 秒）淡出（不改共用的 FAB_IDLE）。滑到框底换成 ↑，点了回框顶；在中间点 ↓ 往下翻一屏。
        //   这次打开 App 以后在框里滑到过底，就不再做进屏幕的提示。设置里「滑动提示」关掉就都不出现（存这台手机，不进备份）。
        const HINT_IDLE=800, HINT_MIN_ROWS=6;
        let catHintSeen=false;   // 这次打开 App 以后在框里滑到过底
        function scrollHintOn(){ try{ return localStorage.getItem('app_scroll_hint')!=='off'; }catch(_){ return true; } }
        const catHint=$('catStatsHint'), catBox=$('catStats');
        catHint._fabIdle=HINT_IDLE;
        fabHold(catHint);
        function catHintFits(){ return scrollHintOn() && catBox.querySelectorAll('.cs-row').length>HINT_MIN_ROWS && catBox.scrollHeight>catBox.clientHeight+2; }
        function catHintAtEnd(){ return catBox.scrollTop+catBox.clientHeight>=catBox.scrollHeight-2; }
        function catHintPaint(){ const end=catHintAtEnd(); catHint.textContent=end ? '↑' : '↓'; catHint.dataset.end=end ? '1' : ''; catHint.setAttribute('aria-label', end ? '回到最上面' : '往下翻'); }
        function catHintWake(){ if(!catHintFits()){ fabWake(catHint, false); return; } catHintPaint(); fabWake(catHint, true); }
        catBox.addEventListener('scroll', ()=>{ if(catHintAtEnd()) catHintSeen=true; catHintWake(); }, { passive:true });
        catHint.addEventListener('click', ()=>{
            const top=catHintAtEnd() ? 0 : Math.min(catBox.scrollTop+catBox.clientHeight, catBox.scrollHeight-catBox.clientHeight);
            try{ catBox.scrollTo({ top, behavior:'smooth' }); }catch(_){ catBox.scrollTop=top; }
            catHintWake();
        });
        if(window.IntersectionObserver){
            let wasIn=false;
            new IntersectionObserver(es=>{
                es.forEach(e=>{
                    const nowIn=e.isIntersecting && e.intersectionRatio>0;
                    if(nowIn && !wasIn && !catHintSeen) catHintWake();
                    if(!nowIn) fabWake(catHint, false);
                    wasIn=nowIn;
                });
            }, { threshold:[0, 0.6] }).observe($('catStatsCard'));
        }
        window.__catHintWake=catHintWake;   // 给测试用
        (function(){
            const seg=$('scrollHintSeg');
            function paint(){ const on=scrollHintOn(); seg.querySelectorAll('button').forEach(b=>b.classList.toggle('on', (b.dataset.v==='on')===on)); }
            seg.querySelectorAll('button').forEach(b=>b.addEventListener('click', ()=>{
                try{ if(b.dataset.v==='off') localStorage.setItem('app_scroll_hint', 'off'); else localStorage.removeItem('app_scroll_hint'); }catch(_){}
                if(b.dataset.v==='off') fabWake(catHint, false);
                paint();
            }));
            paint();
        })();
        $('catSortSeg').addEventListener('click', e=>{
            const b=e.target.closest('button[data-v]'); if(!b) return;
            try{ localStorage.setItem('app_catstats_sort', b.dataset.v); }catch(_){}
            renderCatStats(null);
            $('catStats').scrollTop=0;
        });

        // 渲染分页控件（≤1 页时不显示）：列表上面、下面各一份（下面那份 1017-M 加）
        //   按钮只建一次、以后只改文字和能不能点——翻页时点的那个按钮还是原来那个，不闪
        function renderPager(totalPages){
            [['pager','top'],['pagerBottom','bottom']].forEach(([id, from])=>{
                const box=$(id); if(!box) return;
                if(totalPages<=1){ box.innerHTML=''; return; }
                if(!box.querySelector('.page-info')){
                    box.innerHTML='';
                    const prev=document.createElement('button');
                    prev.textContent='‹ 上一页'; prev.dataset.pg='-1';
                    const info=document.createElement('span'); info.className='page-info';
                    const next=document.createElement('button');
                    next.textContent='下一页 ›'; next.dataset.pg='1';
                    prev.onclick=()=>goPage(-1, from);
                    next.onclick=()=>goPage(1, from);
                    box.appendChild(prev); box.appendChild(info); box.appendChild(next);
                }
                const [prev, next]=box.querySelectorAll('button');
                prev.disabled = JiwenBase.curPage<=1;
                next.disabled = JiwenBase.curPage>=totalPages;
                box.querySelector('.page-info').textContent=`第 ${JiwenBase.curPage} / ${totalPages} 页`;
            });
            if(totalPages<=1) pagerPad(0);
        }
        // 列表最下面一块看不见的垫子：翻到最后一页、新的一页比原来短时垫上差的那点高度，
        //   免得页面变短把滚动位置往上夹、上面那排按钮跟着往下跑（先缩后长）
        function pagerPad(h){ const p=$('pagerPad'); if(p) p.style.height = h>0 ? h+'px' : ''; }
        // 【1017-M】翻页：只换列表那几行。
        //   上面那排：页面一点不动，点的按钮留在原地；
        //   下面那排：直接（不带动画）跳到新一页的第一行。
        function goPage(d, from){
            const y0=window.scrollY;
            JiwenBase.curPage+=d;
            pagerPad(0);
            renderBill({ pageOnly:true });
            if(from==='bottom'){
                const first=billList.firstElementChild;
                if(first) window.scrollTo({ top: Math.max(0, first.getBoundingClientRect().top + window.scrollY - 8), behavior:'instant' });
            } else {
                const lack = y0 - (document.documentElement.scrollHeight - window.innerHeight);
                if(lack>0) pagerPad(Math.ceil(lack));
                if(window.scrollY!==y0) window.scrollTo({ top:y0, behavior:'instant' });
            }
            if(window.syncFilterFab) window.syncFilterFab();
        }
        // 清筛选（✕）后让列表顶部对齐，避免停在半截
        function scrollListTop(){
            const t=$('billHead') || document.querySelector('table');
            if(t) t.scrollIntoView({ behavior:'smooth', block:'start' });
        }
        window.JiwenLedger = { applyBatch, clearAllFilters, goPage, openBatchMenu, renderBill, renderFilterChips, resetSearch, undoBatch };   // ledger 模块对外只有这一个入口
})();
