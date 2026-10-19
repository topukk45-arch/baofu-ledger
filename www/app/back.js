(function(){
        const { $ } = window.JiwenBase;   // 用到前面模块的
        const { kpClose } = window.JiwenKeypad;   // 用到前面模块的
        const { closeText } = window.JiwenText;   // 用到前面模块的
        const { bindSheetDrag, sheetGhostsFinish } = window.JiwenPanel;   // 用到前面模块的
        const { askMask, closeAsk, customConfirm } = window.JiwenAsk;   // 用到前面模块的
        const { closeDtPicker } = window.JiwenDate;   // 用到前面模块的
        const { closeEditModal, closeRefund, closeTplEditor, formSnaps, formState } = window.JiwenForms;   // 用到前面模块的
        const { closeDetail } = window.JiwenStats;   // 用到前面模块的
        const { closeDayDialog, closeDayMgr, exitSelectMode } = window.JiwenDays;   // 用到前面模块的
        const { backFromDaysPage } = window.JiwenTabs;   // 用到前面模块的

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
                    if(now!=='flex'){ delete formSnaps[id]; if(was==='flex' && JiwenBase.currentUser) try{ localStorage.removeItem('app_formdraft_'+JiwenBase.currentUser); }catch(_){} }   // 1019-F：关掉了，填到一半的草稿不要了
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
                { can:()=>JiwenDays.daysSelecting, close:()=>exitSelectMode() },
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
        window.JiwenBack = {  };   // back 模块对外只有这一个入口
})();
