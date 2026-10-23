(function(){
        const { $, escapeHtml, fabHold, fabWake, fitNums, isFlow, isSkip, pad, parseRecTime, recMode, round2, safeNum } = window.JiwenBase;   // 用到前面模块的
        const { balContrib, catSigned, curArchive, daysKey, expSigned, getBudgets, getCats, getUserData, impGetJson, impPendKey, impTarget, isRefund, loadStore, modeAmtCls, odScheduleSync, refundedMap, saveStoreSafe, statContrib } = window.JiwenStore;   // 用到前面模块的
        const { customAlert } = window.JiwenAsk;   // 用到前面模块的
        const { DT_YEAR_MAX, DT_YEAR_MIN, attachSwipe, playSlide } = window.JiwenDate;   // 用到前面模块的
        const { loadImportUI } = window.JiwenImportEntry;   // 用到前面模块的
        const { editBudget, openCatManager } = window.JiwenCats;   // 用到前面模块的
        const { aiFlagText, cal, closeDetail, openDay, openDetail, openWeek, rowHtml } = window.JiwenDetail;   // 用到前面模块的
        const { curYM, setYM, ymVersion } = window.JiwenLedger;   // 用到前面模块的

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
        // 1021-T11（实测 10-20）：未分类（「你有很多账没分类」不是预算）、转账这类默认不计的分类不给预算建议
        const BUDGET_SUGGEST_SKIP=['未分类', '转账'];
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
                if(BUDGET_SUGGEST_SKIP.includes(c)) return;
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
                // 1021-T11：一个都没勾（或没有能写的）时「写入勾上的」点不了
                let go=null;
                const syncGo=()=>{ if(!go) return; const n=[...box.querySelectorAll('input[type=checkbox]')].filter(c=>c.checked).length; go.disabled=!n; go.textContent=n ? `写入勾上的 ${n} 个` : '写入勾上的'; };
                const syncAll=()=>{ syncGo(); if(!allBtn) return; const cbs=[...box.querySelectorAll('input[type=checkbox]')]; allBtn.textContent=(cbs.length && cbs.every(c=>c.checked)) ? '全不选' : '全选'; };
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
                go=document.createElement('button'); go.type='button'; go.className='mini-btn gold'; go.id='bgSuggestApply'; go.textContent='写入勾上的';
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
                foot.appendChild(go); syncGo();
            }
            const cl=document.createElement('button'); cl.type='button'; cl.className='mini-btn'; cl.id='bgSuggestClose'; cl.textContent='收起';
            cl.addEventListener('click', ()=>{ bgSuggestOpen=false; renderBudgetSuggest(dec); });
            foot.insertBefore(cl, foot.firstChild);
            card.appendChild(foot);
        }
        // 「预算」页签
        function renderBudgetPane(dec){
            renderBudgetSuggest(dec);
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
                    // 1023-O：顶上一行「合计 已用 x / y」（设了预算的分类加起来）
                    `<div class="bgo-main"><div class="bgo-total"><span class="bgo-k">合计 已用</span> `
                    + `<span class="bgo-num"><b>${used.toFixed(2)}</b> / ${lim.toFixed(2)}</span></div>`
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
            // 1023-H：每笔照账单页的两行（备注 / 「分类 · 日期 时间」），点了打开同一个单笔详情
            const rMap=refundedMap(getUserData());
            const items = list.length ? `<div class="lg-dc bg-rows">` + list.map(x=>rowHtml(x.r, rMap, { date:true })).join('') + `</div>` : `<div class="bg-detail-empty">这个月还没有计入的支出</div>`;
            const note = `${list.length} 笔${r.excl?`；另有 ${r.excl} 笔不计 / 往来，未算在内`:''}`;
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
            if(act==='detail'){
                openDetail(el.dataset.id);
            } else if(act==='bgRow'){
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
                setStatYM(statYear, Number(el.dataset.mo)); bgExpanded.clear();
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
        // ============================================================
        // ===== 统计模块（纯手写 SVG，跟随外观主题变量） =====
        // ============================================================
        let statYear, statMonth;     // 当前查看的年/月（month: 0-11）
        let statSelDay=null;         // 当前选中的日（1-31）；1023-H 起点某一天打开当日详情，这个一直是 null（首屏快照还看它）
        // 1023-H：统计页和账单页看的是同一个月：月份记在账单页那边（JiwenLedger.curYM），这边一改就推过去，画之前先对一下
        function setStatYM(y, mo){
            statYear=y; statMonth=mo; statSelDay=null;
            setYM(`${y}-${pad(mo+1)}`, { quiet:true });
        }
        let seenYMVer=-1;
        function syncFromLedger(){
            const v=ymVersion(); if(v===seenYMVer && statYear!==undefined) return;   // 账单页那边没改过：照这边的
            seenYMVer=v;
            const ym=curYM(), y=+ym.slice(0,4), mo=+ym.slice(5,7)-1;
            if(statYear!==y || statMonth!==mo){ statYear=y; statMonth=mo; statSelDay=null; }
        }
        function stepMonth(d){ let y=statYear, mo=statMonth+d; while(mo<0){ mo+=12; y--; } while(mo>11){ mo-=12; y++; } setStatYM(y, mo); bgExpanded.clear(); renderStatCalendar(); }
        // 月份浮条（和账单页同一个组件、同一套 1.5 秒规则、松手才切）；超过月预算的那个月柱子标红
        const stStrip=window.JiwenMonthStrip.create({ id:'stStrip', onPick:ym=>{ setStatYM(+ym.slice(0,4), +ym.slice(5,7)-1); bgExpanded.clear(); renderStatCalendar(); },
            onTop:()=>window.scrollTo({ top:0, behavior:'smooth' }) });   // 1023-J：回顶箭头在浮条右端（原来右下角单独一个 ↑）
        // 1023-J：和账单页同一套：滑过一屏才露出回顶箭头、回到顶部就藏；整页不满一屏时浮条一直显示
        function statStripWake(){
            if(JiwenBase.currentTab!=='stats') return;
            const H=window.innerHeight||0, de=document.documentElement;
            stStrip.setTop((window.scrollY||de.scrollTop||0) > H);
            stStrip.pin(de.scrollHeight>0 && de.scrollHeight <= H+1);   // 量不到高度（还没排版）当作满一屏
            stStrip.wake();
        }
        window.addEventListener('scroll', statStripWake, { passive:true });
        window.addEventListener('resize', statStripWake, { passive:true });

        // 读取 CSS 变量当前值，让 SVG 颜色跟着外观走
        function cssVar(name){ return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

        // —— 统计页自带的颜色工具（独立于外观系统的私有函数，避免作用域报错） ——
        function statHexToRgb(h){ h=(h||'').replace('#',''); if(h.length===3)h=h.split('').map(c=>c+c).join('');
            if(h.length<6) h='d4af37';
            return { r:parseInt(h.slice(0,2),16), g:parseInt(h.slice(2,4),16), b:parseInt(h.slice(4,6),16) }; }
        function statRgbToHsl(r,g,b){ r/=255;g/=255;b/=255; const mx=Math.max(r,g,b),mn=Math.min(r,g,b); let h,s,l=(mx+mn)/2;
            if(mx===mn){h=s=0;}else{const d=mx-mn; s=l>0.5?d/(2-mx-mn):d/(mx+mn);
                switch(mx){case r:h=(g-b)/d+(g<b?6:0);break;case g:h=(b-r)/d+2;break;default:h=(r-g)/d+4;}h/=6;}
            return { h:h*360, s:s*100, l:l*100 }; }
        function statHslToHex(h,s,l){ h=(h%360+360)%360; s=Math.max(0,Math.min(100,s))/100; l=Math.max(0,Math.min(100,l))/100;
            const c=(1-Math.abs(2*l-1))*s, x=c*(1-Math.abs((h/60)%2-1)), m=l-c/2; let r,g,b;
            if(h<60)[r,g,b]=[c,x,0];else if(h<120)[r,g,b]=[x,c,0];else if(h<180)[r,g,b]=[0,c,x];
            else if(h<240)[r,g,b]=[0,x,c];else if(h<300)[r,g,b]=[x,0,c];else[r,g,b]=[c,0,x];
            const f=v=>Math.round(Math.max(0,Math.min(255,(v+m)*255))).toString(16).padStart(2,'0');
            return '#'+f(r)+f(g)+f(b); }

        // 为当月每个分类分配稳定颜色：基于主题色在色相环上均匀散开，保证跟随主题
        function catColor(idx, total){
            const base=cssVar('--c-primary')||'#d4af37';
            const {r,g,b}=statHexToRgb(base);
            const {h,s}=statRgbToHsl(r,g,b);
            const hue=(h + idx*(360/Math.max(total,1))) % 360;
            return statHslToHex(hue, Math.max(s,45), 50);
        }

        function statRecords(){
            // 统计基于当前存档的全部记录
            return getUserData().slice();
        }

        // 给每条记录预解析出年/月/日/时间戳，供统计页各处共用。
        // 每条只调一次 parseRecTime（正则 + new Date），把 O(遍历次数 × n) 压成 O(n)。
        // 返回的是包装对象，原记录挂在 .r 上——不改动原对象，避免脏字段流回存储。
        function decorateRecs(recs){
            return recs.map(r=>{
                const t=parseRecTime(r.time);
                return { r, y:t.getFullYear(), mo:t.getMonth(), d:t.getDate(),
                         hh:t.getHours(), mi:t.getMinutes(), ts:t.getTime() };
            });
        }

        function renderStats(){
            syncFromLedger();   // 1023-H：和账单页同一个月
            renderStatCalendar();
            renderAllCatStats();   // 1023-A：分类汇总从账单页搬过来了
        }
        // ===== 分类汇总卡片 =====
        // 1023-A 从账单页搬到统计页最下面，算法不变：全部记录、只算计入，按分类的收支净额（一个分类有收有支先相减）
        // 1023-O：不再在框里滑（框的高度限制、右下角的滑动提示、排序切换都去掉了），全部铺开、固定从大到小；
        //   净额是支出的分类在上（「支出」一段），净额是收入的在下（「收入」一段），中间一道线，每段最后一行合计；
        //   一段超过 CAT_FOLD_OVER（10）个分类时先列前 CAT_FOLD_SHOW（8）个，最后一行「展开全部 N 个」。
        //   两段合计相加 = 累计收入 − 累计支出（和总结余里的对得上），下面写一句说明。
        const CAT_FOLD_OVER=10, CAT_FOLD_SHOW=8;
        let catOpenAll={ out:false, in:false };
        function renderAllCatStats(){
            const byCat={};
            getUserData().forEach(r=>{
                if(recMode(r)!=='normal') return;   // 不进收支统计的不进分类汇总，避免「转账：0.00」「存款：206677」
                const c=statContrib(r);
                byCat[r.cat]=(byCat[r.cat]||0)+(c.inc-c.exp);
            });
            $('catStatsCard').style.display = getUserData().length ? '' : 'none';
            renderCatStats(byCat);
        }
        function renderCatStats(byCat){
            const keys=Object.keys(byCat).filter(c=>round2(byCat[c])!==0);
            if(!keys.length){ $('catStats').innerHTML='<div class="cs-empty">暂无计入收支的记录</div>'; return; }
            const outs=keys.filter(c=>byCat[c]<0).sort((a, b)=>byCat[a]-byCat[b]);
            const ins=keys.filter(c=>byCat[c]>0).sort((a, b)=>byCat[b]-byCat[a]);
            const row=c=>{ const v=round2(byCat[c]), pos=v>0; return `<div class="cs-row"><span class="cs-name">${escapeHtml(c)}</span><span class="cs-amt ${pos?'pos':'out'}">${pos?'+':'−'}${Math.abs(v).toFixed(2)}</span></div>`; };
            const sec=(kind, title, list)=>{
                if(!list.length) return '';
                const open=catOpenAll[kind] || list.length<=CAT_FOLD_OVER;
                const shown=open ? list : list.slice(0, CAT_FOLD_SHOW);
                const sum=round2(list.reduce((t, c)=>t+byCat[c], 0)), pos=sum>0;
                return `<div class="cs-sec" data-kind="${kind}"><div class="cs-sec-h">${title}（${list.length} 个分类，从大到小）</div>`
                    + shown.map(row).join('')
                    + (open ? '' : `<button type="button" class="cs-more" data-kind="${kind}">展开全部 ${list.length} 个 ›</button>`)
                    + `<div class="cs-row cs-total"><span class="cs-name">合计</span><span class="cs-amt ${pos?'pos':'out'}">${pos?'+':'−'}${Math.abs(sum).toFixed(2)}</span></div></div>`;
            };
            $('catStats').innerHTML = sec('out', '支出', outs) + (outs.length && ins.length ? '<div class="cs-split" aria-hidden="true"></div>' : '') + sec('in', '收入', ins)
                + `<div class="cs-note">按分类的净额：一个分类里有收有支先相减（比如红包有收有发）。所以两段合计不一定分别等于总结余里的「累计收入」「累计支出」，但相加一定等于「累计收入 − 累计支出」。</div>`;
        }
        $('catStats').addEventListener('click', e=>{
            const m=e.target.closest('.cs-more'); if(!m) return;
            catOpenAll[m.dataset.kind]=true; renderAllCatStats();
        });
        // 「滑动提示」设置（1019-H）：分类汇总的滑动提示 1023-O 去掉了；开关照留（存这台手机），以后别处加这种提示也归它管
        function scrollHintOn(){ try{ return localStorage.getItem('app_scroll_hint')!=='off'; }catch(_){ return true; } }
        (function(){
            const seg=$('scrollHintSeg');
            function paint(){ const on=scrollHintOn(); seg.querySelectorAll('button').forEach(b=>b.classList.toggle('on', (b.dataset.v==='on')===on)); }
            seg.querySelectorAll('button').forEach(b=>b.addEventListener('click', ()=>{
                try{ if(b.dataset.v==='off') localStorage.setItem('app_scroll_hint', 'off'); else localStorage.removeItem('app_scroll_hint'); }catch(_){}
                paint();
            }));
            paint();
        })();

        // 1016-P：统计页顶上的待处理横幅「本月还有 N 笔导入账单待确认，共 x 元 [去处理]」。
        //   只在开发开关开着时读待处理池（开关关着时什么都不读、不显示）；这个月没有待处理就不显示。首页不加红点
        var __pendBannerSeq=0;   // var：统计页可能在这行执行前就渲染
        function renderPendBanner(){
            const my=++__pendBannerSeq, old=$('statPendBanner');
            let on=false; try{ on=localStorage.getItem('app_dev_import')==='1'; }catch(_){}
            let t=null;
            if(on){ try{ t=impTarget(); }catch(_){ t=null; } }
            if(!t){ if(old) old.remove(); return; }
            const month=`${statYear}-${pad(statMonth+1)}`;
            impGetJson(t.e, impPendKey(t.e.id, t.aid)).then(o=>{
                if(my!==__pendBannerSeq) return;
                let n=0, fen=0;
                ((o && Array.isArray(o.items)) ? o.items : []).forEach(x=>{ if(x && String(x.t||'').slice(0, 7)===month){ n++; fen+=Number(x.amt)||0; } });
                // 1017-L：这个月带 AI 标记的记录
                const flagged=getUserData().filter(r=>r.aiFlag && typeof r.time==='string' && r.time.slice(0, 7)===month);
                let b=$('statPendBanner');
                if(!n && !flagged.length){ if(b) b.remove(); return; }
                if(!b){
                    b=document.createElement('div'); b.id='statPendBanner'; b.className='stat-pend-banner';
                    const pane=$('statPaneFlow'); pane.insertBefore(b, pane.firstChild);
                }
                b.textContent='';
                if(n){
                    const tx=document.createElement('span'); tx.textContent=`本月还有 ${n} 笔导入账单待确认，共 ${(fen/100).toFixed(2)} 元`;
                    const go=document.createElement('button'); go.type='button'; go.id='statPendGo'; go.textContent='去处理';
                    go.addEventListener('click', ()=>{ loadImportUI().then(ui=>ui.openPending()).catch(e=>customAlert('导入模块没加载上：' + (e && e.message || e), '待处理')); });
                    b.appendChild(tx); b.appendChild(go);
                }
                if(flagged.length){
                    const tx2=document.createElement('span'); tx2.id='statAiFlags'; tx2.textContent=`有 ${flagged.length} 条 AI 标记待看`;
                    const go2=document.createElement('button'); go2.type='button'; go2.id='statAiFlagsGo'; go2.textContent='去看';
                    go2.addEventListener('click', ()=>openAiFlagList(month));
                    b.appendChild(tx2); b.appendChild(go2);
                }
            }).catch(()=>{ if(my===__pendBannerSeq){ const b=$('statPendBanner'); if(b) b.remove(); } });
        }

        // 1017-L：这个月带 AI 标记的记录列成一张底部面板（只看），点一条打开账单详情（在那里能「知道了，去掉标记」）
        function openAiFlagList(month){
            const all=getUserData(), list=all.filter(r=>r.aiFlag && typeof r.time==='string' && r.time.slice(0, 7)===month).sort((a, b)=>a.time<b.time ? -1 : 1);
            if(!window.JiwenSheet || !list.length) return;
            window.JiwenSheet.open({ title:'AI 标记待看（' + list.length + ' 条）',
                body(box, done){
                    list.forEach(r=>{
                        const row=document.createElement('div'); row.className='sf-item ai-flag-row'; row.dataset.id=r.id; row.style.minHeight='48px'; row.style.cursor='pointer';
                        const top=document.createElement('div'); top.className='sf-top';
                        top.textContent=`${r.time.slice(5, 16).replace('T', ' ')} · ${r.cat||'未分类'} · ${safeNum(r.money).toFixed(2)}`;
                        const why=document.createElement('div'); why.style.fontSize='12.5px'; why.style.color='var(--c-text-soft)'; why.textContent=aiFlagText(r, all);
                        row.appendChild(top); row.appendChild(why);
                        row.addEventListener('click', ()=>{ done(); openDetail(r.id, { onClose:()=>openAiFlagList(month) }); });   // 1019-S：详情关掉回这张列表（标记都去掉了就不回）
                        box.appendChild(row);
                    });
                },
                foot(box, done){ const c=document.createElement('button'); c.type='button'; c.className='ui-btn block'; c.id='aiFlagListClose'; c.textContent='关闭'; c.addEventListener('click', ()=>done()); box.appendChild(c); } });
        }
        // 1023-H：周合计按万写（格子窄，5 位数放不下）：不到 1 万写整数，不到 100 万「12.3万」，再大「1235万」，上亿「1.2亿」，最多 6 个字
        function shortNum(n){
            const a=Math.abs(n), sg=n>0 ? '+' : (n<0 ? '−' : ''), t=v=>v.toFixed(1).replace(/\.0$/, '');
            if(a>=1e8) return sg+t(a/1e8)+'亿';
            if(a>=1e6) return sg+Math.round(a/1e4)+'万';
            if(a>=1e4) return sg+t(a/1e4)+'万';
            return sg+a.toFixed(0);
        }
        function ymKey(y, mo){ return `${y}-${pad(mo+1)}`; }
        // 1023-O：拿上个月比时比同期：看的是这个月（还没过完）就只拿上个月 1 号到今天这个日子（上个月没这么多天就到月底）；看的是过完的月份照旧整月比
        //   返回 { pY, pM, cut（上个月算到几号）, same（是不是同期比）, name（「9月同期」/「9月」）}
        function prevPeriod(){
            const pY = statMonth===0 ? statYear-1 : statYear, pM = statMonth===0 ? 11 : statMonth-1;
            const now=new Date(), cur = now.getFullYear()===statYear && now.getMonth()===statMonth;
            const pLen=new Date(pY, pM+1, 0).getDate();
            const cut = cur ? Math.min(now.getDate(), pLen) : 31;
            const same = cur && cut<pLen;
            return { pY, pM, cut, same, name:`${pM+1}月${same ? '同期' : ''}` };
        }
        function renderStatCalendar(){
            $('statMonthLabel').textContent = `${statYear}年${pad(statMonth+1)}月`;
            renderPendBanner();
            // 【P4】取一次数、给每条只解析一次时间，几个消费点共用同一份（和 renderBill 同一个改法）
            const dec=decorateRecs(statRecords());

            // 日净额 / 有无数据 / 当月收支汇总——一趟
            const dayNet={}, dayHas={}, dayFlow={}, daySkip={}, dayRefund={};
            let mIn=0, mOut=0, mOutN=0, pOut=0;
            const pp=prevPeriod(), pY=pp.pY, pM=pp.pM;   // 1023-O：这个月没过完时比上个月同期
            // 月份浮条：每个月超没超月预算（设了预算的分类里花的 > 这些预算加起来；当月没过完也实时算），超了的月份字下面一个小红点（1023-J 起不画小柱子）
            const budgets=getBudgets(), budLimit=getCats().reduce((t, c)=>t+(budgets[c]>0 ? safeNum(budgets[c]) : 0), 0);
            const ymBud=new Map();
            let firstYM=ymKey(new Date().getFullYear(), new Date().getMonth());
            dec.forEach(x=>{
                const ym=ymKey(x.y, x.mo);
                if(x.y>1000){
                    if(ym<firstYM) firstYM=ym;
                    if(budLimit>0 && recMode(x.r)==='normal' && budgets[x.r.cat||'未分类']>0){ const v=expSigned(x.r); if(v) ymBud.set(ym, (ymBud.get(ym)||0)+v); }
                }
                if(x.y===pY && x.mo===pM && x.d<=pp.cut) pOut+=statContrib(x.r).exp;
                if(x.y!==statYear || x.mo!==statMonth) return;
                dayHas[x.d]=true;               // 不计的记录也算「这天有账」：格子照样能点开看明细
                // ……但不计金额（不计 / 往来都不进收支统计），只记下「这天有这类记录」用来打标签
                const m=recMode(x.r);
                if(m==='flow'){ dayFlow[x.d]=true; return; }
                if(m==='skip'){ daySkip[x.d]=true; return; }
                if(isRefund(x.r)) dayRefund[x.d]=true;    // 1010-J2：这天的净额里含退款，标出来
                const c=statContrib(x.r);
                dayNet[x.d]=(dayNet[x.d]||0)+(c.inc-c.exp);
                mIn+=c.inc; mOut+=c.exp; if(c.exp>0) mOutN++;
            });
            const nowYM=ymKey(new Date().getFullYear(), new Date().getMonth()), months=[];
            let my=+firstYM.slice(0,4), mmo=+firstYM.slice(5,7)-1;
            while(ymKey(my, mmo)<=nowYM){ const k=ymKey(my, mmo); months.push({ ym:k, over: budLimit>0 && round2(ymBud.get(k)||0)>budLimit }); mmo++; if(mmo>11){ mmo=0; my++; } }
            stStrip.set(months, ymKey(statYear, statMonth));
            requestAnimationFrame(statStripWake);   // 1023-J：换了月份页面变长变短：看要不要一直显示浮条、要不要露回顶箭头
            // 两格：当月支出（几笔、比上月多 / 少）| 当月收入（本月净剩）
            mIn=round2(mIn); mOut=round2(mOut); pOut=round2(pOut);
            $('statOutK').textContent=`当月支出 · ${mOutN} 笔`;
            $('statMonthOut').textContent=mOut.toFixed(2);
            const dm=round2(mOut-pOut);
            $('statOutCmp').textContent = pOut>0 ? (dm>=0 ? `比 ${pp.name} 多花 ${dm.toFixed(2)}` : `比 ${pp.name} 少花 ${(-dm).toFixed(2)}`) : `${pp.name} 没有支出`;
            $('statMonthIn').textContent='+'+mIn.toFixed(2);
            const net=round2(mIn-mOut);
            $('statNet').innerHTML=`本月净剩 <b class="${net>=0 ? 'pos' : 'out'}">${net>=0 ? '+' : '−'}${Math.abs(net).toFixed(2)}</b>`;
            fitNums($('statMonthOut').parentElement.parentElement);   // 金额太长（上千万）就把字缩小，不切掉

            renderStatBal(dec);
            // 本月预算（共用同一份预解析结果）
            renderStatBudget(dec);

            // 当月支出分类占比（复用当日分析的甜甜圈 + 分类列表画法）
            renderStatMonthCats(dec);

            // 画日历格子：周一为一周起始（和日期选择器、账单页同一个规矩）；1023-H 起每一行右边一格「周合计」
            const firstDow=(new Date(statYear, statMonth, 1).getDay()+6)%7;   // 0=周一
            const daysInMonth=new Date(statYear, statMonth+1, 0).getDate();
            const today=new Date();
            const isThisMonth = today.getFullYear()===statYear && today.getMonth()===statMonth;
            const todayMon = today.getDay()===1;

            const grid=$('statCal'); grid.innerHTML='';
            const rows=Math.ceil((firstDow+daysInMonth)/7);
            for(let r=0; r<rows; r++){
                let wkNet=0, wkAny=false, curWk=false;
                for(let i=0; i<7; i++){
                    const day=r*7+i-firstDow+1;
                    if(day<1 || day>daysInMonth){ grid.appendChild(document.createElement('div')); continue; }
                    const cell=document.createElement('div');
                    cell.className='day';
                    const has=!!dayHas[day];
                    if(has) cell.classList.add('has');
                    // 当天有账、但全是不计 / 往来：换一种底色，一眼和「花了钱的日子」分开
                    const excl = has && dayNet[day]===undefined;
                    if(excl) cell.classList.add('excl');
                    if(isThisMonth && today.getDate()===day){ cell.classList.add('today'); curWk=true; }
                    let inner=`<div class="dn">${day}</div>`;
                    // 当天只有不计的记录时 dayNet 没有这一天：只显示日期、不显示金额（否则会是 NaN）
                    if(has && dayNet[day]!==undefined){
                        const n=round2(dayNet[day]);   // 收支浮点相消可能剩 -5e-17，不归整会渲染成「-0」
                        wkNet+=n; wkAny=true;
                        // 1023-H：花出去的用正文色（和账单页一样），进账绿色
                        inner+=`<div class="da ${n>=0 ? 'pos' : 'out'}">${n>=0?'+':''}${n.toFixed(0)}</div>`;
                    }
                    // 统计标签：退款 / 不计 / 往来（普通日子里夹着这类记录也照样标）
                    if(dayFlow[day] || daySkip[day] || dayRefund[day]){
                        inner+=`<div class="day-tags">${dayRefund[day]?'<span class="dtag refund">退款</span>':''}${daySkip[day]?'<span class="dtag skip">不计</span>':''}${dayFlow[day]?'<span class="dtag flow">往来</span>':''}</div>`;
                    }
                    cell.innerHTML=inner;
                    if(has){
                        cell.dataset.day=`${statYear}-${pad(statMonth+1)}-${pad(day)}`;
                        cell.addEventListener('click', ()=>openDay(cell.dataset.day));   // 1023-H：和账单页同一个当日详情
                    }
                    grid.appendChild(cell);
                }
                // 周合计：这一行在这个月里的几天的净额（和格子同一个口径）；本周那格深一点；今天是周一时本周那格空着（和账单页同一个规矩）
                const monDay=r*7-firstDow+1, mon=cal.addDay(ymKey(statYear, statMonth)+'-01', monDay-1);
                const wk=document.createElement('button'); wk.type='button';
                wk.className='wk-sum'+(curWk ? ' cur' : '');
                wk.dataset.mon=mon;
                wkNet=round2(wkNet);
                const blank = curWk && todayMon;
                wk.innerHTML=`<span class="wk-v ${wkNet>0 ? 'pos' : 'out'}">${blank ? '' : (wkAny ? shortNum(wkNet) : '—')}</span>`;   // 1023-O：只写数字（列头「周合计」已经说了是什么），本周那格深底
                wk.setAttribute('aria-label', (curWk ? '本周' : '这一周')+'，点了看一周');
                wk.addEventListener('click', ()=>openWeek(mon));
                grid.appendChild(wk);
            }

            if(statTab==='budget') renderBudgetPane(dec);
            statSelDay=null;
        }

        // 1023-C：总结余（原来在账单页总览最下面一行，搬过来）；1023-O 起挪到页面底部和分类汇总挨着（这两块是全部记录的，切月份不变）：
        //   一行（总结余 + 数 + ⌄），整行点了展开 / 收起；展开是能对上的算式：期初余额 + 累计收入 − 累计支出 + 往来 = 总结余，下面一句不计、往来怎么算
        //   期初余额 = 记成「往来」、备注是「期初余额」的那几笔（导入结果页「补一笔期初余额」就是这样记的），其余往来另算（1023-P 再给正式入口）
        let balSum=null, balOpen=false;
        const BAL_CHEV='<svg class="st-bal-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
        function renderStatBal(dec){
            const card=$('statBal'); if(!card) return;
            let sIn=0, sOut=0, fNet=0, open=0;
            dec.forEach(x=>{ const c=statContrib(x.r); sIn+=c.inc; sOut+=c.exp; if(isFlow(x.r)){ const b=balContrib(x.r), v=b.inc-b.exp; if((x.r.remark||'').trim()==='期初余额') open+=v; else fNet+=v; } });
            sIn=round2(sIn); sOut=round2(sOut); fNet=round2(fNet); open=round2(open);
            balSum={ sIn, sOut, fNet, open, net:round2(sIn-sOut+fNet+open) };
            card.style.display = dec.length ? '' : 'none';
            const f=v=>Math.abs(v).toFixed(2), op=v=>v<0 ? '−' : '+';
            card.classList.toggle('open', balOpen);
            card.innerHTML=`<button type="button" class="st-bal-head" id="statBalHead" aria-expanded="${balOpen}"><span class="st-bal-k">总结余<em>全部记录，含期初余额</em></span><span class="st-bal-v ov-net" id="statBalNum">${balSum.net<0 ? '−' : ''}${f(balSum.net)}</span>${BAL_CHEV}</button>`
                + (balOpen ? `<div class="st-bal-rows" id="statBalRows">`
                    + `<div class="st-bal-row"><span>期初余额</span><b>${balSum.open<0 ? '−' : ''}${f(balSum.open)}</b></div>`
                    + `<div class="st-bal-row"><span>+ 累计收入</span><b class="pos">${f(sIn)}</b></div>`
                    + `<div class="st-bal-row"><span>− 累计支出</span><b>${f(sOut)}</b></div>`
                    + `<div class="st-bal-row"><span>${op(balSum.fNet)} 往来（转账、存取钱、借还钱）</span><b>${f(balSum.fNet)}</b></div>`
                    + `<div class="st-bal-row st-bal-eq"><span>= 总结余</span><b>${balSum.net<0 ? '−' : ''}${f(balSum.net)}</b></div>`
                    + `<div class="st-bal-note">往来只算进结余，不算进收入、支出；记成「不计」的哪里都不算。所以结余不等于收入减支出。</div></div>` : '');
        }
        $('statBal').addEventListener('click', e=>{
            if(!e.target.closest('#statBalHead')) return;
            balOpen=!balOpen; renderStatBal(decorateRecs(statRecords()));
        });

        // 当月分类占比：可按「支出」或「收入」两种口径渲染（由 statMonthCatMode 决定）。
        // 入参 recs 已是整档全量，此处按 statYear/statMonth + 收支类型过滤后按分类聚合。
        // 分类多于 6 个时，金额前 6 保留、其余并入「其他」，避免列表过长。
        // 颜色一律走 catColor()，与当日分析同源，换主题色时一起变。
        let statMonthCatMode='expense';   // 'expense' | 'income'
        let statMonthCatRecs=null;        // 缓存最近一次的 dec（已预解析日期），供胶囊切换时就地重渲染
        function renderStatMonthCats(dec){
            if(dec) statMonthCatRecs=dec;        // 首次/刷新时更新缓存；切换口径时传 null 复用缓存
            dec=statMonthCatRecs||[];
            const card=$('statMonthCatCard');
            const pie=$('statMonthPie'), list=$('statMonthCatList');
            const title=$('statMonthCatTitle');
            if(!card || !pie || !list) return;

            const isExp=statMonthCatMode==='expense';
            const wantType=isExp?'expense':'income';
            if(title) title.textContent = isExp ? '当月支出分类占比' : '当月收入分类占比';

            const byCat={};
            dec.forEach(x=>{
                // 关键：只统计当前查看月份、且符合当前口径（支出/收入）的记录
                if(x.y===statYear && x.mo===statMonth && recMode(x.r)==='normal'){
                    const amt=catSigned(x.r, wantType);    // 支出口径：退款为负（1010-J）
                    if(!amt) return;
                    const c=x.r.cat||'未分类';
                    byCat[c]=(byCat[c]||0)+amt;
                }
            });

            // 上个月同口径的分类金额，用来算「较上月」；1023-O 起这个月没过完时比上个月同期
            const pp=prevPeriod(), pY=pp.pY, pM=pp.pM;
            prevSame=pp.same;
            const prevByCat={};
            dec.forEach(x=>{
                if(x.y===pY && x.mo===pM && x.d<=pp.cut && recMode(x.r)==='normal'){
                    const amt=catSigned(x.r, wantType); if(!amt) return;
                    const c=x.r.cat||'未分类';
                    prevByCat[c]=(prevByCat[c]||0)+amt;
                }
            });

            // 退完了（净额 ≤ 0）的分类画不进饼图，不列
            let cats=Object.keys(byCat).filter(c=>round2(byCat[c])>0).sort((a,b)=>byCat[b]-byCat[a]);

            // 当月该口径无记录：卡片保持可见（胶囊常在），只把内容区替换成一句提示。
            if(!cats.length){
                card.style.display='';
                pie.style.display='none'; pie.innerHTML='';
                list.innerHTML=`<div class="stat-day-empty">当月无${isExp?'支出':'收入'}记录</div>`;
                return;
            }

            // 前 6 + 其余并为「其他」
            const TOP=6;
            let items;
            if(cats.length>TOP){
                const top=cats.slice(0,TOP).map(c=>({ name:c, val:byCat[c], prev:prevByCat[c]||0 }));
                const rest=cats.slice(TOP);
                const restSum=rest.reduce((s,c)=>s+byCat[c],0);
                const restPrev=rest.reduce((s,c)=>s+(prevByCat[c]||0),0);
                // 合并项不叫「其他」：用户自己就有一个叫「其他」的分类，同名会混成两行「其他」
                items=top.concat([{ name:`其余 ${rest.length} 类`, val:restSum, prev:restPrev }]);
            } else {
                items=cats.map(c=>({ name:c, val:byCat[c], prev:prevByCat[c]||0 }));
            }

            const total=items.reduce((s,it)=>s+it.val,0);
            const vals=items.map(it=>it.val);
            const colors=items.map((_,i)=>catColor(i, items.length));

            card.style.display='';
            pie.style.display='';
            pie.innerHTML=buildDonutSVG(vals, colors);
            list.innerHTML=items.map((it,i)=>{
                const pct=total>0 ? (it.val/total*100).toFixed(2) : '0.00';
                const sign=isExp?'−':'+';
                const cls=isExp?'out':'pos';   // 1023-H：花出去的用正文色（和账单页一样），红色只留给「有问题」的
                return `<div class="sc-item">
                    <div class="sc-top">
                        <span class="sc-name"><span class="sc-dot" style="background:${colors[i]}"></span><span class="sc-cat-name">${escapeHtml(it.name)}</span></span>
                        <span class="sc-pct">${pct}%</span>
                    </div>
                    <div class="sc-bot">${monthDeltaHtml(it.val, it.prev, isExp)}<span class="sc-amt ${cls}">${sign}${it.val.toFixed(2)}</span></div>
                </div>`;
            }).join('');
        }
        // 「较上月 ↑12%」。支出涨了标红、降了标绿；收入相反。上月为 0 时写「上月无」。
        let prevSame=false;   // 1023-O：这一次比的是上月同期（这个月没过完）
        function monthDeltaHtml(cur, prev, isExp){
            cur=round2(cur); prev=round2(prev);
            const w = prevSame ? '上月同期' : '上月';
            if(prev<=0) return cur>0 ? `<span class="sc-delta">${w}无</span>` : '';
            const pct=Math.round((cur-prev)/prev*100);
            if(pct===0) return `<span class="sc-delta">与${w}持平</span>`;
            const up=pct>0, bad = isExp ? up : !up;
            return `<span class="sc-delta ${bad?'bad':'good'}">较${w} ${up?'↑':'↓'}${Math.abs(pct)}%</span>`;
        }

        // 支出/收入胶囊切换：只改口径 + 就地重渲染（复用缓存的 recs，不重跑整页统计）
        (function(){
            const seg=$('statMonthCatSeg');
            if(!seg) return;
            seg.addEventListener('click', e=>{
                const btn=e.target.closest('button[data-v]');
                if(!btn) return;
                const mode=btn.getAttribute('data-v');
                if(mode===statMonthCatMode) return;
                statMonthCatMode=mode;
                seg.querySelectorAll('button').forEach(b=>b.classList.toggle('on', b===btn));
                renderStatMonthCats(null);   // 传 null 复用缓存
            });
        })();

        // 手写甜甜圈饼图
        function buildDonutSVG(vals, colors){
            const total=vals.reduce((a,b)=>a+b,0);
            if(total<=0) return '';
            const cx=70, cy=70, r=58, rin=33;
            let ang=-Math.PI/2;   // 从顶端开始
            let paths='';
            vals.forEach((v,i)=>{
                const frac=v/total;
                const a2=ang + frac*Math.PI*2;
                // 单一扇形若占满整圈，用两段避免 arc 退化
                if(frac>=0.9999){
                    paths+=`<circle cx="${cx}" cy="${cy}" r="${(r+rin)/2}" fill="none" stroke="${colors[i]}" stroke-width="${r-rin}"/>`;
                } else {
                    const x1=cx+r*Math.cos(ang),   y1=cy+r*Math.sin(ang);
                    const x2=cx+r*Math.cos(a2),    y2=cy+r*Math.sin(a2);
                    const xi2=cx+rin*Math.cos(a2), yi2=cy+rin*Math.sin(a2);
                    const xi1=cx+rin*Math.cos(ang),yi1=cy+rin*Math.sin(ang);
                    const large=frac>0.5?1:0;
                    paths+=`<path d="M${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)} L${xi2.toFixed(2)},${yi2.toFixed(2)} A${rin},${rin} 0 ${large} 0 ${xi1.toFixed(2)},${yi1.toFixed(2)} Z" fill="${colors[i]}"/>`;
                }
                ang=a2;
            });
            return `<svg viewBox="0 0 140 140" width="140" height="140" role="img" aria-label="当日支出分类占比">${paths}</svg>`;
        }

        // 【1010-H】此处原有「按小时柱状图 → 时段明细 → 详情」一整条链，对应的页面元素早在
        //   统计页改版时就删掉了，代码却一直留着（有判空保护，不报错但也执行不到）。已整体移除。
        //   详情弹窗现在只从两处进入：统计页当日明细 / 预算明细（可修改），批量确认清单（只读）。


        // 「回到本月」浮钮（1010-K2）1023-O 去掉了：月份浮条最右边就是这个月，拨一下就回来


        // ===== 年月选择器（统计页）=====
        // 与日期选择器同构，只是没有「日」这一级：月网格 → 点标题 → 年网格。
        // 复用同一套 .dt-cell 样式与 attachSwipe，保证两个选择器的外观和手势完全一致。
        (function(){
            const mask=$('ymMask'), grid=$('ymGrid'), yearGrid=$('ymYearGrid'), yearLabel=$('ymYearLabel');
            let pickYear;              // 选择器里临时浏览的年份
            let ymLevel='month';       // 'month' | 'year'
            let ymYearPageStart=0;

            // 找出某年里有记账记录的月份集合（用于打点标记）
            function monthsWithData(year){
                const set=new Set();
                statRecords().forEach(r=>{
                    const d=parseRecTime(r.time);
                    if(d.getFullYear()===year) set.add(d.getMonth());
                });
                return set;
            }
            // 有记账记录的年份集合
            function yearsWithData(){
                const set=new Set();
                statRecords().forEach(r=>set.add(parseRecTime(r.time).getFullYear()));
                return set;
            }

            // dir 同 renderDtDays：仅翻页时传，下钻/打开不传
            function paint(dir){
                grid.style.display     = ymLevel==='month' ? 'grid' : 'none';
                yearGrid.style.display = ymLevel==='year'  ? 'grid' : 'none';
                yearLabel.classList.toggle('top', ymLevel==='year');
                if(ymLevel==='month') paintMonths();
                else                  paintYears();
                if(dir) playSlide(ymLevel==='month' ? grid : yearGrid, dir);
            }

            function paintMonths(){
                yearLabel.textContent=pickYear;
                const has=monthsWithData(pickYear);
                const now=new Date();
                grid.innerHTML='';
                for(let m=0;m<12;m++){
                    const b=document.createElement('div');
                    b.className='dt-cell';
                    b.textContent=(m+1)+'月';
                    if(pickYear===statYear && m===statMonth) b.classList.add('selected');
                    if(now.getFullYear()===pickYear && now.getMonth()===m) b.classList.add('today');
                    if(has.has(m)) b.classList.add('has');   // 有数据的月份打点
                    b.onclick=()=>{
                        setStatYM(pickYear, m);
                        mask.style.display='none'; renderStatCalendar();
                    };
                    grid.appendChild(b);
                }
            }

            function paintYears(){
                const end=ymYearPageStart+11;
                yearLabel.textContent=`${ymYearPageStart} - ${end}`;
                const has=yearsWithData();
                const nowY=new Date().getFullYear();
                yearGrid.innerHTML='';
                for(let i=0;i<12;i++){
                    const y=ymYearPageStart+i;
                    const b=document.createElement('div');
                    b.className='dt-cell';
                    b.textContent=y;
                    if(y===statYear) b.classList.add('selected');
                    if(y===nowY)     b.classList.add('today');
                    if(has.has(y))   b.classList.add('has');
                    b.onclick=()=>{
                        pickYear=y;
                        ymLevel='month';    // 选完年 → 收回月网格
                        paint();
                    };
                    yearGrid.appendChild(b);
                }
            }

            // 翻页：按当前层级
            // 顺带补上年份钳位 —— 之前这里没有边界，一直左滑能翻到负数年/9999 年。
            // 复用日期选择器的 DT_YEAR_MIN/MAX，两个选择器的可选范围保持一致。
            function ymNav(dir){
                if(ymLevel==='month'){
                    const y=pickYear+dir;
                    if(y<DT_YEAR_MIN || y>DT_YEAR_MAX) return;
                    pickYear=y;
                } else {
                    const s=ymYearPageStart + dir*12;
                    if(s+11 < DT_YEAR_MIN || s > DT_YEAR_MAX) return;   // 整页都出界就不翻
                    ymYearPageStart=s;
                }
                paint(dir);
            }

            function open(){
                pickYear=statYear;
                ymLevel='month';        // 每次打开都从月网格开始
                paint();
                mask.style.display='flex';
            }

            $('statMonthLabel').addEventListener('click', open);
            // 点标题：月 → 年。年是顶层，再点无效。
            yearLabel.addEventListener('click', ()=>{
                if(ymLevel!=='month') return;
                ymLevel='year';
                ymYearPageStart = pickYear - ((pickYear % 12) + 12) % 12;   // 开在包含当前年的那一页
                paint();
            });
            $('ymPrevY').addEventListener('click', ()=>ymNav(-1));
            $('ymNextY').addEventListener('click', ()=>ymNav(1));
            attachSwipe($('ymBox'), dir=>ymNav(dir));   // 网格内左右滑动翻页，与日期选择器一致
            $('ymCancel').addEventListener('click', ()=>{ mask.style.display='none'; });
            $('ymToCurrent').addEventListener('click', ()=>{
                const now=new Date();
                setStatYM(now.getFullYear(), now.getMonth());
                mask.style.display='none'; renderStatCalendar();
            });
        })();
        function saveDays(list, user){
            try{
                localStorage.setItem(daysKey(user), JSON.stringify(list));
                // 倒数日也在 odBuildPayload 的打包范围内，改完同样要同步（见 saveStoreSafe 处注释）
                if(user===undefined || user===JiwenBase.currentUser) odScheduleSync();
                return true;
            }catch(err){
                customAlert('存储空间已满，这个日子没能保存。请删除部分记录后重试。', '保存失败');
                return false;
            }
        }

        // 计算天数差。
        // 【不用 (t1-t0)/86400000】那种毫秒除法在有夏令时的时区会算错（少/多一天），
        //   国内虽无夏令时，但没必要留这个坑。直接把两个日期都归一到「当天 00:00 的本地时刻」
        //   再比较，语义清楚且与时区无关。
        // 返回 { state:'today'|'future'|'past', n }，n 为天数（today 时为 0）。
        function calcDay(dateStr){
            const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
            if(!m) return { state:'today', n:0 };
            const target=new Date(+m[1], +m[2]-1, +m[3]);   // 本地 00:00
            const now=new Date();
            const today=new Date(now.getFullYear(), now.getMonth(), now.getDate());
            // 两者都是本地零点，相差必为整数天（夏令时下也用 round 兜一层）
            const diff=Math.round((target-today)/86400000);
            if(diff===0) return { state:'today',  n:0 };
            if(diff>0)   return { state:'future', n:diff };
            return { state:'past', n:-diff };
        }

        const DAY_WEEK=['日','一','二','三','四','五','六'];
        function fmtDayDate(s){
            const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
            if(!m) return s;
            const d=new Date(+m[1], +m[2]-1, +m[3]);
            return `${s} 星期${DAY_WEEK[d.getDay()]}`;
        }

        // 排序：置顶优先 → 今天 → 未来（近→远）→ 过去（近→远）。
        // 【只做置顶 + 自动排序，不做拖拽】草图里两者并存是矛盾的——用户手动拖完，
        //   下次打开又被自动排序打乱。倒数日的核心诉求就是「最近的那个」，自动排序
        //   天然满足；「置顶」已经提供了「我要它在最上面」的能力，够用了。
        //
        // 【坑】calcDay().n 是绝对值：3 天前和 3 天后都是 n=3。早先直接拿 n 升序排，
        //   等于把过去和未来混在一起——「3 天前的纪念日」会压在「5 天后的截止日」上面，
        //   「100 天前的旧事」又插在「200 天后的远期」前面。倒数日的重心是未来，
        //   必须先按 state 分组，再在组内比距离。
        const DAY_STATE_RANK={ today:0, future:1, past:2 };
        function sortedDays(list){
            return list.slice().sort((a,b)=>{
                const pa=a.pin?1:0, pb=b.pin?1:0;
                if(pa!==pb) return pb-pa;                     // 置顶在前
                const ca=calcDay(a.date), cb=calcDay(b.date);
                const ra=DAY_STATE_RANK[ca.state], rb=DAY_STATE_RANK[cb.state];
                if(ra!==rb) return ra-rb;                     // 今天 → 未来 → 过去
                return ca.n - cb.n;                           // 组内：距今越近越靠前
            });
        }

        // 渲染一行的「还有/已经 N 天」右侧部分（入口卡与管理页共用同一套口径）
        function dayNumHtml(c, cls){
            if(c.state==='today') return `<span class="${cls}-today">就是今天</span>`;
            const word = c.state==='future' ? '还有' : '已经';
            const fut  = c.state==='future' ? ' future' : '';
            return `<span class="${cls}-word">${word}</span>`
                 + `<span class="${cls}-num${fut}">${c.n}</span>`
                 + `<span class="${cls}-unit">天</span>`;
        }
        window.JiwenStats = { get bgSuggestOpen(){ return bgSuggestOpen; }, set bgSuggestOpen(v){ bgSuggestOpen=v; }, calcDay, dayNumHtml, fmtDayDate, openAiFlagList, renderStats, saveDays, setStatTab, setStatYM, sortedDays, stepMonth, statStripWake, get statMonth(){ return statMonth; }, set statMonth(v){ statMonth=v; }, get statMonthCatMode(){ return statMonthCatMode; }, get statSelDay(){ return statSelDay; }, set statSelDay(v){ statSelDay=v; }, get statTab(){ return statTab; }, get statYear(){ return statYear; }, set statYear(v){ statYear=v; } };   // stats 模块对外只有这一个入口（get / set 的是会变的变量，读写的时候才去取）
})();
