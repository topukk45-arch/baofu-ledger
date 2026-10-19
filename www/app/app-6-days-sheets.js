        function saveDays(list, user){
            try{
                localStorage.setItem(daysKey(user), JSON.stringify(list));
                // 倒数日也在 odBuildPayload 的打包范围内，改完同样要同步（见 saveStoreSafe 处注释）
                if(user===undefined || user===currentUser) odScheduleSync();
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

        // ===== 入口卡显示条数（可配置）=====
        // 【为什么有上限 99】需求是「上不封顶」，但输入框只允许两位数，所以实际天花板就是 99。
        //   这没有削弱需求：入口卡是记账页顶部的一张小卡，真要展示 99 条也早就滚出屏幕了；
        //   而且超出的条目在日子页里一条不少，纯粹是「露多少」的问题，不涉及丢数据。
        const DAYS_CARD_MIN=3, DAYS_CARD_MAX=99, DAYS_CARD_DEFAULT=3;
        function daysCardKey(user){ return `days_card_n_${user!==undefined ? user : currentUser}`; }
        // 读取时也钳一道：localStorage 是用户可改的，别信它写回来的值
        function getDaysCardN(){
            const raw=parseInt(localStorage.getItem(daysCardKey()), 10);
            if(!isFinite(raw)) return DAYS_CARD_DEFAULT;
            return Math.min(Math.max(raw, DAYS_CARD_MIN), DAYS_CARD_MAX);
        }
        function setDaysCardN(n){
            const v=Math.min(Math.max(safeNum(n)|0, DAYS_CARD_MIN), DAYS_CARD_MAX);
            localStorage.setItem(daysCardKey(), String(v));
            return v;
        }

        // ===== 记账页的入口卡 =====
        function renderDaysCard(){
            const box=$('daysEntryRows');
            if(!box) return;
            const list=sortedDays(loadDays());
            if(!list.length){
                // 空态：整行变成添加入口，点一下直接进管理页并弹出添加表单
                box.innerHTML='<div class="days-empty-row" data-day-act="add">＋ 添加你的第一个日子</div>';
                return;
            }
            box.innerHTML=list.slice(0, getDaysCardN()).map(d=>{
                const c=calcDay(d.date);
                return `<div class="days-row" data-day-act="edit" data-day-id="${escapeHtml(d.id)}">`
                    + `<span class="d-name">${d.pin?'<span class="pin">★</span>':''}${escapeHtml(d.name)}</span>`
                    + `<span class="d-right">${dayNumHtml(c,'d')}</span>`
                    + `</div>`;
            }).join('');
        }

        // 入口卡事件委托：点某一条 → 直接编辑它（常用操作不必先进管理页）；点空态 → 去添加
        $('daysEntryRows').addEventListener('click', e=>{
            const el=e.target.closest('[data-day-act]');
            if(!el) return;
            if(el.dataset.dayAct==='add'){ gotoDaysPage(); openDayDialog(null); }
            else if(el.dataset.dayAct==='edit'){ openDayDialog(el.dataset.dayId); }
        });
        $('daysManageBtn').addEventListener('click', gotoDaysPage);

        // ===== 管理页 =====
        // 它是记账页的子页：进入时把 pageLedger 藏起来、pageDays 显示，底部 tab 仍停在「记账」。
        function gotoDaysPage(){
            saveLedgerScroll();   // 1017-F：从「日子」管理页回来也放回原处
            $('pageLedger').style.display='none';
            $('pageDays').style.display='block';
            $('actionBar').style.display='none';    // 子页里不该有「筛选 / 记一笔」
            const tt=$('toTopBtn');        if(tt) tt.classList.remove('show');
            const cf=$('clearFilterFab');  if(cf) cf.classList.remove('show');
            document.body.classList.remove('tab-ledger');   // 去掉为记账页底部常驻条留的内边距
            renderDaysList();
            window.scrollTo(0,0);
        }
        function backFromDaysPage(){
            if(daysSelecting) exitSelectMode();   // 别把选择模式带出这一页
            $('pageDays').style.display='none';
            switchTab('ledger');            // 交回 switchTab 统一处理显隐/底栏/浮钮，别自己拼
            renderDaysCard();               // 可能改过，刷新入口卡
        }
        $('daysBack').addEventListener('click', backFromDaysPage);
        $('daysAdd').addEventListener('click', ()=>openDayDialog(null));

        // ===== 1019-B：底部面板式的弹窗，往下拉 / 返回键关闭走同一个出口 =====
        //   记一笔、修改账单、日子这三个填表的：填过东西（和打开时比变了）先问「放弃这次填写？」，没填过直接关；
        //   别的弹窗直接关（和点它的「关闭 / 取消」一样）。点弹窗里的「关闭 / 取消」按钮照旧直接关，不问。
        const FORM_CLOSE={
            addMask:()=>{ $('addMask').style.display='none'; },
            editMask:()=>closeEditModal(),
            detailMask:()=>closeDetail(),
            refundMask:()=>closeRefund(),
            tplMask:()=>{ $('tplMask').style.display='none'; },
            tplEditMask:()=>closeTplEditor(),
            txtMask:()=>closeText(),
            kpMask:()=>kpClose(),
            catMask:()=>{ $('catMask').style.display='none'; },
            themeMask:()=>{ $('themeMask').style.display='none'; },
            dtMask:()=>closeDtPicker(),   // 和原来返回键一样：直接关，不算「取消」回调
            devImportMask:()=>{ const c=$('devImportClose'); if(c) c.click(); },
            aiExpMask:()=>{ $('aiExpMask').style.display='none'; },
            dayMask:()=>closeDayDialog(),
            dayMgrMask:()=>closeDayMgr(),
            ymMask:()=>{ $('ymMask').style.display='none'; },
        };
        const FORM_ASK=['addMask','editMask','dayMask','tplEditMask','txtMask'];
        const formSnaps={};
        // 表单现在的样子：输入框、日期、选中的标签、开关（打开时记一份，关的时候比一比）
        function formState(id){
            const m=$(id); if(!m) return '';
            const parts=[];
            m.querySelectorAll('input,textarea,select').forEach(e=>parts.push(e.value));
            m.querySelectorAll('.dt-input').forEach(e=>parts.push(e.dataset.day||'', e.dataset.value||'', e.value||'', e.textContent));
            m.querySelectorAll('.cc, .day-switch').forEach(e=>parts.push(e.className));
            return JSON.stringify(parts);
        }
        function formDirty(id){ return formSnaps[id]!=null && formState(id)!==formSnaps[id]; }
        function formBackClose(id){
            const close=FORM_CLOSE[id]; if(!close) return;
            if(!FORM_ASK.includes(id) || !formDirty(id)){ close(); return; }
            customConfirm('填的内容还没保存，关掉就没了。', ()=>{ if($(id).style.display==='flex') close(); },
                '放弃这次填写？', { danger:true, okText:'放弃，关掉', cancelText:'接着填' });
        }
        window.__formDirty=formDirty;   // 给测试用
        Object.keys(FORM_CLOSE).forEach(id=>{
            const m=$(id); if(!m) return;
            const sheet=m.querySelector('.sheet'), grip=m.querySelector('.sheet-grip');
            if(sheet && grip) bindSheetDrag(m, sheet, grip, ()=>{ if(m.style.display==='flex') formBackClose(id); });
            if(FORM_ASK.includes(id)){
                // 一打开就记下表单的样子（打开的代码同步写完值以后，MutationObserver 才回调）
                let was=m.style.display;
                new MutationObserver(()=>{
                    const now=m.style.display;
                    if(now==='flex' && was!=='flex') formSnaps[id]=formState(id);
                    if(now!=='flex'){ delete formSnaps[id]; if(was==='flex' && currentUser) try{ localStorage.removeItem('app_formdraft_'+currentUser); }catch(_){} }   // 1019-F：关掉了，填到一半的草稿不要了
                    was=now;
                }).observe(m, { attributes:true, attributeFilter:['style'] });
            }
        });

        // ===== 系统返回键 / 侧滑返回 =====
        // 【问题】日子管理页是「记账页的子页」——只是把 pageLedger 藏起来、pageDays 显示，
        //   并没有产生任何浏览器历史。安卓的返回手势只认 WebView 的 history，看不到这层 UI 状态，
        //   于是直接把唯一那条历史 pop 掉 —— 表现为「在子页里侧滑返回，整个 App 退了」。
        //   同理，所有弹窗（修改、日期选择、分类管理…）在返回键眼里也都不存在。
        //
        // 【做法：单哨兵】不去维护一个跟 UI 状态一一对应的真实历史栈——那种做法要在每个
        //   open/close 里配对 push/back，漏一次就错位，且用户连点返回时时序无法保证。
        //   这里只压**一条**哨兵历史：只要「有任何东西可以被关掉」，就保证哨兵在。
        //   返回键触发 popstate → 关掉最上面那一层 → 若还有东西开着，把哨兵补回去。
        //   UI 状态是唯一事实来源，历史只是个「拦一下返回键」的钩子，二者不需要同步。
        //
        // 【层级顺序】必须按**视觉最上层**先关，否则会出现「返回键关掉了被盖住的那个」。
        //   顺序直接对应上面 CSS 里写死的 z-index：
        //   askMask(1010) > dtMask(1005) > aiExpMask(1002) > editMask(1001,over-detail)
        //   > detailMask(1000) > 其余同级弹窗(999) > 筛选浮层 > 日子子页。
        (function(){
            const SENTINEL='__back_guard__';

            function isOpen(id){
                const el=$(id);
                if(!el) return false;
                const d=el.style.display;
                // 弹窗用 display:flex 显示、none 隐藏；空串表示「没被显式设过」= 未显示
                return d!=='none' && d!=='';
            }
            function hide(id){ const el=$(id); if(el) el.style.display='none'; }

            // 从上到下的可关闭层，顺序**必须**与 CSS 里的 z-index 阶梯一致，
            // 否则会出现「返回键关掉了被盖住的那个」。一次返回只关一层。
            //
            // 【askMask 要拆成两条】它身兼二职（见 CSS 注释）：
            //   - 当提示/确认用（无 .as-page，z1040）：最顶层，第一个关。
            //   - 当内容页用（有 .as-page，z1010，即批量确认清单）：它上面还压着详情，
            //     必须排到 detailMask/editMask **之后**才关，否则会先把清单关掉、
            //     把详情孤零零留在屏幕上。
            function askIsPrompt(){ return isOpen('askMask') && !askMask.classList.contains('as-page'); }
            function askIsPage(){   return isOpen('askMask') &&  askMask.classList.contains('as-page'); }

            const LAYERS=[
                // 1040 提示/确认：走 closeAsk(null)，等价于「取消」，会触发它自己的 onCancel
                // 1019-P 数字键盘（盖在一切上面）：返回键先收它，数字留着
                { can:()=>isOpen('kpMask'),     close:()=>kpClose() },
                { can:askIsPrompt,              close:()=>closeAsk(null) },
                // 1019-O 文字输入的小面板（盖在记一笔、修改等上面）
                { can:()=>isOpen('txtMask'),    close:()=>formBackClose('txtMask') },
                // 1017-UI1 底部选择 / 确认面板（JiwenSheet，z1000 的 sheet-mask，盖在导入页上面）：返回键等于「取消 / 再看看 / 继续导入」，写入中不关
                { can:()=>!!(window.JiwenSheet && window.JiwenSheet.isOpen()), close:()=>window.JiwenSheet.back() },
                // 1016-B 导入页（整页，盖在别的页面上面）：里面先关哪一层（行详情 → 进度 → 整页）由它自己定
                { can:()=>!!(window.JiwenImportUI && window.JiwenImportUI.canBack()), close:()=>window.JiwenImportUI.back() },
                // 1035 日期时间选择器
                { can:()=>isOpen('dtMask'),     close:()=>formBackClose('dtMask') },
                // 1032 退款弹窗（从修改账单里打开）
                { can:()=>isOpen('refundMask'), close:()=>formBackClose('refundMask') },
                // 1030 详情里点进来的「修改」：必须走唯一出口（closeEditModal），
                //      否则 editId / over-detail 等状态复位不掉；1019-B 起填过东西先问一句
                { can:()=>isOpen('editMask'),   close:()=>formBackClose('editMask') },
                // 1020 账单详情
                { can:()=>isOpen('detailMask'), close:()=>formBackClose('detailMask') },
                // 1010 批量确认清单（askMask 当内容页用）—— 排在详情之后
                { can:askIsPage,                close:()=>closeAsk(null) },
                { can:()=>isOpen('aiExpMask'),  close:()=>formBackClose('aiExpMask') },
                { can:()=>isOpen('devImportMask'), close:()=>formBackClose('devImportMask') },
                // 1000 普通表单弹窗，互不叠加
                { can:()=>isOpen('dayMask'),    close:()=>formBackClose('dayMask') },
                { can:()=>isOpen('dayMgrMask'), close:()=>formBackClose('dayMgrMask') },
                { can:()=>isOpen('catMask'),    close:()=>formBackClose('catMask') },
                { can:()=>isOpen('tplEditMask'), close:()=>formBackClose('tplEditMask') },
                { can:()=>isOpen('tplMask'),    close:()=>formBackClose('tplMask') },
                { can:()=>isOpen('themeMask'),  close:()=>formBackClose('themeMask') },
                // 统计页的年月选择器。它和 dtMask 是两套独立实现，别忘了这一个
                // —— 漏掉的后果不是"关不掉"，而是 handleBack 返回 false、
                // Capacitor 直接 exitApp()：选择器开着时按返回键会退出整个 App。
                { can:()=>isOpen('ymMask'),     close:()=>formBackClose('ymMask') },
                { can:()=>isOpen('addMask'),    close:()=>formBackClose('addMask') },
                // 筛选浮层是 class 驱动（.open），不是 display
                { can:()=>{ const m=$('filterSheetMask'); return !!m && m.classList.contains('open'); },
                  close:()=>{ if(window.closeFilterSheet) window.closeFilterSheet(); } },
                // 选择模式排在子页之前：返回键先退出选择、**留在日子页**，
                // 而不是带着一堆勾选状态直接跳回记账页。
                { can:()=>daysSelecting, close:()=>exitSelectMode() },
                // 最后才是子页：前面全关完了，返回键才把日子页收回记账页
                { can:()=>{ const p=$('pageDays'); return !!p && p.style.display==='block'; },
                  close:()=>backFromDaysPage() },
            ];

            function topLayer(){ return LAYERS.find(l=>{ try{ return l.can(); }catch(_){ return false; } }); }
            function anyOpen(){ return !!topLayer(); }

            // 只要有东西开着，就确保哨兵在栈里；全关完了就不再补——
            // 此时再按返回键就该正常退出 App（用户的预期本来就是这样）。
            function ensureSentinel(){
                if(!anyOpen()) return;
                // 不用 history.state?.g —— 全文都刻意避开可选链（同样的理由：迁就老 WebView）
                const st=history.state;
                if(!st || st.g!==SENTINEL){
                    history.pushState({ g:SENTINEL }, '');
                }
            }

            // 【真正的关键：安卓上返回手势根本不走 popstate】
            //   在 Capacitor 里，硬件返回键/侧滑返回先交给**原生层**。默认行为是直接
            //   finish() 掉 Activity —— 也就是退出 App，WebView 的 history 压根没被碰。
            //   所以只监听 popstate 是不够的：它在浏览器里测得好好的，装到手机上却毫无反应，
            //   因为那个事件从来没被触发过。
            //
            //   正确做法是同时接住原生的 backButton 事件。两条路都绑，谁先到算谁的：
            //   - 有 Capacitor App 插件 → 走 backButton（安卓真机的实际路径）
            //   - 没有插件 / 纯浏览器调试 → 走 popstate（哨兵机制照旧）
            //   handleBack 是唯一的处理入口，两条路复用同一套层级逻辑，不会有两套行为。
            let backLock=false;   // 防抖：两条路都触发时别关掉两层
            function handleBack(){
                sheetGhostsFinish();                 // 1019-N：还在滑走的面板立刻收完，再收下一层
                if(backLock) return true;
                const l=topLayer();
                if(!l) return false;                 // 没东西可关 → 让调用方决定（退出 App）
                backLock=true;
                try{ l.close(); }catch(_){}
                setTimeout(()=>{ backLock=false; }, 120);
                ensureSentinel();                    // 下面还压着别的就把哨兵补回去
                return true;                         // 已消费掉这次返回
            }

            window.addEventListener('popstate', ()=>{
                if(!handleBack()) return;            // 没东西可关 → 放行，正常退出
            });

            // Capacitor 原生返回键。插件不一定存在（纯 HTML 项目里 Plugins.App 可能没打进来），
            // 所以全程防御式取值，取不到就静默降级到上面的 popstate。
            (function bindNativeBack(){
                function tryBind(){
                    const cap=window.Capacitor;
                    if(!cap || !cap.Plugins || !cap.Plugins.App) return false;
                    cap.Plugins.App.addListener('backButton', ()=>{
                        if(handleBack()) return;     // 关掉一层，吃掉这次返回
                        // 没东西可关：不在子页、不在弹窗 → 才真的退出 App
                        try{ cap.Plugins.App.exitApp(); }catch(_){}
                    });
                    return true;
                }
                if(tryBind()) return;
                // 插件可能比这段脚本晚就绪，等一拍再试；仍失败就认了（浏览器里本就没有）
                document.addEventListener('deviceready', tryBind, { once:true });
                setTimeout(tryBind, 800);
            })();

            // 【为什么用轮询而不是在每个 open() 里手动 push】
            //   弹窗的打开入口散在几十处（按钮、事件委托、校验失败自动弹 ask…），
            //   逐个去插 pushState 必漏，而且漏了不报错——只在某条冷门路径上返回键失灵。
            //   这里反过来：不管谁、怎么把弹窗打开的，只要它「显示出来了」，
            //   下一帧就自动补上哨兵。UI 是事实，代码只负责跟上。
            //   250ms 一次、只做几个 style.display 读取，开销可以忽略。
            //   后台时跳过：切走后没有 UI 变化，轮询没有意义，也免得被系统判定为后台活动频繁。
            setInterval(()=>{ if(document.visibilityState==='visible') ensureSentinel(); }, 250);
            document.addEventListener('click', ()=>setTimeout(ensureSentinel, 0), true);
        })();

        // ===== 日子管理弹窗 =====
        const dayMgrMask=$('dayMgrMask'), dmCount=$('dmCount');

        // 只放行数字。参照 sanitizeMoney 的做法：不用 <input type=number>
        //  —— 它在安卓 WebView 上仍能通过键盘/粘贴塞进 'e'、'+'、'-'，而且拿到的 value 会是空串，
        //     校验反而更难写。用 text + inputmode=numeric：手机照样弹数字键盘，
        //     同时这里手工过滤，粘贴、长按输入法、物理键盘三条路径全都拦住。
        function sanitizeCount(v){
            return String(v||'').replace(/[^\d]/g, '').slice(0, 2);   // 只留数字，最多两位
        }
        dmCount.addEventListener('input', ()=>{
            const s=sanitizeCount(dmCount.value);
            if(dmCount.value!==s) dmCount.value=s;   // 只在真被改动时写回，避免打断光标
        });
        // 【不在 input 里钳到 3】用户想输 12，必然先经过「1」这个中间态；
        //   当场纠正成 3 会让人根本没法往下打。钳制只在失焦和保存时做。
        dmCount.addEventListener('blur', ()=>{ dmCount.value=String(clampCount(dmCount.value)); });
        function clampCount(v){
            const n=parseInt(sanitizeCount(v), 10);
            if(!isFinite(n)) return DAYS_CARD_DEFAULT;
            return Math.min(Math.max(n, DAYS_CARD_MIN), DAYS_CARD_MAX);
        }

        function openDayMgr(){
            dmCount.value=String(getDaysCardN());
            // 没有日子时，「批量删除」无意义，禁用掉而不是让人点进去看空列表
            const has=loadDays().length>0;
            $('dmBatch').disabled=!has;
            $('dmBatch').textContent = has ? '批量删除日子' : '批量删除日子（暂无日子）';
            // 走既有的键盘安全打开口：不留透明帧、不抢在绘制前聚焦。
            // 但这里不自动 focus —— 一进来就弹键盘会盖住下面的「批量删除」按钮，
            // 用户多半只是想点它。要改条数的人自己点输入框即可。
            window.__openModalAfterKeyboard(dayMgrMask, null);
        }
        function closeDayMgr(){
            dmCount.blur();               // 收键盘，避免弹窗关了键盘还杵着
            dayMgrMask.style.display='none';
        }
        $('daysManage').addEventListener('click', openDayMgr);
        $('dmClose').addEventListener('click', closeDayMgr);
        $('dmSave').addEventListener('click', ()=>{
            const n=clampCount(dmCount.value);
            setDaysCardN(n);
            closeDayMgr();
            renderDaysCard();             // 入口卡立刻按新条数重绘
            customAlert(`入口卡将显示最多 ${n} 条日子`);
        });
        // 批量删除：先关掉弹窗，再把列表原地切成选择模式（不叠层）
        $('dmBatch').addEventListener('click', ()=>{
            closeDayMgr();
            enterSelectMode();
        });

        // ===== 选择模式（批量删除）=====
        let daysSelecting=false;
        const daysSel=new Set();   // 选中的 id

        function enterSelectMode(){
            daysSelecting=true;
            daysSel.clear();
            document.body.classList.add('days-selecting');
            $('daysHeadNormal').style.display='none';
            $('daysHeadSelect').style.display='flex';
            renderDaysList();
            syncSelBar();
        }
        function exitSelectMode(){
            daysSelecting=false;
            daysSel.clear();
            document.body.classList.remove('days-selecting');
            $('daysHeadNormal').style.display='flex';
            $('daysHeadSelect').style.display='none';
            renderDaysList();
        }
        function toggleDaySel(id){
            if(daysSel.has(id)) daysSel.delete(id); else daysSel.add(id);
            renderDaysList();
            syncSelBar();
        }
        // 头部计数 + 底部删除按钮，统一在这里同步（别在三个地方各写一遍）
        function syncSelBar(){
            const n=daysSel.size;
            const total=loadDays().length;
            $('daysSelCount').textContent=`已选 ${n} 项`;
            $('daysSelAll').textContent = (n>0 && n===total) ? '取消全选' : '全选';
            const btn=$('daysDelBtn');
            btn.disabled = n===0;
            btn.textContent = `删除选中的 ${n} 项`;
        }
        $('daysSelCancel').addEventListener('click', exitSelectMode);
        $('daysSelAll').addEventListener('click', ()=>{
            const list=loadDays();
            if(daysSel.size===list.length) daysSel.clear();       // 已全选 → 取消全选
            else list.forEach(d=>daysSel.add(d.id));
            renderDaysList();
            syncSelBar();
        });
        $('daysDelBtn').addEventListener('click', ()=>{
            const n=daysSel.size;
            if(!n) return;
            // 二次确认：批量删除不可撤销，不能一下就没了
            customConfirm(`删除选中的 ${n} 个日子，删掉的找不回来。`, ()=>{
                const left=loadDays().filter(d=>!daysSel.has(d.id));
                saveDays(left);
                exitSelectMode();      // 内部会 renderDaysList
                renderDaysCard();      // 入口卡同步
                customAlert(`已删除 ${n} 个日子`);
            }, '批量删除', { danger:true, okText:`删除这 ${n} 个日子` });
        });

        function renderDaysList(){
            const box=$('daysList'), empty=$('daysEmpty');
            const list=sortedDays(loadDays());
            if(!list.length){
                box.innerHTML='';
                empty.style.display='block';
                if(daysSelecting) exitSelectMode();   // 全删光了就自动退出选择模式
                return;
            }
            empty.style.display='none';
            box.innerHTML=list.map(d=>{
                const c=calcDay(d.date);
                const on=daysSel.has(d.id);
                // 勾选圈平时 display:none（由 body.days-selecting 控制显隐），
                // 所以常态下这段 DOM 是不可见的、不影响布局，不必分两套模板。
                return `<div class="day-item${d.pin?' pinned':''}${on?' sel':''}" data-day-id="${escapeHtml(d.id)}">`
                    + `<div class="di-check">${on?'✓':''}</div>`
                    + `<div class="di-l">`
                    +   `<div class="di-name">${d.pin?'<span class="pin">★置顶</span>':''}${escapeHtml(d.name)}</div>`
                    +   `<div class="di-date">${escapeHtml(fmtDayDate(d.date))}</div>`
                    + `</div>`
                    + `<div class="di-r">${dayNumHtml(c,'di')}</div>`
                    + `</div>`;
            }).join('');
        }
        // 管理页列表：事件委托（与账单表格/明细行同一套模式，不写内联 onclick）
        // 选择模式下改为「点行 = 勾选/取消」，不再进编辑——同一个 DOM，两种语义。
        $('daysList').addEventListener('click', e=>{
            const el=e.target.closest('[data-day-id]');
            if(!el) return;
            if(daysSelecting) toggleDaySel(el.dataset.dayId);
            else openDayDialog(el.dataset.dayId);
        });

        // ===== 编辑/添加弹窗 =====
        let dayEditId=null;   // null = 新增
        const dayMask=$('dayMask'), dayName=$('dayName'), dayDate=$('dayDate'), dayPin=$('dayPin');

        function todayStr(){
            const n=new Date();
            return `${n.getFullYear()}-${pad(n.getMonth()+1)}-${pad(n.getDate())}`;
        }
        // 预览行：实时告诉用户这个日期会显示成什么，省得存完才发现方向反了
        function updateDayPreview(){
            const s=dayDate.dataset.day || '';
            const el=$('dayPreview');
            if(!isValidDay(s)){ el.textContent='请选择一个目标日期'; return; }
            const c=calcDay(s);
            if(c.state==='today')      el.textContent='就是今天 —— 将显示为「就是今天」';
            else if(c.state==='future') el.textContent=`该日在今天之后 → 将显示为「还有 ${c.n} 天」`;
            else                        el.textContent=`该日在今天之前 → 将显示为「已经 ${c.n} 天」`;
        }
        function setDayDate(s){
            dayDate.dataset.day=s||'';
            dayDate.value = s ? fmtDayDate(s) : '';
            updateDayPreview();
        }
        // 复用现有的纯日期选择器（openDtPickerDate），不另造一个
        dayDate.addEventListener('click', ()=>{
            openDtPickerDate(dayDate.dataset.day || todayStr(), (day)=>setDayDate(day));
        });
        dayPin.addEventListener('click', ()=>dayPin.classList.toggle('on'));

        function openDayDialog(id){
            dayEditId = id || null;
            const list=loadDays();
            const rec = dayEditId ? list.find(d=>d.id===dayEditId) : null;
            if(dayEditId && !rec){ customAlert('这个日子不存在了'); return; }

            $('dayDlgTitle').textContent = rec ? '编辑日子' : '添加日子';
            dayName.value = rec ? rec.name : '';
            setDayDate(rec ? rec.date : todayStr());
            dayPin.classList.toggle('on', !!(rec && rec.pin));
            $('dayDelete').style.display = rec ? 'block' : 'none';
            dayMask.style.display='flex';
        }
        function closeDayDialog(){
            dayMask.style.display='none';
            dayEditId=null;
        }
        $('dayCancel').addEventListener('click', closeDayDialog);

        $('daySave').addEventListener('click', ()=>{
            const name=dayName.value.trim();
            const date=dayDate.dataset.day || '';
            if(!name){ customAlert('给这个日子起个名字吧～'); return; }
            if(charLen(name) > 8){ customAlert('名称最多 8 个字～'); return; }
            if(!isValidDay(date)){ customAlert('请选择一个目标日期～'); return; }

            const list=loadDays();
            const pin=dayPin.classList.contains('on');
            if(dayEditId){
                const i=list.findIndex(d=>d.id===dayEditId);
                if(i<0){ closeDayDialog(); customAlert('这个日子不存在了，可能已被删除。'); renderDaysAll(); return; }
                list[i]={ ...list[i], name, date, pin };
            } else {
                list.push({ id:genId(), name, date, pin });
            }
            if(!saveDays(list)) return;    // 写失败已提示，保持弹窗开着别关
            closeDayDialog();
            renderDaysAll();
        });

        $('dayDelete').addEventListener('click', ()=>{
            const id=dayEditId;
            if(!id) return;
            const rec=loadDays().find(d=>d.id===id);
            customConfirm(`删除日子「${rec?rec.name:''}」，删掉的找不回来。`, ()=>{
                const list=loadDays().filter(d=>d.id!==id);
                if(!saveDays(list)) return;
                closeDayDialog();
                renderDaysAll();
            }, '删除日子', { danger:true, okText:'删除这个日子' });
        });

        // 数据变更后统一刷新两处视图（入口卡 + 管理页，管理页没显示时刷了也无害）
        function renderDaysAll(){
            renderDaysCard();
            if($('pageDays').style.display!=='none') renderDaysList();
        }

