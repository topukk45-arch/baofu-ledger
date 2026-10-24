(function(){
        const { $, billList, escapeHtml, pad, parseRecTime } = window.JiwenBase;   // 用到前面模块的
        const { getUserData, impGetJson, impLogKey, impTarget, refundedMap, statContrib } = window.JiwenStore;   // 用到前面模块的
        const { customAlert } = window.JiwenAsk;   // 用到前面模块的
        const { loadImportUI } = window.JiwenImportEntry;   // 用到前面模块的
        const { openAddModal } = window.JiwenForms;   // 用到前面模块的
        const { CHEV, cal, openDay, openDetail, openWeek, rowHtml, sumFen, sumHtml } = window.JiwenDetail;   // 用到前面模块的
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
        // 1023-G 起点了打开搜一笔的结果页、条件是「待确认分类」（点击在 search.js 里委托绑定）
        function renderRvChip(raw){
            let on=false; try{ on=localStorage.getItem('app_dev_import')==='1'; }catch(_){}
            const n=on ? raw.filter(r=>r.rv===1).length : 0;
            let b=$('rvChip');
            if(!on || !n){ if(b) b.remove(); return; }
            if(!b){
                b=document.createElement('button'); b.type='button'; b.id='rvChip'; b.className='rv-chip';
                const head=$('billHead'); head.parentNode.insertBefore(b, head);
            }
            b.textContent = `待确认分类 ${n} 条 ›`;
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
        //   搜一笔的结果页（search.js）也用 listHtml：不传 ym，全部命中的照同样的周 / 天排，不显示没记账的日子。
        //   月份由底栏上方的月份浮条切（JiwenMonthStrip，停 1.5 秒收起，滑列表时出来）。lgYM：null = 这个月，别的是 'YYYY-MM'
        let lgYM=null;
        function ymNow(){ const n=new Date(); return `${n.getFullYear()}-${pad(n.getMonth()+1)}`; }
        function curYM(){ return lgYM || ymNow(); }
        function ymLabel(ym){ const y=+ym.slice(0,4); return (y!==new Date().getFullYear() ? y+'年' : '')+(+ym.slice(5,7))+'月'; }
        const lgStrip=window.JiwenMonthStrip.create({ id:'lgStrip', onPick:ym=>setYM(ym), onTop:()=>window.scrollTo({ top:0, behavior:'smooth' }) });   // 1023-J：回顶箭头在浮条右端
        // 1023-H：统计页看的是同一个月。opt.quiet：统计页那边改的（推过来），不滚页面、不算「账单页这边改了」；
        //   ymVer：账单页这边每改一次月份加一，统计页画之前看它变没变，变了就跟过来
        let ymVer=0;
        function setYM(ym, opt){
            const quiet=!!(opt && opt.quiet);
            lgYM = (!ym || ym===ymNow()) ? null : ym;
            if(!quiet) ymVer++;
            renderBill();
            if(quiet) return;
            const bar=$('billHead'), y=bar ? bar.getBoundingClientRect().top + window.scrollY : 0;
            if(window.scrollY > y) window.scrollTo({ top:y, behavior:'instant' });   // 切了月份：停在细条那里，新月份从头看
        }
        function ymVersion(){ return ymVer; }
        // 1023-J：滑的时候浮条出来（停 1.5 秒收起）；滑过一屏才露出右端的回顶箭头、回到顶部就藏；整页不满一屏（不用滑）时浮条一直显示
        function stripWake(){
            if(JiwenBase.currentTab!=='ledger' || $('pageLedger').style.display==='none') return;
            const H=window.innerHeight||0, de=document.documentElement;
            lgStrip.setTop((window.scrollY||de.scrollTop||0) > H);
            lgStrip.pin(de.scrollHeight>0 && de.scrollHeight <= H+1);   // 量不到高度（还没排版）当作满一屏
            lgStrip.wake();
        }
        window.addEventListener('scroll', stripWake, { passive:true });
        window.addEventListener('resize', stripWake, { passive:true });
        // 1023-P 后：页面高度后来又变了（排版晚一拍、分批画完、日卡片从估的高度变成真的）也重新看要不要一直显示；只改钉不钉，不另外叫出来
        if(window.ResizeObserver) new ResizeObserver(()=>{
            if(JiwenBase.currentTab!=='ledger' || $('pageLedger').style.display==='none') return;
            const H=window.innerHeight||0, de=document.documentElement;
            lgStrip.pin(de.scrollHeight>0 && de.scrollHeight <= H+1);
        }).observe($('pageLedger'));
        function resetYM(){ lgYM=null; ymVer++; }   // 换账号 / 存档：回到这个月（不重画，后面会整页刷新）
        function ovOff(){ return lgYM!=null; }   // 首屏快照：看的不是这个月就不存（名字是 1023-A 留下来的）
        function gapHtml(a, b, today){
            const C=cal;
            if(a===b && a===today) return `<div class="lg-gap lg-gap-today" data-a="${a}" data-b="${b}"><span class="lg-gap-t">今天 · ${C.mdText(a)} ${C.wdText(a)}，还没记账</span><button type="button" class="lg-gap-btn" data-add="${a}">记一笔</button></div>`;
            const t = a===b ? `${C.mdText(a)} ${C.wdText(a)}，没记账` : `${C.rangeText(a, b)}，${Math.round((C.kd(b)-C.kd(a))/86400000)+1} 天没记`;
            return `<div class="lg-gap" data-a="${a}" data-b="${b}"><span class="lg-gap-t">${t}</span><button type="button" class="lg-gap-btn" data-add="${b}">补一笔</button></div>`;
        }
        // 1023-K：周是一条分隔线「── 本周 10.19–25 ▂▅▃█▁·· ──── 312.38 ›」，不加底色、不装框（可点的地方照旧 48 高，按下整行浅底）；
        //   7 根小柱子是周一到周日每天的支出（按这一周里最多的那天算高度），这个月以外、还没到的日子是一个点；
        //   只有小柱子和「本周」两个字用主色，别的周写「第 42 周」、灰色。右边的数：有支出写支出；只有收入写 +收入（绿）；一笔没记写「没记」
        function weekHtml(mon, a, z, inWk, today){
            const C=cal, cur=mon===C.monOf(today), s=sumFen(inWk);
            const byD=new Map(); inWk.forEach(r=>{ const d=(r.time||'').slice(0,10); byD.set(d, (byD.get(d)||0)+statContrib(r).exp); });
            let max=0; byD.forEach(v=>{ if(v>max) max=v; });
            let bars='';
            for(let i=0; i<7; i++){
                const k=C.addDay(mon, i);
                if(k<a || k>z || k>today){ bars+='<i class="lg-wk-dot"></i>'; continue; }
                const v=byD.get(k)||0;
                bars+=`<i style="height:${v>0 && max>0 ? Math.max(3, Math.round(v/max*16)) : 2}px"></i>`;
            }
            const val = s.exp ? `<b>${s.exp.toFixed(2)}</b>` : (s.inc ? `<b class="pos">+${s.inc.toFixed(2)}</b>` : `<span class="lg-wk-e">没记</span>`);
            return `<button type="button" class="lg-wk${cur ? ' cur' : ''}" data-mon="${mon}" data-a="${a}" data-b="${z}" aria-label="${C.weekLabel(mon)} ${C.rangeText(a, z)}">`
                + `<span class="lg-wk-line lg-wk-lead" aria-hidden="true"></span><span class="lg-wk-n">${C.weekLabel(mon)}</span><span class="lg-wk-r">${C.shortRange(a, z)}</span>`
                + `<span class="lg-wk-bars" aria-hidden="true">${bars}</span><span class="lg-wk-line" aria-hidden="true"></span><span class="lg-wk-v">${val}</span>${CHEV}</button>`;
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
                    if(!(mon===C.monOf(today) && todayMon)) put(weekHtml(mon, a, z, inWk, today));
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
        // 月份浮条的月份表：账本第一笔的月份到这个月（1023-J 起不画小柱子，只要月份）
        function stripMonths(allAsc){
            const now=ymNow();
            let first=now;
            allAsc.forEach(r=>{ const ym=(r.time||'').slice(0,7); if(/^\d{4}-\d{2}$/.test(ym) && ym<first) first=ym; });
            const out=[];
            for(let ym=first; ym<=now; ){ out.push({ ym }); let y=+ym.slice(0,4), m=+ym.slice(5,7)+1; if(m>12){ m=1; y++; } ym=`${y}-${pad(m)}`; }
            return out;
        }
        // 账单页的点击：周小计 → 一周详情、日期抬头 → 当日详情（1023-D）、没记账那条的「记一笔 / 补一笔」
        billList.addEventListener('click', e=>{
            const add=e.target.closest('[data-add]');
            if(add){ e.stopPropagation(); openAddModal({ day:add.dataset.add }); return; }
            const wk=e.target.closest('.lg-wk[data-mon]'); if(wk){ openWeek(wk.dataset.mon); return; }
            const dh=e.target.closest('.lg-dh[data-day]'); if(dh){ openDay(dh.dataset.day); return; }
        });

        // 一个月几百上千笔时分批画：先画前 LIST_FIRST 笔左右（整张日卡片为单位，一屏多），剩下的每次 LIST_CHUNK 笔、让浏览器喘口气再接着画；
        //   重画时没画完的作废。要用到整页高度的（被杀回来放回滚动位置）先 listFlush() 一次画完
        const LIST_FIRST=300, LIST_CHUNK=400;
        function makePainter(box){
            let rest=[], tm=null;
            function take(max){ let h='', n=0; while(rest.length && (n<max || !h)){ const p=rest.shift(); h+=p.h; n+=p.n; } return h; }
            function step(){ tm=null; if(!rest.length) return; box.insertAdjacentHTML('beforeend', take(LIST_CHUNK)); if(rest.length) tm=setTimeout(step, 16); }
            return {
                paint(parts){ clearTimeout(tm); tm=null; rest=parts.slice(); box.innerHTML=take(LIST_FIRST); if(rest.length) tm=setTimeout(step, 0); },
                flush(){ clearTimeout(tm); tm=null; if(rest.length) box.insertAdjacentHTML('beforeend', take(Infinity)); },
            };
        }
        const billPainter=makePainter(billList);
        function listFlush(){ billPainter.flush(); }

        function renderBill(){
            const raw=getUserData();
            renderImpEmptyEntry(raw.length); renderImpRemind(); renderRvChip(raw);
            // 【为什么先算时间戳再排序】排序要做 O(n log n) 次比较，比较器里每次 parseRecTime 太贵：先给每条只解析一次（Schwartzian transform）
            //   同一分钟多笔按存储里的原始顺序（稳定且唯一）
            const allAsc=raw
                .map((r,origIdx)=>({ r, origIdx, ts:parseRecTime(r.time).getTime() }))
                .sort((a,b)=>{ const t=a.ts-b.ts; return t!==0 ? t : a.origIdx-b.origIdx; })
                .map(x=>x.r);
            const ym=curYM();
            lgStrip.set(stripMonths(allAsc), ym);
            // 顶上的细条：这个月的支出、收入（统计页同一口径 statContrib）
            const bar=$('billHead');
            const isNow=ym===ymNow();
            const mon=allAsc.filter(r=>{ const m=(r.time||'').slice(0,7); return m===ym || (isNow && !/^\d{4}-\d{2}$/.test(m)); });   // 没写时间的放在这个月里
            const ms=sumFen(mon);
            bar.innerHTML=`<span class="lg-bar-m" id="lgMonth">${ymLabel(ym)}</span><span class="lg-bar-s"><em>支出</em> <b class="lg-out ov-out">${ms.exp.toFixed(2)}</b></span><span class="lg-bar-s"><em>收入</em> <b class="pos lg-in ov-in">${ms.inc.toFixed(2)}</b></span><span class="lg-bar-go">统计 ›</span>`;   // 1023-K：页头，大字、不加底色不装框
            bar.setAttribute('aria-label', `到统计页看${ymLabel(ym)}`);
            const first=allAsc.length ? (allAsc[0].time||'').slice(0,10) : cal.todayKey();   // 一笔都没有：只有今天那条
            billPainter.paint(listHtml(mon, { ym, first }));
            requestAnimationFrame(stripWake);   // 1023-J：换了月份 / 记了一笔，页面变长变短：看要不要一直显示浮条
        }

        window.JiwenLedger = { curYM, listFlush, listHtml, makePainter, ovOff, renderBill, resetYM, setYM, stripWake, ymVersion };   // ledger 模块对外只有这一个入口
})();
