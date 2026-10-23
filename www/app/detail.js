(function(){
        const { $, escapeHtml, isSkip, pad, parseRecTime, recMode, round2, safeNum } = window.JiwenBase;   // 用到前面模块的
        const { IMP_APPS, balContrib, getUserData, isRefund, modeAmtCls, refundedMap, refundedTag, refundedTotal, refundsOf, saveUserData } = window.JiwenStore;   // 用到前面模块的
        const { customAlert, customConfirm } = window.JiwenAsk;   // 用到前面模块的
        const { devImportOn } = window.JiwenImportEntry;   // 用到前面模块的
        const { refundLineHtml } = window.JiwenForms;   // 用到前面模块的

        // 清单行 → 只读详情。批量确认还没执行，此时允许改记录会让清单和即将执行的范围对不上，
        // 所以从这里进的详情隐藏「修改」按钮，只看不改。
        $('askList').addEventListener('click', e=>{
            const row=e.target.closest('.al-row');
            if(row && row.dataset.id) openDetail(row.dataset.id, { readonly:true });
        });

        // 打开账单详情弹窗。opts.readonly 时隐藏「修改」（批量确认清单里进来的）。
        function openDetail(id, opts){
            const rec=getUserData().find(r=>r.id===id);
            $('detailEdit').style.display = (opts && opts.readonly) ? 'none' : '';
            if(!rec){ customAlert('这条记录不存在了'); return; }
            $('detailTime').textContent = rec.time.replace('T',' ');
            const isExp = rec.type==='expense';
            const amt=safeNum(rec.money);
            $('detailMoney').innerHTML = `<span class="${isExp?'neg':'pos'}${modeAmtCls(rec)}">${isExp?'−':'+'}${amt.toFixed(2)} 元</span>`;
            $('detailCat').innerHTML = `<span class="cat-tag">${escapeHtml(rec.cat||'未分类')}</span>`;
            const all=getUserData();
            $('detailType').innerHTML = (isExp
                ? '<span class="io-tag io-out">支出</span>'
                : (isRefund(rec) ? '<span class="io-tag io-refund">退款</span>' : '<span class="io-tag io-in">收入</span>'))
                + refundedTag(rec, refundedMap(all));
            // 1020-I：统计单独一行（原来是收支后面的小标签）
            $('detailMode').textContent = ({ normal:'计入', skip:'不计', flow:'往来' })[recMode(rec)];
            // 1023-A：原来列表里每行的「结余」挪到这里：记完这一笔以后的结余（全部记录、含期初余额，不计的不算）
            const bal=balanceAfter(rec);
            $('detailBal').textContent = bal==null ? '' : bal.toFixed(2) + (isSkip(rec) ? '（这笔不计，不影响结余）' : '');
            paintDetailRefund(rec, all);
            paintDetailSource(rec);
            paintDetailAiFlag(rec, all);
            paintDetailRv(rec);
            const rk=(rec.remark||'').trim();
            $('detailRemark').textContent = rk || '（无备注）';
            // 1019-S：从别的列表点进来的，关掉回那个列表；详情里刷新同一条（去掉 AI 标记、拆开）时照旧留着
            detailOnClose=(opts && opts.onClose) || (detailCurId===id && $('detailMask').style.display==='flex' ? detailOnClose : null);
            detailCurId=id;
            $('detailMask').style.display='flex';
        }

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
            const id=detailCurId;
            $('detailMask').style.display='none';
            detailCurId=null; detailOnClose=null;   // 去修改了，不再回原来的列表
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
        const cal={ dk, kd, addDay, monOf, todayKey, monthEnd, mdText, wdText, dayTitle, rangeText, weekName };
        window.JiwenDetail = { aiFlagText, balanceAfter, cal, closeDetail, openDetail };   // detail 模块对外只有这一个入口
})();
