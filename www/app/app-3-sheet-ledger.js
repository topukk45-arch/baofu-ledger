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
                curPage=1;
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
                if(cf) fabWake(cf, (active || curPage>1) && currentTab==='ledger');   // 1017-N：停下 1.5 秒淡出
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
        // mode：统计口径筛选，null 表示不限，否则为 'normal' / 'flow' / 'skip'
        const searchState={ keyword:'', min:null, max:null, from:null, to:null, mode:null };
        const MODE_NAME={ normal:'计入', flow:'只算结余', skip:'不计入' };

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
            curPage=1;
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
            // 统计口径
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
            const rk=`app_imp_remind_${currentUser}__${currentArchive}`;
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
                const c=balContrib(item);        // 结余口径：只有「不计入」不算，「只算结余」照算
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
            // 结余走结余口径：期初存款这类「只算结余」不进收入，但必须进结余
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
                if(fSkip) fEx.push(`${fSkip} 条不计入`);
                if(fFlow) fEx.push(`${fFlow} 条只算结余`);
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
                    // 「其中 N 条不计入」：否则会出现「命中 4 条、支出 0.00」这种看着像 bug 的组合
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
            if(curPage > totalPages) curPage = totalPages;
            if(curPage < 1) curPage = 1;
            const start = (curPage - 1) * PAGE_SIZE;
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
            if(!list.length){ customAlert(`命中的 ${rfN} 条都是退款记录。退款的分类和口径跟着原账单走，请改原账单。`); return; }
            customChoose(`对当前筛选命中的 ${list.length} 条记录（不只是这一页）：${rfN?`\n另有 ${rfN} 条退款记录不参与，会跟着各自的原账单一起变。`:''}`, [
                // 说明文字与记一笔里的口径说明（MODE_HINT）同源，两处永远一致
                { value:'cat',    label:'改分类',       desc:'把这些记录统一改到同一个分类，比如把「永劫无间」归到「游戏」' },
                { value:'flow',   label:'标为只算结余', desc:MODE_HINT.flow },
                { value:'skip',   label:'标为不计入',   desc:MODE_HINT.skip },
                { value:'normal', label:'恢复计入',     desc:'取消上面两种标记：'+MODE_HINT.normal }
            ], (act)=>{
                if(act==='cat'){
                    const onCat=(cat)=>{
                        const targets=list.filter(r=>r.cat!==cat);
                        if(!targets.length){ customAlert(`这 ${list.length} 条已经都是「${cat}」了。`); return; }
                        customConfirm(`把下面这 ${targets.length} 条记录的分类改成「${cat}」（挂在上面的退款跟着改）。改完可以马上「撤销这次操作」。`,
                            ()=>applyBatch(targets.map(r=>r.id), { cat }), '批量改分类',
                            { okText:`改这 ${targets.length} 条`, list:targets, danger:true, onCancel:pickCat });   // 1019-S：取消回到选分类
                    };
                    const pickCat=()=>customChoose('改成哪个分类？', getCats().map(c=>({ value:c, label:c })), onCat, '选择分类', openBatchMenu, { layout:'list' });
                    pickCat();
                } else {
                    const NAME={ normal:'计入', flow:'只算结余', skip:'不计入' };
                    const targets=list.filter(r=>recMode(r)!==act);   // 已经是目标口径的不重复改
                    if(!targets.length){ customAlert(`这 ${list.length} 条已经都是「${NAME[act]}」了。`); return; }
                    customConfirm(`把下面这 ${targets.length} 条记录改成「${NAME[act]}」（挂在上面的退款跟着改）。改完可以马上「撤销这次操作」。`,
                        ()=>applyBatch(targets.map(r=>r.id), { mode:act }), '批量修改统计口径',
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
            curPage=1;
            refreshAllViews(); renderFilterChips(); if(window.syncFilterFab) window.syncFilterFab();
            batchUndo={ prev, prevFilter, archive:currentArchive };
            customConfirm(`已处理 ${mainN} 条记录。`, null, '批量操作完成',
                { okText:'好的', extra:{ text:'撤销这次操作', onClick:undoBatch } });
            askCancel.style.display='none';      // 「好的」「取消」意思一样，只留一个
        }
        function undoBatch(){
            const u=batchUndo; batchUndo=null;
            if(!u || u.archive!==currentArchive) return;
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
            curPage=1;
            refreshAllViews(); renderFilterChips(); if(window.syncFilterFab) window.syncFilterFab();
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
        function catHintPaint(){ const end=catHintAtEnd(); catHint.textContent=end ? '↑' : '↓'; catHint.setAttribute('aria-label', end ? '回到最上面' : '往下翻'); }
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

        // ===== 统计页：预算 =====
        // 一处算、两处用：computeBudget 给「收支」页签的一行入口和「预算」页签共用，口径永远一致。
        // 已花 = 该月、该分类、支出、口径「计入」；状态：> 100% 超支 / ≥ 80% 接近 / 其余正常。
        let statTab='flow';        // 'flow' | 'budget'
        // 【1013-E】预算页签里展开的分类：可以同时展开多个（以前只能开一个，点别的会把上一个收起）
        const bgExpanded=new Set();
        let bgUnsetOpen=false;     // 「未设预算的分类」是否展开
        function computeBudget(dec, y, mo){
            const budgets=getBudgets();
            const cats=getCats();
            const keys=cats.filter(c=>budgets[c]>0);
            const now=new Date();
            const isCur = now.getFullYear()===y && now.getMonth()===mo;
            const dim=new Date(y, mo+1, 0).getDate();
            const timePct = isCur ? now.getDate()/dim*100 : null;
            const spent={}, unset={}, excl={};
            dec.forEach(x=>{
                if(x.y!==y || x.mo!==mo) return;
                const e=expSigned(x.r); if(!e) return;    // 支出 +，退款 −（1010-J）
                const c=x.r.cat||'未分类';
                if(recMode(x.r)!=='normal'){ if(x.r.type==='expense') excl[c]=(excl[c]||0)+1; return; }
                if(budgets[c]>0) spent[c]=(spent[c]||0)+e;
                else unset[c]=(unset[c]||0)+e;
            });
            const rows=keys.map(c=>{
                const limit=safeNum(budgets[c]);
                const used=round2(spent[c]||0);
                const pct = limit>0 ? used/limit*100 : 0;
                const state = pct>100 ? 'over' : (pct>=80 ? 'warn' : 'ok');
                const fast = timePct!=null && pct<=100 && pct>timePct+5;   // 比时间进度快 5 个百分点以上才提醒
                return { cat:c, limit, used, pct, left:round2(limit-used), state, fast, excl:excl[c]||0 };
            });
            const unsetList=Object.keys(unset).map(c=>({ cat:c, used:round2(unset[c]), excl:excl[c]||0 }))
                .filter(u=>u.used>0).sort((a,b)=>b.used-a.used);
            return { rows, unsetList, isCur, dim, timePct, day:now.getDate() };
        }
        // 单行预算（名称 / 已花 / 进度条 / 剩余或超出）。clickable=true 时可展开明细
        function budgetRowHtml(r, timePct, clickable, open){
            const cls = r.state==='ok' ? '' : r.state;
            const right = r.left>=0
                ? `<span class="${r.fast?'fast':''}">还剩 ${r.left.toFixed(2)}${r.fast?'（花得偏快）':''}</span>`
                : `<span class="over">超出 ${(-r.left).toFixed(2)}</span>`;
            return `<div class="bg-row${clickable?' bg-click':''}${open?' open':''}"${clickable?` data-act="bgRow" data-cat="${escapeHtml(r.cat)}"`:''}>`
                + `<div class="bg-top"><span class="bg-name">${escapeHtml(r.cat)}${clickable?'<i class="bg-chev">›</i>':''}</span>`
                + `<span class="bg-num"><b>${r.used.toFixed(2)}</b> / ${r.limit.toFixed(2)}</span></div>`
                + `<div class="bg-bar"><div class="bg-fill ${cls}" style="width:${Math.max(0,Math.min(100,r.pct)).toFixed(1)}%"></div>`
                + (timePct!=null ? `<div class="bg-mark" style="left:${timePct.toFixed(1)}%"></div>` : '')
                + `</div>`
                + `<div class="bg-foot"><span>已用 ${r.pct.toFixed(0)}%</span>${right}</div>`
                + `</div>`;
        }

        // 「收支」页签：一行入口
        function renderStatBudget(dec){
            const card=$('statBudgetCard'); if(!card) return;
            const B=computeBudget(dec, statYear, statMonth);
            if(!B.rows.length){ card.style.display='none'; card.innerHTML=''; return; }
            card.style.display='';
            const n={ over:0, warn:0, ok:0 };
            B.rows.forEach(r=>n[r.state]++);
            const parts=[];
            if(n.over) parts.push(`超支 <b class="over">${n.over}</b>`);
            if(n.warn) parts.push(`接近 <b class="warn">${n.warn}</b>`);
            if(n.ok)   parts.push(`正常 <b>${n.ok}</b>`);
            card.innerHTML=`<div class="bg-entry" data-act="toBudget">`
                + `<span class="bg-entry-title">${B.isCur?'本月预算':`${statMonth+1}月预算`}</span>`
                + `<span class="bg-entry-sum">${parts.join(' · ')}</span><span class="bg-go">›</span></div>`;
        }
        $('statBudgetCard').addEventListener('click', e=>{
            if(e.target.closest('[data-act="toBudget"]')) setStatTab('budget');
        });

        // ===== 单独一版（1016-Z9）：按过去 3–6 个月的中位数给每月预算建议，一键写入 =====
        // 只看今天之前已经过完的月份，往前最多 6 个、这个存档有记录的月份；不到 3 个月不建议。
        // 每个分类：这几个月各花了多少（支出、口径「计入」、退款抵扣，和预算页的「已花」同一个口径；某个月没花算 0），取中位数，
        //   往上取整到 10 元；中位数是 0 的不建议。只算不写，写不写、写哪几个由你勾
        // 1019-J：MIN_MEDIAN：每月中位数不到 50 元的不建议（零星几笔，比如「存款」大多是收入、支出偶尔一两块钱）；这个分类收入比支出多的也不建议
        const BUDGET_SUGGEST={ MIN_MONTHS:3, MAX_MONTHS:6, ROUND:10, MIN_MEDIAN:50 };
        function budgetSuggest(dec, now){
            now=now||new Date();
            const cur=now.getFullYear()*12+now.getMonth(), has=new Set(), sums=new Map(), incs=new Map();
            dec.forEach(x=>{
                const m=x.y*12+x.mo; if(m>=cur) return;
                has.add(m);
                if(x.r.type==='income' && !x.r.refundOf && recMode(x.r)==='normal'){ const c=x.r.cat||'未分类'; let o=incs.get(c); if(!o) incs.set(c, o=new Map()); o.set(m, (o.get(m)||0)+safeNum(x.r.money)); }
                const e=expSigned(x.r); if(!e || recMode(x.r)!=='normal') return;
                const c=x.r.cat||'未分类';
                let o=sums.get(c); if(!o) sums.set(c, o=new Map());
                o.set(m, (o.get(m)||0)+e);
            });
            const months=[...has].sort((a, b)=>b-a).slice(0, BUDGET_SUGGEST.MAX_MONTHS);
            if(months.length<BUDGET_SUGGEST.MIN_MONTHS) return { months:months.length, list:[] };
            const list=[];
            sums.forEach((o, c)=>{
                const vs=months.map(m=>Math.max(0, round2(o.get(m)||0))).sort((a, b)=>a-b), n=vs.length;
                const med=n%2 ? vs[(n-1)/2] : (vs[n/2-1]+vs[n/2])/2;
                if(!(med>0) || med<BUDGET_SUGGEST.MIN_MEDIAN) return;
                // 这个分类大部分是收入（这几个月收入比支出多）：不建议
                const exp=months.reduce((t, m)=>t+Math.max(0, o.get(m)||0), 0), io=incs.get(c), inc=io ? months.reduce((t, m)=>t+(io.get(m)||0), 0) : 0;
                if(inc>exp) return;
                list.push({ cat:c, median:round2(med), suggest:Math.ceil(med/BUDGET_SUGGEST.ROUND)*BUDGET_SUGGEST.ROUND });
            });
            list.sort((a, b)=>b.suggest-a.suggest);
            return { months:months.length, list };
        }
        var bgSuggestOpen=false;   // var：导入结果页的「按过去几个月设预算」可能比这行先用到
        function renderBudgetSuggest(dec){
            let card=$('bgSuggestCard');
            let on=false; try{ on=localStorage.getItem('app_dev_import')==='1'; }catch(_){}
            if(!on){ if(card) card.remove(); return; }
            if(!card){ card=document.createElement('div'); card.className='stat-card'; card.id='bgSuggestCard'; $('statPaneBudget').appendChild(card); }
            card.textContent='';
            if(!bgSuggestOpen){
                const b=document.createElement('button'); b.type='button'; b.className='mini-btn'; b.id='bgSuggestBtn'; b.textContent='按过去几个月给预算建议（开发中）';
                b.addEventListener('click', ()=>{ bgSuggestOpen=true; renderBudgetSuggest(dec); });
                card.appendChild(b); return;
            }
            const S=budgetSuggest(dec), budgets=getBudgets(), cats=getCats();
            // 1016-UI3：「收起 / 写入勾上的」放在一条贴着屏幕下方的操作条里（主按钮在右边），不用滑到底
            const foot=document.createElement('div'); foot.className='bg-suggest-foot';
            const h=document.createElement('div'); h.className='stat-day-title'; h.textContent='预算建议'; card.appendChild(h);
            const note=document.createElement('div'); note.style.fontSize='12px'; note.style.color='var(--c-text-soft)'; card.appendChild(note);
            if(!S.list.length){
                note.textContent = S.months<BUDGET_SUGGEST.MIN_MONTHS ? `过去有记录的完整月份只有 ${S.months} 个，至少要 ${BUDGET_SUGGEST.MIN_MONTHS} 个月才给建议。` : '过去几个月没有能参考的支出。';
            } else {
                note.textContent=`按过去 ${S.months} 个月每月花的中位数，往上取整到 10 元；每月不到 ${BUDGET_SUGGEST.MIN_MEDIAN} 元、或者收入比支出多的分类不给建议。没设预算的默认勾上；已经设了的不勾，勾上就换成建议的。`;
                const box=document.createElement('div'); box.id='bgSuggestList';
                // 1019-G：勾选框超过 3 个，顶上放「全选」，全勾上了变「全不选」
                let allBtn=null;
                const syncAll=()=>{ if(!allBtn) return; const cbs=[...box.querySelectorAll('input[type=checkbox]')]; allBtn.textContent=(cbs.length && cbs.every(c=>c.checked)) ? '全不选' : '全选'; };
                // 1019-J：建议值和现在的预算一样的，不一行一行列，收成一行「其余 N 个分类和建议一致」
                const sameAs=S.list.filter(x=>cats.includes(x.cat) && budgets[x.cat]>0 && Math.abs(safeNum(budgets[x.cat])-x.suggest)<0.005);
                S.list.filter(x=>cats.includes(x.cat) && sameAs.indexOf(x)<0).forEach(x=>{
                    const row=document.createElement('label'); row.className='bg-suggest-row'; row.dataset.cat=x.cat;
                    row.style.display='flex'; row.style.gap='8px'; row.style.alignItems='center'; row.style.padding='6px 0'; row.style.fontSize='13px';
                    const cb=document.createElement('input'); cb.type='checkbox'; cb.checked=!(budgets[x.cat]>0);
                    const tx=document.createElement('span'); tx.style.flex='1';
                    tx.textContent=`${x.cat}：建议 ${x.suggest.toFixed(0)} 元（中位数 ${x.median.toFixed(2)}）` + (budgets[x.cat]>0 ? `，现在 ${safeNum(budgets[x.cat]).toFixed(2)}` : '，现在没有预算');
                    cb.addEventListener('change', syncAll);
                    row.appendChild(cb); row.appendChild(tx); box.appendChild(row);
                });
                if(box.children.length>3){
                    allBtn=document.createElement('button'); allBtn.type='button'; allBtn.className='mini-btn bg-sel-all'; allBtn.id='bgSuggestAll';
                    allBtn.addEventListener('click', ()=>{ const cbs=[...box.querySelectorAll('input[type=checkbox]')]; const on=!cbs.every(c=>c.checked); cbs.forEach(c=>{ c.checked=on; }); syncAll(); });
                    card.appendChild(allBtn); syncAll();
                }
                card.appendChild(box);
                if(sameAs.length){
                    const same=document.createElement('div'); same.id='bgSuggestSame'; same.className='bg-suggest-same';
                    same.textContent=`${box.children.length ? '其余' : ''} ${sameAs.length} 个分类和建议一致：${sameAs.map(x=>x.cat).join('、')}`.trim();
                    card.appendChild(same);
                }
                const go=document.createElement('button'); go.type='button'; go.className='mini-btn gold'; go.id='bgSuggestApply'; go.textContent='写入勾上的';
                go.addEventListener('click', ()=>{
                    const pick=[...box.querySelectorAll('.bg-suggest-row')].filter(r=>r.querySelector('input').checked).map(r=>S.list.find(x=>x.cat===r.dataset.cat));
                    if(!pick.length){ customAlert('一个都没勾。', '预算建议'); return; }
                    const store=loadStore(); const a=curArchive(store);
                    a.budgets=Object.assign({}, a.budgets||{});
                    pick.forEach(x=>{ a.budgets[x.cat]=x.suggest; });
                    if(!saveStoreSafe(store)) return;
                    bgSuggestOpen=false;
                    customAlert(`写好了 ${pick.length} 个分类的每月预算。以后可以在「设置 → 管理账单分类」或预算页里改。`, '预算建议');
                    renderStats();
                });
                foot.appendChild(go);
            }
            const cl=document.createElement('button'); cl.type='button'; cl.className='mini-btn'; cl.id='bgSuggestClose'; cl.textContent='收起';
            cl.addEventListener('click', ()=>{ bgSuggestOpen=false; renderBudgetSuggest(dec); });
            foot.insertBefore(cl, foot.firstChild);
            card.appendChild(foot);
        }
        // 「预算」页签
        function renderBudgetPane(dec){
            renderBudgetSuggest(dec);
            $('bgMonthLabel').textContent=`${statYear}年${pad(statMonth+1)}月`;
            const B=computeBudget(dec, statYear, statMonth);

            // —— 总览 ——
            if(!B.rows.length){
                $('bgOverview').innerHTML=`<div class="bg-empty">还没有给任何分类设预算。<br>`
                    + `设好之后，这里会按月显示哪些分类超了、哪些还有余量。<br>`
                    + `<button class="mini-btn gold" data-act="bgSetup">去设置预算</button></div>`;
                $('bgGroups').innerHTML='';
            } else {
                const lim=round2(B.rows.reduce((s,r)=>s+r.limit,0));
                const used=round2(B.rows.reduce((s,r)=>s+r.used,0));
                const pct = lim>0 ? used/lim*100 : 0;
                const st = pct>100 ? 'over' : (pct>=80 ? 'warn' : '');
                const n={ over:0, warn:0, ok:0 };
                B.rows.forEach(r=>n[r.state]++);
                $('bgOverview').innerHTML=
                    `<div class="bgo-main"><div><div class="ov-label">已花 / 预算合计</div>`
                    + `<div class="bgo-num"><b>${used.toFixed(2)}</b> / ${lim.toFixed(2)}</div></div>`
                    + `<div class="bgo-pct ${st}">${pct.toFixed(0)}%</div></div>`
                    + `<div class="bg-bar"><div class="bg-fill ${st}" style="width:${Math.max(0,Math.min(100,pct)).toFixed(1)}%"></div>`
                    + (B.timePct!=null ? `<div class="bg-mark" style="left:${B.timePct.toFixed(1)}%"></div>` : '')
                    + `</div>`
                    + `<div class="bgo-chips">`
                    + `<span class="bgc over">超支 ${n.over}</span><span class="bgc warn">接近上限 ${n.warn}</span><span class="bgc ok">正常 ${n.ok}</span>`
                    + `</div>`
                    + (B.timePct!=null ? `<div class="bgo-legend">竖线是今天（${B.day}/${B.dim}），条越过竖线就是花得偏快。</div>` : '')
                    + budgetExtraRowsHtml(dec, B);

                // —— 分组：超支 → 接近 → 正常，组内按已用比例从高到低 ——
                const GROUPS=[ ['over','已超支'], ['warn','接近上限（80% 以上）'], ['ok','正常'] ];
                $('bgGroups').innerHTML=GROUPS.map(([k,title])=>{
                    const rs=B.rows.filter(r=>r.state===k).sort((a,b)=>b.pct-a.pct);
                    if(!rs.length) return '';
                    return `<div class="stat-card"><div class="stat-day-title bg-gtitle ${k}"><span class="dot"></span>${title} · ${rs.length}</div>`
                        + rs.map(r=>budgetRowHtml(r, B.timePct, true, bgExpanded.has(r.cat))
                            + (bgExpanded.has(r.cat) ? budgetDetailHtml(dec, r) : '')).join('')
                        + `</div>`;
                }).join('');
            }

            // —— 未设预算的分类（本月有计入的支出）——
            const uc=$('bgUnsetCard');
            if(!B.unsetList.length){ uc.style.display='none'; uc.innerHTML=''; }
            else {
                uc.style.display='';
                uc.classList.toggle('bgu-open', bgUnsetOpen);
                uc.innerHTML=`<button class="bgu-head" data-act="bgUnsetToggle">`
                    + `<span class="stat-day-title">未设预算的分类 · ${B.unsetList.length}</span><span class="bgu-arrow">▾</span></button>`
                    + (bgUnsetOpen ? `<div class="bgu-list">` + B.unsetList.map(u=>
                        `<div class="bgu-row bg-click${bgExpanded.has(u.cat)?' open':''}" data-act="bgRow" data-cat="${escapeHtml(u.cat)}">`
                        + `<span class="bgu-name">${escapeHtml(u.cat)}<i class="bg-chev">›</i></span>`
                        + `<span class="bgu-amt">−${u.used.toFixed(2)}</span>`
                        + `<button class="bgu-set" data-act="bgSet" data-cat="${escapeHtml(u.cat)}">设预算</button></div>`
                        + (bgExpanded.has(u.cat) ? budgetDetailHtml(dec, { cat:u.cat, excl:u.excl||0 }) : '')).join('')
                        + `</div>` : '');
            }
        }
        // 【1010-I】总览下方两行：
        //   预算外 —— 本月没设预算的分类花了多少（计入口径），点一下展开下面的「未设预算」并滚过去；
        //   年度预算 —— 见 budgetYearHtml（1010-I3）。
        function budgetExtraRowsHtml(dec, B){
            let h='';
            if(B.unsetList.length){
                const sum=round2(B.unsetList.reduce((s,u)=>s+u.used,0));
                const names=B.unsetList.map(u=>u.cat);
                const shown=names.slice(0,3).join('、') + (names.length>3 ? ` 等 ${names.length} 类` : '');
                h+=`<div class="bgo-row bgo-click" data-act="bgOutside"><span class="bgo-k">预算外</span>`
                    + `<span class="bgo-v neg">−${sum.toFixed(2)}</span>`
                    + `<span class="bgo-sub">${escapeHtml(shown)} 没设预算</span></div>`;
            }
            h+=budgetYearHtml(dec, B);
            return h ? `<div class="bgo-rows">${h}</div>` : '';
        }
        // 【1010-I3】年度预算
        //   起算月 = 这一年里第一次有记录的月份（6 月才开始记账，就从 6 月算），之后连续算，
        //     中间哪个月一条都没有也照算——那多半是漏记，跳过它等于漏记反而让预算变宽松；
        //     展开的月度列表里会把这种月标成「没有记录」，提醒去补。
        //   全年预算 = 每月预算合计 × 起算月到 12 月的月数。
        //   「至今」按真实的今天算，不按页面上正在看的月份：年度进度不该因为翻到 7 月就变了。
        //   预算只存一份、没有历史，中途改过预算会按现在的值往回算，所以写明「估算」。
        let bgYearOpen=false;
        function budgetYearInfo(dec, B, y){
            const perMonth=round2(B.rows.reduce((s,r)=>s+r.limit,0));
            const now=new Date(), ny=now.getFullYear(), nm=now.getMonth();
            const has=new Set();
            dec.forEach(x=>{ if(x.y===y) has.add(x.mo); });
            const endMo = y<ny ? 11 : (y===ny ? nm : -1);        // 「至今」最后一个月；未来年份为 -1
            let start = has.size ? Math.min(...has) : (endMo>=0 ? endMo : 0);
            if(endMo>=0 && start>endMo) start=endMo;              // 今年还没开始记：从本月起算
            const months=[];
            for(let mo=start; mo<=endMo; mo++){
                const used=round2(computeBudget(dec, y, mo).rows.reduce((s,r)=>s+r.used,0));
                months.push({ mo, used, has:has.has(mo) });
            }
            const used=round2(months.reduce((s,m)=>s+m.used,0));
            const yearLim=round2(perMonth*(12-start));
            const shouldLim=round2(perMonth*months.length);
            const remMonths = y===ny ? 12-nm : 0;                 // 含本月
            return { perMonth, start, endMo, months, used, yearLim, shouldLim, remMonths };
        }
        function budgetStateOf(pct){ return pct>100 ? 'over' : (pct>=80 ? 'warn' : ''); }
        function budgetYearHtml(dec, B){
            const Y=budgetYearInfo(dec, B, statYear);
            const pct = Y.yearLim>0 ? Y.used/Y.yearLim*100 : 0;
            const st=budgetStateOf(pct);
            const subs=[];
            if(Y.months.length){
                const d=round2(Y.used-Y.shouldLim);
                subs.push(`至今应花 ${Y.shouldLim.toFixed(2)}（${Y.months.length} 个月）`
                    + (d>0 ? `，已超 <span class="over">${d.toFixed(2)}</span>` : `，结余 ${(-d).toFixed(2)}`));
            }
            if(Y.remMonths>0){
                const left=round2(Y.yearLim-Y.used);
                subs.push(left>0 ? `剩下 ${Y.remMonths} 个月每月可花 ${(left/Y.remMonths).toFixed(2)}`
                                 : `全年预算已用完`);
            }
            let h=`<div class="bgo-row bgo-click bgy-head${bgYearOpen?' open':''}" data-act="bgYearToggle">`
                + `<span class="bgo-k">年度预算（${Y.start+1}–12月）<i class="bg-chev">›</i></span>`
                + `<span class="bgo-v bgy-v-head"><b>${Y.used.toFixed(0)}</b> / ${Y.yearLim.toFixed(0)} · <span class="${st}">${pct.toFixed(0)}%</span></span>`
                + `<span class="bgo-sub">${subs.join(' · ')}</span></div>`;
            if(bgYearOpen && Y.months.length){
                h+=`<div class="bgy-list">` + Y.months.map(m=>{
                    const cur = m.mo===statMonth;
                    if(!m.has){
                        return `<div class="bgy-row empty${cur?' cur':''}" data-act="bgYearMonth" data-mo="${m.mo}">`
                            + `<span class="bgy-m">${m.mo+1}月</span><div class="bg-bar"></div>`
                            + `<span class="bgy-v">没有记录</span></div>`;
                    }
                    const mp = Y.perMonth>0 ? m.used/Y.perMonth*100 : 0;
                    return `<div class="bgy-row${cur?' cur':''}" data-act="bgYearMonth" data-mo="${m.mo}">`
                        + `<span class="bgy-m">${m.mo+1}月</span>`
                        + `<div class="bg-bar"><div class="bg-fill ${budgetStateOf(mp)}" style="width:${Math.max(0,Math.min(100,mp)).toFixed(1)}%"></div></div>`
                        + `<span class="bgy-v ${budgetStateOf(mp)}">${m.used.toFixed(0)} / ${Y.perMonth.toFixed(0)}</span></div>`;
                }).join('')
                + `<div class="bgy-note">点月份查看那个月的预算 · 按当前预算估算</div></div>`;
            }
            return h;
        }
        // 展开的明细：这个月、这个分类里计入预算的每一笔（时间倒序）
        function budgetDetailHtml(dec, r){
            const list=dec.filter(x=>x.y===statYear && x.mo===statMonth && x.r.cat===r.cat
                    && expSigned(x.r)!==0 && recMode(x.r)==='normal')
                .sort((a,b)=>b.ts-a.ts);
            const items = list.length ? `<div class="stat-flow">` + list.map(x=>{
                const rm=(x.r.remark||'').trim();
                const rf=isRefund(x.r);
                return `<div class="sf-item" data-act="bgRec" data-id="${escapeHtml(x.r.id)}">`
                    + `<div class="sf-top"><span class="sf-time">${pad(x.mo+1)}-${pad(x.d)} ${pad(x.hh)}:${pad(x.mi)}</span>`
                    + (rf ? `<span class="sf-io refund">退款</span>` : '')
                    + (rm ? `<span class="sf-remark">${escapeHtml(rm)}</span>` : `<span class="sf-cat">${escapeHtml(r.cat)}</span>`)
                    + `</div><span class="sf-amt ${rf?'pos':'neg'}">${rf?'+':'−'}${safeNum(x.r.money).toFixed(2)}</span></div>`;
            }).join('') + `</div>` : `<div class="bg-detail-empty">这个月还没有计入的支出</div>`;
            const note = `${list.length} 笔${r.excl?`；另有 ${r.excl} 笔不计入 / 只算结余，未算在内`:''}`;
            // 【1013-E】设了预算的分类，展开后就地改上限，不用再跑去设置里的分类管理
            const edit = r.limit>0 ? `<button class="mini-btn bg-edit" data-act="bgSet" data-cat="${escapeHtml(r.cat)}">改预算</button>` : '';
            // 【1013-E】说明和「改预算」放在明细最上面：这个月要是有几十笔，不用滑到底才能改
            return `<div class="bg-detail"><div class="bg-detail-head"><span>${note}</span>${edit}</div>`
                + `${items}</div>`;
        }
        // 预算页签的所有点击（事件委托，一次绑定）
        $('statPaneBudget').addEventListener('click', e=>{
            const el=e.target.closest('[data-act]'); if(!el) return;
            const act=el.dataset.act;
            if(act==='bgRow'){
                const c=el.dataset.cat;
                if(bgExpanded.has(c)) bgExpanded.delete(c); else bgExpanded.add(c);
                renderStats();
            } else if(act==='bgRec'){
                openDetail(el.dataset.id);
            } else if(act==='bgUnsetToggle'){
                bgUnsetOpen=!bgUnsetOpen; renderStats();
            } else if(act==='bgYearToggle'){
                bgYearOpen=!bgYearOpen; renderStats();
            } else if(act==='bgYearMonth'){
                statMonth=Number(el.dataset.mo); statSelDay=null; bgExpanded.clear();
                renderStatCalendar();
                window.scrollTo(0,0);
            } else if(act==='bgOutside'){
                bgUnsetOpen=true; renderStats();
                const uc=$('bgUnsetCard');
                if(uc && uc.scrollIntoView) uc.scrollIntoView({ behavior:'smooth', block:'start' });
            } else if(act==='bgSet'){
                editBudget(el.dataset.cat, { fromStats:true });
            } else if(act==='bgSetup'){
                openCatManager();
            }
        });
        // 页签切换
        function setStatTab(tab){
            statTab = (tab==='budget') ? 'budget' : 'flow';
            $('statTabSeg').querySelectorAll('button').forEach(b=>b.classList.toggle('on', b.dataset.v===statTab));
            $('statPaneFlow').style.display   = statTab==='flow'   ? '' : 'none';
            $('statPaneBudget').style.display = statTab==='budget' ? '' : 'none';
            renderStats();
            window.scrollTo(0,0);
        }
        $('statTabSeg').addEventListener('click', e=>{
            const b=e.target.closest('button[data-v]'); if(b) setStatTab(b.dataset.v);
        });
        // 预算页签的月份切换：与收支页签共用 statYear/statMonth
        $('bgPrevM').addEventListener('click', ()=>{
            statMonth--; if(statMonth<0){ statMonth=11; statYear--; }
            statSelDay=null; renderStatCalendar();
        });
        $('bgNextM').addEventListener('click', ()=>{
            statMonth++; if(statMonth>11){ statMonth=0; statYear++; }
            statSelDay=null; renderStatCalendar();
        });
        $('bgMonthLabel').addEventListener('click', ()=>$('statMonthLabel').click());   // 复用年月选择器

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
                prev.disabled = curPage<=1;
                next.disabled = curPage>=totalPages;
                box.querySelector('.page-info').textContent=`第 ${curPage} / ${totalPages} 页`;
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
            curPage+=d;
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

