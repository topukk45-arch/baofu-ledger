        // 1016-T：导入结果页「接下来」的三个去处（import/ui.js 调）：去看统计、去设预算、补一笔期初余额（只算结余的收入）
        window.JiwenImportNext={
            stats(){ const b=document.querySelector('.tab-btn[data-tab="stats"]'); if(b) b.click(); setStatTab('flow'); },
            budget(){ JiwenStats.bgSuggestOpen=true; const b=document.querySelector('.tab-btn[data-tab="stats"]'); if(b) b.click(); setStatTab('budget'); },   // 1016-Z9：直接打开预算建议
            opening(){
                const b=document.querySelector('.tab-btn[data-tab="ledger"]'); if(b) b.click();
                openAddModal();
                const inc=[...$('billTypeChips').children].find(x=>x.textContent==='收入'); if(inc) inc.click();
                setModeChips($('billMode'), 'flow');
                billRemark.value='期初余额';
            }
        };
        // ============================================================
        // ===== 底部标签切换 =====
        // ============================================================
        // 默认进入页面（存全局偏好，所有用户共用此设置）
        // 1019-L：多一个「上次停留的页面」（存 'last'）：选它才回到上次的页签、页码、滚动位置（resumeTake）；
        //   别的选项永远照设置进（原来 1019-F 不管设置、2 小时内都回到上次的页面，把设置盖掉了）
        function getDefaultTabPref(){
            const v=localStorage.getItem('app_default_tab');
            return (v==='stats'||v==='ledger'||v==='settings'||v==='last') ? v : 'ledger';
        }
        function getDefaultTab(){ const v=getDefaultTabPref(); return v==='last' ? 'ledger' : v; }
        function setDefaultTab(v){ localStorage.setItem('app_default_tab', v); snapDrop(); }   // 1019-U：打开时进哪页变了，快照作废

        // 记一笔按钮位置偏好（全局，左撇子可设为「左」）。默认 right=记一笔在右、筛选在左。
        function getAddSide(){
            const v=localStorage.getItem('app_add_side');
            return (v==='left'||v==='right') ? v : 'right';
        }
        function setAddSide(v){ localStorage.setItem('app_add_side', v); }
        // 应用到底部操作栏：选「左」时整行 row-reverse，记一笔挪到左、筛选挪到右
        function applyAddSide(){
            const bar=$('actionBar');
            if(bar) bar.style.flexDirection = (getAddSide()==='left') ? 'row-reverse' : 'row';
        }

        // 收支按钮顺序偏好（左撇子可设为「收入在左」）。默认 out=支出在左、收入在右。
        function getIoSide(){
            const v=localStorage.getItem('app_io_side');
            return (v==='out'||v==='in') ? v : 'out';
        }
        function setIoSide(v){ localStorage.setItem('app_io_side', v); }
        // 应用到记一笔/修改账单弹窗的收支标签：选「收入在左」时 row-reverse 对调左右
        function applyIoSide(){
            const rev = getIoSide()==='in';
            ['billTypeChips','editTypeChips'].forEach(id=>{
                const box=$(id); if(box) box.classList.toggle('io-rev', rev);
            });
        }
        // ===== 1019-F：切到后台被系统杀掉，回来看不出来 =====
        //   切到后台（visibilitychange hidden / pagehide / 原生 pause）时，把停在哪个页签、账单页第几页、滚到哪，
        //   和记一笔 / 修改账单填到一半的（和打开时比变了才算）存在这台手机的 localStorage（不进备份）；
        //   下次打开 App 自动登录、离开不到 RESUME_MAX_MS（2 小时）就直接回去，填到一半的重新打开接着填。
        //   正常回到前台（没被杀）什么都不用做。表单关掉（保存、取消、放弃）就把它的草稿删掉。
        const RESUME_MAX_MS=2*3600*1000;
        const resumeKey=id=>'app_resume_'+id, formDraftKey=id=>'app_formdraft_'+id;
        // ===== 1019-U：首屏快照 =====
        //   切到后台时（resumeSave）把打开 App 时会看到的那一页原样存一份：只在「现在屏幕上的样子就是下次打开会看到的样子」时存，
        //   对不上（翻到了第 2 页、开着筛选、统计页不在这个月……）就删掉，宁可慢一点也不画错。
        //   账本一改（saveStore）、换账号 / 存档、恢复、导入、撤销、换主题、改默认页都删（snapDrop），下次切后台再存。
        const SNAP_MAX=400000;
        const SNAP_BODY_SKIP=['kb-open','login-mode','days-selecting'];
        function snapDrop(){
            try{ Object.keys(localStorage).forEach(k=>{ if(k.indexOf('app_snap_')===0) localStorage.removeItem(k); }); }catch(_){}
        }
        function snapBootState(tab, pref){
            if($('pageDays') && $('pageDays').style.display!=='none' && $('pageDays').style.display!=='') return false;   // 日子管理页开着
            if(document.getElementById('impPage') && document.getElementById('impPage').offsetParent!==null) return false;
            if(tab==='ledger'){
                if(window.__filterActive && window.__filterActive()) return false;   // 打开时会清掉筛选
                if(pref!=='last' && JiwenBase.curPage!==1) return false;                      // 打开时回第 1 页
                return true;
            }
            if(tab==='stats'){
                if(tab!==JiwenBase.currentTab) return false;   // 统计页不在屏幕上，内容不一定是最新的
                const n=new Date();
                return JiwenStats.statYear===n.getFullYear() && JiwenStats.statMonth===n.getMonth() && JiwenStats.statSelDay==null && JiwenStats.statTab==='flow' && JiwenStats.statMonthCatMode==='expense';
            }
            if(tab==='settings') return tab===JiwenBase.currentTab;
            return false;
        }
        function snapPrune(orig, copy, page){
            const a=orig.querySelectorAll('*'), b=copy.querySelectorAll('*');
            if(a.length!==b.length) return;
            const vh=window.innerHeight||0; if(!vh) return;
            const clipCache=new Map();
            const clipOf=el=>{   // 往上找最近的会把内容裁掉的框（overflow 不是 visible），返回它的下沿；没有就是屏幕下沿
                const p=el.parentElement;
                if(!p || p===page || !page.contains(p)) return vh;
                if(clipCache.has(p)) return clipCache.get(p);
                const cs=getComputedStyle(p);
                const v=(cs.overflowY!=='visible') ? Math.min(p.getBoundingClientRect().bottom, clipOf(p)) : clipOf(p);
                clipCache.set(p, v); return v;
            };
            const drop=[];
            for(let i=0;i<a.length;i++){
                if(!page.contains(a[i]) || a[i]===page) continue;
                const r=a[i].getBoundingClientRect();
                if(r.top > clipOf(a[i]) + 8) drop.push(b[i]);
            }
            drop.forEach(x=>{ if(x.isConnected || x.parentNode) x.remove(); });
        }
        function snapSave(){
            try{
                if(!JiwenBase.currentUser || $('mainBox').style.display!=='block'){ snapDrop(); return; }
                const pref=getDefaultTabPref(), tab=pref==='last' ? JiwenBase.currentTab : pref;
                if(!snapBootState(tab, pref)){ snapDrop(); return; }
                const pageId={ ledger:'pageLedger', stats:'pageStats', settings:'pageSettings' }[tab];
                // 只要主界面（只留要进的那一页）、底栏、记账页的底部操作栏；登录框、各个弹窗（都在 .container 里、都藏着）不要
                const c=document.querySelector('body > .container').cloneNode(false);
                const mb=$('mainBox').cloneNode(true);
                // 只留一屏看得见的：这一页正显示着时，屏幕下沿以下的、框里滚出去看不见的都不要（东西越少，打开时画得越快；
                //   下面那些反正看不见，真的那页画好就换掉了）
                if(tab===JiwenBase.currentTab) snapPrune($('mainBox'), mb, $(pageId));
                mb.querySelectorAll('.tab-page').forEach(pg=>{ if(pg.id!==pageId) pg.remove(); else pg.style.display='block'; });
                const pd=mb.querySelector('#pageDays'); if(pd) pd.remove();
                mb.querySelectorAll('input, textarea').forEach(x=>{ if(x.type!=='checkbox' && x.type!=='radio') x.setAttribute('value', x.value||''); });
                c.appendChild(mb);
                const tb=$('tabBar').cloneNode(true); tb.style.display='flex';
                tb.querySelectorAll('.tab-btn').forEach(b=>b.classList.toggle('active', b.dataset.tab===tab));
                c.appendChild(tb);
                if(tab==='ledger'){ const ab=$('actionBar').cloneNode(true); ab.style.display='flex'; c.appendChild(ab); }
                const html=c.outerHTML;
                if(html.length>SNAP_MAX){ snapDrop(); return; }
                const n=new Date();
                const bodyCls=String(document.body.className||'').split(/\s+/).filter(k=>k && SNAP_BODY_SKIP.indexOf(k)<0)
                    .filter(k=>k!=='tab-ledger' && k!=='tab-stats').concat(tab==='ledger' ? ['tab-ledger'] : tab==='stats' ? ['tab-stats'] : []).join(' ');
                snapDrop();
                localStorage.setItem('app_snap_'+JiwenBase.currentUser, JSON.stringify({ v:1, build:$('loginBuild').textContent, day:`${n.getFullYear()}-${n.getMonth()+1}-${n.getDate()}`,
                    pref, tab, page:JiwenBase.curPage, y:(tab==='ledger' && pref==='last') ? (window.scrollY||document.documentElement.scrollTop||0) : 0,
                    w:window.innerWidth, at:Date.now(), archive:JiwenBase.currentArchive, root:document.documentElement.getAttribute('style')||'', body:bodyCls, html }));
            }catch(_){ snapDrop(); }
        }
        // 真的首屏画好了：下一帧拿掉快照（这一帧真的那页已经排好，拿掉看不出变化）；没有快照时告诉原生层可以收启动画面了
        function snapUnveil(){
            const el=document.getElementById('bootSnap');
            // 1019-X：告诉原生层收启动画面不再等一帧（有快照时早就说过了，这里再说一次没关系）
            try{ const c=window.Capacitor, p=c&&c.Plugins&&c.Plugins.Launch; if(p&&p.ready) p.ready(); }catch(_){}
            const go=()=>{ const x=document.getElementById('bootSnap'); if(x) x.remove(); };
            if(el && window.requestAnimationFrame) requestAnimationFrame(go); else go();
        }
        window.snapSave=snapSave; window.snapDrop=snapDrop;   // 给测试用
        function resumeSave(){
            if(!JiwenBase.currentUser || $('mainBox').style.display!=='block') return;
            saveLedgerScroll();
            try{ localStorage.setItem(resumeKey(JiwenBase.currentUser), JSON.stringify({ tab:JiwenBase.currentTab, page:JiwenBase.curPage, y:ledgerScrollY, archive:JiwenBase.currentArchive, at:Date.now() })); }catch(_){}
            try{
                const f=formDraftNow();
                if(f) localStorage.setItem(formDraftKey(JiwenBase.currentUser), JSON.stringify(Object.assign(f, { archive:JiwenBase.currentArchive, at:Date.now() })));
                else localStorage.removeItem(formDraftKey(JiwenBase.currentUser));
            }catch(_){}
            snapSave();
        }
        function resumeTake(id){
            let r=null;
            try{ r=JSON.parse(localStorage.getItem(resumeKey(id))||'null'); }catch(_){ r=null; }
            if(!r || r.archive!==JiwenBase.currentArchive) return null;
            if(['ledger','stats','settings'].indexOf(r.tab)<0) return null;
            // 1019-L：选了「上次停留」就回到上次的页签（不限多久）；页码、滚动位置只在离开不到 2 小时时放回
            if(!(Date.now()-r.at < RESUME_MAX_MS)) return { tab:r.tab, page:1, y:0 };
            const pages=Math.max(1, Math.ceil(getUserData().length/PAGE_SIZE));
            return { tab:r.tab, page:Math.min(Math.max(1, Math.floor(r.page)||1), pages), y:Math.max(0, +r.y||0) };
        }
        // 记一笔 / 修改账单开着、填过东西：记下填了什么
        function formDraftNow(){
            if($('addMask').style.display==='flex' && window.__formDirty && window.__formDirty('addMask'))
                return { kind:'add', v:{ time:getDtInput(billTime), money:billMoney.value, cat:JiwenForms.billCatSel, type:JiwenForms.billTypeSel, mode:getModeChips($('billMode')), remark:billRemark.value } };
            if(editMask.style.display==='flex' && JiwenForms.editId!=null && window.__formDirty && window.__formDirty('editMask'))
                return { kind:'edit', id:JiwenForms.editId, v:{ time:getDtInput(editTime), money:editMoney.value, cat:JiwenForms.editCatSel, type:JiwenForms.editTypeSel, mode:getModeChips($('editMode')), remark:editRemark.value } };
            return null;
        }
        function formDraftRestore(id){
            let f=null;
            try{ f=JSON.parse(localStorage.getItem(formDraftKey(id))||'null'); }catch(_){ f=null; }
            if(!f || !(Date.now()-f.at < RESUME_MAX_MS) || f.archive!==JiwenBase.currentArchive || !f.v) return;
            const v=f.v, cats=getCats();
            if(f.kind==='add'){
                openAddModal();
                const blank=formState('addMask');
                if(v.time) setDtInput(billTime, v.time);
                billMoney.value=v.money||'';
                const cc=[...$('billCatChips').children].find(c=>c.textContent===v.cat && cats.includes(v.cat)); if(cc) cc.click();
                const tc=[...$('billTypeChips').children].find(c=>c.textContent===(v.type==='expense'?'支出':v.type==='income'?'收入':'')); if(tc) tc.click();
                if(v.mode) setModeChips($('billMode'), v.mode);
                billRemark.value=v.remark||'';
                Promise.resolve().then(()=>{ formSnaps.addMask=blank; });   // 恢复出来的算「填过」，关的时候照样问
            } else if(f.kind==='edit'){
                const rec=getUserData().find(r=>r.id===f.id);
                if(!rec) return;
                window.openEdit(f.id);
                if(editMask.style.display!=='flex') return;
                const blank=formState('editMask');
                if(v.time) setDtInput(editTime, v.time);
                editMoney.value=v.money||'';
                if(!rec.refundOf){   // 退款记录的分类 / 收支 / 口径跟着原账单，不动
                    renderEditCatChips(cats.includes(v.cat) ? v.cat : '');
                    renderEditTypeChips(v.type);
                    if(v.mode) setModeChips($('editMode'), v.mode);
                }
                editRemark.value=v.remark||'';
                Promise.resolve().then(()=>{ formSnaps.editMask=blank; });
            }
        }
        document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='hidden') resumeSave(); });
        window.addEventListener('pagehide', ()=>resumeSave());
        try{ const cap=window.Capacitor; if(cap && cap.Plugins && cap.Plugins.App && cap.Plugins.App.addListener) cap.Plugins.App.addListener('pause', ()=>resumeSave()); }catch(_){}
        // 1017-F：离开账单页时记下滚到哪了，回来放回原处（以前切回来先回到顶上，安卓上还会再自己往下滑一段，看着跳一下）
        let ledgerScrollY=0;
        let tabShownOnce=false;   // 1019-U：打开 App 第一次切页签时不读滚动位置（读了会逼浏览器多排一次版）
        function saveLedgerScroll(){
            if(!tabShownOnce) return;
            const pl=$('pageLedger');
            if(JiwenBase.currentTab==='ledger' && pl && pl.style.display!=='none') ledgerScrollY=window.scrollY||document.documentElement.scrollTop||0;
        }
        function switchTab(tab){
            closeAllCs();   // 收起可能展开的下拉：其面板已传送到 body，切页隐藏容器不会带走它
            saveLedgerScroll();
            tabShownOnce=true;
            JiwenBase.currentTab=tab;
            // 「日子」管理页是记账页的子页，不属于任何 tab。切 tab 时必须把它关掉，
            // 否则从子页点底栏会出现「子页与目标页同时显示」。
            const pd=$('pageDays'); if(pd) pd.style.display='none';
            $('pageLedger').style.display   = tab==='ledger'   ? 'block':'none';
            $('pageStats').style.display    = tab==='stats'    ? 'block':'none';
            $('pageSettings').style.display = tab==='settings' ? 'block':'none';
            // 底部操作栏（筛选 + 记一笔）只在记账页显示
            $('actionBar').style.display = tab==='ledger' ? 'flex':'none';
            if(tab!=='ledger'){
                const tt=$('toTopBtn'); if(tt) tt.classList.remove('show');
                const cf=$('clearFilterFab'); if(cf) cf.classList.remove('show');
            }
            if(tab!=='stats'){ const sf=$('statTodayFab'); if(sf) sf.classList.remove('show'); }
            document.body.classList.toggle('tab-ledger', tab==='ledger');
            document.body.classList.toggle('tab-stats', tab==='stats');
            document.querySelectorAll('.tab-btn').forEach(b=>{
                b.classList.toggle('active', b.dataset.tab===tab);
            });
            // 进入记账页时按当前筛选状态决定清除浮钮显隐
            if(tab==='ledger' && window.syncFilterFab) window.syncFilterFab();
            if(tab==='stats') renderStats();
            if(tab==='settings') renderStorageUse();
            // 切换标签后回到顶部：延到布局完成后执行，避免在 display 切换同帧里失效
            // 1017-F：回到账单页时不回顶上，直接放回离开时的位置（同一帧里放一次、布局完成后再放一次，中间不经过顶上）
            const y = tab==='ledger' ? ledgerScrollY : 0;
            window.scrollTo(0,y);
            requestAnimationFrame(()=>{ window.scrollTo(0,y); document.documentElement.scrollTop=y; if(!y) document.body.scrollTop=0; });
        }
        document.querySelectorAll('.tab-btn').forEach(b=>{
            b.addEventListener('click', ()=>switchTab(b.dataset.tab));
        });

        // 回到顶部：滚动超过一屏且在记账页时显示
        (function(){
            const btn=$('toTopBtn');
            function onScroll(){
                const y = window.scrollY||document.documentElement.scrollTop;
                let show;
                if(JiwenBase.currentTab==='ledger'){
                    // 回顶落点是「账单标题」而非页顶。用标题相对视口的位置判断：标题被滚到视口上方
                    // 一段距离后才显示按钮；回顶到标题处时它 rect.top≈0，不再满足条件 → 按钮消失。
                    const head=$('billHead');
                    if(head){
                        show = head.getBoundingClientRect().top < -60;
                    } else {
                        show = y > 400;
                    }
                } else if(JiwenBase.currentTab==='stats'){
                    show = y > 400;
                } else {
                    show = false;
                }
                fabWake(btn, show);   // 1017-N：滑动时出现，停下 1.5 秒淡出
                // 账单页滑动时 ✕ 也跟着出现、停下一起淡出
                if(JiwenBase.currentTab==='ledger' && window.syncFilterFab) window.syncFilterFab();
            }
            fabHold(btn); fabHold($('clearFilterFab')); fabHold($('statTodayFab'));
            window.addEventListener('scroll', onScroll, {passive:true});
            btn.addEventListener('click', ()=>{
                // 记账页：落到账单标题处（其下方就是翻页条），方便随手翻页——而非滚到整页最顶的「日子」卡片。
                // 其他页（统计）：仍回到整页顶部。
                const head = JiwenBase.currentTab==='ledger' ? $('billHead') : null;
                if(head){ head.scrollIntoView({ behavior:'smooth', block:'start' }); }
                else { window.scrollTo({top:0, behavior:'smooth'}); }
            });
            onScroll();

            // 清除筛选浮钮：一键清空全部筛选并刷新列表
            const clearFab=$('clearFilterFab');
            if(clearFab) clearFab.addEventListener('click', ()=>{ clearAllFilters(); });
        })();

        // 默认进入页面：分段选择器
        (function(){
            const seg=$('defaultTabSeg');
            function paint(){
                const cur=getDefaultTabPref();
                seg.querySelectorAll('button').forEach(b=>b.classList.toggle('on', b.dataset.v===cur));
            }
            seg.querySelectorAll('button').forEach(b=>{
                b.addEventListener('click', ()=>{ setDefaultTab(b.dataset.v); paint(); });
            });
            paint();
        })();

        // 记一笔按钮位置：分段选择器（左/右）
        (function(){
            const seg=$('addSideSeg');
            function paint(){
                const cur=getAddSide();
                seg.querySelectorAll('button').forEach(b=>b.classList.toggle('on', b.dataset.v===cur));
            }
            seg.querySelectorAll('button').forEach(b=>{
                b.addEventListener('click', ()=>{ setAddSide(b.dataset.v); applyAddSide(); paint(); });
            });
            paint();
            applyAddSide();   // 启动即按偏好摆放
        })();

        // 收支按钮顺序：分段选择器（支出在左 / 收入在左）
        (function(){
            const seg=$('ioSideSeg');
            function paint(){
                const cur=getIoSide();
                seg.querySelectorAll('button').forEach(b=>b.classList.toggle('on', b.dataset.v===cur));
            }
            seg.querySelectorAll('button').forEach(b=>{
                b.addEventListener('click', ()=>{ setIoSide(b.dataset.v); applyIoSide(); paint(); });
            });
            paint();
            applyIoSide();   // 启动即按偏好对调
        })();

