(function(){
        const { $, MODE_HINT, escapeHtml, isFlow, isSkip, parseRecTime, recMode, round2, safeNum, setRecMode } = window.JiwenBase;   // 用到前面模块的
        const { getCats, getUserData, isRefund, recentCats, saveUserData, syncRefunds } = window.JiwenStore;   // 用到前面模块的
        const { bindSheetDrag } = window.JiwenPanel;   // 用到前面模块的
        const { askCancel, customAlert, customChoose, customConfirm } = window.JiwenAsk;   // 用到前面模块的
        const { openDtPickerDate } = window.JiwenDate;   // 用到前面模块的
        const { cal, openDay, openDetail, openWeek, sumFen } = window.JiwenDetail;   // 用到前面模块的
        const { listHtml, makePainter } = window.JiwenLedger;   // 用到前面模块的
        const { askCatRule } = window.JiwenForms;   // 用到前面模块的
        const { loadImportUI } = window.JiwenImportEntry;   // 用到前面模块的

        // ===== 搜索状态：备注 / 金额 / 日期 / 收支 / 统计 / 分类（1023-F 定的口径，1023-G 从账单页搬到搜一笔）=====
        // 金额存数字（null 表示不限）；日期存 'YYYY-MM-DD'（null 表示不限）；关键词存小写串，按空白分成几个词，都要包含。
        // 收支、统计、分类都能多选：ios（'expense' / 'income'，两个都选等于全部）、modes（'normal' / 'flow' / 'skip'）、cats（分类名）；空数组 = 不限
        // rv：1021-T13 只看待确认分类
        // 导入简化 4a：srcs 来源（'manual' 手记 / 'wechat' 微信 / 'alipay' 支付宝 / 'merged' 已对账，多选），batch 某一次导入（批次号，从导入横幅 / 导入记录点进来）
        const searchState={ keyword:'', min:null, max:null, from:null, to:null, modes:[], rv:false, ios:[], cats:[], srcs:[], batch:null };
        const SRC_NAME={ manual:'手记', wechat:'微信', alipay:'支付宝', merged:'已对账' }, SRC_ORDER=['manual', 'wechat', 'alipay', 'merged'];
        function srcOf(r){ const s=r.src; if(!s || typeof s!=='object') return 'manual'; if(s.merged) return 'merged'; return s.app==='alipay' ? 'alipay' : s.app==='wechat' ? 'wechat' : 'manual'; }
        // 批次号 'b' + 时间（36 进制）：标签写「10月21日那次导入」
        function batchLabel(b){ const t=parseInt(String(b||'').slice(1), 36), d=new Date(t); return isFinite(t) && !isNaN(d) ? `${d.getMonth()+1}月${d.getDate()}日那次导入` : '那次导入'; }
        const MODE_NAME={ normal:'计入', skip:'不计', flow:'往来' };
        const MODE_ORDER=['normal', 'skip', 'flow'];
        function searchWords(){ return (searchState.keyword||'').split(/\s+/).filter(Boolean); }
        // 有没有任何条件（含分类）。收支两个都选不算
        function hasFilter(){
            const s=searchState;
            return !!(s.keyword || s.min!=null || s.max!=null || s.from || s.to || s.modes.length || s.rv || s.ios.length===1 || s.cats.length || s.srcs.length || s.batch);
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
            if(searchState.srcs.length && !searchState.srcs.includes(srcOf(r))) return false;
            if(searchState.batch && r.batch!==searchState.batch) return false;
            return true;
        }
        // 「当前搜到的」的唯一判定：结果页列表、条数、「看这 N 笔」、批量操作都调它——两边各写一套，早晚会出现「列表显示 12 条，实际改了 13 条」
        function filterMatch(r){
            const cs=searchState.cats;
            return (!cs.length || cs.includes(r.cat)) && searchMatch(r);
        }
        // 给外面（测试）看现在的条件，拿的是一份副本
        function searchNow(){ return JSON.parse(JSON.stringify(searchState)); }
        function clearState(){ Object.assign(searchState, { keyword:'', min:null, max:null, from:null, to:null, modes:[], rv:false, ios:[], cats:[], srcs:[], batch:null }); }
        function toggleIn(arr, v){ const i=arr.indexOf(v); if(i<0) arr.push(v); else arr.splice(i, 1); }

        // ===== 1023-G：搜一笔的结果页 =====
        //   账单页底栏「搜一笔」：从右边滑进来，同时自动拉出筛选条件抽屉；抽屉收起就是结果页。
        //   条件一改，后面的结果页、抽屉底部「看这 N 笔」都跟着变（不再有「点完成才生效」的草稿）。
        //   结果页：顶上生效的条件一个一个深色小标签（点 × 去掉）、条数 + 支出 / 收入合计（右边「批量改 ›」，批量的范围就是这里列出来的）、
        //   列表（和账单页同一份画法，不显示没记账的日子）；底部「回到账单 | 改条件」。没条件时列全部记录；没结果时缺省页
        const page=$('pageSearch'), list=$('searchList'), painter=makePainter(list);
        let pageOpen=false, closeT=null;
        // 1024-Y：量条件卡和底部按钮排的高，列表底下按真的高让、卡片贴着按钮排（量不到的老 WebView / jsdom 照旧固定 250）
        function fitCard(){
            const card=$('searchCard'), bar=page.querySelector('.sp-bar');
            const ch=card ? card.offsetHeight : 0, bh=bar ? bar.offsetHeight : 0;
            if(!ch || !bh){ page.classList.remove('sp-fit'); return; }
            page.style.setProperty('--sp-card-h', ch+'px'); page.style.setProperty('--sp-bar-h', bh+'px');
            page.classList.add('sp-fit');
        }
        try{ if(window.ResizeObserver){ const ro=new ResizeObserver(()=>{ if(pageOpen) fitCard(); }); ro.observe($('searchCard')); ro.observe(page.querySelector('.sp-bar')); } }catch(_){}
        function spNoMotion(){ try{ return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(_){ return false; } }
        // 1025-UX：列表往下滑过 24px 收起最近搜过，回到 4px 以内展开（中间留一段，不会来回闪）
        function setFold(on){ page.classList.toggle('sp-folded', !!on); }
        $('searchBody').addEventListener('scroll', ()=>{
            const y=$('searchBody').scrollTop;
            if(y>24) setFold(true); else if(y<=4) setFold(false);
        }, { passive:true });
        function isOpen(){ return pageOpen; }
        function openSearch(o){
            o=o||{};
            if(o.rv){ clearState(); searchState.rv=true; }   // 账单页「待确认分类 N 条 ›」：只看待确认分类
            if(o.batch){ clearState(); searchState.batch=o.batch; }   // 4a：导入横幅 / 导入记录的「查看」：只看那一次导入的
            clearTimeout(closeT);
            pageOpen=true; page.hidden=false;
            page.classList.remove('sp-out'); page.classList.remove('sp-in');
            if(!spNoMotion()){ void page.offsetWidth; page.classList.add('sp-in'); }
            document.body.classList.add('search-open');
            setFold(false);
            $('searchBody').scrollTop=0;
            render();
            if(!o.noSheet) openSheet();
        }
        function closeSearch(){
            closeSheet({ noHist:true });   // 直接回账单：不算确认条件
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
        // ===== 1023-N：最近搜过 =====
        //   存在这台手机（localStorage，按账号 + 存档分开，不进备份、云备份），最多 HIST_MAX 条，新的在前、一样的条件合成一条并挪到最前。
        //   每条存的是一组条件；「本月 / 上月 / 近 7 天」按相对时间存（下个月点开就是下个月），自己选的日期存日子。
        //   什么时候记：确认条件的时候——抽屉收起（看这 N 笔、往下拉、点暗处、返回键）且有条件；在结果页点 × 去掉条件那种中间状态不记。
        const HIST_MAX=10;
        function histKey(){ return `app_search_hist_${JiwenBase.currentUser}__${JiwenBase.currentArchive}`; }
        function histLoad(){ try{ const a=JSON.parse(localStorage.getItem(histKey())||'[]'); return Array.isArray(a) ? a.filter(x=>x && typeof x==='object') : []; }catch(_){ return []; } }
        function histSave(a){ try{ localStorage.setItem(histKey(), JSON.stringify(a.slice(0, HIST_MAX))); }catch(_){} }
        function histOf(){
            const s=searchState, h={};
            if(s.from || s.to){
                const q=['month', 'last', '7d'].find(x=>{ const [a, z]=quickRange(x); return (s.from||'')===a && (s.to||'')===z; });
                if(q) h.q=q; else { h.from=s.from||null; h.to=s.to||null; }
            }
            if(s.min!=null) h.min=s.min;
            if(s.max!=null) h.max=s.max;
            if(s.ios.length===1) h.ios=s.ios.slice();
            if(s.cats.length) h.cats=s.cats.slice();
            if(s.modes.length) h.modes=MODE_ORDER.filter(m=>s.modes.includes(m));
            if(s.keyword) h.keyword=s.keyword;
            if(s.rv) h.rv=true;
            if(s.srcs.length) h.srcs=SRC_ORDER.filter(x=>s.srcs.includes(x));
            if(s.batch) h.batch=s.batch;
            return h;
        }
        function histSig(h){ return JSON.stringify(['q', 'from', 'to', 'min', 'max', 'ios', 'cats', 'modes', 'keyword', 'rv', 'srcs', 'batch'].map(k=>h[k]===undefined ? null : h[k])); }
        function histAdd(){
            if(!hasFilter()) return;
            const h=histOf(), sig=histSig(h);
            histSave([h].concat(histLoad().filter(x=>histSig(x)!==sig)));
        }
        const Q_NAME={ month:'本月', last:'上月', '7d':'近 7 天' };
        function histLabel(h){
            const out=[];
            if(h.q) out.push(Q_NAME[h.q]||'');
            else if(h.from || h.to){
                const f=h.from, z=h.to;
                if(f && z && f.slice(8)==='01' && z===cal.monthEnd(f.slice(0,7))) out.push(`${+f.slice(0,4)}年${+f.slice(5,7)}月`);
                else out.push(f && z ? (f===z ? dayLabel(f) : `${dayLabel(f)}–${dayLabel(z)}`) : (f ? `${dayLabel(f)}起` : `到${dayLabel(z)}`));
            }
            if(h.min!=null || h.max!=null) out.push(h.min!=null && h.max!=null ? `¥${h.min}–${h.max}` : (h.min!=null ? `¥${h.min} 起` : `¥${h.max} 以内`));
            if(h.ios && h.ios.length===1) out.push(h.ios[0]==='expense' ? '支出' : '收入');
            (h.cats||[]).forEach(c=>out.push(c));
            (h.modes||[]).forEach(m=>out.push(MODE_NAME[m]));
            if(h.keyword) out.push('备注：'+h.keyword);
            if(h.rv) out.push('待确认分类');
            (h.srcs||[]).forEach(x=>out.push(SRC_NAME[x]||x));
            if(h.batch) out.push(batchLabel(h.batch));
            return out.join(' · ');
        }
        // 点一条：整组套用（换掉现在的条件）
        function histApply(h){
            clearState();
            if(h.q){ const [a, z]=quickRange(h.q); searchState.from=a||null; searchState.to=z||null; }
            else { searchState.from=h.from||null; searchState.to=h.to||null; }
            searchState.min = h.min!=null ? h.min : null; searchState.max = h.max!=null ? h.max : null;
            searchState.ios=(h.ios||[]).slice(); searchState.cats=(h.cats||[]).slice(); searchState.modes=(h.modes||[]).slice();
            searchState.keyword=h.keyword||''; searchState.rv=!!h.rv;
            searchState.srcs=(h.srcs||[]).filter(x=>SRC_NAME[x]); searchState.batch=typeof h.batch==='string' ? h.batch : null;
            kw.value=searchState.keyword;
            min.value = searchState.min!=null ? String(searchState.min) : ''; max.value = searchState.max!=null ? String(searchState.max) : '';
            renderFilterChips();   // 分类后来被删了、改名了的去掉
            histAdd();
            changed();
        }
        function histDrop(i){ const a=histLoad(); a.splice(i, 1); histSave(a); }
        const CLOCK='<svg class="sp-hist-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
        // 结果页没条件时，条件卡里列最近 3 条
        //   1025-UX：列表往下滑（看全部账单）时这 3 条收成一行「还没设条件 · 最近搜过 3 条 ›」，不再一直盖着列表；回到列表顶上自己展开，
        //   点那一行也回到顶上、展开（`.sp-hist-fold`，`search-page.sp-folded`）。不照月份浮条那样停 1.5 秒自己收：它是要读、要点的内容，
        //   人没动它就消失会来不及点；只在人明确往下看列表时让开
        function histCardHtml(){
            const a=histLoad().slice(0, 3);
            if(!a.length) return `<span class="sp-nocond">还没设条件，下面是全部账单</span>`;
            return `<button type="button" class="sp-hist-fold" data-act="hunfold">还没设条件 · 最近搜过 ${a.length} 条<span class="sp-hist-fold-go" aria-hidden="true">›</span></button>`
                + `<div class="sp-hist"><div class="sp-hist-head"><span>最近搜过</span><button type="button" class="sp-hist-clear" data-act="hclear">清空</button></div>`
                + a.map((h, i)=>`<div class="sp-hist-row"><button type="button" class="sp-hist-go" data-act="happly" data-i="${i}">${CLOCK}<span class="sp-hist-t">${escapeHtml(histLabel(h))}</span></button>`
                    + `<button type="button" class="sp-hist-x" data-act="hdrop" data-i="${i}" aria-label="删掉这条：${escapeHtml(histLabel(h))}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>`).join('')
                + `</div>`;
        }
        // 抽屉顶上：最近 5 条，点一下整组套用
        function paintHistTop(){
            const box=$('filterHist'); if(!box) return;
            const a=histLoad().slice(0, 5);
            box.hidden=!a.length;
            box.innerHTML = a.length ? `<span class="sf-hist-k">最近搜过</span><div class="sf-hist-list">` + a.map((h, i)=>`<button type="button" class="sf-hist-chip" data-i="${i}">${escapeHtml(histLabel(h))}</button>`).join('') + `</div>` : '';
        }
        // 生效的条件：一个一个小标签，每个带「去掉」
        function condTags(){
            const s=searchState, out=[];
            // sec：点条件本身时打开抽屉、翻到这一项（1023-M）
            if(s.from || s.to) out.push({ sec:'date', t: s.from && s.to ? (s.from===s.to ? dayLabel(s.from) : `${dayLabel(s.from)}–${dayLabel(s.to)}`) : (s.from ? `${dayLabel(s.from)}起` : `到${dayLabel(s.to)}`), drop(){ s.from=null; s.to=null; } });
            if(s.min!=null || s.max!=null) out.push({ sec:'money', t: s.min!=null && s.max!=null ? `¥${s.min}–${s.max}` : (s.min!=null ? `¥${s.min} 起` : `¥${s.max} 以内`), drop(){ s.min=null; s.max=null; } });
            if(s.ios.length===1) out.push({ sec:'io', t: s.ios[0]==='expense' ? '支出' : '收入', drop(){ s.ios=[]; } });
            s.cats.forEach(c=>out.push({ sec:'cat', t:c, drop(){ s.cats=s.cats.filter(x=>x!==c); } }));
            MODE_ORDER.filter(m=>s.modes.includes(m)).forEach(m=>out.push({ sec:'mode', t:MODE_NAME[m], drop(){ s.modes=s.modes.filter(x=>x!==m); } }));
            if(s.keyword) out.push({ sec:'kw', t:'备注：'+s.keyword, drop(){ s.keyword=''; } });
            if(s.rv) out.push({ sec:'rv', t:'待确认分类', drop(){ s.rv=false; } });
            SRC_ORDER.filter(x=>s.srcs.includes(x)).forEach(x=>out.push({ sec:'src', t:'来源：'+SRC_NAME[x], drop(){ s.srcs=s.srcs.filter(y=>y!==x); } }));
            if(s.batch) out.push({ sec:'src', t:batchLabel(s.batch), drop(){ s.batch=null; } });
            return out;
        }
        let tagList=[];
        function render(){
            if(!pageOpen) return;
            const asc=sortedRecs().filter(filterMatch), any=hasFilter();
            tagList=condTags();
            // 1023-M：条件一个一个排成一行（多了横着滑、不换行）；点条件本身是改这个条件（打开抽屉翻到那一项），点 × 是去掉
            $('searchTags').innerHTML = tagList.length
                ? tagList.map((x, i)=>`<span class="sp-tag" data-i="${i}"><button type="button" class="sp-tag-t" data-act="edit" aria-label="改条件：${escapeHtml(x.t)}">${escapeHtml(x.t)}</button>`
                    + `<button type="button" class="sp-tag-x" data-act="drop" aria-label="去掉条件：${escapeHtml(x.t)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></span>`).join('')
                : histCardHtml();   // 1023-N：没条件时列最近搜过的 3 条
            $('searchCount').textContent=`${asc.length} 笔`;
            const s=sumFen(asc);
            let nSkip=0, nFlow=0; asc.forEach(r=>{ if(isSkip(r)) nSkip++; else if(isFlow(r)) nFlow++; });
            const ex=[]; if(nSkip) ex.push(`${nSkip} 笔不计`); if(nFlow) ex.push(`${nFlow} 笔往来`);
            // 条件只限了支出（或只限了收入）：只写那一项的合计
            const io1 = searchState.ios.length===1 ? searchState.ios[0] : '';
            const money = io1==='expense' ? `支出 <b>${s.exp.toFixed(2)}</b>`
                : io1==='income' ? `收入 <b class="pos">${s.inc.toFixed(2)}</b>`
                : `支出 <b>${s.exp.toFixed(2)}</b>${s.inc ? ` · 收入 <b class="pos">${s.inc.toFixed(2)}</b>` : ''}`;
            const sum=$('summaryFilter');
            sum.innerHTML = asc.length
                ? `<span class="sp-sumtx"><span class="sp-n">找到 <b>${asc.length}</b> 笔 · <span class="sp-s">${money}</span></span>`
                    + (ex.length ? `<span class="sp-ex">其中 ${ex.join('、')}</span>` : '') + `</span>`
                    // 批量：有条件、搜到了才有（没条件就等于全部记录，一不小心就改了整本账）；范围 = 这里列出来的全部
                    + (any ? `<button type="button" class="sp-batch" id="batchBar" data-act="batch"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>批量改</button>` : '')
                    // 导入简化第 5 版：看的是待确认分类：「逐条确认 ›」「成组确认 ›」
                    + (searchState.rv && asc.some(r=>r.rv===1) ? `<span class="sp-rv-acts"><button type="button" class="sp-rv-b" id="rvOneBtn" data-act="rvone">逐条确认 ›</button><button type="button" class="sp-rv-b" id="rvGroupBtn" data-act="rvgroup">成组确认 ›</button><button type="button" class="sp-rv-b" id="rvAiBtn" data-act="rvai">交给 AI 按组整理 ›</button></span>` : '')
                : '';
            sum.hidden=!asc.length;
            // 底部按钮：有条件「清空条件 | 改条件」，没条件只有一个「设条件」
            $('searchClear').hidden=!any;
            $('searchEdit').textContent = any ? '改条件' : '设条件';
            const empty=!asc.length;
            $('searchEmpty').hidden=!empty;
            if(empty){
                $('searchEmpty').querySelector('.sp-empty-t').textContent = any ? '没有找到相关的账' : '账本里还没有记录';
                $('searchEmpty').querySelector('.sp-empty-s').textContent = any ? '点下面的条件把它去掉，或者改条件' : '记了账以后，在这里按条件找';
                painter.paint([]);
            } else painter.paint(listHtml(asc, {}));
            fitCard();
            paintSheet();
        }
        function searchFlush(){ painter.flush(); }
        $('searchTags').addEventListener('click', e=>{
            const ha=e.target.closest('[data-act^="h"]');
            if(ha){
                const act=ha.dataset.act, i=+ha.dataset.i;
                if(act==='hunfold'){ const sb=$('searchBody'); try{ sb.scrollTo({ top:0, behavior:spNoMotion() ? 'instant' : 'smooth' }); }catch(_){ sb.scrollTop=0; } setFold(false); }
                else if(act==='happly'){ const h=histLoad()[i]; if(h) histApply(h); }
                else if(act==='hdrop'){ histDrop(i); render(); }
                else if(act==='hclear'){ customConfirm('清空最近搜过的条件？只删这台手机上记下的搜索条件，账本不动。', ()=>{ histSave([]); render(); }, '清空最近搜过', { okText:'清空', danger:true }); }
                return;
            }
            const b=e.target.closest('.sp-tag'); if(!b) return;
            const x=tagList[+b.dataset.i]; if(!x) return;
            if(e.target.closest('[data-act="drop"]')){ x.drop(); render(); return; }
            if(e.target.closest('[data-act="edit"]')) openSheet({ focus:x.sec });
        });
        $('summaryFilter').addEventListener('click', e=>{
            if(e.target.closest('[data-act="batch"]')) openBatchMenu();
            else if(e.target.closest('[data-act="rvone"]')) openRvOne(0);
            else if(e.target.closest('[data-act="rvgroup"]')) openRvGroups();
            else if(e.target.closest('[data-act="rvai"]')) loadImportUI().then(ui=>ui.openAiGroups()).catch(err=>customAlert('导入模块没加载上：' + (err && err.message || err), 'AI 按组整理'));   // 导入简化第 14 版
        });
        list.addEventListener('click', e=>{
            const row=e.target.closest('.bl-row[data-id]'); if(row){ openDetail(row.dataset.id); return; }
            const wk=e.target.closest('.lg-wk[data-mon]'); if(wk){ openWeek(wk.dataset.mon); return; }
            const dh=e.target.closest('.lg-dh[data-day]'); if(dh){ openDay(dh.dataset.day); }
        });
        $('searchBack').addEventListener('click', closeSearch);
        $('searchClear').addEventListener('click', ()=>{ clearState(); kw.value=''; min.value=''; max.value=''; render(); });   // 只清条件，结果页留着   // 1023-M：原来的「回到账单」换成「清空条件」（回账单走顶上的 ‹ 或返回键）
        $('searchEdit').addEventListener('click', ()=>openSheet());
        $('filterFab').addEventListener('click', ()=>openSearch());
        // 账单页的「待确认分类 N 条 ›」（ledger.js 画的）：打开结果页，只看待确认分类
        $('pageLedger').addEventListener('click', e=>{
            if(e.target.closest('#rvChip')) openSearch({ rv:true, noSheet:true });
            const bv=e.target.closest('#impBannerView'); if(bv) openSearch({ batch:bv.dataset.b, noSheet:true });   // 4a：导入横幅「查看」：这一批
        });

        // ===== 1023-G：筛选条件抽屉（样子照记一笔：拖动条 + 标题，最高约屏幕八成）=====
        //   日期范围（两个带日历图标的按钮 + 不限 / 本月 / 上月 / 近 7 天）、金额范围（大字，App 的数字键盘）、收入 | 支出（能都选）、
        //   常用分类 4 个（最近用得多的，多选）、列表卡：分类 ›（点开展开全部分类，多选）、统计 ›（计入 / 不计 / 往来，多选）、备注（空格隔开的几个词都要包含）、
        //   开发开关开着、有待确认分类时多一行「待确认分类」开关。底部「看这 N 笔」（N 跟着条件变）、「回到账单 | 清空条件」。
        //   往下拉、点暗处、返回键收起，条件留着（收起就是结果页）。这个抽屉点暗处能关，是用户点名要的（别的面板照旧不做）
        const mask=$('filterSheetMask'), sheet=$('filterSheet');
        const from=$('searchFrom'), to=$('searchTo'), kw=$('searchKeyword'), min=$('searchMin'), max=$('searchMax');
        let quickCats=[], catOpen=false, modeOpen=false;
        function sheetOpen(){ return mask.style.display==='flex'; }
        // opt.focus：从结果页点某个条件进来，翻到那一项（分类 / 统计顺便展开）、闪一下
        const FOCUS_EL={ date:'filterDateQuick', money:'searchMin', io:'filterIoChips', cat:'filterCatRow', mode:'filterModeRow', kw:'searchKeyword', rv:'filterRvRow', src:'filterSrcRow' };
        let srcOpen=false;
        function openSheet(opt){
            if(!pageOpen){ openSearch({ noSheet:true }); }
            quickCats=recentCats(searchState.ios.length===1 ? searchState.ios[0] : undefined, 4);   // 打开时定下来，开着时不挪位置
            const focus=opt && opt.focus;
            catOpen=focus==='cat'; modeOpen=focus==='mode'; srcOpen=focus==='src';
            kw.value=searchState.keyword;
            min.value = searchState.min!=null ? String(searchState.min) : '';
            max.value = searchState.max!=null ? String(searchState.max) : '';
            renderFilterChips(); paintSheet(); paintHistTop();
            mask.style.display='flex';
            sheetDrag.reset();
            requestAnimationFrame(()=>mask.classList.add('open'));
            const fe=focus && $(FOCUS_EL[focus]);
            const row=fe && (fe.closest('.rec-row, .sf-sec') || fe);
            if(row){
                try{ row.scrollIntoView({ block:'center' }); }catch(_){}
                row.classList.remove('sf-flash'); void row.offsetWidth; row.classList.add('sf-flash');
                setTimeout(()=>row.classList.remove('sf-flash'), 1200);
            }
        }
        function closeSheet(opt){
            if(!sheetOpen() && !mask.classList.contains('open')) return;
            if(pageOpen && !(opt && opt.noHist)){ readInputs(); histAdd(); render(); }   // 1023-N：收起抽屉 = 确认了条件，记一条
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
            // 4a：来源（开发开关开着，或者已经选了）
            const sr=$('filterSrcRow');
            sr.hidden=!(dev || searchState.srcs.length);
            const sv=$('filterSrcVal'); sv.textContent = searchState.srcs.length ? SRC_ORDER.filter(x=>searchState.srcs.includes(x)).map(x=>SRC_NAME[x]).join('、') : '全部'; sv.classList.toggle('sf-ph', !searchState.srcs.length);
            sr.setAttribute('aria-expanded', srcOpen ? 'true' : 'false'); sr.classList.toggle('open', srcOpen);
            const sc=$('filterSrcChips'); sc.hidden=!srcOpen || sr.hidden;
            if(!sc.children.length) sc.innerHTML=SRC_ORDER.map(x=>`<button type="button" class="sf-btn cc" data-v="${x}">${SRC_NAME[x]}</button>`).join('');
            sc.querySelectorAll('[data-v]').forEach(b=>{ const on=searchState.srcs.includes(b.dataset.v); b.classList.toggle('sel', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
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
        $('filterSrcRow').addEventListener('click', ()=>{ srcOpen=!srcOpen; paintSheet(); });
        $('filterSrcChips').addEventListener('click', e=>{ const b=e.target.closest('[data-v]'); if(!b) return; toggleIn(searchState.srcs, b.dataset.v); changed(); });
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
        // 1023-N：抽屉顶上「最近搜过」：点一条整组套用（抽屉不关，结果跟着变）
        $('filterHist').addEventListener('click', e=>{
            const c=e.target.closest('.sf-hist-chip'); if(!c) return;
            const h=histLoad()[+c.dataset.i]; if(!h) return;
            histApply(h); paintHistTop();
        });

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
            const rvN=list.filter(r=>r.rv===1).length;
            customChoose(`这 ${list.length} 笔是这次搜到的全部记录。先选怎么改，下一步会再让你确认：${rfN?`\n另有 ${rfN} 条退款记录不参与，会跟着各自的原账单一起变。`:''}`, [
                // 导入简化第 5 版：确认分类（不改）：只去掉「待确认分类」标记（有待确认的才有这一项）
                ...(rvN ? [{ value:'rvok', label:'确认分类（不改）', desc:`这里面 ${rvN} 条待确认分类的，分类没问题：只去掉标记，分类不动` }] : []),
                // 说明文字与记一笔里的口径说明（MODE_HINT）同源，两处永远一致
                { value:'cat',    label:'改分类',       desc:'把这些记录统一改到同一个分类，比如把「永劫无间」归到「游戏」' },
                { value:'normal', label:'恢复计入',     desc:'取消「不计」「往来」：'+MODE_HINT.normal },
                { value:'skip',   label:'标为不计',     desc:MODE_HINT.skip },
                { value:'flow',   label:'标为往来',     desc:MODE_HINT.flow }
            ], (act)=>{
                if(act==='rvok'){
                    const targets=list.filter(r=>r.rv===1);
                    customConfirm(`确认下面这 ${targets.length} 条的分类没问题（只去掉「待确认分类」，分类不动）。改完可以马上「撤销这次操作」。`,
                        ()=>applyBatch(targets.map(r=>r.id), { rvOk:true }), '确认分类', { okText:`确认这 ${targets.length} 条`, list:targets, onCancel:openBatchMenu });
                    return;
                }
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
            }, `将修改 ${list.length} 笔`, null, { layout:'list' });   // 1023-M：第一屏先说清楚改几笔，下一步再确认
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
                if(change.rvOk && n.rv){ prev[prev.length-1].rv=1; delete n.rv; }   // 第 5 版：确认分类（不改），撤销时放回
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
            customConfirm(change.rvOk ? `已确认 ${mainN} 条的分类。` : `已处理 ${mainN} 条记录。`, null, change.rvOk ? '确认分类' : '批量操作完成',
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
        // ===== 导入简化第 5 版：待确认分类的确认 =====
        //   逐条确认：顶上「待确认 3 / 60」，一条一张：对方、商品说明（备注）、推荐的分类和理由（打开时按现在的规则再推一遍，载入导入模块）；
        //   「没问题」（去掉标记）、「改成…」（常用分类小标签，点一下就改，改了问一句以后也这么记吗）、「跳过」；处理完自动到下一条。
        //   成组确认：按分类分组「餐饮 · 42 笔（瑞幸 18、果切 9…）[这组都没问题]」，点开看每一笔、勾掉个别的；确认走批量那套，能撤销
        function rvList(){ return getUserData().filter(r=>r.rv===1 && filterMatch(r)).map((r, i)=>({ r, i, ts:parseRecTime(r.time).getTime() })).sort((a, b)=>(b.ts-a.ts) || (b.i-a.i)).map(x=>x.r); }
        function cpName(r){ try{ const a=window.JiwenStore.loadStore(JiwenBase.currentUser).archives[JiwenBase.currentArchive]; return Number.isInteger(r.cp) ? ((a.cps||[])[r.cp]||'') : ''; }catch(_){ return ''; } }
        let rvIds=null;
        function setRec(id, fn){
            const data=getUserData(), i=data.findIndex(r=>r.id===id); if(i<0) return null;
            const n=Object.assign({}, data[i]); fn(n); data[i]=n;
            syncRefunds(data, n);      // 挂在上面的退款跟着改分类
            if(!saveUserData(data)) return null;
            return n;
        }
        function openRvOne(k){
            if(!window.JiwenSheet) return;
            if(!k || !rvIds) rvIds=rvList().map(r=>r.id);
            const ids=rvIds, total=ids.length;
            let i=k||0;
            while(i<total){ const r=getUserData().find(x=>x.id===ids[i]); if(r && r.rv===1) break; i++; }
            if(i>=total){ rvIds=null; window.JiwenTabs.refreshAllViews(); render(); customAlert(total ? `这 ${total} 条都看完了。` : '没有待确认分类的记录了。', '逐条确认'); return; }
            const r=getUserData().find(x=>x.id===ids[i]), nm=cpName(r), next=()=>openRvOne(i+1);
            const quick=recentCats(r.type, 5).filter(c=>c!==r.cat).slice(0, 4);
            window.JiwenSheet.open({ title:`待确认 ${i+1} / ${total}`, sub:'分类没问题就点「没问题」，处理完自动到下一条',
                onDismiss:()=>{ rvIds=null; window.JiwenTabs.refreshAllViews(); render(); },
                body(box){
                    const amt=safeNum(r.money).toFixed(2), d=String(r.time||'').slice(5, 16).replace('T', ' ');
                    box.innerHTML=`<div class="rvr-card" id="rvOneCard"><div class="rvr-top"><span class="rvr-cp">${escapeHtml(nm || '（没有对方）')}</span><span class="rvr-amt">${r.type==='expense' ? '−' : '+'}${amt}</span></div>`
                        + `<div class="rvr-sub">${escapeHtml(d)}${r.remark ? ' · '+escapeHtml(String(r.remark).split('\n')[0]) : ''}</div>`
                        + `<div class="rvr-rec">推荐的分类：<b>${escapeHtml(r.cat||'未分类')}</b></div><div class="rvr-why" id="rvOneWhy"></div></div>`
                        + `<div class="rvr-h">改成…</div><div class="cat-chips cat-grid4" id="rvOneCats">${quick.map(c=>`<button type="button" class="cc" data-cat="${escapeHtml(c)}"><span class="cc-t">${escapeHtml(c)}</span></button>`).join('')}<button type="button" class="cc" data-cat="" id="rvOneMore"><span class="cc-t">更多…</span></button></div>`;
                    // 理由：按现在的规则再推一遍（要载入导入模块，载不上就不写）
                    loadImportUI().then(ui=>ui.reasonFor ? ui.reasonFor(r, nm) : null).then(w=>{ const e=$('rvOneWhy'); if(e && w) e.textContent=w; }).catch(()=>{});
                    box.querySelector('#rvOneCats').addEventListener('click', e=>{
                        const b=e.target.closest('[data-cat]'); if(!b) return;
                        const go=cat=>{ const n=setRec(r.id, x=>{ x.cat=cat; delete x.rv; }); if(n) askCatRule(n, cat, next); };
                        if(b.dataset.cat){ window.JiwenSheet.close(); go(b.dataset.cat); }
                        else window.JiwenSheet.cats({ title:'改成哪个分类', type:r.type, value:r.cat, onCancel:()=>openRvOne(i), onPick:go });
                    });
                },
                foot(box, done){
                    const mk=(id, t, cls)=>{ const b=document.createElement('button'); b.type='button'; b.id=id; b.className='ui-btn '+(cls||''); b.textContent=t; return b; };
                    const ok=mk('rvOneOk', '没问题', 'primary'), skip=mk('rvOneSkip', '跳过'), cl=mk('rvOneClose', '关闭', 'block');
                    ok.addEventListener('click', ()=>{ done(); setRec(r.id, x=>{ delete x.rv; }); next(); });
                    skip.addEventListener('click', ()=>{ done(); next(); });
                    cl.addEventListener('click', ()=>{ done(); rvIds=null; window.JiwenTabs.refreshAllViews(); render(); });
                    const pair=document.createElement('div'); pair.className='ui-pair'; pair.appendChild(skip); pair.appendChild(ok);
                    const col=document.createElement('div'); col.className='ui-stack'; col.appendChild(pair); col.appendChild(cl); box.appendChild(col);
                } });
        }
        let rvGroupOpen=null, rvGroupOff=null;
        function openRvGroups(keep){
            if(!window.JiwenSheet) return;
            if(!keep){ rvGroupOpen=null; rvGroupOff=new Set(); }
            const list=rvList(); if(!list.length){ customAlert('没有待确认分类的记录了。', '成组确认'); render(); return; }
            const by=new Map(); list.forEach(r=>{ const c=r.cat||'未分类'; if(!by.has(c)) by.set(c, []); by.get(c).push(r); });
            const groups=[...by.entries()].sort((a, b)=>b[1].length-a[1].length);
            window.JiwenSheet.open({ title:'成组确认', tall:true, sub:`按推荐的分类分组 · 共 ${list.length} 条`,
                body(box, done){
                    groups.forEach(([cat, rs])=>{
                        const cps=new Map(); rs.forEach(r=>{ const n=cpName(r)||'（没有对方）'; cps.set(n, (cps.get(n)||0)+1); });
                        const top=[...cps.entries()].sort((a, b)=>b[1]-a[1]).slice(0, 3).map(([n, c])=>`${n} ${c}`).join('、') + (cps.size>3 ? '…' : '');
                        const on=rs.filter(r=>!rvGroupOff.has(r.id));
                        const g=document.createElement('div'); g.className='rvg'; g.dataset.cat=cat;
                        g.innerHTML=`<button type="button" class="rvg-head" data-act="open"><span class="rvg-t">${escapeHtml(cat)} · ${rs.length} 笔</span><span class="rvg-s">（${escapeHtml(top)}）</span><span class="rvg-go">${rvGroupOpen===cat ? '收起 ▴' : '看每一笔 ▸'}</span></button>`
                            + `<button type="button" class="ui-btn primary rvg-ok" data-act="ok"${on.length ? '' : ' disabled'}>${on.length===rs.length ? '这组都没问题' : `勾上的 ${on.length} 笔没问题`}</button>`;
                        if(rvGroupOpen===cat){
                            const ul=document.createElement('div'); ul.className='rvg-list';
                            rs.forEach(r=>{ const row=document.createElement('label'); row.className='rvg-row'; row.innerHTML=`<input type="checkbox"${rvGroupOff.has(r.id) ? '' : ' checked'} data-id="${escapeHtml(r.id)}"><span class="rvg-r">${escapeHtml(String(r.time||'').slice(5, 10))} ${escapeHtml(cpName(r)||r.remark||'—')}</span><span class="rvg-a">${safeNum(r.money).toFixed(2)}</span>`; ul.appendChild(row); });
                            g.appendChild(ul);
                        }
                        g.addEventListener('click', e=>{
                            const cb=e.target.closest('input[type=checkbox]');
                            if(cb){ if(cb.checked) rvGroupOff.delete(cb.dataset.id); else rvGroupOff.add(cb.dataset.id); openRvGroups(true); return; }
                            const a=e.target.closest('[data-act]'); if(!a) return;
                            if(a.dataset.act==='open'){ rvGroupOpen = rvGroupOpen===cat ? null : cat; openRvGroups(true); }
                            else if(a.dataset.act==='ok'){ const ids=on.map(r=>r.id); done(); applyBatch(ids, { rvOk:true }); }
                        });
                        box.appendChild(g);
                    });
                },
                foot(box, done){ const b=document.createElement('button'); b.type='button'; b.id='rvGroupClose'; b.className='ui-btn block'; b.textContent='关闭'; b.addEventListener('click', ()=>done()); box.appendChild(b); } });
        }
        window.JiwenSearch = { openRvGroups, openRvOne, srcOf, applyBatch, closeSearch, filterMatch, isOpen, openBatchMenu, openSearch, openSheet, render, renderFilterChips, resetSearch, searchFlush, searchNow, undoBatch };   // search 模块对外只有这一个入口
})();
