        // 1016-T：导入结果页「接下来」的三个去处（import/ui.js 调）：去看统计、去设预算、补一笔期初余额（只算结余的收入）
        window.JiwenImportNext={
            stats(){ const b=document.querySelector('.tab-btn[data-tab="stats"]'); if(b) b.click(); setStatTab('flow'); },
            budget(){ bgSuggestOpen=true; const b=document.querySelector('.tab-btn[data-tab="stats"]'); if(b) b.click(); setStatTab('budget'); },   // 1016-Z9：直接打开预算建议
            opening(){
                const b=document.querySelector('.tab-btn[data-tab="ledger"]'); if(b) b.click();
                openAddModal();
                const inc=[...$('billTypeChips').children].find(x=>x.textContent==='收入'); if(inc) inc.click();
                setModeChips($('billMode'), 'flow');
                billRemark.value='期初余额';
            }
        };

        // 页面初始化逻辑见脚本末尾 initApp()（在所有函数与外观主题就绪后执行）

        // ===== 外观：主题色（全局，所有账号共用，存 localStorage）=====
        (function(){
            const DEFAULT_PRIMARY='#3f6f6b';
            // 预设：每套只给一个主色，其余色由算法从主色推导，保证整体协调
            const PRESETS=[
                { name:'雾松青', color:'#3f6f6b' },
                { name:'素墨米', color:'#8a7f66' },
                { name:'黛紫烟', color:'#6b5a82' },
                { name:'宣纸灰', color:'#5f5b54' },
                { name:'赭石红', color:'#a8553f' },
                { name:'黛蓝', color:'#3a5a7a' },
                { name:'橄榄绿', color:'#6b7245' },
                { name:'豆沙粉', color:'#9c5b63' }
            ];

            // —— 颜色工具：hex<->hsl，按亮度派生整套变量 ——
            function hexToRgb(h){ h=h.replace('#',''); if(h.length===3)h=h.split('').map(c=>c+c).join('');
                return { r:parseInt(h.slice(0,2),16), g:parseInt(h.slice(2,4),16), b:parseInt(h.slice(4,6),16) }; }
            function rgbToHex(r,g,b){ const f=v=>Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,'0'); return '#'+f(r)+f(g)+f(b); }
            function rgbToHsl({r,g,b}){ r/=255;g/=255;b/=255; const mx=Math.max(r,g,b),mn=Math.min(r,g,b); let h,s,l=(mx+mn)/2;
                if(mx===mn){h=s=0;}else{const d=mx-mn; s=l>0.5?d/(2-mx-mn):d/(mx+mn);
                    switch(mx){case r:h=(g-b)/d+(g<b?6:0);break;case g:h=(b-r)/d+2;break;default:h=(r-g)/d+4;}h/=6;}
                return { h:h*360, s:s*100, l:l*100 }; }
            function hslToHex(h,s,l){ h=(h%360+360)%360; s=Math.max(0,Math.min(100,s))/100; l=Math.max(0,Math.min(100,l))/100;
                const c=(1-Math.abs(2*l-1))*s, x=c*(1-Math.abs((h/60)%2-1)), m=l-c/2; let r,g,b;
                if(h<60)[r,g,b]=[c,x,0];else if(h<120)[r,g,b]=[x,c,0];else if(h<180)[r,g,b]=[0,c,x];
                else if(h<240)[r,g,b]=[0,x,c];else if(h<300)[r,g,b]=[x,0,c];else[r,g,b]=[c,0,x];
                return rgbToHex((r+m)*255,(g+m)*255,(b+m)*255); }
            // 相对亮度 & 与白色的对比度（用于兜底压暗）
            function _lum(hex){ const {r,g,b}=hexToRgb(hex); const a=[r,g,b].map(v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);}); return 0.2126*a[0]+0.7152*a[1]+0.0722*a[2]; }
            function _whiteContrast(hex){ const l=_lum(hex); return (1.0+0.05)/(l+0.05); }
            function _contrast(a,b){ const l1=_lum(a),l2=_lum(b); return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05); }

            // 从一个主色推导整套主题变量（保证浅底深字、对比足够）
            function buildPalette(primaryHex){
                let { h,s,l } = rgbToHsl(hexToRgb(primaryHex));
                if(s<12) s=12;                       // 太灰会显脏，给个下限
                // 主色亮度收进可读区间：上限 56
                let pL=Math.min(l,56);
                // 关键兜底：黄/青等高亮色相即使压到 56 白字仍可能发虚，
                // 逐步压暗直到「白字 / 主色」对比≥2.4，保证按钮文字任何选色下都看得清
                let primary=hslToHex(h,s,pL);
                let guard=0;
                while(_whiteContrast(primary) < 2.4 && pL > 20 && guard++ < 40){
                    pL -= 2; primary=hslToHex(h,s,pL);
                }
                const primaryMid=hslToHex(h,Math.min(s+4,90),Math.min(pL+6,60));
                // 主色按钮上的文字：黑/白哪个对主色对比更高就用哪个（比单纯按亮度判断更稳）
                const {r,g,b}=hexToRgb(primary);
                const onPrimary = _contrast(primary,'#ffffff') >= _contrast(primary,'#2a2200')
                    ? '#ffffff' : '#2a2200';
                return {
                    '--c-primary':       primary,
                    '--c-primary-mid':   primaryMid,
                    '--c-primary-dark':  hslToHex(h,Math.min(s+6,90),Math.max(pL-14,26)),
                    '--c-primary-deep':  hslToHex(h,Math.min(s+10,92),Math.max(pL-26,20)),
                    '--c-accent':        hslToHex(h,Math.min(s+20,100),Math.min(pL+10,68)),
                    '--c-accent-soft':   hslToHex(h,Math.min(s+8,80),88),
                    // 底栏重点笔画：同色相、提高饱和度。宣纸灰这类低饱和主题，主色和选中深色几乎一样，
                    // 直接用主色这一笔会看不出来；提饱和后变成赭金 / 亮青这类「同族但跳得出来」的颜色。
                    '--c-tab-accent':    hslToHex(h,Math.min(Math.max(s+28,42),60),44),
                    '--c-text':          hslToHex(h,Math.min(s+8,85),28),
                    '--c-text-soft':     hslToHex(h,Math.min(s+4,70),38),
                    '--c-border':        hslToHex(h,Math.min(s,55),78),
                    '--c-border-mid':    hslToHex(h,Math.min(s+4,60),68),
                    '--c-surface':       hslToHex(h,40,98),
                    '--c-surface-2':     hslToHex(h,45,98.5),
                    '--c-bg':            hslToHex(h,42,96),
                    '--c-card-1':        hslToHex(h,55,95),
                    '--c-card-2':        hslToHex(h,62,88),
                    '--c-sheet':         hslToHex(h,60,91.5),   // 1019-T：底部面板底色（卡片两头渐变色的中间）
                    '--c-chip':          hslToHex(h,70,92),
                    '--c-on-primary':    onPrimary,
                    '--c-shadow-rgb':    `${r},${g},${b}`,
                    // 选中态：底色取中浅染（亮度 82，明显深于未选中的 --c-chip≈92），
                    // 纯色块即可清晰区分，无需边框；文字用深主色保证可读。
                    '--c-sel-bg':        hslToHex(h,Math.min(s+14,74),82),
                    '--c-sel-border':    primary,
                    '--c-sel-text':      hslToHex(h,Math.min(s+10,92),Math.max(pL-22,22))
                };
            }
            function applyPrimary(primaryHex){
                const pal=buildPalette(primaryHex);
                const root=document.documentElement;
                Object.keys(pal).forEach(k=>root.style.setProperty(k, pal[k]));
                // 同步「键盘弹起兜底底色」：把当前主题背景钉到 html inline 背景 + theme-color，
                // 否则换肤后键盘弹起会闪一下旧底色。
                const bg=pal['--c-bg'];
                if(bg){
                    root.style.backgroundColor=bg;
                    let tc=document.querySelector('meta[name="theme-color"]');
                    if(tc) tc.setAttribute('content', bg);
                }
            }

            // —— 读写持久化 ——
            function loadPrefs(){
                try{ return JSON.parse(localStorage.getItem('app_appearance')||'{}'); }catch(_){ return {}; }
            }
            function savePrefs(p){ localStorage.setItem('app_appearance', JSON.stringify(p)); try{ snapDrop(); }catch(_){} }   // 1019-U：换了主题，快照作废

            // —— 弹窗交互 ——
            const themeMask=$('themeMask');
            function renderPresets(activeColor){
                const box=$('themePresets'); box.innerHTML='';
                PRESETS.forEach(p=>{
                    const sw=document.createElement('div');
                    sw.className='theme-swatch';
                    sw.style.background=`linear-gradient(135deg, ${p.color}, ${hslToHex(rgbToHsl(hexToRgb(p.color)).h, rgbToHsl(hexToRgb(p.color)).s, Math.max(rgbToHsl(hexToRgb(p.color)).l-16,22))})`;
                    sw.title=p.name;
                    if(activeColor && p.color.toLowerCase()===activeColor.toLowerCase()) sw.classList.add('active');
                    sw.onclick=()=>{
                        applyPrimary(p.color);
                        const pf=loadPrefs(); pf.primary=p.color; savePrefs(pf);
                        renderPresets(p.color);
                        $('customColor').value=p.color;
                    };
                    box.appendChild(sw);
                });
            }
            function openTheme(){
                const pf=loadPrefs();
                const cur=pf.primary||DEFAULT_PRIMARY;
                $('customColor').value = /^#[0-9a-fA-F]{6}$/.test(cur)?cur:DEFAULT_PRIMARY;
                renderPresets(cur);
                themeMask.style.display='flex';
            }
            $('themeBtn').addEventListener('click', openTheme);
            $('closeTheme').addEventListener('click', ()=>{ themeMask.style.display='none'; });

            $('applyCustomBtn').addEventListener('click', ()=>{
                const c=$('customColor').value;
                applyPrimary(c);
                const pf=loadPrefs(); pf.primary=c; savePrefs(pf);
                renderPresets(c);
            });
            $('resetThemeBtn').addEventListener('click', ()=>{
                applyPrimary(DEFAULT_PRIMARY);
                const pf=loadPrefs(); pf.primary=DEFAULT_PRIMARY; savePrefs(pf);
                $('customColor').value=DEFAULT_PRIMARY;
                renderPresets(DEFAULT_PRIMARY);
            });

            // —— 启动时应用已保存的外观 ——
            const pf=loadPrefs();
            if(pf.primary) applyPrimary(pf.primary);
        })();
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

        // 1016-V：设置里「存储已用 x%」，超过 70% 提醒。按浏览器给这个 App 的配额算（navigator.storage.estimate，账本在 IndexedDB 里）。
        //   这一版只在开发开关开着时显示（入口先不放出去）；拿不到配额时不显示
        const STORAGE_WARN=0.7;
        var __storageSeq=0;
        function renderStorageUse(){
            const my=++__storageSeq;
            let on=false; try{ on=localStorage.getItem('app_dev_import')==='1'; }catch(_){}
            const old=$('storageUse'), oldW=$('storageUseWarn');
            if(!on || !navigator.storage || !navigator.storage.estimate){ if(old) old.remove(); if(oldW) oldW.remove(); return; }
            Promise.resolve().then(()=>navigator.storage.estimate()).then(q=>{
                if(my!==__storageSeq) return;
                // 1019-I：用量挪到设置页最底下、版本号上面，一行灰色小字，只写占用多少，不写百分比、不写上限
                //   （系统给网页的上限很大，写出来像记问要占 10 个 G）；超过上限 70% 才在原来的位置放一张提醒卡，也不提上限数字
                let b=$('storageUse'), w=$('storageUseWarn');
                if(!q || !q.quota){ if(b) b.remove(); if(w) w.remove(); return; }
                const used=q.usage||0, pct=used/q.quota;
                if(!b){
                    b=document.createElement('div'); b.id='storageUse'; b.className='storage-use';
                    const sb=$('setBuild'); sb.parentNode.insertBefore(b, sb);
                }
                b.textContent='';
                const l1=document.createElement('span'); l1.id='storageUsePct';
                l1.textContent=`账本和备份占用约 ${Math.max(used/1048576, used ? 0.1 : 0).toFixed(1)} MB`;
                b.appendChild(l1);
                if(pct>STORAGE_WARN){
                    if(!w){
                        w=document.createElement('div'); w.id='storageUseWarn'; w.className='set-item set-static storage-warn';
                        const anchor=$('devLogsBtn'); anchor.parentNode.insertBefore(w, anchor.nextSibling);
                    }
                    w.textContent='';
                    const t1=document.createElement('b'); t1.textContent='手机存储空间不多了，记问可能存不下新的备份';
                    const t2=document.createElement('span'); t2.textContent='可以先导出备份，再删掉不用的存档或旧的备份。满了以后记账也会存不进去。';
                    w.appendChild(t1); w.appendChild(t2);
                } else if(w) w.remove();
            }).catch(()=>{ if(my===__storageSeq){ const b=$('storageUse'), w=$('storageUseWarn'); if(b) b.remove(); if(w) w.remove(); } });
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
                if(pref!=='last' && curPage!==1) return false;                      // 打开时回第 1 页
                return true;
            }
            if(tab==='stats'){
                if(tab!==currentTab) return false;   // 统计页不在屏幕上，内容不一定是最新的
                const n=new Date();
                return statYear===n.getFullYear() && statMonth===n.getMonth() && statSelDay==null && statTab==='flow' && statMonthCatMode==='expense';
            }
            if(tab==='settings') return tab===currentTab;
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
                if(!currentUser || $('mainBox').style.display!=='block'){ snapDrop(); return; }
                const pref=getDefaultTabPref(), tab=pref==='last' ? currentTab : pref;
                if(!snapBootState(tab, pref)){ snapDrop(); return; }
                const pageId={ ledger:'pageLedger', stats:'pageStats', settings:'pageSettings' }[tab];
                // 只要主界面（只留要进的那一页）、底栏、记账页的底部操作栏；登录框、各个弹窗（都在 .container 里、都藏着）不要
                const c=document.querySelector('body > .container').cloneNode(false);
                const mb=$('mainBox').cloneNode(true);
                // 只留一屏看得见的：这一页正显示着时，屏幕下沿以下的、框里滚出去看不见的都不要（东西越少，打开时画得越快；
                //   下面那些反正看不见，真的那页画好就换掉了）
                if(tab===currentTab) snapPrune($('mainBox'), mb, $(pageId));
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
                localStorage.setItem('app_snap_'+currentUser, JSON.stringify({ v:1, build:$('loginBuild').textContent, day:`${n.getFullYear()}-${n.getMonth()+1}-${n.getDate()}`,
                    pref, tab, page:curPage, y:(tab==='ledger' && pref==='last') ? (window.scrollY||document.documentElement.scrollTop||0) : 0,
                    w:window.innerWidth, at:Date.now(), archive:currentArchive, root:document.documentElement.getAttribute('style')||'', body:bodyCls, html }));
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
            if(!currentUser || $('mainBox').style.display!=='block') return;
            saveLedgerScroll();
            try{ localStorage.setItem(resumeKey(currentUser), JSON.stringify({ tab:currentTab, page:curPage, y:ledgerScrollY, archive:currentArchive, at:Date.now() })); }catch(_){}
            try{
                const f=formDraftNow();
                if(f) localStorage.setItem(formDraftKey(currentUser), JSON.stringify(Object.assign(f, { archive:currentArchive, at:Date.now() })));
                else localStorage.removeItem(formDraftKey(currentUser));
            }catch(_){}
            snapSave();
        }
        function resumeTake(id){
            let r=null;
            try{ r=JSON.parse(localStorage.getItem(resumeKey(id))||'null'); }catch(_){ r=null; }
            if(!r || r.archive!==currentArchive) return null;
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
            if(!f || !(Date.now()-f.at < RESUME_MAX_MS) || f.archive!==currentArchive || !f.v) return;
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
            if(currentTab==='ledger' && pl && pl.style.display!=='none') ledgerScrollY=window.scrollY||document.documentElement.scrollTop||0;
        }
        function switchTab(tab){
            closeAllCs();   // 收起可能展开的下拉：其面板已传送到 body，切页隐藏容器不会带走它
            saveLedgerScroll();
            tabShownOnce=true;
            currentTab=tab;
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
                if(currentTab==='ledger'){
                    // 回顶落点是「账单标题」而非页顶。用标题相对视口的位置判断：标题被滚到视口上方
                    // 一段距离后才显示按钮；回顶到标题处时它 rect.top≈0，不再满足条件 → 按钮消失。
                    const head=$('billHead');
                    if(head){
                        show = head.getBoundingClientRect().top < -60;
                    } else {
                        show = y > 400;
                    }
                } else if(currentTab==='stats'){
                    show = y > 400;
                } else {
                    show = false;
                }
                fabWake(btn, show);   // 1017-N：滑动时出现，停下 1.5 秒淡出
                // 账单页滑动时 ✕ 也跟着出现、停下一起淡出
                if(currentTab==='ledger' && window.syncFilterFab) window.syncFilterFab();
            }
            fabHold(btn); fabHold($('clearFilterFab')); fabHold($('statTodayFab'));
            window.addEventListener('scroll', onScroll, {passive:true});
            btn.addEventListener('click', ()=>{
                // 记账页：落到账单标题处（其下方就是翻页条），方便随手翻页——而非滚到整页最顶的「日子」卡片。
                // 其他页（统计）：仍回到整页顶部。
                const head = currentTab==='ledger' ? $('billHead') : null;
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

