(function(){
        // ===== 1019-M：性能记录（开发开关里的「性能记录」页看、复制）=====
        //   App 自己记：启动各段耗时（网页脚本开始跑、打开数据库、读账本、画出首屏）、点输入框到能输入用了多久、
        //   键盘弹起过程中面板位置变了几次、每次打开 / 关闭面板用了多久。只在开发开关开着时记，
        //   存在这台手机的 localStorage（app_perf_log，最多留最近 PERF_MAX 条），不进备份。
        window.JiwenPerf=(function(){
            const KEY='app_perf_log', PERF_MAX=50;
            const now=()=>(window.performance && performance.now) ? performance.now() : Date.now();
            const T0=now();          // 网页脚本开始跑（相对页面开始加载）
            const boot={ script:Math.round(T0) };
            function on(){ try{ return localStorage.getItem('app_dev_import')==='1'; }catch(_){ return false; } }
            function list(){ try{ const a=JSON.parse(localStorage.getItem(KEY)||'[]'); return Array.isArray(a) ? a : []; }catch(_){ return []; } }
            function add(e){
                if(!on()) return;
                const ts=Date.now(); const a=list(); a.push(Object.assign({ at:perfLocalAt(ts), ts }, e));   // 1019-Z4：按手机当地时间写（原来 toISOString 是 UTC，北京时间差 8 小时）
                while(a.length>PERF_MAX) a.shift();
                try{ localStorage.setItem(KEY, JSON.stringify(a)); }catch(_){}
            }
            // 启动：各段到「网页开始加载」多少毫秒
            function bootMark(k){ if(!(k in boot)) boot[k]=Math.round(now()); }
            // 1019-Z4：「月-日 时:分:秒」按手机当地时间（页面上和复制出来的都用它）
            function perfLocalAt(ts){ const d=new Date(ts), p=n=>String(n).padStart(2, '0'); return `${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; }
            function bootDone(){
                if(boot.done) return; boot.done=1;
                const f=()=>{ boot.paint=Math.round(now()); const e={ kind:'启动', ms:boot.paint };
                    if(window.__bootSnap) boot.snap=window.__bootSnap.at;   // 1019-U：快照先画出来的时间
                    // 1020-B：快照是怎么存的（停下来时 / 切后台时）、存了多久；没用上的写原因
                    if(window.__bootSnap){ e.snapSrc=window.__bootSnap.src||''; if(window.__bootSnap.age!=null) e.snapAge=Math.round(window.__bootSnap.age/1000); }
                    else if(window.__bootSnapMiss) e.snapMiss=window.__bootSnapMiss;
                    ['snap','script','db','read','render','paint'].forEach(k=>{ if(boot[k]!=null) e[k]=boot[k]; });
                    e.n=window.__perfRecs;
                    nativeInto(e, 0).then(()=>add(e), ()=>add(e)); };
                if(window.requestAnimationFrame) requestAnimationFrame(()=>setTimeout(f, 0)); else setTimeout(f, 0);
            }
            // 1019-X：原生那段（从点图标起）：问原生层要时间点，换到同一把尺子上（都从进程启动算），记进同一条「启动」。
            //   网页的 performance 时间从网页开始加载算，换算：网页开始 = timeOrigin（系统时间）换成开机以来的毫秒。
            //   启动画面还没收起（退场还没做完）就过 200 毫秒再问，最多问 10 次。不在手机上（没有 Launch.timings）就不加。
            function nativeInto(e, tries){
                const c=window.Capacitor, L=c && c.Plugins && c.Plugins.Launch;
                if(!L || typeof L.timings!=='function') return Promise.resolve();
                return Promise.resolve(L.timings()).then(t=>{
                    if(!t || !t.actCreate) return;
                    if(t.wait && !t.splashGone && tries<10) return new Promise(r=>setTimeout(r, 200)).then(()=>nativeInto(e, tries+1));
                    const base=t.procStart || t.actCreate, off=t.nowUptime - t.nowEpoch;   // 系统时间 + off = 开机以来的毫秒
                    const T0=(performance.timeOrigin || (Date.now()-performance.now())) + off;   // 网页开始加载那一刻
                    const rel=x=>x ? Math.round(x-base) : null;
                    const first=e.snap!=null ? e.snap : e.paint;
                    e.nat={ proc:!!t.procStart, act:rel(t.actCreate), web:rel(t.webReady), page:rel(T0), first:rel(T0+first), ready:rel(t.readyAt), gone:rel(t.splashGone), wait:!!t.wait };
                });
            }
            return { now, add, list, on, bootMark, bootDone, nativeInto, localAt:perfLocalAt, clear(){ try{ localStorage.removeItem(KEY); }catch(_){} }, T0 };
        })();
        // ===== 软键盘处理（极简、稳健版） =====
        // 关键教训：之前"先把弹窗设透明、等键盘信号再淡入"的做法，会在键盘弹起、WebView 重排的
        // 那一帧里露出透明弹窗下的底部空白 —— 这正是"先白图、后弹窗"的真正来源。
        //
        // 现在的策略：弹窗一律【直接、不透明】显示，绝不留透明帧。键盘让位完全交给原生层
        // （AndroidManifest 的 adjustResize + Keyboard 插件 resize:native）：键盘弹起时 WebView
        // 被压缩、不上推，弹窗靠 CSS 的 100dvh 自然落在键盘上方。
        //
        // 这里的 JS 只做一件事：用浏览器原生的 visualViewport 检测键盘开/关，借此隐藏底栏与
        // 悬浮按钮，并给极旧 webview 兜底 mask 高度。不依赖任何 Capacitor 插件的 JS 引用
        // （纯 HTML 项目里 window.Capacitor.Plugins.Keyboard 不一定存在，依赖它会判断失灵）。
        // 1019-O：等面板滑入的动画走完再做（没动画、被打断的 260 毫秒兜底）
        // 1019-Z3：底部面板打开 / 收起（往下拉松手、返回键、按钮都是）的时长，改这一个数就行；CSS 里的 --sheet-ms 按它重写
        const SHEET_MS=300;
        try{ document.documentElement.style.setProperty('--sheet-ms', SHEET_MS+'ms'); }catch(_){}
        window.SHEET_MS=SHEET_MS;   // 给测试用
        function afterOpenAnim(mask, fn){
            const sh=mask && (mask.querySelector('.sheet') || mask.firstElementChild); let done=false;
            const go=()=>{ if(done) return; done=true; fn(); };
            if(sh) sh.addEventListener('animationend', go, { once:true });
            setTimeout(go, SHEET_MS+40);   // 没有动画事件（被打断、减少动画）的兜底
        }
        (function(){
            const vv = window.visualViewport;

            // 1019-O：原来每次可视区一变（键盘动画里一帧一次）就把每一层 mask 的高度改成可视区高度，
            //   加上系统（adjustResize）自己也在缩网页，两边叠成两次移动，叠几层每层都跟着动，看着抖。
            //   现在：可视区一开始变，先把所有开着的层按变之前的高度冻住（.kb-hold），不跟着动；
            //   等可视区停下来（KB_SETTLE_MS 没再变），只放开最上面那一层——它只动一次，贴到键盘上面；下面几层一直不动。
            //   键盘收起、可视区回到原来的高度，全部放开（冻住的高度本来就是原来的，不会再动）。
            // 1019-W：最上面那层（正在输入的小面板）不再跟着冻住等 120 毫秒：这一段键盘变化的第一帧就贴到键盘上面，
            //   这一段里后面的几步先停在那儿（不一步一步跟），停下来再放开一次；下面几层照旧一直冻着。停下来的判定 120 → 60 毫秒。
            const KB_SETTLE_MS=60;
            function openMasks(){
                const ms=[...document.querySelectorAll('.mask')].filter(m=>m.style.display==='flex');
                ms.sort((a, b)=>(parseInt(getComputedStyle(a).zIndex)||0)-(parseInt(getComputedStyle(b).zIndex)||0) || (a.compareDocumentPosition(b) & 4 ? -1 : 1));
                return ms;
            }
            let holdH=0, settleT=null, firstH=0;
            function holdTopAt(h){ const ms=openMasks(), m=ms[ms.length-1]; if(!m || m.classList.contains('kb-hold')) return;
                const sh=m.querySelector('.sheet') || m.firstElementChild;
                if(sh){ const mx=getComputedStyle(sh).maxHeight; if(/px$/.test(mx)) m.style.setProperty('--hold-max', Math.round(parseFloat(mx))+'px'); }
                m.style.setProperty('--hold-h', h+'px'); m.classList.add('kb-hold'); }
            function holdAll(h, skipTop){ const all=openMasks(), topM=all[all.length-1]; all.forEach(m=>{ if(m.classList.contains('kb-hold') || (skipTop && m===topM)) return;
                const sh=m.querySelector('.sheet') || m.firstElementChild;
                // 面板的最高高度原来按屏幕百分比算，屏幕一缩它也缩：冻住时一起按现在的像素定住
                // 这时屏幕已经缩了（按屏幕百分比算的最高高度也跟着缩了），按比例换回键盘动之前的高度
                if(sh){ const mx=getComputedStyle(sh).maxHeight, cur=(vv && vv.height) || window.innerHeight || h;
                    m.style.setProperty('--hold-max', /px$/.test(mx) ? Math.round(parseFloat(mx)/cur*h)+'px' : Math.round(h*0.88)+'px'); }
                m.style.setProperty('--hold-h', h+'px'); m.classList.add('kb-hold'); }); }
            function releaseTop(shrunk){
                const ms=openMasks();
                if(!shrunk){ document.querySelectorAll('.mask.kb-hold').forEach(m=>m.classList.remove('kb-hold')); return; }
                const top=ms[ms.length-1]; if(top) top.classList.remove('kb-hold');
            }
            window.__kbHoldInfo=()=>({ holdH, held:[...document.querySelectorAll('.mask.kb-hold')].map(m=>m.id) });   // 给测试用

            if(vv){
                let baseH = vv.height, lastH = vv.height;
                vv.addEventListener('resize', ()=>{
                    const shrunk = (baseH - vv.height) > 120;   // 可视区明显变矮 = 键盘弹起
                    if(!settleT){ holdH=Math.round(lastH); holdAll(holdH, true); firstH=Math.round(vv.height); }   // 这一轮刚开始变：下面几层按变之前的高度冻住（先冻再改 kb-open，免得量到变了以后的高度）；最上面那层这一帧直接贴到键盘上
                    else holdTopAt(firstH);   // 这一轮后面几步：最上面那层先停在第一帧的位置，等停下来再放开
                    document.body.classList.toggle('kb-open', shrunk);
                    lastH=vv.height;
                    clearTimeout(settleT);
                    settleT=setTimeout(()=>{ settleT=null; releaseTop(shrunk); if(!shrunk) baseH=vv.height; }, KB_SETTLE_MS);
                });
                window.__relayoutMasks = ()=>{};
            } else {
                window.__relayoutMasks = ()=>{};
            }

            // 打开「记一笔」弹窗：直接、不透明地显示，随后聚焦输入框触发键盘。
            // 全程没有透明帧 → 没有白图。键盘让位由原生 adjustResize 处理。
            window.__openModalAfterKeyboard = function(mask, focusEl){
                const dlg = mask.firstElementChild;
                if(dlg){ dlg.style.opacity = '1'; dlg.style.transition = ''; }
                mask.style.display = 'flex';
                // 1019-O：等面板滑上来的动画走完再聚焦（原来 50 毫秒就聚焦，打开动画和键盘动画一起跑）
                // 1019-Q：滑上来之前上面又盖了一层（放弃确认、文字输入、日期选择、共用面板）就不聚焦了，免得数字键盘弹到那一层上面
                const above=()=>['askMask','txtMask','dtMask','uiSheetMask'].some(id=>{ const e=document.getElementById(id); return e && e!==mask && e.style.display==='flex'; });
                if(focusEl) afterOpenAnim(mask, ()=>{ try{ if(mask.style.display==='flex' && !above()){ if(document.activeElement===focusEl) focusEl.blur(); focusEl.focus(); } }catch(e){} });
            };
        })();

        const PAGE_SIZE = 15;   // 每页条数

        // 【1017-N】右下角的圆钮（账单页清筛选 ✕、账单页和统计页的回到顶部 ↑、统计页回到本月 ✕）
        //   一律照统计页 ✕ 的老规矩（1010-K2）：有动作才出现（滑动、翻页、改筛选、翻月），停下 1.5 秒淡出；
        //   淡出后 pointer-events:none，不挡下面的记录。手指按在圆钮上时不淡出，松开再重新计时。
        const FAB_IDLE=1500;
        function fabWake(el, on){
            if(!el) return;
            clearTimeout(el._fabT);
            el.classList.toggle('show', !!on);
            if(on) el._fabT=setTimeout(()=>el.classList.remove('show'), el._fabIdle || FAB_IDLE);   // 1019-H：分类汇总的滑动提示停 0.8 秒（HINT_IDLE），别的照旧 1.5 秒
        }
        function fabHold(el){
            if(!el) return;
            el.addEventListener('pointerdown', ()=>clearTimeout(el._fabT));
            ['pointerup','pointercancel'].forEach(ev=>el.addEventListener(ev, ()=>{ if(el.classList.contains('show')) fabWake(el, true); }));
        }

        const DEFAULT_CATS = ['未分类', '餐饮', '购物', '转账', '工资', '红包', '其他'];

        const $ = id => document.getElementById(id);
        const loginBox=$('loginBox'), mainBox=$('mainBox'), nowUser=$('nowUser');
        const logoutBtn=$('logoutBtn'), billList=$('billList');
        const billTime=$('billTime'), billMoney=$('billMoney'), billRemark=$('billRemark'), billCat=$('billCat'), billType=$('billType');
        const addBill=$('addBill'), editMask=$('editMask');
        const editTime=$('editTime'), editMoney=$('editMoney'), editRemark=$('editRemark'), editCat=$('editCat'), editType=$('editType');

        // ===== 金额输入过滤：只放行数字和一个小数点，小数最多两位 =====
        function sanitizeMoney(v){
            v = v.replace(/[^\d.]/g, '');          // 去掉数字和点以外的字符
            const i = v.indexOf('.');
            if(i !== -1){                           // 只保留第一个小数点
                v = v.slice(0, i+1) + v.slice(i+1).replace(/\./g, '');
            }
            const p = v.split('.');
            if(p[1] !== undefined) v = p[0] + '.' + p[1].slice(0, 2); // 小数最多两位
            return v;
        }
        document.querySelectorAll('.money-input').forEach(el=>{
            el.addEventListener('input', ()=>{
                const start = el.selectionStart;
                const before = el.value;
                const after = sanitizeMoney(before);
                if(after !== before){
                    el.value = after;
                    // 尽量维持光标位置（删掉了几个字符就回退几位）
                    const delta = before.length - after.length;
                    const pos = Math.max(0, (start||after.length) - delta);
                    try{ el.setSelectionRange(pos, pos); }catch(e){}
                }
            });
        });
        const saveEdit=$('saveEdit'), cancelEdit=$('cancelEdit');
        const archiveSelect=$('archiveSelect'), filterCat=$('filterCat');

        // ===== .dt-input 的 value 垫片 =====
        // 这五个触发框已从 <input readonly> 换成 <div>（原因见 CSS 中 .dt-input 处的长注释）。
        // div 没有 value 属性，而现有代码有十余处直接读写 .value（setDtInput/getDtInput、
        // 筛选草稿的回填与提交等）。与其逐处改调用方，不如在元素上补一个同名属性：
        // 读 → textContent，写 → textContent。空串时 textContent 为空，:empty::before 自动显示占位符。
        // 这样上层代码一行不用动，行为与原 input 完全一致。
        document.querySelectorAll('.dt-input').forEach(el => {
            Object.defineProperty(el, 'value', {
                get(){ return el.textContent; },
                set(v){ el.textContent = (v==null) ? '' : String(v); },
                configurable: true
            });
            // 表单校验里有一处 billTime.focus()。div 继承 HTMLElement.focus，调用不会报错，
            // 但没有 tabindex 时是静默空操作——这正是我们要的：它不可编辑，聚焦本就无事可做。
            // 不加 tabindex，避免把只读展示框带进键盘 Tab 序列。
            // 长按菜单再兜一道。div + user-select:none 已能挡住，这里只是成本极低的双保险。
            el.addEventListener('contextmenu', e => e.preventDefault());
        });

        // 金额规范化：返回 {ok:true, val} 或 {ok:false, why}，why 用于给出对症提示
        function normMoney(raw){
            const n = Number(raw);
            if(!isFinite(n)) return { ok:false, why:'请输入正确的金额数字～' };  // NaN / Infinity
            if(n > 99999999) return { ok:false, why:'金额太大啦，确认一下没多打几个 0？' };  // 上限挡手滑
            const val = Math.round(n * 100) / 100;  // 先对齐到分
            if(val <= 0) return { ok:false, why:'金额要大于 0 哦～' };  // 含 0、负数、以及 0.001 这类四舍五入后归零的值
            return { ok:true, val };
        }

        // 安全数值：把可能是脏数据（null/undefined/""/"abc" 等）的金额转成有限数，
        // 非法一律按 0，避免 NaN 污染整列汇总（导入不规范 JSON 时尤其有用）。
        function safeNum(x){ const n=Number(x); return isFinite(n) ? n : 0; }
        // 对齐到「分」：消除多笔浮点累加的尾差（如 2.9999999 → 3.00）。
        function round2(n){ return Math.round(n*100)/100; }

        // ===== 统计口径（1010-B）=====
        // 一条记录对「收入 / 支出」各贡献多少。所有求和——账单结余、总览、筛选小计、分类汇总、
        // 统计页日历/当月/饼图、AI 导出——一律走这里，不再各处自己写 type==='expense' 判断。
        // 此前这类判断散在 6 处，只要漏改一处，账单页和统计页的数字就会对不上，而且不报错。
        // 标记了 skip（不计入收支：信用卡还款、内部转账等）的记录贡献为 0：照常显示，不进任何统计。
        // skip 只认严格的 true，旧数据没有这个字段，行为与之前完全一致。
        //
        // 【1010-C】口径分三种：
        //   normal 计入    ：收支统计、结余都算（默认；旧数据没有任何标记即为此）
        //   flow   只算结余：资金往来——期初存款、垫付报销、借出借入、退还父母。钱真实进出了账户，
        //                    结余要算；但它既不是收入也不是消费，收支统计不算。
        //   skip   不计入  ：重复记录——信用卡还款（消费在刷卡时已经记过）。收支、结余都不算。
        // 两个字段互斥，都只认严格的 true；同时存在时 skip 优先。
        function isSkip(r){ return !!(r && r.skip===true); }
        function isFlow(r){ return !!(r && r.flow===true && r.skip!==true); }
        function recMode(r){ return isSkip(r) ? 'skip' : (isFlow(r) ? 'flow' : 'normal'); }
        // 就地改 r：只能用在新对象上（账本缓存里的记录是冻结的，要改先 Object.assign({}, r) 换一个）
        function setRecMode(r, mode){
            delete r.skip; delete r.flow;
            if(mode==='skip') r.skip=true; else if(mode==='flow') r.flow=true;
        }
        // HTML 转义，防止备注/名称里的特殊字符破坏页面
        function escapeHtml(s){
            return String(s).replace(/[&<>"']/g, c => ({
                '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
            }[c]));
        }
        function fillSelect(sel, cats, selected){
            sel.innerHTML='';
            cats.forEach(c=>{
                const o=document.createElement('option');
                o.value=c; o.textContent=c;
                if(c===selected) o.selected=true;
                sel.appendChild(o);
            });
        }

        function pad(n){ return String(n).padStart(2,'0'); }
        // 当前时刻的规范格式 YYYY-MM-DDTHH:mm
        function nowDtValue(){
            const n=new Date();
            return `${n.getFullYear()}-${pad(n.getMonth()+1)}-${pad(n.getDate())}T${pad(n.getHours())}:${pad(n.getMinutes())}`;
        }

        // ===== 数字自适应字号 =====
        // 带 data-fit 的数字先用 CSS 里的大字号；放不下（scrollWidth > clientWidth）就逐级缩小，
        // 下限 12px。账户结余到 7、8 位时不至于被截断，平时又能用大字撑满格子。
        function fitNums(root){
            if(!root) return;
            root.querySelectorAll('[data-fit]').forEach(el=>{
                el.style.fontSize='';
                let size=parseFloat(getComputedStyle(el).fontSize)||16;
                let guard=0;
                while(el.scrollWidth>el.clientWidth && size>12 && guard++<30){
                    size-=1; el.style.fontSize=size+'px';
                }
            });
        }
        const MODE_HINT={
            normal:'正常计入收支统计和结余',
            flow:'资金往来：期初存款、垫付报销、借出借入等。算进结余，不算收入或支出',
            skip:'重复记录：信用卡还款等（消费在刷卡时已记过）。收支和结余都不算'
        };

        // ============================================================
        // ===== 历史脏数据自检与修复：time 字面量 vs Date 解析不一致 =====
        // ============================================================
        // 背景：旧版导入清洗用 isFinite(new Date(s)) 判定时间是否合法，但 JS 对越界日期
        //   是「静默滚动」而非报错——'2026-02-30T10:30' 会被解析成 3月2日，isFinite 仍为真，
        //   于是这个字符串被原样入库。而本 App 对 r.time 有两套读法：
        //     · 字符串口径（账单列表显示、日期范围筛选 slice(0,10)）→ 认 2月30日
        //     · Date 口径（统计日历、当月汇总、AI 导出）        → 认 3月2日
        //   同一条记录在两个页面落到不同月份，且日期筛选永远匹配不到它实际所在的月。
        //   新版导入已用严格校验堵住入口，但**存量脏数据仍在库里**，故需要这一次性修复。
        //
        // 修复口径：钳制到当月最后一天（2月30 → 2月28/29），而不是跟随 Date 的滚动（→3月2）。
        //   理由：用户记账时想表达的是「二月的这笔支出」，月份归属比具体某天更重要；
        //   滚动会把它推进下个月，直接改变统计页和 AI 导出的月度口径。
        //   月份本身就越界的（如 13 月）无法推断意图，回退为「该年 1 月 1 日 00:00」并单独计数。

        // 判定一条 time 是否「脏」（非规范格式，或解析回来与字面量不一致）
        // ===== 记录时间的唯一解析口 =====
        // r.time 的规范格式是「YYYY-MM-DDTHH:mm」（由 isDirtyTime / repairTime 保证）。
        //
        // 【为什么不直接 new Date(r.time)】按 ES2015+ 规范，这种「日期+时间、不带时区」的串
        //   应当按本地时间解析；现代 WebView 也确实如此。但同一份代码里，calcDay / isDirtyTime
        //   都是手写正则拆字段再 new Date(y, m-1, d)，唯独统计那边直接把字符串丢给 Date——
        //   两套口径并存，等于把「这里依赖引擎按本地时区解析」这个前提藏在了 15 个调用点里。
        //   一旦哪天喂进来的是「YYYY-MM-DD」（纯日期，规范里按 UTC 解析）或带了尾巴，
        //   跨月/跨日的记录就会静默错位一格，还极难复现。
        //   统一走这里：显式按本地时区构造，与 calcDay 同口径，前提写死在一处。
        function parseRecTime(t){
            const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(t||''));
            if(!m) return new Date(t);                       // 兜底：非规范串交回引擎，行为不变
            return new Date(+m[1], +m[2]-1, +m[3], +m[4], +m[5], 0, 0);
        }

        function isDirtyTime(t){
            if(typeof t!=='string') return true;
            const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(t);
            if(!m) return true;
            const y=+m[1], mo=+m[2], d=+m[3], h=+m[4], mi=+m[5];
            const dt=new Date(y, mo-1, d, h, mi, 0, 0);
            return !(dt.getFullYear()===y && dt.getMonth()===mo-1 && dt.getDate()===d
                  && dt.getHours()===h && dt.getMinutes()===mi);
        }

        // 把一条脏 time 修成合法的规范串。修不出来则返回 null（调用方回退为当前时刻）。
        function repairTime(t){
            if(typeof t!=='string') return null;
            const s=t.trim().replace(' ', 'T');          // 兼容「YYYY-MM-DD HH:mm」显示格式
            const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s);   // 宽松：允许尾部有秒/毫秒/时区
            if(!m) return null;
            const y=+m[1];
            let mo=+m[2], d=+m[3], h=+m[4], mi=+m[5];
            if(!isFinite(y) || y<1970 || y>9999) return null;
            if(mo<1 || mo>12) return `${y}-01-01T00:00`;  // 月份越界：意图无从推断，落到该年年初
            const lastDay=new Date(y, mo, 0).getDate();   // 该年该月的最后一天（自动处理闰年）
            d = Math.min(Math.max(d, 1), lastDay);        // 钳制：2月30 → 2月28/29
            h = Math.min(Math.max(h, 0), 23);
            mi= Math.min(Math.max(mi, 0), 59);
            return `${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}`;
        }
        let currentUser = '';
        let currentArchive = '';
        let currentTab = 'ledger';
        let curPage = 1;
        window.JiwenBase = { get currentUser(){ return currentUser; }, set currentUser(v){ currentUser=v; }, get currentArchive(){ return currentArchive; }, set currentArchive(v){ currentArchive=v; }, get currentTab(){ return currentTab; }, set currentTab(v){ currentTab=v; }, get curPage(){ return curPage; }, set curPage(v){ curPage=v; }, $, DEFAULT_CATS, MODE_HINT, PAGE_SIZE, SHEET_MS, addBill, afterOpenAnim, archiveSelect, billCat, billList, billMoney, billRemark, billTime, billType, cancelEdit, editCat, editMask, editMoney, editRemark, editTime, editType, escapeHtml, fabHold, fabWake, fillSelect, filterCat, fitNums, isDirtyTime, isFlow, isSkip, loginBox, logoutBtn, mainBox, normMoney, nowDtValue, nowUser, pad, parseRecTime, recMode, repairTime, round2, safeNum, sanitizeMoney, saveEdit, setRecMode };   // base 模块对外只有这一个入口
})();
