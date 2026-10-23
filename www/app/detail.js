(function(){
        const { $, escapeHtml, isSkip, pad, parseRecTime, recMode, round2, safeNum } = window.JiwenBase;   // 用到前面模块的
        const { IMP_APPS, balContrib, getUserData, isRefund, modeAmtCls, modeTag, refundedMap, refundedTag, refundedTotal, refundsOf, saveUserData, statContrib } = window.JiwenStore;   // 用到前面模块的
        const { customAlert, customConfirm } = window.JiwenAsk;   // 用到前面模块的
        const { devImportOn } = window.JiwenImportEntry;   // 用到前面模块的
        const { openAddModal, openRefund, refundLineHtml } = window.JiwenForms;   // 用到前面模块的

        // 清单行 → 只读详情。批量确认还没执行，此时允许改记录会让清单和即将执行的范围对不上，
        // 所以从这里进的详情隐藏「修改」按钮，只看不改。
        $('askList').addEventListener('click', e=>{
            const row=e.target.closest('.al-row');
            if(row && row.dataset.id) openDetail(row.dataset.id, { readonly:true });
        });

        // 打开账单详情弹窗。opts.readonly 时隐藏「修改」（批量确认清单里进来的）。
        // 1023-D：单笔详情（账单页、统计页共用）：上面大金额、标题（备注，没备注写分类）、分类 + 收支标签 + 日期时间；
        //   下面一张列表卡：统计、「这一天 · N 笔 · 支出 x ›」（点了换成当日详情）、这笔之后结余，有的才显示原账单 / 退款、来源、AI 标记、待确认；
        //   底部「修改 | 再记一笔」，再下面一行小字「这笔要退款」（原来在修改账单里，1023-D 提出来；删除还在修改里）。
        //   opts.readonly：批量确认清单里进来的，只看不改（三个按钮都藏）
        function openDetail(id, opts){
            const rec=getUserData().find(r=>r.id===id);
            const ro=!!(opts && opts.readonly);
            if(!rec){ customAlert('这条记录不存在了'); return; }
            const C=cal, day=(rec.time||'').slice(0,10), okDay=/^\d{4}-\d{2}-\d{2}$/.test(day);
            $('detailTime').textContent = okDay ? `${C.dayTitle(day).replace(/^(今天|昨天) · /, '')} ${(rec.time||'').slice(11,16)}` : (rec.time||'').replace('T',' ');
            const isExp = rec.type==='expense';
            const amt=safeNum(rec.money);
            $('detailMoney').innerHTML = `<span class="${isExp?'out':'pos'}${modeAmtCls(rec)}">${isExp?'−':'+'}${amt.toFixed(2)}</span>`;
            $('detailCat').innerHTML = `<span class="cat-tag">${escapeHtml(rec.cat||'未分类')}</span>`;
            const all=getUserData();
            $('detailType').innerHTML = (isExp
                ? '<span class="io-tag io-out">支出</span>'
                : (isRefund(rec) ? '<span class="io-tag io-refund">退款</span>' : '<span class="io-tag io-in">收入</span>'))
                + refundedTag(rec, refundedMap(all));
            // 1020-I：统计单独一行（原来是收支后面的小标签）
            $('detailMode').textContent = ({ normal:'计入', skip:'不计', flow:'往来' })[recMode(rec)];
            // 这一天：几笔、支出多少，点了看当日详情
            const dayRow=$('detailDayRow');
            if(okDay){
                const ds=all.filter(r=>(r.time||'').slice(0,10)===day), s=sumFen(ds);
                $('detailDay').textContent=`${ds.length} 笔 · 支出 ${s.exp.toFixed(2)}`;
                dayRow.dataset.day=day; dayRow.style.display='';
            } else dayRow.style.display='none';
            // 1023-A：原来列表里每行的「结余」挪到这里：记完这一笔以后的结余（全部记录、含期初余额，不计的不算）
            const bal=balanceAfter(rec);
            $('detailBal').textContent = bal==null ? '' : bal.toFixed(2) + (isSkip(rec) ? '（这笔不计，不影响结余）' : '');
            paintDetailRefund(rec, all);
            paintDetailSource(rec);
            paintDetailAiFlag(rec, all);
            paintDetailRv(rec);
            const rk=(rec.remark||'').trim();
            $('detailRemark').textContent = rk || (rec.cat||'未分类');
            $('detailRemark').classList.toggle('dtl-nork', !rk);
            $('detailEdit').style.display = ro ? 'none' : '';
            $('detailAgain').style.display = (ro || isRefund(rec)) ? 'none' : '';   // 退款的分类跟着原账单走，不给「再记一笔」
            const rf=$('detailRefund');
            const rem = isExp ? round2(amt-refundedTotal(all, rec.id)) : 0;
            if(!ro && isExp && rem>0){ rf.style.display=''; rf.textContent = rem<round2(amt) ? `再退一笔（还能退 ${rem.toFixed(2)}）` : '这笔要退款'; }
            else rf.style.display='none';
            // 1019-S：从别的列表点进来的，关掉回那个列表；详情里刷新同一条（去掉 AI 标记、拆开）时照旧留着
            detailOnClose=(opts && opts.onClose) || (detailCurId===id && $('detailMask').style.display==='flex' ? detailOnClose : null);
            detailCurId=id;
            $('detailMask').style.display='flex';
        }
        // 离开详情去别处（修改 / 再记一笔 / 退款 / 这一天）：关掉、不再回原来的列表
        function leaveDetail(){ const id=detailCurId; $('detailMask').style.display='none'; detailCurId=null; detailOnClose=null; return id; }
        $('detailDayRow').addEventListener('click', ()=>{ const k=$('detailDayRow').dataset.day; leaveDetail(); if(k) openDay(k); });
        $('detailAgain').addEventListener('click', ()=>{
            const rec=getUserData().find(r=>r.id===detailCurId); leaveDetail();
            if(rec) openAddModal({ from:rec });
        });
        $('detailRefund').addEventListener('click', ()=>{ const id=leaveDetail(); if(id) openRefund(id); });

        // 第二期（1016-Z6）：详情里一行浅色「来自微信账单」/「已和微信账单合并」；合并过的、开着开发开关时有「拆开」。手记、没来源的不显示
        function paintDetailSource(rec){
            let f=$('detailSrcField');
            const app=rec.src && IMP_APPS.includes(rec.src.app) ? (rec.src.app==='alipay' ? '支付宝' : '微信') : '';
            if(!app){ if(f) f.remove(); return; }
            if(!f){
                f=document.createElement('div'); f.className='rec-row detail-row detail-block'; f.id='detailSrcField';   // 1020-I：列表卡里一行
                $('detailList').appendChild(f);
            }
            f.textContent='';
            const k=document.createElement('span'); k.className='rec-row-k'; k.textContent='来源'; f.appendChild(k);
            const v=document.createElement('div'); v.className='detail-src'; v.id='detailSrc';
            v.textContent = rec.src.merged ? `已和${app}账单合并（你记的这条，补上了来源）` : rec.src.sum ? `来自${app}账单（几笔合成的一条）` : `来自${app}账单`;
            f.appendChild(v);
            if(rec.src.merged && devImportOn()){
                const b=document.createElement('button'); b.type='button'; b.className='mini-btn'; b.id='detailSplit'; b.textContent='拆开'; b.style.marginTop='6px';
                b.addEventListener('click', ()=>{
                    customConfirm(`把这条和${app}账单拆开：\n\n· 你记的这条改回合并前的样子（你后来改过的不动）\n· 账单另记一条（分类和你记的这条一样）\n\n拆开算进原来那次导入，撤销那次导入时一起撤。`, async ()=>{
                        try{
                            const r=await window.JiwenImportStore.splitMerge(rec.id);
                            $('detailMask').style.display='none';
                            customAlert(r.added ? `拆开了：你记的那条还原了，账单另记了 ${r.added} 条（分类和你记的那条一样，不对可以去改）。` : '拆开了：你记的那条还原了。这次导入是旧版本做的，没存账单本身，下次再导同一份账单时它会作为新增出现。', '拆开');
                        }catch(err){
                            const c=err && (err.code || err.message);
                            customAlert(c==='nolog' ? '找不到合并它的那次导入记录了（只保留最近 10 次），拆不开。' : '没拆成，账本没动：' + c, '拆开');
                        }
                    }, '拆开', { okText:'拆开这条', danger:true });
                });
                f.appendChild(b);
            }
        }
        // 1017-L：AI 标记（「AI 检查导入结果」打的）：详情里一行「AI 觉得可能和 X 月 X 日那笔重复」+ 理由，「知道了，去掉标记」。
        //   标记只有用过开发开关里的 AI 检查才会有，有就显示（不看开关）；去掉标记就是改这一条记录（不算 AI 修改，撤销那次 AI 修改时这一项按「你后来改过」不动）
        function aiFlagText(rec, all){
            const f=rec.aiFlag; if(!f) return '';
            const o=f.ref ? (all||getUserData()).find(r=>r.id===f.ref) : null;
            const when=o ? `${+o.time.slice(5,7)} 月 ${+o.time.slice(8,10)} 日那笔（${safeNum(o.money).toFixed(2)}）` : '';
            return f.k==='dup' ? (when ? `AI 觉得可能和 ${when}重复` : 'AI 觉得这笔可能记重复了')
                               : (when ? `AI 觉得可能漏配：和 ${when}有关` : 'AI 觉得这笔可能漏配了（和你记的某条手记是同一笔）');
        }
        function paintDetailAiFlag(rec, all){
            let f=$('detailAiField');
            if(!rec.aiFlag){ if(f) f.remove(); return; }
            if(!f){
                f=document.createElement('div'); f.className='rec-row detail-row detail-block'; f.id='detailAiField';   // 1020-I：列表卡里一行
                $('detailList').appendChild(f);
            }
            f.textContent='';
            const lab=document.createElement('span'); lab.className='rec-row-k'; lab.textContent='AI 标记'; f.appendChild(lab);
            const box=document.createElement('div'); box.className='detail-ai';
            const v=document.createElement('div'); v.id='detailAiFlag'; v.style.color='var(--c-neg)'; v.textContent=aiFlagText(rec, all); box.appendChild(v);
            if(rec.aiFlag.why){ const w=document.createElement('div'); w.id='detailAiWhy'; w.style.color='var(--c-text-soft)'; w.style.fontSize='12.5px'; w.style.marginTop='4px'; w.textContent='理由：'+rec.aiFlag.why; box.appendChild(w); }
            f.appendChild(box);
            const b=document.createElement('button'); b.type='button'; b.className='mini-btn'; b.id='detailAiClear'; b.textContent='知道了，去掉标记'; b.style.marginTop='6px';
            b.addEventListener('click', ()=>{
                const data=getUserData(), i=data.findIndex(r=>r.id===rec.id);
                if(i<0){ customAlert('这条记录不存在了'); return; }
                const next=Object.assign({}, data[i]); delete next.aiFlag;
                data[i]=next;
                if(!saveUserData(data)) return;
                try{ window.JiwenTabs.refreshAllViews(); }catch(_){}
                openDetail(rec.id);
            });
            f.appendChild(b);
        }
        // 1021-T13：待确认分类（导入时推荐把握低 / 未分类、确认页没定过的，记录上 rv:1）：详情里一行「分类没问题」只去掉标记
        function paintDetailRv(rec){
            let f=$('detailRvField');
            if(rec.rv!==1){ if(f) f.remove(); return; }
            if(!f){ f=document.createElement('div'); f.className='rec-row detail-row detail-block'; f.id='detailRvField'; $('detailList').appendChild(f); }
            f.textContent='';
            const lab=document.createElement('span'); lab.className='rec-row-k'; lab.textContent='待确认'; f.appendChild(lab);
            const v=document.createElement('div'); v.textContent='分类是导入时推荐的，还没确认。改了分类就不再提示。'; v.style.color='var(--c-text-soft)'; f.appendChild(v);
            const b=document.createElement('button'); b.type='button'; b.className='mini-btn'; b.id='detailRvOk'; b.textContent='分类没问题'; b.style.marginTop='6px';
            b.addEventListener('click', ()=>{
                const data=getUserData(), i=data.findIndex(r=>r.id===rec.id);
                if(i<0){ customAlert('这条记录不存在了'); return; }
                const next=Object.assign({}, data[i]); delete next.rv;
                data[i]=next;
                if(!saveUserData(data)) return;
                try{ window.JiwenTabs.refreshAllViews(); }catch(_){}
                openDetail(rec.id);
            });
            f.appendChild(b);
        }
        function paintDetailRefund(rec, data){
            const f=$('detailRefundField'), lab=$('detailRefundLabel'), val=$('detailRefundVal');
            const line=refundLineHtml;
            if(isRefund(rec)){
                const o=data.find(r=>r.id===rec.refundOf);
                lab.textContent='原账单';
                val.innerHTML = o ? line(o, -1) : '<div class="dr-line">原账单已不存在</div>';
                f.style.display='';
                return;
            }
            const rs = rec.type==='expense' ? refundsOf(data, rec.id).sort((a,b)=>a.time<b.time?-1:1) : [];
            if(!rs.length){ f.style.display='none'; val.innerHTML=''; return; }
            const done=refundedTotal(data, rec.id), rem=round2(safeNum(rec.money)-done);
            lab.textContent = rem<=0 ? `退款记录 · 已全额退款` : `退款记录 · 还能退 ${rem.toFixed(2)}`;
            val.innerHTML=rs.map(r=>line(r, 1)).join('');
            f.style.display='';
        }
        let detailCurId=null, detailOnClose=null;
        // 详情「关闭」。抽成具名函数：返回键也要走这个正规出口，不能只 display='none'
        // —— 那样 detailCurId 不会复位。
        function closeDetail(){
            $('detailMask').style.display='none';
            detailCurId=null;
            const f=detailOnClose; detailOnClose=null; if(f) f();
        }
        $('detailClose').addEventListener('click', closeDetail);
        // 详情「修改」→ 关详情、打开修改弹窗。保存/删除后由 closeEditModal 统一刷新视图。
        $('detailEdit').addEventListener('click', ()=>{
            const id=leaveDetail();   // 去修改了，不再回原来的列表
            if(id) window.openEdit(id, { fromDetail:true });
        });

        // 1023-A：详情里的「结余」：记完这一笔以后，全部记录算下来的结余（和以前列表里那一栏同一个算法：按时间排、同一分钟按存的先后）
        function balanceAfter(rec){
            const raw=getUserData();
            let idx=raw.indexOf(rec); if(idx<0) idx=raw.findIndex(r=>r.id===rec.id); if(idx<0) return null;
            const items=raw.map((r,origIdx)=>({ r, origIdx, ts:parseRecTime(r.time).getTime() }));
            const me=items[idx];
            let fen=0;   // 按分加，免得几千笔加下来有浮点零头
            items.forEach(x=>{
                if(x.ts<me.ts || (x.ts===me.ts && x.origIdx<=me.origIdx)){ const c=balContrib(x.r); fen+=Math.round(c.inc*100)-Math.round(c.exp*100); }
            });
            return fen/100;
        }

        // ===== 1023-C：日子、周的小工具（账单页的周小计 / 日卡片、以后统计页的周合计、三个详情抽屉共用）=====
        //   日子一律用本地日期的 'YYYY-MM-DD'；一周从周一开始（和日期选择器、统计页日历同一个规矩）
        const CAL_WEEK='日一二三四五六';
        function dk(d){ return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
        function kd(k){ return new Date(+k.slice(0,4), +k.slice(5,7)-1, +k.slice(8,10)); }
        function addDay(k, n){ const d=kd(k); d.setDate(d.getDate()+n); return dk(d); }
        function monOf(k){ return addDay(k, -((kd(k).getDay()+6)%7)); }
        function todayKey(){ return dk(new Date()); }
        function monthEnd(ym){ const d=new Date(+ym.slice(0,4), +ym.slice(5,7), 0); return dk(d); }
        function mdText(k){ return `${+k.slice(5,7)}月${+k.slice(8,10)}日`; }
        function wdText(k){ return '周'+CAL_WEEK[kd(k).getDay()]; }
        // 「今天 · 10月23日 周五」「昨天 · …」，不是今年的带年份
        function dayTitle(k){
            const t=todayKey(), pre = k===t ? '今天 · ' : (k===addDay(t, -1) ? '昨天 · ' : '');
            const y=+k.slice(0,4);
            return `${pre}${y!==new Date().getFullYear() ? y+'年' : ''}${mdText(k)} ${wdText(k)}`;
        }
        // 「10月1日–4日」；跨月「9月29日–10月4日」；同一天就一个日子
        function rangeText(a, b){
            if(a===b) return mdText(a);
            if(a.slice(0,7)===b.slice(0,7)) return `${mdText(a)}–${+b.slice(8,10)}日`;
            return `${mdText(a)}–${mdText(b)}`;
        }
        // 本周 / 上周 / 那周（按今天算）
        function weekName(mon){ const tm=monOf(todayKey()); return mon===tm ? '本周' : (mon===addDay(tm, -7) ? '上周' : '那周'); }
        // 1023-K：一年里的第几周（ISO：周一开始，这一周的周四在哪一年就算哪一年的）；账单页周分隔线：本周写「本周」，别的周写「第 42 周」
        function isoWeek(mon){ const th=kd(addDay(mon, 3)), y1=new Date(th.getFullYear(), 0, 1); return 1+Math.floor(Math.round((th-y1)/86400000)/7); }
        function weekLabel(mon){ return mon===monOf(todayKey()) ? '本周' : `第 ${isoWeek(mon)} 周`; }
        // 「10.19–25」；跨月「9.28–10.4」；同一天「10.4」
        function shortRange(a, b){
            const m=k=>+k.slice(5,7), d=k=>+k.slice(8,10);
            if(a===b) return `${m(a)}.${d(a)}`;
            return a.slice(0,7)===b.slice(0,7) ? `${m(a)}.${d(a)}–${d(b)}` : `${m(a)}.${d(a)}–${m(b)}.${d(b)}`;
        }
        const cal={ dk, kd, addDay, monOf, todayKey, monthEnd, mdText, wdText, dayTitle, rangeText, weekName, isoWeek, weekLabel, shortRange };

        // ===== 1023-D：账单页列表、三个详情抽屉共用的小块（每笔两行、合计）=====
        const CHEV='<svg class="lg-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
        // 统计页同一口径（statContrib）按分加
        function sumFen(list){ let i=0, e=0; list.forEach(r=>{ const c=statContrib(r); i+=Math.round(c.inc*100); e+=Math.round(c.exp*100); }); return { inc:i/100, exp:e/100 }; }
        function sumHtml(s, emptyText){
            if(!s.exp && !s.inc) return emptyText ? `<span class="lg-sum-e">${emptyText}</span>` : '';
            return (s.exp ? `<span>支出 <b>${s.exp.toFixed(2)}</b></span>` : '') + (s.inc ? `<span>收入 <b class="pos">${s.inc.toFixed(2)}</b></span>` : '');
        }
        // 每笔一行：上面备注（没备注写分类）+ 标签，下面小字「分类 · 时间」，右边金额（支出正文色带 −、收入绿色带 +）
        //   opt.date：时间前面带上日期（预算明细这种跨天的列表用）
        function rowHtml(r, rMap, opt){
            const isExp=r.type==='expense', amt=safeNum(r.money).toFixed(2);
            const tags=(isRefund(r) ? '<span class="io-tag io-refund">退款</span>' : '') + modeTag(r) + refundedTag(r, rMap);
            const remark=(r.remark||'').trim(), cat=r.cat||'未分类', k=(r.time||'').slice(0,10);
            const when=(opt && opt.date && /^\d{4}-\d{2}-\d{2}$/.test(k) ? cal.mdText(k)+' ' : '') + (r.time||'').slice(11,16);
            return `<div class="bl-row" data-act="detail" data-id="${escapeHtml(r.id)}" role="button">`
                + `<div class="bl-main"><div class="bl-t"><span class="bl-t-x">${escapeHtml(remark || cat)}</span>${tags}</div>`
                + `<div class="bl-sub"><span class="bl-cat-t">${escapeHtml(cat)}</span> · <span class="bl-time">${escapeHtml(when)}</span></div></div>`
                + `<span class="bl-amt ${isExp ? 'out' : 'pos'}${modeAmtCls(r)}">${isExp ? '−' : '+'}${amt}</span></div>`;
        }
        function recsOfDays(a, b){ return getUserData().filter(r=>{ const k=(r.time||'').slice(0,10); return k>=a && k<=b; }); }
        function byTimeDesc(list){ return list.map((r, i)=>({ r, i, ts:parseRecTime(r.time).getTime() })).sort((x, y)=>(y.ts-x.ts) || (y.i-x.i)).map(x=>x.r); }
        function cellHtml(k, v, sub, cls){ return `<div class="dd-cell"><span class="dd-k">${k}</span><span class="dd-v${cls ? ' '+cls : ''}">${v}</span><span class="dd-s">${sub}</span></div>`; }
        function moreLess(d, what){ return d>=0 ? `比${what}多 ${d.toFixed(2)}` : `比${what}少 ${(-d).toFixed(2)}`; }
        function btn(id, text, cls){ const b=document.createElement('button'); b.type='button'; b.className='ui-btn'+(cls ? ' '+cls : ''); b.id=id; b.textContent=text; return b; }
        function pairFoot(box, a, b){ const p=document.createElement('div'); p.className='ui-pair'; p.appendChild(a); if(b) p.appendChild(b); box.appendChild(p); }

        // ===== 1023-D：当日详情（账单页点日期抬头、单笔详情里「这一天」、一周详情里点某一天；统计页 1023-H 也用它）=====
        //   支出（比本月日均多 / 少）、收入（当天净剩）、当天支出按分类的小横条、当天每一笔（点了进单笔详情，关了回到这里）；底部「关闭 | 给这天补一笔」
        //   本月日均 = 这个月的支出 ÷ 过去了的天数（这个月按到今天算，过去的月按整月）。opt.onClose：关掉以后回到哪（一周详情点进来的回一周）
        function openDay(k, opt){
            if(!window.JiwenSheet || !/^\d{4}-\d{2}-\d{2}$/.test(k||'')) return;
            const C=cal, list=byTimeDesc(recsOfDays(k, k)), s=sumFen(list), rMap=refundedMap(getUserData());
            const ym=k.slice(0,7), today=C.todayKey();
            const dim=+C.monthEnd(ym).slice(8,10), passed = today.slice(0,7)===ym ? +today.slice(8,10) : (today<ym ? 0 : dim);
            const ms=sumFen(recsOfDays(ym+'-01', C.monthEnd(ym))), avg = passed>0 ? ms.exp/passed : 0;
            const back=opt && opt.onClose;
            const reopen=()=>openDay(k, opt);
            window.JiwenSheet.open({ title:C.dayTitle(k), sub:`${list.length} 笔`, tall:true, onDismiss:back,
                body(box, done){
                    box.classList.add('dd-body');
                    const net=round2(s.inc-s.exp);
                    let h=`<div class="dd-cells">`
                        + cellHtml('支出', s.exp.toFixed(2), passed>0 ? moreLess(round2(s.exp-avg), '本月日均') : '')
                        + cellHtml('收入', s.inc.toFixed(2), `当天净剩 ${net<0 ? '−' : '+'}${Math.abs(net).toFixed(2)}`, 'pos')
                        + `</div>`;
                    // 当天支出按分类（退完了的不列）
                    const byCat=new Map();
                    list.forEach(r=>{ const e=statContrib(r).exp; if(e) byCat.set(r.cat||'未分类', (byCat.get(r.cat||'未分类')||0)+e); });
                    const cats=[...byCat].map(([c, v])=>[c, round2(v)]).filter(x=>x[1]>0).sort((a, b)=>b[1]-a[1]);
                    if(cats.length){
                        const mx=cats[0][1];
                        h+=`<div class="dd-cats">` + cats.map(([c, v])=>`<div class="dd-cat"><span class="dd-cat-n">${escapeHtml(c)}</span><span class="dd-cat-b"><i style="width:${(v/mx*100).toFixed(0)}%"></i></span><span class="dd-cat-v">${v.toFixed(2)}</span></div>`).join('') + `</div>`;
                    }
                    h+= list.length ? `<div class="lg-dc dd-rows">` + list.map(r=>rowHtml(r, rMap)).join('') + `</div>` : `<div class="dd-empty">这天没记账</div>`;
                    box.innerHTML=h;
                    box.addEventListener('click', e=>{ const row=e.target.closest('.bl-row[data-id]'); if(!row) return; done(); openDetail(row.dataset.id, { onClose:reopen }); });
                },
                foot(box, done){
                    const c=btn('dayClose', '关闭'), a=btn('dayAdd', '给这天补一笔', 'primary');
                    c.addEventListener('click', ()=>{ done(); if(back) back(); });
                    a.addEventListener('click', ()=>{ done(); openAddModal({ day:k }); });
                    pairFoot(box, c, a);
                } });
        }

        // ===== 1023-D：一周详情（账单页点周小计；统计页 1023-H 也用它）=====
        //   支出（比上一周多 / 少）、记了几笔（日均按过去了的天数算）、周一到周日 7 根柱子（今天深色、没到的日子虚线框）、
        //   每天一行（点了进当日详情，关了回到这里；没记的写「没记 · 补一笔」）；底部「关闭」
        function openWeek(mon, opt){
            if(!window.JiwenSheet || !/^\d{4}-\d{2}-\d{2}$/.test(mon||'')) return;
            const C=cal; mon=C.monOf(mon);
            const sun=C.addDay(mon, 6), today=C.todayKey();
            const list=recsOfDays(mon, sun), s=sumFen(list), prev=recsOfDays(C.addDay(mon, -7), C.addDay(mon, -1)), ps=sumFen(prev);
            const days=[]; for(let i=0;i<7;i++){ const k=C.addDay(mon, i), rs=list.filter(r=>(r.time||'').slice(0,10)===k); days.push({ k, rs, exp:sumFen(rs).exp, future:k>today }); }
            const passed=days.filter(d=>!d.future).length;
            const back=opt && opt.onClose, reopen=()=>openWeek(mon, opt);
            window.JiwenSheet.open({ title:`${C.weekName(mon)} · ${C.rangeText(mon, sun)}`, tall:true, onDismiss:back,
                body(box, done){
                    box.classList.add('dd-body');
                    let h=`<div class="dd-cells">`
                        + cellHtml('支出', s.exp.toFixed(2), prev.length ? moreLess(round2(s.exp-ps.exp), '上一周') : '上一周没有记录可比')
                        + cellHtml('记了', `${list.length} <small>笔</small>`, passed ? `日均 ${(s.exp/passed).toFixed(2)}（${passed} 天）` : '')
                        + `</div>`;
                    const mx=Math.max(1, ...days.map(d=>d.exp));
                    h+=`<div class="dw-chart"><div class="dw-bars">` + days.map(d=>`<div class="dw-bar${d.k===today ? ' today' : ''}${d.future ? ' future' : ''}"><span class="dw-v">${d.future ? '' : Math.round(d.exp)}</span><i style="height:${d.future ? 6 : Math.max(4, Math.round(d.exp/mx*60))}px"></i></div>`).join('')
                        + `</div><div class="dw-labs">` + days.map(d=>`<span${d.k===today ? ' class="today"' : ''}>${C.wdText(d.k).slice(1)}</span>`).join('') + `</div></div>`;
                    h+=`<div class="lg-dc dw-days">` + days.filter(d=>!d.future).reverse().map(d=>d.rs.length
                        ? `<button type="button" class="dw-day" data-day="${d.k}"><span class="dw-day-l">${C.mdText(d.k)} ${C.wdText(d.k)}</span><span class="dw-day-n">${d.rs.length} 笔</span><span class="dw-day-v">${d.exp.toFixed(2)}</span>${CHEV}</button>`
                        : `<div class="dw-day dw-day-none"><span class="dw-day-l">${C.mdText(d.k)} ${C.wdText(d.k)}</span><span class="dw-day-n">没记</span><button type="button" class="lg-gap-btn" data-add="${d.k}">补一笔</button></div>`).join('') + `</div>`;
                    box.innerHTML=h;
                    box.addEventListener('click', e=>{
                        const add=e.target.closest('[data-add]'); if(add){ done(); openAddModal({ day:add.dataset.add }); return; }
                        const d=e.target.closest('.dw-day[data-day]'); if(d){ done(); openDay(d.dataset.day, { onClose:reopen }); }
                    });
                },
                foot(box, done){ const c=btn('weekClose', '关闭', 'block'); c.addEventListener('click', ()=>{ done(); if(back) back(); }); box.appendChild(c); } });
        }
        window.JiwenDetail = { CHEV, aiFlagText, balanceAfter, cal, closeDetail, openDay, openDetail, openWeek, rowHtml, sumFen, sumHtml };   // detail 模块对外只有这一个入口
})();
