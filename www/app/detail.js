(function(){
        const { $, emptyHtml, escapeHtml, isSkip, pad, parseRecTime, recMode, round2, safeNum } = window.JiwenBase;   // 用到前面模块的
        const { IMP_APPS, balContrib, getUserData, isOpening, isRefund, modeAmtCls, modeTag, refundedMap, refundedTag, refundedTotal, refundsOf, saveUserData, statContrib, syncRefunds } = window.JiwenStore;   // 用到前面模块的
        const { customAlert, customConfirm } = window.JiwenAsk;   // 用到前面模块的
        const { devImportOn } = window.JiwenImportEntry;   // 用到前面模块的
        const { askCatRule, deleteRecord, openAddModal, openRefund, refundLineHtml } = window.JiwenForms;   // 用到前面模块的

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
            paintDetailOb(rec, opts, ro);
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
            if(rec.src.sum) f.appendChild(partsBox(rec));   // 实测 10-30：几笔合成的一条：列出是哪几笔
            // 导入简化第 15 版：账单原文（导入时存的那一行），点了展开
            if(rec.raw && typeof rec.raw==='object'){
                const b=document.createElement('button'); b.type='button'; b.className='link-btn'; b.id='detailRawBtn'; b.textContent='看账单原文 ›';
                const box=rawBox(rec.raw); box.id='detailRaw'; box.hidden=true;
                b.addEventListener('click', ()=>{ box.hidden=!box.hidden; b.textContent=box.hidden ? '看账单原文 ›' : '收起账单原文'; });
                f.appendChild(b); f.appendChild(box);
            }
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
        // 账单原文那一块（导入时存的那一行）：能长按选字（全 App 默认不让选，这里放开）；「单号」那行右边「复制」、最下面「复制全文」（点击区 48px），复制了底部小条说一声。
        //   支付宝账单那一栏叫「交易分类」（日用百货、餐饮美食……），微信叫「交易类型」（商户消费、转账……），照来源写
        function rawBox(R){
            const box=document.createElement('div'); box.className='detail-raw';
            const parts=[[R.app==='alipay' ? '交易分类' : '交易类型', R.kind], ['对方', R.cp], ['商品说明', R.desc], ['状态', R.status], ['支付方式', R.pm], ['备注', R.note], ['单号', R.no]].filter(x=>x[1]);
            parts.forEach(([k, v])=>{
                const l=document.createElement('div'); l.className='detail-raw-l';
                const t=document.createElement('span'); t.className='detail-raw-t'; t.textContent=k+'：'+v; l.appendChild(t);
                if(k==='单号'){
                    l.classList.add('no');
                    const c=document.createElement('button'); c.type='button'; c.className='detail-raw-copy'; c.textContent='复制'; c.setAttribute('aria-label', '复制单号');
                    c.addEventListener('click', ev=>{
                        ev.stopPropagation();
                        window.JiwenPanel.copyText(v).then(ok=>window.JiwenPanel.snack({ over:true, text:ok ? '已复制单号' : '没复制上，长按单号选中复制' }));
                    });
                    l.appendChild(c);
                }
                box.appendChild(l);
            });
            // 实测 10-30：整份原文也能一下复制（原来只能复制单号，别的只能长按选）
            const all=document.createElement('button'); all.type='button'; all.className='detail-raw-copy detail-raw-all'; all.textContent='复制全文';
            all.addEventListener('click', ev=>{
                ev.stopPropagation();
                window.JiwenPanel.copyText(parts.map(x=>x[0]+'：'+x[1]).join('\n')).then(ok=>window.JiwenPanel.snack({ over:true, text:ok ? '已复制账单原文' : '没复制上，长按原文选中复制' }));
            });
            box.appendChild(all);
            return box;
        }
        // 实测 10-30：几笔合成的一条（零碎扣款、收款按天、分分捐）列出是哪几笔：一行一笔「时间 · 对方 · 金额」，按时间排；
        //   多于 PARTS_SHOW 笔先列这几笔 +「展开全部 N 笔」；最下面合计（导入后改过这条的金额就写一句）；点一笔就地展开它的原文（单号能复制）。
        //   早一点导入的没存明细：照实说，不假装有
        const PARTS_SHOW=10;
        function partsBox(rec){
            const w=document.createElement('div'); w.className='detail-parts'; w.id='detailParts';
            const ps=Array.isArray(rec.parts) ? rec.parts.slice().sort((a, b)=>a.time<b.time ? -1 : a.time>b.time ? 1 : 0) : [];
            if(!ps.length){ const n=document.createElement('div'); n.className='detail-parts-none'; n.id='detailPartsNone'; n.textContent='这条是早一点导入的，没有存每一笔的明细'; w.appendChild(n); return w; }
            const yuan=fen=>(fen/100).toFixed(2);
            const h=document.createElement('div'); h.className='detail-parts-h'; h.textContent=`是这 ${ps.length} 笔合成的（点一笔看原文）`; w.appendChild(h);
            const ul=document.createElement('div'); ul.className='detail-parts-list'; w.appendChild(ul);
            const row=p=>{
                const b=document.createElement('button'); b.type='button'; b.className='detail-part';
                const t=document.createElement('span'); t.className='detail-part-time'; t.textContent=`${+p.time.slice(5, 7)}月${+p.time.slice(8, 10)}日 ${p.time.slice(11, 16)}`;
                const n=document.createElement('span'); n.className='detail-part-cp'; n.textContent=p.cp || p.desc || p.kind || '（账单里没写对方）';
                const a=document.createElement('span'); a.className='detail-part-amt'; a.textContent=yuan(p.fen);
                b.appendChild(t); b.appendChild(n); b.appendChild(a);
                let box=null;
                b.addEventListener('click', ()=>{
                    if(box){ box.remove(); box=null; b.classList.remove('open'); return; }
                    box=rawBox({ app:rec.src.app, kind:p.kind, cp:p.cp, desc:p.desc, no:p.no }); box.classList.add('detail-part-raw');
                    b.after(box); b.classList.add('open');
                });
                ul.appendChild(b);
            };
            ps.slice(0, PARTS_SHOW).forEach(row);
            if(ps.length>PARTS_SHOW){
                const more=document.createElement('button'); more.type='button'; more.className='link-btn detail-parts-more'; more.id='detailPartsMore'; more.textContent=`展开全部 ${ps.length} 笔 ›`;
                more.addEventListener('click', ()=>{ more.remove(); ps.slice(PARTS_SHOW).forEach(row); });
                w.appendChild(more);
            }
            const tot=ps.reduce((s, p)=>s+p.fen, 0), recFen=Math.round(safeNum(rec.money)*100);
            const s=document.createElement('div'); s.className='detail-parts-sum'; s.id='detailPartsSum';
            s.textContent=`合计 ${yuan(tot)}` + (tot!==recFen ? `（这条现在是 ${yuan(recFen)}，导入后改过金额）` : '');
            w.appendChild(s);
            return w;
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
        // 导入简化第 5 版：确认挪到分类旁边：列表卡第一行「分类是导入时推荐的　[没问题]　[改分类]」（原来是最底下一个小按钮）
        function paintDetailRv(rec){
            let f=$('detailRvField');
            if(rec.rv!==1){ if(f) f.remove(); return; }
            if(!f){ f=document.createElement('div'); f.className='rec-row detail-row detail-rv'; f.id='detailRvField'; }
            const list=$('detailList'); if(list.firstChild!==f) list.insertBefore(f, list.firstChild);
            f.textContent='';
            const v=document.createElement('span'); v.className='rec-row-k detail-rv-t'; v.textContent='分类是导入时推荐的'; f.appendChild(v);
            const mk=(id, t, cls)=>{ const b=document.createElement('button'); b.type='button'; b.className='ui-btn '+cls; b.id=id; b.textContent=t; return b; };
            const ok=mk('detailRvOk', '没问题', 'primary detail-rv-b'), ch=mk('detailRvEdit', '改分类', 'detail-rv-b');
            ok.addEventListener('click', ()=>{
                const data=getUserData(), i=data.findIndex(r=>r.id===rec.id);
                if(i<0){ customAlert('这条记录不存在了'); return; }
                const next=Object.assign({}, data[i]); delete next.rv;
                data[i]=next;
                if(!saveUserData(data)) return;
                try{ window.JiwenTabs.refreshAllViews(); }catch(_){}
                openDetail(rec.id);
            });
            ch.addEventListener('click', ()=>{
                if(!window.JiwenSheet) return;
                window.JiwenSheet.cats({ title:'改成哪个分类', type:rec.type, value:rec.cat, onCancel:()=>openDetail(rec.id), onPick:cat=>{
                    const data=getUserData(), i=data.findIndex(r=>r.id===rec.id); if(i<0) return;
                    const next=Object.assign({}, data[i], { cat }); delete next.rv; data[i]=next;
                    syncRefunds(data, next);
                    if(!saveUserData(data)) return;
                    try{ window.JiwenTabs.refreshAllViews(); }catch(_){}
                    askCatRule(next, cat, ()=>openDetail(rec.id));
                } });
            });
            f.appendChild(ok); f.appendChild(ch);
        }
        // 1023-P：期初余额：只给「往来」的记录（退款不算）一行开关「这笔是期初余额」，记录上 ob:1；可以几笔都标，总结余里期初余额是它们的合计、往来那一行不算它们
        function paintDetailOb(rec, opts, ro){
            let f=$('detailObRow');
            if(ro || recMode(rec)!=='flow' || isRefund(rec)){ if(f) f.remove(); return; }
            if(!f){
                f=document.createElement('button'); f.type='button'; f.className='rec-row detail-row detail-ob'; f.id='detailObRow';
                f.innerHTML='<span class="rec-row-k">期初</span><span class="rec-row-v">这笔是期初余额</span><span class="sf-switch" id="detailObSw" aria-hidden="true"></span>';
                $('detailList').appendChild(f);
            }
            const on=isOpening(rec);
            f.setAttribute('aria-pressed', on ? 'true' : 'false');
            $('detailObSw').classList.toggle('on', on);
            f.onclick=()=>{
                const data=getUserData(), i=data.findIndex(r=>r.id===rec.id);
                if(i<0){ customAlert('这条记录不存在了'); return; }
                const next=Object.assign({}, data[i]);
                if(on) delete next.ob; else next.ob=1;
                data[i]=next;
                if(!saveUserData(data)) return;
                try{ window.JiwenTabs.refreshAllViews(); }catch(_){}
                openDetail(rec.id, opts);
            };
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
        // 导入简化 4a：列表第二行小字写来源（文字，不用两家的图标；圆角标签留给往来、不计、期初这些影响统计的）：
        //   自己记的没对上账单不写；已和账单合并的「已对账」；导入的「微信 / 支付宝」；几笔合成的一条「微信 · 几笔合成」。开发开关开着才写
        const SRC_APP={ wechat:'微信', alipay:'支付宝' };
        function srcText(r){
            const s=r && r.src; if(!s || typeof s!=='object') return '';
            let on=false; try{ on=localStorage.getItem('app_dev_import')==='1'; }catch(_){}
            if(!on) return '';
            if(s.merged) return '已对账';
            const a=SRC_APP[s.app]; if(!a) return '';
            return s.sum ? a+' · 几笔合成' : a;
        }
        function rowHtml(r, rMap, opt){
            const isExp=r.type==='expense', amt=safeNum(r.money).toFixed(2);
            const tags=(isRefund(r) ? '<span class="io-tag io-refund">退款</span>' : '') + modeTag(r) + refundedTag(r, rMap);
            const remark=(r.remark||'').trim(), cat=r.cat||'未分类', k=(r.time||'').slice(0,10);
            const when=(opt && opt.date && /^\d{4}-\d{2}-\d{2}$/.test(k) ? cal.mdText(k)+' ' : '') + (r.time||'').slice(11,16);
            const st=srcText(r);
            return `<div class="bl-row" data-act="detail" data-id="${escapeHtml(r.id)}" role="button">`
                + `<div class="bl-main"><div class="bl-t"><span class="bl-t-x">${escapeHtml(remark || cat)}</span>${tags}</div>`
                // 1024-Y：没备注时上面一行已经写了分类，下面一行不再写一遍（只写时间 · 来源）
                + `<div class="bl-sub">${remark ? `<span class="bl-cat-t">${escapeHtml(cat)}</span> · ` : ''}<span class="bl-time">${escapeHtml(when)}</span>${st ? ` · <span class="bl-src">${st}</span>` : ''}</div></div>`
                + `<span class="bl-amt ${isExp ? 'out' : 'pos'}${modeAmtCls(r)}">${isExp ? '−' : '+'}${amt}</span></div>`;
        }
        function recsOfDays(a, b){ return getUserData().filter(r=>{ const k=(r.time||'').slice(0,10); return k>=a && k<=b; }); }
        function byTimeDesc(list){ return list.map((r, i)=>({ r, i, ts:parseRecTime(r.time).getTime() })).sort((x, y)=>(y.ts-x.ts) || (y.i-x.i)).map(x=>x.r); }
        // 1027-UI4：汇总块（.ui-sum，浅底、不画边框、圆角 16）：左边大字（支出），右边一个中号的数（收入 / 日均），下面一行说明，再往下可以挂别的（柱子、分类条）
        function sumBlockHtml(o){
            return `<section class="ui-sum dd-sum"><div class="ui-sum-row">`
                + `<div class="ui-sum-main"><span class="ui-sum-k dd-k">${o.k}</span><span class="ui-sum-big dd-v">${o.v}</span></div>`
                + `<div class="ui-sum-side"><span class="ui-sum-k dd-k">${o.sk}</span><span class="ui-sum-mid dd-v${o.sc ? ' '+o.sc : ''}">${o.sv}</span></div>`
                + `</div><div class="ui-sum-line dd-s">${o.line || ''}</div>${o.extra || ''}</section>`;
        }
        // 1027-UI4：当天分类：一根叠起来的条（按金额分段，颜色是主题色的几档深浅）+ 下面每个分类一个小胶囊（第一轮不能点，第二轮点了去搜一笔）
        const CAT_SHADES=[100, 72, 50, 34, 22];
        function catsHtml(cats){
            const shade=i=>`var(--c-shade-${i % CAT_SHADES.length})`;   // 1027-UI8：颜色在 buildPalette 里先算好（--c-shade-0～4，主色按 CAT_SHADES 混进卡片底），不用 color-mix（老 WebView 不认，见 settings.js）
            return `<div class="dd-stack" aria-hidden="true">` + cats.map(([c, v], i)=>`<i style="flex:${v};background:${shade(i)}"></i>`).join('') + `</div>`
                + `<div class="dd-cats">` + cats.map(([c, v], i)=>`<button type="button" class="dd-cat" data-cat="${escapeHtml(c)}" aria-label="看这一天的「${escapeHtml(c)}」"><i class="dd-cat-dot" style="background:${shade(i)}"></i><span class="dd-cat-n">${escapeHtml(c)}</span><em class="dd-cat-v">${v.toFixed(2)}</em><span class="dd-cat-go" aria-hidden="true">›</span></button>`).join('') + `</div>`;
        }
        function moreLess(d, what){ return d>=0 ? `比${what}多 ${d.toFixed(2)}` : `比${what}少 ${(-d).toFixed(2)}`; }
        function btn(id, text, cls){ const b=document.createElement('button'); b.type='button'; b.className='ui-btn'+(cls ? ' '+cls : ''); b.id=id; b.textContent=text; return b; }
        function pairFoot(box, a, b){ const p=document.createElement('div'); p.className='ui-pair'; p.appendChild(a); if(b) p.appendChild(b); box.appendChild(p); }

        // ===== 1023-D：当日详情、一周详情；1025-UX 合成一个面板（以这段为准）=====
        //   原来一周详情里点某一天，要关掉一周、再弹一个当日详情，叠两层；现在一周和一天是同一个面板，在里面切：
        //   顶上一行「整周 一 二 三 四 五 六 日」（`.wd-tabs`，还没到的日子点不了），点「整周」看这一周，点某一天看那一天；
        //   一周里点柱子、点某一天那一行，也是就地换成那一天。下面一行 ‹ ›（`#weekPrev` / `#weekNext`）：看整周时换上一周 / 下一周（最晚到本周），
        //   看某一天时换前一天 / 后一天（最晚到今天，跨周时上面那行跟着换周）；在面板上横着滑也一样。
        //   看整周：支出（比上一周多 / 少）、记了几笔（日均按过去了的天数算）、周一到周日 7 根大柱子（每根上面写取整的金额，今天深色，没到的日子一个点）、
        //   每天一行（没记的写「没记 · 补一笔」，标过没花钱的写「没花钱 · 取消标记」）；底部「关闭」（`#weekClose`）。
        //   看一天：支出（比本月日均多 / 少）、收入（当天净剩）、当天支出按分类的小横条、当天每一笔（点了进单笔详情，关了回到这个面板的这一天）；
        //   底部「关闭 | 给这天补一笔」（`#dayClose` / `#dayAdd`）。本月日均 = 这个月的支出 ÷ 过去了的天数（这个月按到今天算，过去的月按整月）。
        //   openWeek(周一) 打开时看整周，openDay(日子) 打开时看那一天（账单页点日期抬头、单笔详情里「这一天」、统计页日历）。opt.onClose：关掉以后回到哪
        function openDay(k, opt){
            if(!/^\d{4}-\d{2}-\d{2}$/.test(k||'')) return;
            openWD(cal.monOf(k), k, opt);
        }
        function openWeek(mon, opt){
            if(!/^\d{4}-\d{2}-\d{2}$/.test(mon||'')) return;
            openWD(cal.monOf(mon), null, opt);
        }
        const WD_MS=260;   // 1025-UX：一周 / 一天切换的滑动时长（比面板收起的 300 毫秒略短，切得利落）
        // 1027-UI：面板高度：打开时按这一周和前后一周里内容最多的那一页取最高（顶上至少留 WD_TOP_GAP），之后切天、切整周、左右滑、换周都不变，顶边不动；
        //   再往前翻也不长高（放不下的在面板里滚）。内容少的（这天没记账）在中间
        const WD_TOP_GAP=56;   // 1027-UI3：面板最高到屏幕顶上只留这么一条（原来最高 85%，内容多的天要滚；用户说再高一点就全显示了）
        // 1027-UI：「左右滑动看前一天、后一天」这句说明只在前 WD_HINT_N 次打开时写，之后只留 ‹ ›（次数记在这台手机上，不进备份）
        const WD_HINT_N=3, WD_HINT_KEY='app_wd_hint_n';
        function wdHintCount(add){
            let n=0; try{ n=parseInt(localStorage.getItem(WD_HINT_KEY)||'0', 10)||0; if(add){ n++; localStorage.setItem(WD_HINT_KEY, String(n)); } }catch(_){}
            return n;
        }
        function openWD(mon, day, opt){
            if(!window.JiwenSheet) return;
            const C=cal;
            const back=opt && opt.onClose;
            const today=C.todayKey(), thisMon=C.monOf(today);
            let bodyBox=null, footBox=null, doneFn=null, fromWeek=!!(opt && opt.fromWeek);
            const reopen=()=>openWD(mon, day, Object.assign({}, opt, { fromWeek, again:true }));
            // 从单笔详情回来（again）不算又打开了一次
            const showHint = (opt && opt.again) ? wdHintCount(false)<=WD_HINT_N : wdHintCount(true)<=WD_HINT_N;
            function setHead(t, sub){
                const te=document.getElementById('uiSheetTitle'); if(te) te.textContent=t;
                const se=document.getElementById('uiSheetSub'); if(se){ se.textContent=sub||''; se.style.display=sub ? '' : 'none'; }
            }
            function tabsHtml(){
                let h=`<div class="wd-tabs" role="tablist"><button type="button" class="wd-tab wd-tab-wk${day ? '' : ' on'}" role="tab" aria-selected="${day ? 'false' : 'true'}" data-v="week">整周</button>`;
                for(let i=0;i<7;i++){
                    const k=C.addDay(mon, i), fut=k>today, on=k===day;
                    h+=`<button type="button" class="wd-tab${on ? ' on' : ''}${k===today ? ' today' : ''}" role="tab" aria-selected="${on ? 'true' : 'false'}" data-v="${k}"${fut ? ' disabled' : ''} aria-label="${C.mdText(k)} ${C.wdText(k)}">${C.wdText(k).slice(1)}<small>${+k.slice(8,10)}</small></button>`;
                }
                return h+`</div>`;
            }
            function navHtml(){
                const canNext = day ? day<today : mon<thisMon;
                return `<div class="dw-nav"><button type="button" class="dw-prev" id="weekPrev" aria-label="${day ? '前一天' : '上一周'}">‹</button>`
                    + `<span class="dw-nav-t">${!showHint ? '' : day ? '左右滑动看前一天、后一天' : '左右滑动看上一周、下一周'}</span>`
                    + `<button type="button" class="dw-next" id="weekNext" aria-label="${day ? '后一天' : '下一周'}"${canNext ? '' : ' disabled'}>›</button></div>`;
            }
            function weekHtml(){
                const sun=C.addDay(mon, 6);
                const list=recsOfDays(mon, sun), s=sumFen(list), prev=recsOfDays(C.addDay(mon, -7), C.addDay(mon, -1)), ps=sumFen(prev);
                const days=[]; for(let i=0;i<7;i++){ const k=C.addDay(mon, i), rs=list.filter(r=>(r.time||'').slice(0,10)===k); days.push({ k, rs, exp:sumFen(rs).exp, future:k>today }); }
                const passed=days.filter(d=>!d.future).length;
                setHead(`${C.weekLabel(mon)} · ${C.rangeText(mon, sun)}`, '');   // 1027-UI4：「N 笔」挪进汇总块（「支出 · N 笔」），标题下面不再单独一行（一周、一天一样，切换时不跳）
                const mx=Math.max(1, ...days.map(d=>d.exp));
                let h=sumBlockHtml({ k:`支出 · ${list.length} 笔`, v:s.exp.toFixed(2), sk: passed ? `日均（${passed} 天）` : '日均', sv: passed ? (s.exp/passed).toFixed(2) : '—',
                    line: prev.length ? moreLess(round2(s.exp-ps.exp), '上一周') : '上一周没有记录可比', extra:`<div class="dw-chart"><div class="dw-bars">` + days.map(d=>d.future
                        ? `<div class="dw-bar future"><span class="dw-v"></span><i class="dw-fdot"></i></div>`
                        : `<button type="button" class="dw-bar${d.k===today ? ' today' : ''}" data-day="${d.k}" aria-label="${C.mdText(d.k)} 支出 ${d.exp.toFixed(2)}"><span class="dw-v">${Math.round(d.exp)}</span><i style="height:${Math.max(4, Math.round(d.exp/mx*96))}px"></i></button>`).join('')
                    + `</div><div class="dw-labs">` + days.map(d=>`<span${d.k===today ? ' class="today"' : ''}>${C.wdText(d.k).slice(1)}</span>`).join('') + `</div>`
                    + `<span class="dw-hint">点某一根，看那一天的明细</span></div>` });
                const ns=window.JiwenStore.noSpendDays();   // 导入简化第 12 版：标过「没花钱」的写「没花钱」，能取消
                h+=`<div class="lg-dc dw-days">` + days.filter(d=>!d.future).reverse().map(d=>d.rs.length
                    ? `<button type="button" class="dw-day" data-day="${d.k}"><span class="dw-day-l">${C.mdText(d.k)} ${C.wdText(d.k)}</span><span class="dw-day-n">${d.rs.length} 笔</span><span class="dw-day-v">${d.exp.toFixed(2)}</span>${CHEV}</button>`
                    : ns.has(d.k) ? `<div class="dw-day dw-day-none dw-day-ns"><span class="dw-day-l">${C.mdText(d.k)} ${C.wdText(d.k)}</span><span class="dw-day-n">没花钱</span><button type="button" class="lg-gap-btn" data-unns="${d.k}">取消标记</button></div>`
                    : `<div class="dw-day dw-day-none"><span class="dw-day-l">${C.mdText(d.k)} ${C.wdText(d.k)}</span><span class="dw-day-n">没记</span><button type="button" class="lg-gap-btn" data-add="${d.k}">补一笔</button></div>`).join('') + `</div>`;
                return h;
            }
            function dayHtml(k){
                const list=byTimeDesc(recsOfDays(k, k)), s=sumFen(list), rMap=refundedMap(getUserData());
                const ym=k.slice(0,7);
                const dim=+C.monthEnd(ym).slice(8,10), passed = today.slice(0,7)===ym ? +today.slice(8,10) : (today<ym ? 0 : dim);
                const ms=sumFen(recsOfDays(ym+'-01', C.monthEnd(ym))), avg = passed>0 ? ms.exp/passed : 0;
                setHead(C.dayTitle(k), '');
                const net=round2(s.inc-s.exp);
                // 1027-UI：0 笔的那一天不比；今天还没过完，「比本月日均少」不写（还会再花），多了照写
                const dAvg=round2(s.exp-avg), cmp = (passed>0 && list.length && !(k===today && dAvg<0)) ? moreLess(dAvg, '本月日均') : '';
                // 当天支出按分类（退完了的不列）
                const byCat=new Map();
                list.forEach(r=>{ const e=statContrib(r).exp; if(e) byCat.set(r.cat||'未分类', (byCat.get(r.cat||'未分类')||0)+e); });
                const cats=[...byCat].map(([c, v])=>[c, round2(v)]).filter(x=>x[1]>0).sort((a, b)=>b[1]-a[1]);
                // 1027-UI4：两格和「当天净剩」那一行合成一个汇总块：支出大字、收入在右，下面一行「净剩 x · 比本月日均多 y」，分类条挂在最下面
                const netHtml=`<span class="dd-net">净剩 <b class="dd-net-v${net<0 ? ' neg' : net>0 ? ' pos' : ''}">${net<0 ? '−' : net>0 ? '+' : ''}${Math.abs(net).toFixed(2)}</b></span>`;
                let h=sumBlockHtml({ k:`支出 · ${list.length} 笔`, v:s.exp.toFixed(2), sk:'收入', sv:s.inc.toFixed(2), sc:'pos',
                    line: netHtml + (cmp ? `<span class="dd-cmp"> · ${cmp}</span>` : ''), extra: cats.length ? catsHtml(cats) : '' });
                h+= list.length ? `<div class="lg-dc dd-rows">` + list.map(r=>rowHtml(r, rMap)).join('') + `</div>` : `<div class="dd-empty">${emptyHtml('calendar', '这天没记账')}</div>`;   // 1027-UI4：空状态统一写法；面板底部已有「给这天补一笔」，空状态只放图标和一句话
                return h;
            }
            function paintFoot(){
                if(!footBox) return;
                footBox.textContent='';
                if(day){
                    const c=btn('dayClose', '关闭'), a=btn('dayAdd', '给这天补一笔', 'primary'), k=day;
                    c.addEventListener('click', ()=>{ doneFn(); if(back) back(); });
                    a.addEventListener('click', ()=>{ doneFn(); openAddModal({ day:k }); });
                    pairFoot(footBox, c, a);
                } else {
                    const c=btn('weekClose', '关闭', 'block'); c.addEventListener('click', ()=>{ doneFn(); if(back) back(); }); footBox.appendChild(c);
                }
            }
            function render(){
                if(!bodyBox) return;
                bodyBox.classList.toggle('wd-isday', !!day);
                bodyBox.innerHTML = tabsHtml() + navHtml() + `<div class="wd-pane">` + (day ? dayHtml(day) : weekHtml()) + `</div>`;
                paintFoot();
            }
            // 换一周 / 换一天（d：-1 往前、1 往后）；到头了返回 false。from：手指松开时内容已经跟着挪到了哪（像素），从那里接着滑
            function can(d){ return d<0 || (day ? day<today : mon<thisMon); }
            function go(d, from){
                if(!can(d)) return false;
                if(day){ day=C.addDay(day, d); mon=C.monOf(day); }
                else mon=C.addDay(mon, 7*d);
                slide(d, from||0); return true;
            }
            // 1027-UI：面板定高（见 WD_TOP_GAP）：打开时把这一周、上一周、下一周（不晚于本周）的整周和每一天（到今天为止）挨个画一遍量高度，取最高的；
            //   之后不再改（原来换周时内容更多会长高一次：从本周的一天点 ‹ 退到上一周的周日，面板变长一下，10-27 手机上看到的）。放不下的在面板里滚
            function fitHeight(){
                const sh=document.getElementById('uiSheet'), mk=document.getElementById('uiSheetMask');
                if(!sh || !mk || !bodyBox || !mk.clientHeight) return;
                const keepDay=day, keepMon=mon, cap=Math.max(200, mk.clientHeight-WD_TOP_GAP);
                const views=[];
                [C.addDay(keepMon, -7), keepMon, C.addDay(keepMon, 7)].forEach(m=>{
                    if(m>thisMon) return;
                    views.push([m, null]);
                    for(let i=0;i<7;i++){ const k=C.addDay(m, i); if(k<=today) views.push([m, k]); }
                });
                sh.classList.remove('wd-fixed'); sh.style.height='';
                let mx=0;
                views.forEach(([m, v])=>{ mon=m; day=v; render(); mx=Math.max(mx, sh.scrollHeight); });
                mon=keepMon; day=keepDay; render();
                const h=Math.min(cap, Math.ceil(mx));
                sh.classList.add('wd-fixed'); sh.style.height=h+'px';
                sh.dataset.wdH=String(h);
            }
            // fromWeek：这一天是从整周点进来的（返回键 / 往下拉先回整周）；一打开就是某一天的（账单页点日期抬头）没有这一层
            function show(v){
                const nd = v==='week' ? null : v;
                if(nd===day) return;
                if(nd && !day) fromWeek=true;
                if(!nd) fromWeek=false;
                // 方向：整周算在最左边，日子按先后
                const pos=x=>x ? 1+Math.round((C.kd(x)-C.kd(mon))/86400000) : 0;
                const d = pos(nd)>=pos(day) ? 1 : -1;
                day=nd; slide(d, 0);
            }
            // 1025-UX：切换时的动效：旧的内容往一边滑走，新的从另一边滑进来（WD_MS 毫秒，和面板同一条先快后慢的曲线）；
            //   跟着手指挪的那一段在下面 pointermove 里。系统「减少动画」时直接换。新内容当场就画好（标题、按钮马上是新的），只是位置在滑
            function slide(d, from){
                const oldPane=bodyBox && bodyBox.querySelector('.wd-pane');
                const ghost = (oldPane && !noMotion() && bodyBox.clientWidth) ? oldPane.cloneNode(true) : null;
                const top = oldPane ? oldPane.offsetTop : 0, left = oldPane ? oldPane.offsetLeft : 0, wid = oldPane ? oldPane.offsetWidth : 0, hgt = oldPane ? oldPane.offsetHeight : 0;
                render();
                const pane=bodyBox.querySelector('.wd-pane');
                if(!ghost || !pane) return;
                const W=bodyBox.clientWidth;
                ghost.classList.add('wd-ghost'); ghost.removeAttribute('id');
                ghost.querySelectorAll('[id]').forEach(x=>x.removeAttribute('id'));
                ghost.style.top=top+'px'; ghost.style.left=left+'px'; ghost.style.width=wid+'px'; ghost.style.height=hgt+'px'; ghost.style.transform=`translateX(${from}px)`;
                bodyBox.appendChild(ghost);
                pane.style.transition='none'; pane.style.transform=`translateX(${from + d*W}px)`;
                void pane.offsetWidth;
                const tr=`transform ${WD_MS}ms var(--sheet-ease), opacity ${WD_MS}ms ease-out`;
                ghost.style.transition=tr; pane.style.transition=tr;
                ghost.style.transform=`translateX(${-d*W}px)`; ghost.style.opacity='0.2';
                pane.style.transform='translateX(0)';
                setTimeout(()=>{ ghost.remove(); pane.style.transition=''; pane.style.transform=''; }, WD_MS+40);
            }
            function noMotion(){ try{ return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(_){ return false; } }
            window.JiwenSheet.open({ title:day ? C.dayTitle(day) : `${C.weekLabel(mon)} · ${C.rangeText(mon, C.addDay(mon, 6))}`, tall:true, onDismiss:back,
                onBack:()=>{ if(day && fromWeek){ show('week'); return true; } return false; },
                body(box, done){
                    box.classList.add('dd-body', 'wd-body');
                    bodyBox=box; doneFn=done;
                    box.addEventListener('click', e=>{
                        if(e.target.closest('#weekPrev')){ go(-1); return; }
                        if(e.target.closest('#weekNext')){ go(1); return; }
                        const tb=e.target.closest('.wd-tab'); if(tb){ if(!tb.disabled) show(tb.dataset.v); return; }
                        const add=e.target.closest('[data-add]'); if(add){ done(); openAddModal({ day:add.dataset.add }); return; }
                        // 1027-UI5：分类胶囊 → 搜一笔（这一天 + 这个分类），返回键 / ‹ 回到这个面板的这一天（回调口 detail → search，用的时候才去拿）
                        const dc=e.target.closest('.dd-cat[data-cat]'); if(dc && day){ const k=day; done(); window.JiwenSearch.openSearch({ preset:{ from:k, to:k, cats:[dc.dataset.cat] }, from:{ back:reopen } }); return; }
                        const un=e.target.closest('[data-unns]'); if(un){ window.JiwenStore.noSpendSet([un.dataset.unns], false); render(); window.JiwenTabs.refreshAllViews(); return; }
                        const row=e.target.closest('.bl-row[data-id]'); if(row){ done(); openDetail(row.dataset.id, { onClose:reopen }); return; }
                        const d=e.target.closest('[data-day]'); if(d) show(d.dataset.day);
                    });
                    // 1027-UI6：长按这一天里的一笔：收起面板弹菜单，取消 / 删完回到这一天
                    box.addEventListener('jw-longpress', e=>{ const row=e.target.closest('.bl-row[data-id]'); if(!row) return; e.stopPropagation(); done(); openRowMenu(row.dataset.id, { back:reopen }); });
                    // 左右滑：横着挪了 50px 以上、而且比竖着挪得多，就换（往右滑看前面的，往左滑看后面的）。
                    //   1025-UX：手指横着挪的时候内容跟着手指走（到头了只挪三成，拉不动的感觉），松手够了就接着滑过去，不够就弹回原处
                    let sx=null, sy=0, lock=null, pdx=0;
                    const paneEl=()=>box.querySelector('.wd-pane');
                    function snapBack(){
                        const pn=paneEl(); if(!pn) return;
                        pn.style.transition=`transform ${WD_MS}ms var(--sheet-ease)`; pn.style.transform='translateX(0)';
                        setTimeout(()=>{ pn.style.transition=''; pn.style.transform=''; }, WD_MS+40);
                    }
                    box.addEventListener('pointerdown', e=>{ sx=e.clientX; sy=e.clientY; lock=null; pdx=0; }, { passive:true });
                    box.addEventListener('pointermove', e=>{
                        if(sx==null) return;
                        const dx=e.clientX-sx, dy=e.clientY-sy;
                        if(!lock && (Math.abs(dx)>8 || Math.abs(dy)>8)) lock = Math.abs(dx)>Math.abs(dy)*1.2 ? 'x' : 'y';
                        if(lock!=='x' || noMotion()) return;
                        const pn=paneEl(); if(!pn) return;
                        pdx = can(dx>0 ? -1 : 1) ? dx : dx*0.3;
                        pn.style.transition='none'; pn.style.transform=`translateX(${pdx}px)`;
                    }, { passive:true });
                    box.addEventListener('pointercancel', ()=>{ if(lock==='x') snapBack(); sx=null; lock=null; });
                    box.addEventListener('pointerup', e=>{
                        if(sx==null) return;
                        const dx=e.clientX-sx, dy=e.clientY-sy, wasX=lock==='x'; sx=null; lock=null;
                        if(Math.abs(dx)>=50 && Math.abs(dx)>Math.abs(dy)*1.5){
                            e.preventDefault(); box.__swiped=Date.now();
                            if(go(dx>0 ? -1 : 1, wasX ? pdx : 0)) return;
                        }
                        if(wasX) snapBack();
                    });
                    box.addEventListener('click', e=>{ if(box.__swiped && Date.now()-box.__swiped<400){ e.stopImmediatePropagation(); e.preventDefault(); } }, true);   // 滑完那一下不算点
                },
                foot(box, done){ footBox=box; doneFn=done; render(); } });
            fitHeight();
        }
        // 1027-UI6：长按一笔弹的菜单（账单列表、搜一笔结果、一天面板共用）：顶上是这一笔（和列表同一行的画法），下面三项「修改 / 再记一笔 / 删除」，
        //   最下面「取消」。退款没有「再记一笔」（和单笔详情一样，分类跟着原账单走）。删除：手动记的直接删 + 5 秒撤销，导入的照旧四选一（JiwenForms.deleteRecord）。
        //   back：从一天面板进来的，取消 / 往下拉 / 返回键 / 删完回到那一天；去修改、去再记一笔就不回了（和单笔详情一样）
        function openRowMenu(id, opt){
            const back=opt && opt.back;
            const all=getUserData(), rec=all.find(r=>r.id===id);
            if(!rec) return;
            const acts=[['edit', '修改'], ...(isRefund(rec) ? [] : [['again', '再记一笔']]), ['del', '删除']];
            window.JiwenSheet.open({ title:'这一笔', onDismiss:()=>{ if(back) back(); },
                body(box, done){
                    const w=document.createElement('div'); w.id='rowMenu'; w.className='row-menu';
                    w.innerHTML=`<div class="lg-dc rm-rec">${rowHtml(rec, refundedMap(all), { date:true })}</div>`
                        + `<div class="ui-stack rm-acts">${acts.map(([v, t])=>`<button type="button" class="ui-btn block rm-act${v==='del' ? ' warn' : ''}" data-v="${v}">${t}</button>`).join('')}</div>`;
                    w.addEventListener('click', e=>{
                        const b=e.target.closest('.rm-act'); if(!b) return;
                        done();
                        if(b.dataset.v==='edit') window.openEdit(id);
                        else if(b.dataset.v==='again') openAddModal({ from:rec, money:true });
                        else deleteRecord(id, { direct:true, onDone:()=>{ if(back) back(); }, onCancel:()=>{ if(back) back(); } });
                    });
                    box.appendChild(w);
                },
                foot(box){
                    const c=document.createElement('button'); c.type='button'; c.className='ui-btn block'; c.id='rmCancel'; c.textContent='取消';
                    c.addEventListener('click', ()=>{ window.JiwenSheet.close(); if(back) back(); });
                    box.appendChild(c);
                } });
        }
        document.addEventListener('jw-longpress', e=>{
            const row=e.target.closest('.bl-row[data-id]'); if(!row) return;
            if(row.closest('#billList, #searchList')) openRowMenu(row.dataset.id);
        });
        window.JiwenDetail = { CHEV, aiFlagText, openRowMenu, balanceAfter, cal, closeDetail, openDay, openDetail, openWeek, rowHtml, sumFen, sumHtml };   // detail 模块对外只有这一个入口
})();
