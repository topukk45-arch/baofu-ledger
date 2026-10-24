(function(){
        const { $, archiveSelect } = window.JiwenBase;   // 用到前面模块的
        const { IMPORT_MAX_BYTES, __corruptedStores, impOrdersRestoreFromCloud, importArchiveFromText, ledgerAcceptDamage, loadStore, odClearLink, odGetLink, odGetOrdLink, odOrdersSync, odPlugin, odRefreshStatusUI, odSetLink, odSetOrdLink, odSyncNow, storeKey, trackBusy } = window.JiwenStore;   // 用到前面模块的
        const { customAlert, customConfirm } = window.JiwenAsk;   // 用到前面模块的
        const { askImportOtherDays, importDaysSuffix, importFixSuffix } = window.JiwenAiExport;   // 用到前面模块的
        const { DEV_IMPORT_KEY, devImportOn, renderDevImport } = window.JiwenImportEntry;   // 用到前面模块的
        const { renderBill } = window.JiwenLedger;   // 用到前面模块的
        const { openCatManager } = window.JiwenCats;   // 用到前面模块的

        function refreshArchiveSelect(){
            const store = loadStore();
            archiveSelect.innerHTML='';
            Object.keys(store.archives).forEach(name => {
                const opt=document.createElement('option');
                opt.value=name; opt.textContent=name;
                if(name===JiwenBase.currentArchive) opt.selected=true;
                archiveSelect.appendChild(opt);
            });
            odRefreshStatusUI();
        }
        if($('odConnectBtn')){
            $('odConnectBtn').addEventListener('click', async () => {
                const plugin = odPlugin();
                if(!plugin){ customAlert('这个功能目前只支持安装到手机上的 App，网页版暂不支持。'); return; }
                try{
                    const suggested = `记问存档_${JiwenBase.currentArchive}.json`;
                    const res = await plugin.pickFile({ mode:'create', suggestedName: suggested });
                    if(!res || !res.uri) return;
                    // 重新选择 = 明确的用户意图，解除守卫（含损坏名单），否则一旦拦下就再也恢复不了
                    __corruptedStores.delete(storeKey(JiwenBase.currentUser));
                    ledgerAcceptDamage(JiwenBase.currentUser, JiwenBase.currentArchive);   // 这个存档读不出来的月份按现在的样子重写，以后不再暂停
                    odSetLink(JiwenBase.currentUser, JiwenBase.currentArchive, { uri: res.uri, name: res.name || suggested,
                        lastSyncAt:null, lastError:null, blocked:false, lastCount:0 });
                    odRefreshStatusUI();
                    // 导入简化第 13 版：导入过账单的存档，连好以后顺带问单号表也存一份吗
                    if(odPlugin() && !(odGetOrdLink() && odGetOrdLink().uri) && await hasImports())
                        customConfirm('已连接，之后每次记账/修改会自动同步到这个文件。\n\n这个存档导入过微信 / 支付宝账单，单号表也存一份到云盘吗？换手机或恢复备份以后再导同一份账单，靠单号表认出哪些导过了；没有它，认不出来的会堆进待处理。单号表是另一个文件，只在导入、撤销以后更新。',
                            ()=>ordersConnect(), '连接成功', { okText:'再选一个文件存单号表', cancelText:'先不用' });
                    else customAlert('已连接，之后每次记账/修改会自动同步到这个文件。现在先手动同步一次试试。', '连接成功');
                    odSyncNow();
                }catch(err){
                    // 用户取消选择时也会走到这里，静默即可，不用报错打扰
                }
            });
        }
        // 1016-W：单号表云端文件：另选（新建）一个文件；恢复时从那个文件读（没连过就让你选一个）
        $('odOrdersBtn').addEventListener('click', ()=>ordersConnect());
        // 导入简化第 13 版：这个存档导入过账单（有导入记录）吗
        async function hasImports(archive){ try{ const L=await window.JiwenImportStore.importsRead(archive); return (L||[]).some(l=>l.kind!=='ai'); }catch(_){ return false; } }
        // 导入了一份备份文件以后：那份备份导入过账单，问一句「要从云盘恢复单号表吗」（新存档还没有单号表）
        async function offerOrdersRestore(archive){
            const plugin=odPlugin(); if(!plugin || !(await hasImports(archive))) return;
            customConfirm(`存档「${archive}」导入过微信 / 支付宝账单。云盘上存过它的单号表吗？恢复了，以后再导同一份账单就不会重复。\n\n按记录内容一条条认回来，认不出来的当作没导过。`, async ()=>{
                let uri=null; try{ const res=await plugin.pickFile({ mode:'open' }); if(!res || !res.uri) return; uri=res.uri; }catch(_){ return; }
                try{
                    const r=await plugin.readText({ uri });
                    const out=await impOrdersRestoreFromCloud(r && r.text, archive);
                    odSetOrdLink(JiwenBase.currentUser, archive, { uri, name:'', lastSyncAt:null, lastError:null });
                    odRefreshStatusUI();
                    customAlert(`恢复好了：认回 ${out.kept} 个单号` + (out.dropped ? `，${out.dropped} 个对应的记录不在了，当作没导过` : '') + '。以后导入也会更新这个文件。', '恢复单号表');
                }catch(err){
                    const c=err && (err.code || err.message);
                    customAlert(c==='notempty' ? '这个存档已经有单号表了，没有覆盖。' : c==='badfile' ? '这个文件不是记问的单号表。' : '没恢复成，什么都没改：' + c, '恢复单号表');
                }
            }, '恢复单号表', { okText:'选云盘上的单号表文件', cancelText:'没存过 / 先不用' });
        }
        async function ordersConnect(){
            const plugin=odPlugin(); if(!plugin) return;
            try{
                const suggested=`记问单号表_${JiwenBase.currentArchive}.json`;
                const res=await plugin.pickFile({ mode:'create', suggestedName:suggested });
                if(!res || !res.uri) return;
                odSetOrdLink(JiwenBase.currentUser, JiwenBase.currentArchive, { uri:res.uri, name:res.name || suggested, lastSyncAt:null, lastError:null });
                await odOrdersSync();
                odRefreshStatusUI();
                const ol=odGetOrdLink();
                customAlert(ol && ol.lastError ? '已连接，但这次没传上：' + ol.lastError + '\n\n下次导入后会再试。' : '已连接，现在的单号表传上去了。以后每次导入、撤销、处理待处理后更新这个文件，平时记账不碰它。', '单号表上云');
            }catch(_){ /* 取消选择 */ }
        }
        $('odOrdersRestoreBtn').addEventListener('click', async () => {
            const plugin=odPlugin(); if(!plugin) return;
            let uri=null, ol=odGetOrdLink();
            try{
                if(ol && ol.uri) uri=ol.uri;
                else { const res=await plugin.pickFile({ mode:'open' }); if(!res || !res.uri) return; uri=res.uri; }
            }catch(_){ return; }
            customConfirm('从云端的单号表文件恢复这个存档的单号表：按记录内容一条条认回来，认不出来的当作没导过。\n\n只在这个存档还没有单号表时恢复，已经有的不覆盖。', async () => {
                try{
                    const r=await plugin.readText({ uri });
                    const out=await impOrdersRestoreFromCloud(r && r.text);
                    customAlert(`恢复好了：认回 ${out.kept} 个单号` + (out.dropped ? `，${out.dropped} 个对应的记录不在了，当作没导过` : '') + '。', '恢复单号表');
                }catch(err){
                    const c=err && (err.code || err.message);
                    customAlert(c==='notempty' ? '这个存档已经有单号表了，没有覆盖。' : c==='badfile' ? '这个文件不是记问的单号表。' : '没恢复成，什么都没改：' + c, '恢复单号表');
                }
            }, '恢复单号表', { okText:'从云盘恢复单号表' });
        });
        if($('odDisconnectBtn')){
            $('odDisconnectBtn').addEventListener('click', () => {
                customConfirm('停止把这个存档自动备份到云盘。云盘上已有的文件不删，需要的话可以重新连接。', () => {
                    const plugin = odPlugin();
                    const link = odGetLink();
                    if(plugin && link && link.uri){ plugin.forget({ uri: link.uri }).catch(()=>{}); }
                    odClearLink(JiwenBase.currentUser, JiwenBase.currentArchive);
                    odRefreshStatusUI();
                }, '取消自动同步', { okText:'停止自动同步', cancelText:'继续同步' });
            });
        }
        // 2 秒内连点 5 次版本号：开 / 关（1019-Z4-M26 起计数定义在设置页模块里，原来在导入入口）
        let __buildTaps=[];
        $('setBuild').addEventListener('click', () => {
            const now=Date.now();
            __buildTaps=__buildTaps.filter(t=>now-t<2000); __buildTaps.push(now);
            if(__buildTaps.length<5) return;
            __buildTaps=[];
            const on=!devImportOn();
            try{ if(on) localStorage.setItem(DEV_IMPORT_KEY,'1'); else localStorage.removeItem(DEV_IMPORT_KEY); }catch(_){}
            renderDevImport();
            try{ if(JiwenBase.currentUser) renderBill(); }catch(_){}     // 1016-R：空账本的小入口跟着开关出现 / 消失
            renderStorageUse();
            try{ odRefreshStatusUI(); }catch(_){}
            customAlert(on ? '已打开「导入（开发中）」，入口在上面「存档管理」里。只在这台手机上有效。' : '已关闭「导入（开发中）」。', '开发开关');
        });
        $('importFile').addEventListener('change', e => {
            const file=e.target.files[0]; if(!file) return;
            if(file.size > IMPORT_MAX_BYTES){
                customAlert('文件太大啦（超过 24MB），请确认是否为正确的备份文件。');
                $('importFile').value=''; return;
            }
            const reader=new FileReader();
            reader.onload=ev=>trackBusy((async()=>{
                try{
                    const { finalName, stats, daysAdded, daysPending }=await importArchiveFromText(ev.target.result, JiwenBase.currentUser);
                    // importArchiveFromText 内部已把新存档写盘并设好 store.last，无需再重读重写一遍
                    JiwenBase.currentArchive=finalName;
                    // refreshAllViews 里已含 renderDaysCard，导进来的倒数日会一并刷新到入口卡
                    refreshArchiveSelect(); window.JiwenTabs.refreshCatSelectors(); window.JiwenTabs.refreshAllViews();
                    const user=JiwenBase.currentUser;
                    askImportOtherDays(daysPending, user, (asked)=>{
                        if(asked && user===JiwenBase.currentUser) window.JiwenTabs.refreshAllViews();
                        customAlert(`导入成功！已存为存档「${finalName}」${importFixSuffix(stats)}${importDaysSuffix(daysAdded+asked)}`, '导入成功', 'left');
                        // 导入简化第 13 版：那份备份导入过账单：这句提示关掉以后问要不要从云盘恢复单号表
                        if(odPlugin()) hasImports(finalName).then(y=>{ if(!y) return; const iv=setInterval(()=>{ if(document.getElementById('askMask').style.display==='none'){ clearInterval(iv); offerOrdersRestore(finalName); } }, 200); });
                    });
                }catch(err){
                    const msg = err && err.message;
                    let tip;
                    if(msg==='empty')      tip='导入失败：文件里没有有效记录';
                    else if(msg==='toomany') tip='导入失败：记录条数过多（上限 5 万条），请拆分后再导入';
                    else if(msg==='quota')   tip='导入失败：存储空间不足，已放弃本次导入。请删除部分存档或记录后重试。';
                    else                     tip='导入失败：文件格式不正确';
                    customAlert(tip);
                }
                $('importFile').value='';
            })());
            reader.readAsText(file);
        });
        // 「管理分类」入口已从筛选浮层移到设置页（分类属于存档配置，与筛选语义分离）
        $('manageCatSetting').addEventListener('click', openCatManager);

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

            // 1020-J：主色真正会用的那一段（选色面板的深浅条、鲜艳条两头就是它）：亮度 PAL_L_MIN～PAL_L_MAX、饱和度 PAL_S_MIN～100
            const PAL_L_MIN=20, PAL_L_MAX=56, PAL_S_MIN=12;
            // 黑 / 白 / 灰没有色相（rgbToHsl 给 0 = 红，原来再被「饱和度至少 12」提上去，配出来的浅底是粉色）；太黑太白时取整也把色相弄乱了
            function noHue(hsl){ return hsl.s<1 || hsl.l<2 || hsl.l>98; }
            const DEFAULT_HUE=175;   // 默认主色 #3f6f6b 的色相：没色相、又没记过上一次的色相时用它
            // 从一个主色推导整套主题变量（保证浅底深字、对比足够）
            //   hue：选色面板记着的色相（拖条时用它，不从色值反推）；不给时从色值反推，色值没有色相的用 hueFallback（上一次的色相）
            function buildPalette(primaryHex, hue, hueFallback){
                let { h,s,l } = rgbToHsl(hexToRgb(primaryHex));
                if(hue!=null && isFinite(hue)) h=hue;
                else if(noHue({ h,s,l })) h=(hueFallback!=null && isFinite(hueFallback)) ? hueFallback : DEFAULT_HUE;
                if(s<PAL_S_MIN) s=PAL_S_MIN;         // 太灰会显脏，给个下限
                // 主色亮度收进可读区间：PAL_L_MIN～PAL_L_MAX（1020-J 起也有下限：拉到最黑也是看得出色相的深色）
                let pL=Math.max(PAL_L_MIN, Math.min(l,PAL_L_MAX));
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
            function applyPrimary(primaryHex, hue){
                const pal=buildPalette(primaryHex, hue, savedHue());
                const root=document.documentElement;
                Object.keys(pal).forEach(k=>root.style.setProperty(k, pal[k]));
                // 同步「键盘弹起兜底底色」：把当前主题背景钉到 html inline 背景 + theme-color，
                // 否则换肤后键盘弹起会闪一下旧底色。
                const bg=pal['--c-bg'];
                if(bg){
                    // 1020-J：要带 !important：index.html 开头为了防白闪把根底色钉成默认的米黄（!important），不带的话换了主题根底色还是米黄，
                    //   页面没铺到的地方（日子页最后一条虚线往下）就露出一块偏橙的底
                    root.style.setProperty('background-color', bg, 'important');
                    let tc=document.querySelector('meta[name="theme-color"]');
                    if(tc) tc.setAttribute('content', bg);
                }
            }

            // —— 读写持久化 ——
            function loadPrefs(){
                try{ return JSON.parse(localStorage.getItem('app_appearance')||'{}'); }catch(_){ return {}; }
            }
            // 1020-J：上一次的色相（存在 app_appearance 的 hue 里，和那时存的色值 hueOf 成对；不进备份）
            function savedHue(){ const p=loadPrefs(); return (typeof p.hue==='number' && isFinite(p.hue)) ? p.hue : null; }
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
                        const pf=loadPrefs(); pf.primary=p.color; pf.hue=Math.round(rgbToHsl(hexToRgb(p.color)).h*10)/10; pf.hueOf=p.color; savePrefs(pf);
                        renderPresets(p.color);
                        $('customColor').value=p.color; paintCustomRow();
                    };
                    box.appendChild(sw);
                });
            }
            function openTheme(){
                const pf=loadPrefs();
                const cur=pf.primary||DEFAULT_PRIMARY;
                $('customColor').value = /^#[0-9a-fA-F]{6}$/.test(cur)?cur:DEFAULT_PRIMARY;
                paintCustomRow();
                renderPresets(cur);
                themeMask.style.display='flex';
            }
            // 1020-E：「自定义主色」那一行：色块 + 色值
            function paintCustomRow(){
                const c=$('customColor').value;
                $('customColorDot').style.background=c; $('customColorVal').textContent=c;
            }
            $('themeBtn').addEventListener('click', openTheme);
            $('closeTheme').addEventListener('click', ()=>{ themeMask.style.display='none'; });

            // ===== 1020-E：App 自己的选色面板（不用系统的选色框：安卓上是白底的，和 App 不搭）=====
            //   共用底部面板 JiwenSheet：一排常用色块 + 色相条 + 深浅条 + 鲜艳条，下面写现在选的色值、能直接输入色值；
            //   选的时候整个 App 实时跟着变（applyPrimary，只改样子不存），「应用」才存（和原来「应用此色」一样存选的色值），
            //   「取消」、往下拉、返回键都恢复打开前的颜色。「太浅太亮自动加深」照旧在 buildPalette 里，这里写出实际用的是哪个色。
            const CP_COMMON=['#3f6f6b','#8a7f66','#6b5a82','#5f5b54','#a8553f','#3a5a7a','#6b7245','#9c5b63',
                '#b0413e','#c26a2b','#1565c0','#ad1457'];   // 前 8 个是预设主题，后 4 个补几种常见的；两排
            const HEX_RE=/^#[0-9a-fA-F]{6}$/;
            function openColorPicker(){
                const pf=loadPrefs();
                const orig=HEX_RE.test(pf.primary||'') ? pf.primary.toLowerCase() : DEFAULT_PRIMARY;
                let cur=HEX_RE.test($('customColor').value) ? $('customColor').value.toLowerCase() : orig;
                // 1020-J：面板自己记住色相、深浅、鲜艳三个数，配色用面板里的色相（不从色值反推）；
                //   从色值输入框 / 色块进来的：有色相就用它的，没有色相（黑白灰）的保留上一次的色相
                let hsl=rgbToHsl(hexToRgb(cur));
                if(pf.hueOf===cur && savedHue()!=null) hsl.h=savedHue();
                else if(noHue(hsl)) hsl.h = savedHue()!=null ? savedHue() : DEFAULT_HUE;
                let raf=0, els={};
                // 取消时原样放回：打开时 html 上的样式（主题色都在这里）和 theme-color（没存过主题时 App 用的是样式表里默认的颜色，不能用「再套一次」来恢复）
                const root=document.documentElement, meta=document.querySelector('meta[name="theme-color"]');
                const origStyle=root.getAttribute('style'), origMeta=meta ? meta.getAttribute('content') : null;
                const restore=()=>{ if(raf){ cancelAnimationFrame(raf); raf=0; }
                    if(origStyle==null) root.removeAttribute('style'); else root.setAttribute('style', origStyle);
                    if(meta && origMeta!=null) meta.setAttribute('content', origMeta); };
                const preview=()=>{ if(raf) return; raf=requestAnimationFrame(()=>{ raf=0; applyPrimary(cur, hsl.h); }); };
                const setHex=(hex, fromHsl)=>{
                    cur=hex.toLowerCase();
                    if(!fromHsl){ const n=rgbToHsl(hexToRgb(cur)); if(noHue(n)) n.h=hsl.h; hsl=n; }
                    paint(); preview();
                };
                // 1020-J：深浅条、鲜艳条的两头就是 App 真正会用的最深 / 最浅、最灰 / 最艳（和 buildPalette 的上下限一样）；
                //   条上的颜色按 buildPalette 实际会用的主色画（太亮被加深的那段条上也是加深以后的颜色）
                const used=(h, s0, l0)=>buildPalette(hslToHex(h, s0, l0), h)['--c-primary'];
                const bars=[
                    { k:'h', label:'色相', min:0, max:360, grad:()=>`linear-gradient(to right, ${[0,30,60,90,120,150,180,210,240,270,300,330,360].map(h=>used(h,Math.max(hsl.s,35),Math.min(Math.max(hsl.l,35),PAL_L_MAX))).join(',')})` },
                    { k:'l', label:'深浅', min:PAL_L_MIN, max:PAL_L_MAX, grad:()=>`linear-gradient(to right, ${[0,0.25,0.5,0.75,1].map(f=>used(hsl.h,hsl.s,PAL_L_MIN+f*(PAL_L_MAX-PAL_L_MIN))).join(',')})` },
                    { k:'s', label:'鲜艳', min:PAL_S_MIN, max:100, grad:()=>`linear-gradient(to right, ${[0,0.5,1].map(f=>used(hsl.h,PAL_S_MIN+f*(100-PAL_S_MIN),Math.min(Math.max(hsl.l,PAL_L_MIN),PAL_L_MAX))).join(',')})` }
                ];
                const frac=b=>Math.max(0, Math.min(1, (hsl[b.k]-b.min)/(b.max-b.min)));
                function paint(){
                    bars.forEach(b=>{ const e=els[b.k]; if(!e) return; e.track.style.background=b.grad(); e.thumb.style.left=(frac(b)*100)+'%';
                        e.thumb.style.background=b.k==='h' ? used(hsl.h,Math.max(hsl.s,35),Math.min(Math.max(hsl.l,35),PAL_L_MAX)) : buildPalette(cur, hsl.h)['--c-primary']; });
                    if(els.dot) els.dot.style.background=cur;
                    if(els.hex && document.activeElement!==els.hex){ els.hex.value=cur; els.hex.classList.remove('bad'); }
                    if(els.sw) [...els.sw.children].forEach(x=>x.classList.toggle('on', x.dataset.c===cur));
                    if(els.note){ const used=buildPalette(cur, hsl.h)['--c-primary'].toLowerCase();
                        els.note.textContent = used!==cur ? `这个颜色太浅或太亮，按钮上看不清字，实际会用深一点的 ${used}。` : '整个 App 已经换成这个颜色看看效果，点「应用」才存。'; }
                }
                window.JiwenSheet.open({ title:'自定义主色', sub:'点色块，或者拖下面的条；整个 App 跟着变，点「应用」才存', tall:true,   // 1020-J：原来 72% 高装不下，色相 / 深浅条被「应用」挡住半截
                    onDismiss(){ restore(); },
                    body(outer){
                        const box=document.createElement('div'); box.className='cp-wrap'; outer.appendChild(box);   // 面板正文是竖排 flex，装进一个普通的块里，不被拉开
                        const sw=document.createElement('div'); sw.className='cp-swatches'; sw.id='cpSwatches';
                        CP_COMMON.forEach(c=>{ const b=document.createElement('button'); b.type='button'; b.className='cp-sw'; b.dataset.c=c; b.style.background=c; b.setAttribute('aria-label', c);
                            b.addEventListener('click', ()=>setHex(c)); sw.appendChild(b); });
                        box.appendChild(sw); els.sw=sw;
                        bars.forEach(b=>{
                            const lab=document.createElement('div'); lab.className='cp-label'; lab.innerHTML=`<span>${b.label}</span>`;
                            const bar=document.createElement('div'); bar.className='cp-bar'; bar.id='cpBar'+b.k.toUpperCase(); bar.setAttribute('data-nodrag','1');
                            const track=document.createElement('div'); track.className='cp-track';
                            const thumb=document.createElement('div'); thumb.className='cp-thumb';
                            bar.appendChild(track); bar.appendChild(thumb);
                            let dragging=false;
                            const at=e=>{ const r=track.getBoundingClientRect(); if(!r.width) return;
                                const f=Math.max(0, Math.min(1, (e.clientX-r.left)/r.width));
                                hsl[b.k]=Math.round((b.min+f*(b.max-b.min))*10)/10;
                                // 另外两个数不在范围里的（从色值进来的太浅、太灰）先收进范围，条上看到的就是实际用的
                                hsl.l=Math.max(PAL_L_MIN, Math.min(PAL_L_MAX, hsl.l)); hsl.s=Math.max(PAL_S_MIN, hsl.s);
                                setHex(hslToHex(hsl.h,hsl.s,hsl.l), true); };
                            bar.addEventListener('pointerdown', e=>{ dragging=true; try{ bar.setPointerCapture(e.pointerId); }catch(_){} at(e); });
                            bar.addEventListener('pointermove', e=>{ if(dragging) at(e); });
                            ['pointerup','pointercancel'].forEach(ev=>bar.addEventListener(ev, ()=>{ dragging=false; }));
                            box.appendChild(lab); box.appendChild(bar);
                            els[b.k]={ track, thumb };
                        });
                        const now=document.createElement('div'); now.className='cp-now';
                        const dot=document.createElement('span'); dot.className='cp-now-dot'; dot.id='cpNowDot';
                        const hex=document.createElement('input'); hex.type='text'; hex.className='cp-hex'; hex.id='cpHex'; hex.maxLength=7;
                        hex.setAttribute('autocomplete','off'); hex.setAttribute('autocapitalize','off'); hex.setAttribute('spellcheck','false'); hex.setAttribute('aria-label','色值，比如 #3f6f6b');
                        hex.addEventListener('input', ()=>{ let v=hex.value.trim(); if(v && v[0]!=='#') v='#'+v;
                            if(HEX_RE.test(v)){ hex.classList.remove('bad'); setHex(v); } else hex.classList.toggle('bad', v.length>=7); });
                        hex.addEventListener('blur', ()=>{ hex.value=cur; hex.classList.remove('bad'); });
                        now.appendChild(dot); now.appendChild(hex); box.appendChild(now);
                        const note=document.createElement('p'); note.className='cp-note'; note.id='cpNote'; box.appendChild(note);
                        Object.assign(els, { dot, hex, note });
                        paint();
                    },
                    foot(box, done){
                        // 1024-Y：「取消 | 应用」左右并排（左退右进），原来上下摞两行，360×780 下把色值框挡住半截
                        const st=document.createElement('div'); st.className='ui-pair';
                        const ok=document.createElement('button'); ok.type='button'; ok.className='ui-btn primary'; ok.id='cpApply'; ok.textContent='应用';
                        ok.addEventListener('click', ()=>{ done(); if(raf){ cancelAnimationFrame(raf); raf=0; } applyPrimary(cur, hsl.h); const p=loadPrefs(); p.primary=cur; p.hue=Math.round(hsl.h*10)/10; p.hueOf=cur; savePrefs(p);
                            $('customColor').value=cur; paintCustomRow(); renderPresets(cur); });
                        const no=document.createElement('button'); no.type='button'; no.className='ui-btn'; no.id='cpCancel'; no.textContent='取消';
                        no.addEventListener('click', ()=>{ done(); restore(); });
                        st.appendChild(no); st.appendChild(ok); box.appendChild(st);
                    } });
            }
            $('customColorBtn').addEventListener('click', openColorPicker);
            $('resetThemeBtn').addEventListener('click', ()=>{
                applyPrimary(DEFAULT_PRIMARY);
                const pf=loadPrefs(); pf.primary=DEFAULT_PRIMARY; pf.hue=DEFAULT_HUE; pf.hueOf=DEFAULT_PRIMARY; savePrefs(pf);
                $('customColor').value=DEFAULT_PRIMARY; paintCustomRow();
                renderPresets(DEFAULT_PRIMARY);
            });

            // —— 启动时应用已保存的外观 ——
            const pf=loadPrefs();
            if(pf.primary) applyPrimary(pf.primary, pf.hueOf===pf.primary ? savedHue() : null);
        })();

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
        window.JiwenSettings = { refreshArchiveSelect, renderStorageUse };   // settings 模块对外只有这一个入口
})();
