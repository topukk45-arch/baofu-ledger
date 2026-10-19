
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

