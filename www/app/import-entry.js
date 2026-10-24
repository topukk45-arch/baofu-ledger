(function(){
        const { $, pad, setTxtNudge, txtNudge } = window.JiwenBase;   // 用到前面模块的
        const { customAlert } = window.JiwenAsk;   // 用到前面模块的

        // ===== 1015-A：账单导入（开发中）=====
        // 导入的代码在 import/ 目录下，平时启动一个都不加载；点开入口时才插入 import/import.js（loadImportModule）。
        // 开关只存在这台手机上（localStorage 的 app_dev_import），不进账本、不进备份、不进云备份。
        const DEV_IMPORT_KEY='app_dev_import';
        const devImportOn=()=>{ try{ return localStorage.getItem(DEV_IMPORT_KEY)==='1'; }catch(_){ return false; } };
        function renderDevImport(){ $('devImportBtn').style.display = $('devRestoreBtn').style.display = $('devLogsBtn').style.display = $('devRulesBtn').style.display = $('devOptCatBtn').style.display = $('devPerfBtn').style.display = $('devMeasureBtn').style.display = $('devSplashBtn').style.display = $('devNudgeBtn').style.display = devImportOn() ? '' : 'none'; if(devImportOn()){ splashWaitPaint(); nudgePaint(); } }
        // 1019-X：开发开关里的「启动画面等首屏」（默认开）：真正的开关存在原生层（SharedPreferences，打开 App 时原生那边一开始就要知道），
        //   这里只是读 / 写它；关掉 = 回到 1019-U 之前「系统画出第一帧就收启动画面」，下次打开 App 生效。不在手机上时记在 localStorage 里只为显示
        function splashPlugin(){ const c=window.Capacitor; return c && c.Plugins && c.Plugins.Launch && typeof c.Plugins.Launch.setWait==='function' ? c.Plugins.Launch : null; }
        function splashWaitLocal(){ try{ return localStorage.getItem('app_launch_wait')!=='0'; }catch(_){ return true; } }
        function splashWaitPaint(){
            const v=$('devSplashVal'); if(!v) return;
            v.textContent=splashWaitLocal() ? '开' : '关';
            const L=splashPlugin();
            if(L && L.getWait) Promise.resolve(L.getWait()).then(r=>{ if(r && typeof r.on==='boolean'){ try{ localStorage.setItem('app_launch_wait', r.on ? '1' : '0'); }catch(_){} v.textContent=r.on ? '开' : '关'; } }).catch(()=>{});
        }
        $('devSplashBtn').addEventListener('click', ()=>{
            const on=!splashWaitLocal();
            try{ localStorage.setItem('app_launch_wait', on ? '1' : '0'); }catch(_){}
            const L=splashPlugin(); if(L) Promise.resolve(L.setWait({ on })).catch(()=>{});
            splashWaitPaint();
            customAlert(on ? '已打开：启动画面等首屏画好再收（最多 1 秒）。下次打开 App 生效。' : '已关掉：启动画面像 1019-U 之前那样，系统画出第一帧就收。下次打开 App 生效。\n\n对比完告诉开发者用哪种当默认。', '启动画面等首屏');
        });
        // 1020-H：开发开关里的「字往下挪几像素（开发中）」：0～3px（每档 0.5），只存这台手机（localStorage 的 app_txt_nudge，不进备份），
        //   写进 html 上的 --txt-nudge-dev（按钮、分类块、收支、列表卡的行里的字一起往下挪），手机上看着调，定了再写死、去掉这个调节。
        //   「自动」= 不写（支持 text-box 的按字形裁、不挪；不支持的旧 WebView 往下挪 1px）
        function nudgePaint(){ const v=$('devNudgeVal'); if(!v) return; const n=txtNudge(); v.textContent = n===null ? '自动' : n+' px'; }
        $('devNudgeBtn').addEventListener('click', ()=>{
            const cur=txtNudge();
            window.JiwenSheet.pick({ title:'字往下挪几像素', sub:'按钮、分类块、收支、列表卡的行里的字一起往下挪，选了马上生效，只存这台手机。',
                value: cur===null ? 'auto' : String(cur),
                options:[{ value:'auto', label:'自动（不支持按字形裁的旧手机挪 1px）' }].concat([0, 0.5, 1, 1.5, 2, 2.5, 3].map(n=>({ value:String(n), label:n+' px' }))),
                onPick:v=>{ setTxtNudge(v==='auto' ? null : +v); nudgePaint(); } });
        });
        $('setBuild').textContent=$('loginBuild').textContent;
        renderDevImport();
        let __importLoading=null;
        function loadImportModule(){
            if(window.JiwenImport) return Promise.resolve(window.JiwenImport);
            if(__importLoading) return __importLoading;
            __importLoading=new Promise((resolve, reject)=>{
                const s=document.createElement('script');
                s.src='import/import.js';
                s.onload=()=>{ if(window.JiwenImport) resolve(window.JiwenImport); else { __importLoading=null; reject(new Error('导入模块不完整')); } };
                s.onerror=()=>{ __importLoading=null; s.remove(); reject(new Error('导入模块没加载上')); };
                document.head.appendChild(s);
            });
            return __importLoading;
        }
        // 1016-B：导入页（确认页）要的另外两个文件，按顺序载入；都只在打开导入时才载入
        let __importUiLoading=null;
        function loadImportUI(){
            if(window.JiwenImportUI) return Promise.resolve(window.JiwenImportUI);
            if(__importUiLoading) return __importUiLoading;
            const one=src=>new Promise((resolve, reject)=>{
                const s=document.createElement('script'); s.src=src;
                s.onload=()=>resolve(); s.onerror=()=>{ s.remove(); reject(new Error('导入模块没加载上')); };
                document.head.appendChild(s);
            });
            __importUiLoading=loadImportModule().then(()=>one('import/plan.js')).then(()=>one('import/write.js')).then(()=>one('import/undo.js')).then(()=>one('import/route.js')).then(()=>one('import/pending.js')).then(()=>one('import/vendor/tiny-inflate.js')).then(()=>one('import/unzip.js')).then(()=>one('import/ai.js')).then(()=>one('import/ui.js')).then(()=>{
                if(!window.JiwenImportUI) throw new Error('导入模块不完整');
                return window.JiwenImportUI;
            });
            __importUiLoading.catch(()=>{ __importUiLoading=null; });
            return __importUiLoading;
        }
        let __devImportRun=0;
        function runDevImportCheck(){
            const out=$('devImportOut'), my=++__devImportRun;
            out.textContent='正在自检…';
            loadImportModule().then(m=>m.selfTest()).then(r=>{
                if(my!==__devImportRun) return;
                const st=window.JiwenImport.state();
                out.textContent=(r.ok ? '通路正常' : '结果不对')
                    + '\n算的地方：' + (r.mode==='worker' ? '后台线程' : '主线程（' + (st.fallbackReason||'后台线程起不来') + '）')
                    + '\n文本：' + r.textLines + ' 行（应为 ' + r.expect + '）'
                    + '\n字节：' + r.byteLines + ' 行，' + r.bytes + ' 字节' + (r.bufferAfter===0 ? '，直接交给线程没复制' : '')
                    + '\nGBK 解码：' + (r.gbkOk ? '正常（读出 ' + r.gbk.rows + ' 笔支付宝账单，第一笔对方「' + r.gbk.cp + '」）'
                        : '不对（' + (r.gbk ? (r.gbk.fatal || ('编码 ' + r.gbk.encoding + '，' + r.gbk.rows + ' 笔')) : '没跑') + '）')
                    + '\n内置词表：' + r.merchants + ' 条 · 计算部分 ' + r.core
                    + '\n用时：' + r.ms + ' 毫秒';
            }).catch(e=>{
                if(my!==__devImportRun || (e && e.cancelled)) return;
                out.textContent='自检失败：' + (e && e.message || e);
            });
        }
        // 1016-B：开发入口改成真的导入页（选文件 → 确认页）；通路自检挪进导入页里
        $('devImportBtn').addEventListener('click', () => {
            loadImportUI().then(ui=>ui.open()).catch(e=>customAlert('导入模块没加载上：' + (e && e.message || e), '导入'));
        });
        // 1017-O：恢复备份（原来叫「恢复到导入前」，只能恢复最新那份）：底部面板列出现存的每一份（种类、时间、是哪一次操作之前、
        //   恢复后有几条），点一份 → 确认面板写清影响（之后的几次导入、手记的几条会没有……），「恢复这份备份，覆盖现在的账本」警示色在上、「再看看」在下。
        //   恢复前先自动备份一份「恢复前」，恢复错了能回来
        const BK_KIND_NAME={ import:'导入前', undo:'撤销前', ai:'AI 修改前', restore:'恢复前' };
        function bkWhen(t){ const d=new Date(t); return `${d.getMonth()+1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`; }
        function bkDelta(n, now){ return n===null || n===undefined ? '' : (n===now ? '和现在一样多' : n>now ? `比现在多 ${n-now} 条` : `比现在少 ${now-n} 条`); }
        let bkBusy=false;
        function openBackupList(){
            if(!window.JiwenImportStore || !window.JiwenSheet) return;
            const S=window.JiwenSheet;
            S.open({ title:'恢复备份', sub:'导入、AI 修改、撤销、恢复之前都会自动备份一份，存在这台手机上。', onDismiss(){},
                body(box){
                    const ld=document.createElement('div'); ld.className='ui-msg'; ld.textContent='正在读备份…'; box.appendChild(ld);
                    window.JiwenImportStore.backupList().then(r=>{
                        if(!S.isOpen()) return;
                        box.textContent='';
                        if(!r.list.length){
                            const e=document.createElement('div'); e.className='ui-msg'; e.id='bkEmpty';
                            e.innerHTML='<p>这个存档还没有备份。</p><p class="ui-msg-soft">每次导入、AI 修改、撤销、恢复之前会自动备份一份：导入前留 3 份，撤销前留 2 份，AI 修改前、恢复前各留 1 份。</p>';
                            box.appendChild(e); return;
                        }
                        const wrap=document.createElement('div'); wrap.className='ui-stack'; wrap.id='bkList';
                        r.list.forEach(x=>{
                            const b=document.createElement('button'); b.type='button'; b.className='ui-choice bk-item'; b.dataset.key=x.key; b.dataset.kind=x.kind;
                            const h=document.createElement('b'); h.textContent=(BK_KIND_NAME[x.kind]||'') + '备份 · ' + bkWhen(x.t);
                            const w=document.createElement('span'); w.textContent=x.bad ? '这份备份读不出来，不能恢复' : (x.what ? x.what + '之前' : '那次操作之前');
                            const n=document.createElement('span'); n.className='ui-msg-soft'; n.textContent=x.n===null ? '' : `恢复后账本 ${x.n} 条（${bkDelta(x.n, r.now)}）`;
                            b.appendChild(h); b.appendChild(w); if(n.textContent) b.appendChild(n);
                            if(x.bad) b.disabled=true;
                            b.addEventListener('click', ()=>openBackupConfirm(x, r.now));
                            wrap.appendChild(b);
                        });
                        box.appendChild(wrap);
                    }).catch(err=>{ if(S.isOpen()) ld.textContent='读不出备份：' + (err && (err.code || err.message) || err); });
                },
                foot(box, done){
                    const c=document.createElement('button'); c.type='button'; c.className='ui-btn block'; c.id='bkListClose'; c.textContent='关闭';
                    c.addEventListener('click', ()=>done());
                    box.appendChild(c);
                } });
        }
        function openBackupConfirm(x, now){
            const S=window.JiwenSheet;
            S.open({ title:'恢复这份备份？', sub:(BK_KIND_NAME[x.kind]||'') + '备份 · ' + bkWhen(x.t) + (x.what ? ' · ' + x.what + '之前' : ''), onDismiss(){ openBackupList(); }, busy:()=>bkBusy,
                body(box){
                    const m=document.createElement('div'); m.className='ui-msg'; m.id='bkConfirmMsg'; m.textContent='正在算恢复以后会变什么…'; box.appendChild(m);
                    window.JiwenImportStore.backupDiff(x.key).then(d=>{
                        if(!S.isOpen()) return;
                        x.ver=d.ver;
                        const li=[];
                        if(d.goneMan) li.push(`你手记的 ${d.goneMan} 条会没有`);
                        if(d.goneImp) li.push(`导入进来的 ${d.goneImp} 条会没有`);
                        if(d.back) li.push(`现在没有的 ${d.back} 条会回来`);
                        if(d.changed) li.push(`${d.changed} 条记录会变回当时的样子（分类、金额、备注、时间等）`);
                        if(d.logsGone || d.aiGone) li.push('这之后的' + [d.logsGone ? ` ${d.logsGone} 次导入` : '', d.aiGone ? ` ${d.aiGone} 次 AI 修改` : ''].filter(Boolean).join('、') + '会没有，导入记录里也不再有');
                        if(d.logsBack) li.push(`导入记录里会多回 ${d.logsBack} 次（能接着撤销）`);
                        if(d.pendNow!==d.pendBk) li.push(`待处理从 ${d.pendNow} 笔变成 ${d.pendBk} 笔`);
                        if(d.catsChange) li.push('分类列表变回当时的样子');
                        if(d.budgetsChange) li.push('预算变回当时的样子');
                        if(d.rulesChange) li.push('导入规则变回当时的样子');
                        m.textContent='';
                        const p1=document.createElement('p'); p1.textContent=`恢复以后账本有 ${d.records} 条（现在 ${d.now} 条，${bkDelta(d.records, d.now)}）。`; m.appendChild(p1);
                        if(li.length){ const ul=document.createElement('ul'); li.forEach(t=>{ const e=document.createElement('li'); e.textContent=t; ul.appendChild(e); }); m.appendChild(ul); }
                        else { const p=document.createElement('p'); p.textContent='和现在的账本一模一样，恢复了也不会变。'; m.appendChild(p); }
                        const p2=document.createElement('p'); p2.className='ui-msg-soft'; p2.textContent='单号表、待处理、导入记录、分类、预算、名单都一起还原。恢复之前会先自动备份一份现在的样子（「恢复前」），恢复错了可以再恢复回来。'; m.appendChild(p2);
                        const ok=document.getElementById('bkConfirmOk'); if(ok) ok.disabled=false;
                    }).catch(err=>{ if(S.isOpen()) m.textContent='这份备份读不出来，不能恢复：' + (err && (err.code || err.message) || err); });
                },
                foot(box, done){
                    const col=document.createElement('div'); col.className='ui-stack';
                    const ok=document.createElement('button'); ok.type='button'; ok.className='ui-btn warn block'; ok.id='bkConfirmOk'; ok.textContent='恢复这份备份，覆盖现在的账本'; ok.disabled=true;
                    const no=document.createElement('button'); no.type='button'; no.className='ui-btn block'; no.id='bkConfirmNo'; no.textContent='再看看';
                    ok.addEventListener('click', async ()=>{
                        if(bkBusy) return;
                        bkBusy=true; ok.disabled=no.disabled=true; ok.textContent='正在恢复…';
                        let msg;
                        try{
                            const r=await window.JiwenImportStore.restoreBackup(x.key, { ver:x.ver });
                            msg=`已恢复，现在有 ${r.records} 条记录。恢复前的样子另存了一份「恢复前」备份，在「恢复备份」里能找回来。`;
                        }catch(err){
                            const c=err && (err.code || err.message);
                            msg= c==='stale' ? '刚才账本有了变化，没有恢复。请重新打开「恢复备份」再看一遍影响。'
                               : (c==='quota' || c==='nospace') ? '存储空间不够，没有恢复，账本没动。'
                               : '恢复失败，账本没动：' + (c || err);
                        }
                        bkBusy=false; done();
                        S.open({ title:'恢复备份', onDismiss(){}, body(b){ const e=document.createElement('div'); e.className='ui-msg'; e.id='bkDoneMsg'; e.textContent=msg; b.appendChild(e); },
                            foot(b, d2){ const c=document.createElement('button'); c.type='button'; c.className='ui-btn block'; c.id='bkDoneClose'; c.textContent='知道了'; c.addEventListener('click', ()=>d2()); b.appendChild(c); } });
                    });
                    no.addEventListener('click', ()=>{ if(bkBusy) return; done(); openBackupList(); });
                    col.appendChild(ok); col.appendChild(no); box.appendChild(col);
                } });
        }
        $('devRestoreBtn').addEventListener('click', openBackupList);
        // 1016-Z3：「用记问打开」账单文件（安卓：文件管理 / 微信里「用其他应用打开」或「分享」，原生插件 OpenFile 接住、读成字节）。
        //   开发开关没开：只提示「导入功能还在测试中」，不进导入；开着：直接拿这个文件进导入页。还没进账号就先记着，进了账号再接着
        async function impTakeOpenedFile(){
            const cap=window.Capacitor, pl=cap && cap.Plugins && cap.Plugins.OpenFile;
            if(!pl || typeof pl.getPending!=='function') return;
            let r=null; try{ r=await pl.getPending(); }catch(_){ return; }
            const f=r && r.file; if(!f) return;
            if(!JiwenBase.currentUser){ window.__impOpened=f; return; }
            impOpenFile(f);
        }
        function impOpenFile(f){
            if(!devImportOn()){ customAlert('导入功能还在测试中，暂时不能用记问打开账单文件。', '用记问打开'); return; }
            if(f.error){ customAlert(f.error==='too_big' ? '这个文件太大了（超过 8MB），读不了。' : '这个文件读不出来，换个方式选文件试试（导入页里点「选账单文件」）。', '用记问打开'); return; }
            let bytes;
            try{ const bin=atob(f.data||''); bytes=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i); }
            catch(_){ customAlert('这个文件读不出来，换个方式选文件试试（导入页里点「选账单文件」）。', '用记问打开'); return; }
            const file=new File([bytes], f.name || '账单文件');
            loadImportUI().then(ui=>ui.openWith([file])).catch(e=>customAlert('导入模块没加载上：' + (e && e.message || e), '导入'));
        }
        (function bindOpenFile(){
            const cap=window.Capacitor, pl=cap && cap.Plugins && cap.Plugins.OpenFile;
            if(!pl) return;
            try{ if(typeof pl.addListener==='function') pl.addListener('fileOpened', ()=>{ impTakeOpenedFile(); }); }catch(_){}
            setTimeout(impTakeOpenedFile, 0);
        })();
        // 第二期（1016-Z5）：「设置 → 管理导入规则」：你的分类规则、分类对照、类型规则，能看、改、删、加（导入页那一层里打开）
        $('devRulesBtn').addEventListener('click', () => {
            if(!devImportOn()) return;
            loadImportUI().then(ui=>ui.openRules()).catch(e=>customAlert('导入模块没加载上：' + (e && e.message || e), '管理导入规则'));
        });
        // 导入简化第 6 版：「设置 → 一键优化分类」（备用入口；主入口在账单页「待确认分类」胶囊旁）
        $('devOptCatBtn').addEventListener('click', () => {
            if(!devImportOn()) return;
            loadImportUI().then(ui=>ui.openOptimize()).catch(e=>customAlert('导入模块没加载上：' + (e && e.message || e), '一键优化分类'));
        });
        // 1016-L：「设置 → 导入记录」最近 10 次，每次右侧「撤销」（导入页那一层里打开，返回键照样一层层关）
        $('devLogsBtn').addEventListener('click', () => {
            if(!devImportOn()) return;
            loadImportUI().then(ui=>ui.openLogs()).catch(e=>customAlert('导入模块没加载上：' + (e && e.message || e), '导入记录'));
        });
        function openDevImportCheck(){ $('devImportMask').style.display='flex'; runDevImportCheck(); }
        $('devImportRerun').addEventListener('click', runDevImportCheck);
        $('devImportClose').addEventListener('click', () => {
            __devImportRun++;
            $('devImportMask').style.display='none';
            if(window.JiwenImport) window.JiwenImport.cancel();   // 退出导入：停掉后台线程，下次再起
        });

        // 仅在横向标签条容器内部滚动，使目标标签完整可见。
        // 用容器的 scrollLeft 计算，完全不影响外层页面（区别于 scrollIntoView 的冒泡副作用）。
        function scrollChipIntoView(container, chip){
            if(!container || !chip) return;
            const cLeft=container.scrollLeft;
            const cRight=cLeft + container.clientWidth;
            const bLeft=chip.offsetLeft;
            const bRight=bLeft + chip.offsetWidth;
            const pad=12;   // 留点边距，别贴边
            if(bLeft < cLeft){
                container.scrollLeft = Math.max(0, bLeft - pad);
            } else if(bRight > cRight){
                container.scrollLeft = bRight - container.clientWidth + pad;
            }
        }
        $('closeCat').addEventListener('click', ()=>{ $('catMask').style.display='none'; });
        window.openDevImportCheck = openDevImportCheck;   // 老入口：原来是顶层的，自己就在 window 上，搬进来以后照旧挂上
        // 导入简化第 1 版：开发开关里的「导入量度（开发中）」：最近几次导入的量度（导入记录里的 m，只有数字），一键复制发给开发者。
        //   「导入后改了分类」不存，打开时按导入记录里的指纹现算（JiwenImportStore.measureList）
        const MEASURE_N=10;
        // 「893 笔，自动定了 812，要你看 81（分类 60、手记 12、退款 6、金额 3）」（导入页导入记录详情里有一份一样的，import/ui.js 的 measureLine）
        function measureLine(m){
            const parts=[['cat','分类'],['match','手记'],['refund','退款'],['amount','金额'],['type','类型']].filter(x=>m.why && m.why[x[0]]).map(x=>x[1]+' '+m.why[x[0]]);
            // 1024-X：有 grp 的（这次每一笔去了哪）：跳过的单列，自动定了只算没跳过的
            const sk=m.grp ? (m.grp.skip||0) : 0;
            return `${m.n} 笔，`+(sk ? `跳过 ${sk}（导入过 / 不导入的），其余 ${m.n-sk} 笔里 ` : '')+`自动定了 ${Math.max(0, m.auto-sk)}，要你看 ${m.look}`+(parts.length ? '（'+parts.join('、')+'）' : '');
        }
        function measureText(x){
            const APPN={ wechat:'微信', alipay:'支付宝' }, m=x.m;
            const head=String(x.at||'').replace('T', ' ').slice(5)+' · '+(x.apps.map(a=>APPN[a]||a).join('+')||'—')+(x.only ? '（只对账）' : '')+' · '+x.from.slice(5)+' 至 '+x.to.slice(5);
            const L=[head];
            if(!m) L.push('  这次没有量度（1024-B 之前导入的）');
            else {
                L.push('  '+measureLine(m));
                L.push('  走的是「'+(m.path==='quick' ? '导入' : '逐项看看')+'」，从选文件到点导入 '+m.min+' 分钟');
                const cg=[['cat','分类'],['match','手记'],['refund','退款'],['amount','金额'],['type','类型']].filter(k=>m.chg && m.chg[k[0]]).map(k=>k[1]+' '+m.chg[k[0]]);
                L.push('  改了推荐：'+(cg.length ? cg.join('、') : '没改'));
                const LY=[['rule','你的规则'],['learned','合并里学'],['history','账本历史'],['borrow','两家互借'],['builtin','词表'],['alipay','支付宝分类'],['none','没推出']];
                // 1024-X：分类来自只数新建的（合并的手记、退款、不计、待处理、跳过的不在里面），写明数的是哪些
                const G=m.grp, GN=[['merge','和手记合并'],['refund','退款'],['neutral','不计'],['pending','待处理'],['skip','跳过'],['excluded','勾掉的'],['error','出错']];
                L.push('  分类来自'+(G ? '（只数新建的 '+(G.add||0)+' 笔）' : '')+'：'+LY.map(k=>k[1]+' '+((m.layer && m.layer[k[0]])||0)).join('、'));
                if(G){ const o=GN.filter(k=>G[k[0]]).map(k=>k[1]+' '+G[k[0]]); if(o.length) L.push('  不是新建的：'+o.join('、')); }
                // 1024-V：分类拿不准的拆开数（老记录没有就不写）
                const sum=o=>Object.keys(o).filter(k=>k!=='person').reduce((s, k)=>s+(o[k]||0), 0), all=o=>Object.keys(o).reduce((s, k)=>s+(o[k]||0), 0);
                if(m.none) L.push('  推不出的 '+sum(m.none)+'：商户消费 '+m.none.shop+'、扫码付款 '+m.none.qr+'、转账 '+m.none.transfer+'、红包 '+m.none.redpack+'、别的 '+m.none.other+'；其中对方是个人 '+m.none.person);
                if(m.low) L.push('  把握低的 '+all(m.low)+'：只在商品说明里认出 '+m.low.desc+'、平台或综合商超 '+m.low.plat+'、和个人之间的 '+m.low.person+'、礼包 '+m.low.game+'、别的 '+m.low.other);
                if(m.rest) L.push('  分类里其余的 '+sum(m.rest)+'：新建分类的 '+m.rest.newcat+'、不到 3 笔并进「其他」的 '+m.rest.merged+'、别的 '+m.rest.other);   // 1024-W
            }
            // 1024-X：按分类依据看导入后改了多少（改了分类的 / 这一类共几笔；改了别的字段的不算进去）
            if(x.acc){
                const A=x.acc, pc=v=>'改了 '+v[1]+' / '+v[0]+(v[0] ? '（'+Math.round(v[1]*100/v[0])+'%）' : '');
                const BN=[['rule','你的规则'],['learned','合并里学'],['history','账本历史'],['borrow','两家互借'],['cp','词表认出对方'],['desc','只靠商品说明'],['plat','平台或综合商超'],['game','礼包'],['ali','支付宝分类'],['person','和个人之间的'],['none','没推出']];
                L.push('  导入后改了多少'+(A.src==='guess' ? '（这次导入时没存依据，按账单原文重推的，近似）' : '')+'：自动定了的 '+pc(A.a)+'；要你看的 '+pc(A.l));
                L.push('    '+BN.filter(k=>A.by[k[0]]).map(k=>k[1]+' '+pc(A.by[k[0]])).join('；'));
            }
            L.push('  导入后改了分类 '+x.catChg+' 笔，改了别的 '+x.otherChg+' 笔，删了 '+x.gone+' 笔'+(x.days===null ? '' : '（导入 '+x.days+' 天了）'));
            return L.join('\n');
        }
        function measureScripts(){
            const one=src=>new Promise(res=>{ const sc=document.createElement('script'); sc.src=src; sc.onload=()=>res(true); sc.onerror=()=>{ sc.remove(); res(false); }; document.head.appendChild(sc); });
            const need=[['JiwenImportMerchants','import/merchants.js'], ['JiwenImportClassify','import/classify.js'], ['JiwenImportPlan','import/plan.js']];
            return need.reduce((p, [g, src])=>p.then(()=>window[g] ? true : one(src)), Promise.resolve(true)).catch(()=>false);
        }
        async function openMeasurePage(){
            const S=window.JiwenImportStore;
            let list=[];
            await measureScripts();   // 1024-X：以前导入的没存分类依据，载入分类推荐按账单原文重推（载不上就不写那几行）
            try{ list=S && S.measureList ? await S.measureList(MEASURE_N) : []; }catch(e){ customAlert('读导入记录出错了：'+(e && e.message || e)+'\n\n关掉 App 重新打开再试；还不行的话，把这段话截图发给开发者。'); return; }
            const text=['记问导入量度（只有数字）'].concat(list.map(measureText)).join('\n');
            window.JiwenSheet.open({ title:'导入量度（开发中）', sub:list.length ? `最近 ${list.length} 次导入，新的在上（只有数字，不带对方名和金额）` : '还没有导入过：导入一次账单，这里就有了。',
                body(box){ const pre=document.createElement('pre'); pre.id='measureList'; pre.className='perf-list'; pre.textContent=list.map(measureText).join('\n\n'); box.appendChild(pre); },
                foot(box, done){
                    const st=document.createElement('div'); st.className='ui-stack';
                    const cp=document.createElement('button'); cp.type='button'; cp.className='ui-btn primary block'; cp.id='measureCopy'; cp.textContent='复制全部';
                    cp.addEventListener('click', ()=>{ window.JiwenPanel.copyText(text).then(y=>{ cp.textContent = y ? '已复制' : '没复制上，长按上面的字选中复制'; }); });   // 1024-T 后修：不再退到系统 prompt
                    const x=document.createElement('button'); x.type='button'; x.className='ui-btn block'; x.id='measureClose'; x.textContent='关闭';
                    x.addEventListener('click', ()=>done());
                    st.appendChild(cp); st.appendChild(x); box.appendChild(st);
                } });
        }
        $('devMeasureBtn').addEventListener('click', openMeasurePage);
        window.JiwenImportEntry = { DEV_IMPORT_KEY, devImportOn, impOpenFile, loadImportUI, renderDevImport, scrollChipIntoView };   // impentry 模块对外只有这一个入口（get / set 的是会变的变量，读写的时候才去取）
})();
