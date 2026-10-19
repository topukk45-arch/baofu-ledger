
        // 清单行 → 只读详情。批量确认还没执行，此时允许改记录会让清单和即将执行的范围对不上，
        // 所以从这里进的详情隐藏「修改」按钮，只看不改。
        $('askList').addEventListener('click', e=>{
            const row=e.target.closest('.al-row');
            if(row && row.dataset.id) openDetail(row.dataset.id, { readonly:true });
        });

        $('newAccountBtn').addEventListener('click', ()=>promptNewAccount());

        // ===== 登录页：从文件导入存档（先选文件，再指定要导入到哪个账号）=====
        $('loginImportBtn').addEventListener('click', ()=> $('loginImportFile').click());
        $('loginImportFile').addEventListener('change', e => {
            const file=e.target.files[0]; if(!file) return;
            // 文件体积预校验：与主界面导入一致，避免超大文件读入后 JSON.parse 卡死 UI
            if(file.size > IMPORT_MAX_BYTES){
                customAlert('文件太大啦（超过 24MB），请确认是否为正确的备份文件。');
                $('loginImportFile').value=''; return;
            }
            const reader=new FileReader();
            reader.onload=ev=>{
                const text=ev.target.result;
                // 先校验文件本身能不能解析，避免输完名字才报错。
                // 同时把「条数过多」单独识别出来，给出对症提示（与主界面导入区分 toomany 保持一致）。
                let arr;
                try{ const t=JSON.parse(text); arr=Array.isArray(t)?t:t.data; if(!Array.isArray(arr)) throw 0; }
                catch(_){ customAlert('导入失败：文件格式不正确'); $('loginImportFile').value=''; return; }
                if(arr.length > MAX_IMPORT_RECORDS){
                    customAlert('导入失败：记录条数过多（上限 5 万条），请拆分后再导入');
                    $('loginImportFile').value=''; return;
                }

                // 导到哪个账号：从已有账号里选，或新建一个。
                // 新建时默认用备份里的名字；备份里带着账号编号且这台手机上没有的话，新账号沿用这个编号——
                // 换手机恢复时，它就还是「同一个账号」，日子也会自动带上。
                let parsedHead={};
                try{ parsedHead=JSON.parse(text); }catch(_){}
                const fileUser=(parsedHead && typeof parsedHead.user==='string') ? charSlice(parsedHead.user.trim(), 8) : '';
                const fileId=(parsedHead && isAccountId(parsedHead.accountId)) ? parsedHead.accountId : null;
                const doImport=(id)=>trackBusy((async()=>{
                    // 【1013-B】还没整理完的账号不能导入：导入会先在新位置建出账本，挡住老数据搬过来
                    //   【1013-D】账本还没搬进 IndexedDB 的账号同样不能导入
                    const target=accountById(id);
                    if(target && (typeof target.legacy==='string' || __ledgerPending.has(id))){
                        customAlert(`账号「${target.name}」的数据还没整理完，暂时不能往里导入。请关掉 App 重新打开后再试。`, '请稍候');
                        return;
                    }
                    try{
                        await ledgerLoad(storeKey(id));    // 导到哪个账号，先把它的账本读进内存
                        const { finalName, stats, daysAdded, daysPending }=await importArchiveFromText(text, id);
                        renderRecentUsers();
                        // 同一个账号（编号一样；旧备份没编号就比名字）：日子已自动带进来。
                        // 不是同一个：先问要不要一起导入日子，再问进不进账号。
                        askImportOtherDays(daysPending, id, (asked)=>{
                            customConfirm(`已导入到账号「${nameOf(id)}」的存档「${finalName}」。${importFixSuffix(stats)}${importDaysSuffix(daysAdded+asked)}\n\n现在进入该账号吗？`, ()=>{
                                login(id);           // 进入后会自动定位到 last（即刚导入的存档）
                            }, '导入成功', { okText:'立即进入', cancelText:'稍后' });
                        });
                    }catch(err){
                        const msg = err && err.message;
                        let tip;
                        if(msg==='empty')        tip='导入失败：文件里没有有效记录';
                        else if(msg==='toomany') tip='导入失败：记录条数过多（上限 5 万条），请拆分后再导入';
                        else if(msg==='quota')   tip='导入失败：存储空间不足，已放弃本次导入。请删除部分存档或记录后重试。';
                        else                     tip='导入失败：文件格式不正确';
                        customAlert(tip);
                    }
                })());
                const newThenImport=()=>promptNewAccount(doImport, (fileUser && !nameTaken(fileUser)) ? fileUser : '', fileId);
                // 还没整理完的账号不出现在可选列表里（见 doImport）
                const accts=getAccounts().filter(a=>typeof a.legacy!=='string' && !__ledgerPending.has(a.id));
                if(!accts.length){ newThenImport(); }
                else {
                    const opts=accts.map(a=>{
                        const o={ value:a.id, label:a.name };
                        if(a.id===fileId) o.desc='这份备份原来就是这个账号的';
                        else if(a.hidden) o.desc='已从登录页移走的账号';
                        return o;
                    });
                    opts.push({ value:'__new', label:'＋ 新建账号', desc:'导到一个新账号里，和现有账号分开' });
                    customChoose('把这份存档导入到哪个账号？', opts, (v)=>{
                        if(v==='__new') newThenImport(); else doImport(v);
                    }, '导入到账号', null, { layout:'list' });
                }

                $('loginImportFile').value='';
            };
            reader.readAsText(file);
        });

        // ===== 登录页：账号列表 =====
        let showHiddenAccounts=false;
        function accountChip(acc){
            const chip=document.createElement('div'); chip.className='user-chip';
            chip.title='点击进入';
            const av=document.createElement('div'); av.className='avatar';
            av.textContent=Array.from(acc.name)[0] || '?';
            const label=document.createElement('span'); label.textContent=acc.name;
            chip.appendChild(av); chip.appendChild(label);
            if(!acc.hidden){
                const del=document.createElement('button'); del.className='u-del'; del.textContent='×';
                del.title='从列表移走（数据不会删除，可在下方找回）';
                del.onclick=(e)=>{
                    e.stopPropagation();
                    customConfirm(`把「${acc.name}」从登录列表移走。\n\n账本数据不会删除，之后点下方「已移走的账号」就能找回。`, ()=>{
                        try{ setAccountHidden(acc.id, true); }catch(_){ customAlert('保存失败，请重试。'); }
                        renderRecentUsers();
                    }, '移走账号', { okText:'从列表移走' });
                };
                chip.appendChild(del);
            }
            chip.onclick=()=>login(acc.id);
            return chip;
        }
        function renderRecentUsers(){
            const box=$('recentUsers');
            box.innerHTML='';
            const all=getAccounts();
            const shown=all.filter(a=>!a.hidden), hidden=all.filter(a=>a.hidden);
            if(shown.length){
                const t=document.createElement('div'); t.className='recent-title'; t.textContent='选择账号';
                const wrap=document.createElement('div'); wrap.className='recent-list';
                shown.forEach(a=>wrap.appendChild(accountChip(a)));
                box.appendChild(t); box.appendChild(wrap);
            } else {
                const t=document.createElement('div'); t.className='recent-title';
                t.textContent = all.length ? '账号都被移走了，点下方找回，或者新建一个' : '还没有账号，先新建一个吧';
                box.appendChild(t);
            }
            if(hidden.length){
                const tg=document.createElement('button'); tg.className='hidden-toggle'; tg.id='hiddenToggle';
                tg.textContent = showHiddenAccounts ? '收起已移走的账号' : `已移走的账号（${hidden.length}）`;
                tg.onclick=()=>{ showHiddenAccounts=!showHiddenAccounts; renderRecentUsers(); };
                box.appendChild(tg);
                if(showHiddenAccounts){
                    const wrap=document.createElement('div'); wrap.className='recent-list hidden-list';
                    hidden.forEach(a=>wrap.appendChild(accountChip(a)));
                    box.appendChild(wrap);
                }
            }
        }
        // 新建账号：起个名字，建好直接进去
        function promptNewAccount(onCreated, preset, preferId){
            customPrompt('给新账号起个名字（最多 8 字）。名字以后可以在「设置 → 修改用户名」里改。', preset||'', (name)=>{
                name=name.trim();
                trackBusy((async()=>{
                    let id;
                    try{ id=await createAccount(name, preferId); }
                    catch(_){ customAlert('存储空间不足，没能新建账号。请删除部分存档或记录后重试。', '新建失败'); return; }
                    if(onCreated) onCreated(id);
                    else {
                        await login(id);
                        // 1016-R：新账号进去以后问一次「怎么开始？」（开发开关开着才问；只在新建账号这一次，可以跳过）
                        // 是「用记问打开」账单文件进来的，已经在导入了，就不问
                        const viaFile=window.__impOpenedNow; window.__impOpenedNow=false;
                        if(currentUser===id && devImportOn() && !viaFile) customConfirm('怎么开始？\n\n可以从零开始一笔笔记，也可以先把微信、支付宝的账单导进来，第一次打开就有几个月的统计可看。', ()=>{
                            loadImportUI().then(ui=>ui.open()).catch(e=>customAlert('导入模块没加载上：' + (e && e.message || e), '导入'));
                        }, '怎么开始', { okText:'导入微信、支付宝账单', cancelText:'从零开始记' });
                    }
                })());
            }, '新建账号', (name)=>accountNameError(name.trim()), { placeholder:'输入名字（最多 8 字）', maxchars:8 });
        }

        // 【1013-D】进入账号先从 IndexedDB 把账本读进内存（读一次），读好了再往下走，后面和以前一样
        let __loginSeq=0;
        function login(id){
            const acc=accountById(id);
            if(!acc){ renderRecentUsers(); return; }
            // 迁移还没搬完的账号先别进：进去会建一个空账本，反而挡住后面的数据搬过来
            if(typeof acc.legacy==='string' || __ledgerPending.has(id)){ customAlert('这个账号的数据还没整理完，请关掉 App 重新打开后再进。', '请稍候'); return; }
            const seq=++__loginSeq;
            const key=storeKey(id);
            return trackBusy(ledgerLoad(key).then(()=>{
                if(seq!==__loginSeq) return;          // 读的过程中又点了别的账号：以最后一次为准
                const boot=!!window.__autoLogin;
                if(boot) window.JiwenPerf.bootMark('read');
                ledgerEvictExcept(key);
                enterAccount(id);
                if(boot){ window.JiwenPerf.bootMark('render'); try{ window.__perfRecs=getUserData().length; }catch(_){} window.JiwenPerf.bootDone(); }
                // 【1013-H】账本有读不出来的地方：如实告诉用户（同一处只说一次）
                const dmg=ledgerDamageNotice(id);
                if(dmg) customAlert(dmg, '有数据读不出来');
            }, ()=>{
                if(seq!==__loginSeq) return;
                customAlert('读取账本失败，请关掉 App 重新打开后再试。', '读取失败');
            }));
        }
        function enterAccount(id){
            currentUser = id;
            touchAccount(id);
            localStorage.setItem('app_logged_in_user', id);   // 记住当前登录账号（编号），下次自动进入
            const store = loadStore();
            saveStoreSafe(store);
            currentArchive = store.last || Object.keys(store.archives)[0];
            // 兜底：若 last 指向一个已不存在的存档（导入/迁移等异常路径下可能发生），
            // 回退到第一个存档，避免 curArchive() 返回 undefined 导致主界面白屏
            if(!store.archives[currentArchive]){
                currentArchive = Object.keys(store.archives)[0];
                store.last = currentArchive; saveStoreSafe(store);
            }
            loginBox.style.display='none';
            mainBox.style.display='block';
            $('tabBar').style.display='flex';
            document.body.classList.remove('login-mode');
            nowUser.innerText = `当前用户：${nameOf(id)}`;
            resetSearch();
            refreshArchiveSelect();
            refreshCatSelectors();
            setDtInput(billTime, nowDtValue());   // 进入主界面即默认当前时间
            renderBill();
            renderDaysCard();             // 「日子」入口卡（数据独立于存档，跟账号走）
            ledgerScrollY=0;              // 1017-F：换了账号，账单页从顶上开始
            // 1019-F：打开 App 自动登录、上次是被系统关掉的（离开不到 RESUME_MAX_MS）：回到上次的页签、账单页第几页、滚到哪
            const auto=!!window.__autoLogin;
            const rs=auto && getDefaultTabPref()==='last' ? resumeTake(id) : null;   // 1019-L：设置里选了「上次停留」才回去
            window.__autoLogin=false;
            if(rs && rs.tab==='ledger' && rs.page>1){ curPage=rs.page; renderBill(); }
            if(rs && rs.tab==='ledger'){ ledgerScrollY=rs.y||0; currentTab=''; }   // currentTab 先清掉：switchTab 开头记滚动位置那一步别把它冲成 0
            switchTab(rs ? rs.tab : getDefaultTab());   // 按用户设置进入默认页（默认记账）
            if(auto) setTimeout(()=>formDraftRestore(id), 0);   // 填到一半的记一笔 / 修改，不管默认页选哪个都接着来
            // 历史脏数据自检（每个账号只跑一次）。放在最后：此时界面已就绪，
            // 修复函数内部可以直接刷新视图并弹出如实告知的提示。
            trackBusy(runTimeRepairOnce(id));
            // 1016-Z3：没进账号时「用记问打开」过来的账单文件，进了账号再接着处理
            if(window.__impOpened){ const f=window.__impOpened; window.__impOpened=null; window.__impOpenedNow=true; setTimeout(()=>impOpenFile(f), 0); }
        }

        logoutBtn.addEventListener('click', () => {
            currentUser=''; currentArchive='';
            localStorage.removeItem('app_logged_in_user');   // 退出后不再自动登录
            mainBox.style.display='none';
            $('tabBar').style.display='none';
            loginBox.style.display='block';
            document.body.classList.add('login-mode');
            $('actionBar').style.display='none';
            showHiddenAccounts=false;
            renderRecentUsers();
        });

        // 修改用户名：数据按编号存，改名只改账号列表里的名字（再抄一份进 store），不搬任何数据
        $('editNameBtn').addEventListener('click', () => {
            const id=currentUser, oldName=nameOf(id);
            customPrompt('', oldName, (newName)=>{
                newName=newName.trim();
                if(newName===oldName) return;
                const list=getAccounts().map(a=>a.id===id ? Object.assign({}, a, { name:newName }) : a);
                try{ saveAccounts(list); }
                catch(_){ customAlert('存储空间不足，改名未能完成，原名字没有变。请删除部分存档或记录后重试。', '改名失败'); return; }
                stampAccountName(id, newName);   // 当前账号的账本就在内存里
                nowUser.innerText=`当前用户：${newName}`;
                customAlert(`用户名已改为「${newName}」`);
            }, '修改用户名', (newName)=>{
                newName=newName.trim();
                if(newName===oldName) return '';
                return accountNameError(newName, id);
            }, { placeholder:'输入新用户名（最多 8 字）', maxchars:8 });
        });

        function refreshArchiveSelect(){
            const store = loadStore();
            archiveSelect.innerHTML='';
            Object.keys(store.archives).forEach(name => {
                const opt=document.createElement('option');
                opt.value=name; opt.textContent=name;
                if(name===currentArchive) opt.selected=true;
                archiveSelect.appendChild(opt);
            });
            odRefreshStatusUI();
        }
        archiveSelect.addEventListener('change', () => {
            currentArchive = archiveSelect.value;
            const store=loadStore(); store.last=currentArchive; saveStoreSafe(store);
            curPage=1; statSelDay=null; resetSearch(); refreshCatSelectors(); refreshAllViews();
            odRefreshStatusUI();
        });
        $('newArchive').addEventListener('click', () => {
            customPrompt('', '', (name)=>{
                name=name.trim();
                const store=loadStore();
                store.archives[name]={ records:[], cats:DEFAULT_CATS.slice() };
                store.last=name; saveStoreSafe(store); currentArchive=name;
                refreshArchiveSelect(); refreshCatSelectors(); refreshAllViews();
            }, '新建存档', (name)=>{
                name=name.trim();
                if(!name) return '存档名不能为空';
                if(charLen(name) > 16) return '存档名最多 16 个字～';
                if(loadStore().archives[name]) return '该存档名已存在';
                return '';
            }, { placeholder:'输入存档名称（最多 16 字）', maxchars:16 });
        });
        $('renameArchive').addEventListener('click', () => {
            customPrompt('', currentArchive, (name)=>{
                name=name.trim();
                if(name===currentArchive) return;
                const oldArchive=currentArchive;
                const store=loadStore();
                store.archives[name]=store.archives[oldArchive];
                delete store.archives[oldArchive];
                // 云备份连接按「用户名__存档名」存，存档改名必须跟着搬，否则改名后显示「未连接」、
                // 备份静默停掉。先搬连接、再存档：saveStoreSafe 会触发同步，那时要能找到新名下的连接。
                odMoveLink(currentUser, oldArchive, currentUser, name);
                currentArchive=name; store.last=name; saveStoreSafe(store);
                refreshArchiveSelect(); refreshCatSelectors(); refreshAllViews();
            }, '重命名存档', (name)=>{
                name=name.trim();
                if(name===currentArchive) return '';
                if(!name) return '存档名不能为空';
                if(charLen(name) > 16) return '存档名最多 16 个字～';
                if(loadStore().archives[name]) return '该存档名已存在';
                return '';
            }, { placeholder:'输入新存档名（最多 16 字）', maxchars:16 });
        });
        $('delArchive').addEventListener('click', () => {
            const store=loadStore();
            if(Object.keys(store.archives).length<=1){ customAlert('至少保留一个存档！'); return; }
            // 1017-U：写清楚会删掉什么（记录几条、导入记录和导入前备份），按钮「删除这个存档」警示色
            const n0=(store.archives[currentArchive] && store.archives[currentArchive].records || []).length;
            customConfirm(`删除存档「${currentArchive}」：里面的 ${n0} 条记录、分类、预算、模板，还有导入记录、单号表、待处理、导入前的备份都会一起删掉，找不回来。\n\n别的存档不受影响；要留底可以先在设置里「导出存档」。云盘上已有的备份文件不删。`, ()=>{
                const s=loadStore();
                const delName=currentArchive;
                delete s.archives[delName];
                // 顺带清掉这个存档的云备份连接，并释放系统授权（云盘上的文件不删）
                const delLink=odGetLink(currentUser, delName);
                const odp=odPlugin();
                if(odp && delLink && delLink.uri){ odp.forget({ uri: delLink.uri }).catch(()=>{}); }
                odClearLink(currentUser, delName);
                currentArchive=Object.keys(s.archives)[0];
                s.last=currentArchive; saveStoreSafe(s);
                refreshArchiveSelect(); refreshCatSelectors(); refreshAllViews();
            }, '删除存档', { danger:true, okText:'删除这个存档' });
        });

        $('exportBtn').addEventListener('click', async () => {
            const store=loadStore(); const a=curArchive(store);
            // days：倒数日随存档一起导出，让换手机时能一并带走。
            // 注意它是账号级的（全局一份），不是存档级的——多存档时每份导出文件都会
            // 各带一份相同副本。这是可接受的冗余：真把它挪进 archives[x] 才是错的
            // （切到「旅行」存档，「入职纪念日」难道就不存在了）。
            // 【1015-B】导入的名单、规则、导入记录、待处理池、单号表一起带上（空的不写，没导入过的存档备份内容不变）
            let impExtra;
            try{ impExtra=await impExportFields(currentUser, currentArchive, true); }
            catch(err){
                customAlert(err && err.code==='impdamaged'
                    ? '导入的单号表有一部分读不出来，这次没有导出。原文已另存在手机里，请联系开发者。'
                    : '读取导入数据失败，请重试。', '导出失败');
                return;
            }
            const payload={ app:'记问', user:nameOf(currentUser), accountId:currentUser, archive:currentArchive,
                cats:a.cats, budgets:a.budgets||{}, tpls:a.tpls||[], ...impArchFields(a), data:a.records, days:loadDays(),
                ...impExtra, exportedAt:new Date().toLocaleString() };
            const json=JSON.stringify(payload,null,2);
            const fileName=`记账存档_${currentArchive}_${Date.now()}.json`;

            // 在 App（安卓 WebView）里，<a download> 无效，改用 Capacitor 文件插件直接存到手机
            const cap = window.Capacitor;
            if(cap && cap.isNativePlatform && cap.isNativePlatform() && cap.Plugins && cap.Plugins.Filesystem){
                const { Filesystem } = cap.Plugins;
                // 依次尝试真实存在的目录枚举（Capacitor v6）：文档→外部→数据，哪个成功用哪个
                const targets = [
                    { directory:'DOCUMENTS', label:'手机「文档 / Documents」文件夹' },
                    { directory:'EXTERNAL',  label:'应用外部存储目录' },
                    { directory:'DATA',      label:'应用内部存储目录' }
                ];
                for(const t of targets){
                    try{
                        await Filesystem.writeFile({
                            path: fileName,
                            data: json,
                            directory: t.directory,
                            encoding: 'utf8',
                            recursive: true
                        });
                        customAlert(`已保存到${t.label}：\n${fileName}\n\n可用手机自带「文件管理」找到它。`, '导出成功', 'left');
                        return;
                    }catch(err){ /* 换下一个目录再试 */ }
                }
                // 全部失败：复制兜底
                showExportCopy(json);
                return;
            }

            // 浏览器：正常下载
            try{
                const blob=new Blob([json],{type:'application/json'});
                const url=URL.createObjectURL(blob);
                const el=document.createElement('a');
                el.href=url; el.download=fileName; el.click();
                URL.revokeObjectURL(url);
            }catch(err){
                showExportCopy(json);
            }
        });
        // 兜底：文件写入/下载全失败时，把存档内容放进导出弹窗供复制/分享。
        // 复用 aiExpMask（textarea + navigator.clipboard/execCommand 双兜底 + 系统分享），
        // 而不是塞进单行 <input>——几千条记录的 JSON 在单行框里既读不了、也没法可靠全选复制，
        // 那等于「最后的救命通道」实际拿不到数据。
        function showExportCopy(json){
            openAiExport(json, `${currentArchive} · ${(json.length/1024).toFixed(1)} KB`, {
                mode: 'backup',
                title: '导出存档（手动保存）',
                tip: '无法直接写入文件，请点「复制」或「分享」，把内容保存到记事本 / 云笔记 / 聊天收藏。这段文本就是完整备份，之后可用「导入存档」还原。'
            });
        }
        if($('odConnectBtn')){
            $('odConnectBtn').addEventListener('click', async () => {
                const plugin = odPlugin();
                if(!plugin){ customAlert('这个功能目前只支持安装到手机上的 App，网页版暂不支持。'); return; }
                try{
                    const suggested = `记问存档_${currentArchive}.json`;
                    const res = await plugin.pickFile({ mode:'create', suggestedName: suggested });
                    if(!res || !res.uri) return;
                    // 重新选择 = 明确的用户意图，解除守卫（含损坏名单），否则一旦拦下就再也恢复不了
                    __corruptedStores.delete(storeKey(currentUser));
                    ledgerAcceptDamage(currentUser, currentArchive);   // 这个存档读不出来的月份按现在的样子重写，以后不再暂停
                    odSetLink(currentUser, currentArchive, { uri: res.uri, name: res.name || suggested,
                        lastSyncAt:null, lastError:null, blocked:false, lastCount:0 });
                    odRefreshStatusUI();
                    customAlert('已连接，之后每次记账/修改会自动同步到这个文件。现在先手动同步一次试试。', '连接成功');
                    odSyncNow();
                }catch(err){
                    // 用户取消选择时也会走到这里，静默即可，不用报错打扰
                }
            });
        }
        // 1016-W：单号表云端文件：另选（新建）一个文件；恢复时从那个文件读（没连过就让你选一个）
        $('odOrdersBtn').addEventListener('click', async () => {
            const plugin=odPlugin(); if(!plugin) return;
            try{
                const suggested=`记问单号表_${currentArchive}.json`;
                const res=await plugin.pickFile({ mode:'create', suggestedName:suggested });
                if(!res || !res.uri) return;
                odSetOrdLink(currentUser, currentArchive, { uri:res.uri, name:res.name || suggested, lastSyncAt:null, lastError:null });
                await odOrdersSync();
                odRefreshStatusUI();
                const ol=odGetOrdLink();
                customAlert(ol && ol.lastError ? '已连接，但这次没传上：' + ol.lastError + '\n\n下次导入后会再试。' : '已连接，现在的单号表传上去了。以后每次导入、撤销、处理待处理后更新这个文件，平时记账不碰它。', '单号表上云');
            }catch(_){ /* 取消选择 */ }
        });
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
                    odClearLink(currentUser, currentArchive);
                    odRefreshStatusUI();
                }, '取消自动同步', { okText:'停止自动同步', cancelText:'继续同步' });
            });
        }
        $('setBuild').addEventListener('click', () => {
            const now=Date.now();
            JiwenImportEntry.__buildTaps=JiwenImportEntry.__buildTaps.filter(t=>now-t<2000); JiwenImportEntry.__buildTaps.push(now);
            if(JiwenImportEntry.__buildTaps.length<5) return;
            JiwenImportEntry.__buildTaps=[];
            const on=!devImportOn();
            try{ if(on) localStorage.setItem(DEV_IMPORT_KEY,'1'); else localStorage.removeItem(DEV_IMPORT_KEY); }catch(_){}
            renderDevImport();
            try{ if(currentUser) renderBill(); }catch(_){}     // 1016-R：空账本的小入口跟着开关出现 / 消失
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
                    const { finalName, stats, daysAdded, daysPending }=await importArchiveFromText(ev.target.result, currentUser);
                    // importArchiveFromText 内部已把新存档写盘并设好 store.last，无需再重读重写一遍
                    currentArchive=finalName;
                    // refreshAllViews 里已含 renderDaysCard，导进来的倒数日会一并刷新到入口卡
                    refreshArchiveSelect(); refreshCatSelectors(); refreshAllViews();
                    const user=currentUser;
                    askImportOtherDays(daysPending, user, (asked)=>{
                        if(asked && user===currentUser) refreshAllViews();
                        customAlert(`导入成功！已存为存档「${finalName}」${importFixSuffix(stats)}${importDaysSuffix(daysAdded+asked)}`, '导入成功', 'left');
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
        function refreshCatSelectors(){
            const cats=getCats();
            fillSelect(billCat, cats, cats[0]);
            const cur=filterCat.value;
            filterCat.innerHTML='<option value="__all">全部</option>';
            cats.forEach(c=>{
                const o=document.createElement('option'); o.value=c; o.textContent=c;
                filterCat.appendChild(o);
            });
            // 当前筛选值若在新分类表里仍存在则保留，否则回落到「全部」
            filterCat.value = [...filterCat.options].some(o=>o.value===cur) ? cur : '__all';
            renderFilterChips();
            if(window.syncFilterFab) window.syncFilterFab();
        }
        // 「管理分类」入口已从筛选浮层移到设置页（分类属于存档配置，与筛选语义分离）
        $('manageCatSetting').addEventListener('click', openCatManager);
        function showCatErr(msg){
            const el=$('catErr');
            el.textContent=msg||'';
            el.style.display = msg ? 'block' : 'none';
        }
        $('newCatName').addEventListener('input', ()=>showCatErr(''));
        $('addCatBtn').addEventListener('click', () => {
            const name=$('newCatName').value.trim();
            if(!name){ showCatErr('请输入分类名'); return; }
            if(charLen(name) > 8){ showCatErr('分类名最多 8 个字～'); return; }
            const store=loadStore(); const a=curArchive(store);
            if(a.cats.includes(name)){ showCatErr('该分类已存在'); return; }
            a.cats.push(name); saveStoreSafe(store);
            $('newCatName').value=''; showCatErr('');
            refreshCatSelectors(); openCatManager(); refreshAllViews(); refreshBillCatChipsIfOpen(); refreshEditCatChipsIfOpen();
            // 新分类排在末尾，若标签条已需横滑则它在最右看不到——主动滚到可见，给用户「确实加上了」的反馈
            const fbox=$('filterChips');
            if(fbox){
                const newChip=[...fbox.querySelectorAll('.cc')].find(el=>el.textContent===name);
                if(newChip) scrollChipIntoView(fbox, newChip);
            }
        });
        function openCatManager(){
            showCatErr('');
            const store=loadStore(); const a=curArchive(store);
            const list=$('catList'); list.innerHTML='';
            a.cats.forEach(c=>{
                const div=document.createElement('div'); div.className='cat-item';
                div.dataset.cat=c;

                const left=document.createElement('div'); left.className='cat-left';
                const handle=document.createElement('span'); handle.className='drag-handle';
                handle.textContent='⠿'; handle.title='长按拖动排序';
                const span=document.createElement('span'); span.className='cat-name'; span.textContent=c;
                left.appendChild(handle); left.appendChild(span);
                const bv=(a.budgets && a.budgets[c]>0) ? a.budgets[c] : null;
                if(bv!=null){
                    const bs=document.createElement('span'); bs.className='cat-budget';
                    bs.textContent=`每月预算 ${safeNum(bv).toFixed(0)}`;
                    left.appendChild(bs);
                }
                // 1019-C：行里不再塞「预算 / 改名 / 删除」三个小按钮，整行点开一个面板（拖动手柄除外）
                const more=document.createElement('span'); more.className='cat-more'; more.textContent='›'; more.setAttribute('aria-hidden','true');
                div.appendChild(left); div.appendChild(more);
                div.setAttribute('role','button');
                div.addEventListener('click', e=>{
                    if(e.target.closest('.drag-handle') || div.classList.contains('dragging') || (div.__dragEnd && Date.now()-div.__dragEnd<400)) return;
                    openCatActions(c);
                });
                attachCatDrag(div, handle);
                list.appendChild(div);
            });
            $('catMask').style.display='flex';
        }

        // ===== 分类长按拖动排序（pointer/touch 手写，避免 WebView 原生 draggable 不稳）=====
        // 在手柄上按住约 250ms 触发拖动；跟手移动，越过相邻项中线即交换位置；松手落位并存盘。
        function attachCatDrag(item, handle){
            let holdTimer=null, dragging=false;
            let startY=0, curY=0, placeholder=null, listEl=null, items=[];
            const HOLD_MS=250, MOVE_CANCEL=10;

            function onDown(e){
                const pt=e.touches?e.touches[0]:e;
                startY=pt.clientY; curY=startY;
                holdTimer=setTimeout(()=>startDrag(pt), HOLD_MS);
                document.addEventListener('pointermove', onMovePre, {passive:true});
                document.addEventListener('touchmove', onMovePre, {passive:true});
                document.addEventListener('pointerup', cancelPre, {passive:true});
                document.addEventListener('touchend', cancelPre, {passive:true});
                document.addEventListener('pointercancel', cancelPre, {passive:true});
                document.addEventListener('touchcancel', cancelPre, {passive:true});
            }
            // 长按未触发前若手指明显移动，判为滚动，取消长按
            function onMovePre(e){
                const pt=e.touches?e.touches[0]:e;
                if(Math.abs(pt.clientY-startY)>MOVE_CANCEL){ clearHold(); }
            }
            function cancelPre(){ clearHold(); }
            function clearHold(){
                if(holdTimer){ clearTimeout(holdTimer); holdTimer=null; }
                if(!dragging){
                    document.removeEventListener('pointermove', onMovePre);
                    document.removeEventListener('touchmove', onMovePre);
                    document.removeEventListener('pointerup', cancelPre);
                    document.removeEventListener('touchend', cancelPre);
                    document.removeEventListener('pointercancel', cancelPre);
                    document.removeEventListener('touchcancel', cancelPre);
                }
            }

            function startDrag(pt){
                dragging=true;
                clearHold();
                listEl=item.parentNode;
                items=Array.from(listEl.children);
                const rect=item.getBoundingClientRect();
                // 占位：保留原高度，避免后面项跳动
                placeholder=document.createElement('div');
                placeholder.className='cat-item drag-placeholder';
                placeholder.style.height=rect.height+'px';
                placeholder.style.marginBottom=getComputedStyle(item).marginBottom;
                listEl.insertBefore(placeholder, item);
                // 把被拖项变为绝对定位浮层，跟手
                item.classList.add('dragging');
                item.style.position='fixed';
                item.style.left=rect.left+'px';
                item.style.top=rect.top+'px';
                item.style.width=rect.width+'px';
                item.style.margin='0';
                item.style.pointerEvents='none';
                if(navigator.vibrate) try{ navigator.vibrate(15); }catch(_){}

                document.addEventListener('pointermove', onMove, {passive:false});
                document.addEventListener('touchmove', onMove, {passive:false});
                document.addEventListener('pointerup', onUp, {passive:true});
                document.addEventListener('touchend', onUp, {passive:true});
                document.addEventListener('pointercancel', onUp, {passive:true});
                document.addEventListener('touchcancel', onUp, {passive:true});
            }

            function onMove(e){
                if(!dragging) return;
                if(e.cancelable) e.preventDefault();      // 阻止页面滚动
                const pt=e.touches?e.touches[0]:e;
                curY=pt.clientY;
                const rect=item.getBoundingClientRect();
                item.style.top=(rect.top + (curY - (rect.top+rect.height/2)))+'px';
                // 找占位应插入的位置：以指针 Y 与各兄弟项中线比较
                const siblings=Array.from(listEl.children)
                    .filter(el=>el!==item && el!==placeholder);
                let inserted=false;
                for(const sib of siblings){
                    const r=sib.getBoundingClientRect();
                    if(curY < r.top + r.height/2){
                        listEl.insertBefore(placeholder, sib); inserted=true; break;
                    }
                }
                if(!inserted) listEl.appendChild(placeholder);
            }

            function onUp(){
                if(!dragging){ clearHold(); return; }
                dragging=false;
                // 落位：把拖项放回占位处
                listEl.insertBefore(item, placeholder);
                placeholder.remove(); placeholder=null;
                item.classList.remove('dragging');
                item.style.position=''; item.style.left=''; item.style.top='';
                item.style.width=''; item.style.margin=''; item.style.pointerEvents='';

                document.removeEventListener('pointermove', onMove);
                document.removeEventListener('touchmove', onMove);
                document.removeEventListener('pointerup', onUp);
                document.removeEventListener('touchend', onUp);
                document.removeEventListener('pointercancel', onUp);
                document.removeEventListener('touchcancel', onUp);

                item.__dragEnd=Date.now();   // 1019-C：刚拖完松手带出来的那一下点击不算「点开」
                persistCatOrder();
            }

            // 支持 PointerEvent 的设备只绑 pointerdown，避免触屏上 pointer+touch 双触发
            // 导致重复计时器/重复挂监听；老设备回退 touchstart。
            if(window.PointerEvent){
                handle.addEventListener('pointerdown', onDown, {passive:true});
            } else {
                handle.addEventListener('touchstart', onDown, {passive:true});
            }
        }

        // 把当前 DOM 里 cat-item 的顺序写回存档的 cats 数组
        function persistCatOrder(){
            const order=Array.from($('catList').children)
                .map(el=>el.dataset && el.dataset.cat)
                .filter(Boolean);
            if(!order.length) return;
            const store=loadStore(); const a=curArchive(store);
            // 以新顺序重排，遗漏的（理论上不会有）补在末尾
            const set=new Set(order);
            a.cats=order.concat(a.cats.filter(c=>!set.has(c)));
            saveStoreSafe(store);
            refreshCatSelectors(); refreshBillCatChipsIfOpen(); refreshEditCatChipsIfOpen();
        }
        // 设置 / 修改 / 取消某分类的每月预算。填 0 = 取消（customPrompt 不接受空串，用 0 表示「不要了」）。
        // opts.fromStats：从统计页「未设预算」里点的，存完只刷新统计页，不弹出分类管理
        // 1019-C：分类的操作面板：标题是分类名，「设预算」「改名」「删除这个分类」（警示色）竖排，「取消」在最下面
        function openCatActions(c){
            const a=curArchive(loadStore());
            if(!a.cats.includes(c)) return;
            const used=a.records.filter(r=>r.cat===c).length;
            const bv=(a.budgets && a.budgets[c]>0) ? a.budgets[c] : null;
            const sub=(bv!=null ? `每月预算 ${safeNum(bv).toFixed(0)} · ` : '') + (used ? `${used} 条记录` : '还没有记录');
            const btn=(id, text, cls, fn)=>{ const b=document.createElement('button'); b.type='button'; b.id=id; b.className='ui-btn block '+(cls||''); b.textContent=text; b.addEventListener('click', fn); return b; };
            window.JiwenSheet.open({ title:c, sub,
                body(box, done){
                    const st=document.createElement('div'); st.className='ui-stack'; st.id='catActList';
                    // 1019-S：设预算 / 改名的输入框存好、取消、返回、往下拉都回到这个分类的面板（改了名就是新名字的面板），再按返回才回列表；
                    //   删除的确认框取消也回这个面板，删掉了回列表
                    const back=name=>openCatActions(name||c);
                    st.appendChild(btn('catActBudget', bv!=null ? '改预算' : '设预算', '', ()=>{ done(); editBudget(c, { back }); }));
                    st.appendChild(btn('catActRename', '改名', '', ()=>{ done(); renameCat(c, { back }); }));
                    if(c!=='未分类') st.appendChild(btn('catActDelete', '删除这个分类', 'warn', ()=>{ done(); deleteCat(c, { back }); }));
                    else { const p=document.createElement('div'); p.className='ui-msg ui-msg-soft'; p.textContent='「未分类」是保留分类，不能删除。'; st.appendChild(p); }
                    box.appendChild(st);
                },
                foot(box, done){
                    const st=document.createElement('div'); st.className='ui-stack';
                    st.appendChild(btn('catActCancel', '取消', '', ()=>done()));
                    box.appendChild(st);
                } });
        }
        function editBudget(cat, opts){
            const cur=getBudgets()[cat];
            customPrompt(`给「${cat}」设一个每月预算（元）。填 0 表示取消预算。`, cur>0 ? String(cur) : '', (v)=>{
                const n=round2(Number(v));
                const store=loadStore(); const a=curArchive(store);
                a.budgets=Object.assign({}, a.budgets||{});
                if(n>0) a.budgets[cat]=n; else delete a.budgets[cat];
                if(!saveStoreSafe(store)) return;
                if(!(opts && opts.fromStats)) openCatManager();
                if(currentTab==='stats') renderStats();
                if(opts && opts.back) opts.back(cat);
            }, '分类预算', (v)=>{
                const n=Number(v);
                if(!isFinite(n) || n<0) return '请输入 0 或正数金额';
                if(n>99999999) return '金额太大啦，确认一下没多打几个 0？';
                return '';
            }, { inputmode:'decimal', placeholder:'例如 200', kpOk:'保存', onCancel:(opts && opts.back) ? ()=>opts.back(cat) : null });
        }

        function renameCat(oldName, opts){
            const back=opts && opts.back;
            customPrompt('', oldName, (name)=>{
                name=name.trim();
                if(!name || name===oldName){ if(back) back(oldName); return; }
                const store=loadStore(); const a=curArchive(store);
                a.cats=a.cats.map(c=>c===oldName?name:c);
                a.records=a.records.map(r=>r.cat===oldName ? Object.assign({}, r, { cat:name }) : r);
                // 预算跟着分类改名，否则改名后预算悄悄失效
                if(a.budgets && a.budgets[oldName]!=null){
                    a.budgets=Object.assign({}, a.budgets);
                    a.budgets[name]=a.budgets[oldName]; delete a.budgets[oldName];
                }
                // 常用模板也跟着改名
                if(Array.isArray(a.tpls)) a.tpls.forEach(t=>{ if(t.cat===oldName) t.cat=name; });
                // 【1015-B】导入的分类规则也跟着改名
                impRulesRenameCat(a, oldName, name);
                saveStoreSafe(store);
                refreshCatSelectors(); openCatManager(); refreshAllViews(); refreshBillCatChipsIfOpen(); refreshEditCatChipsIfOpen();
                if(back) back(name);
            }, '重命名分类', (name)=>{
                name=name.trim();
                if(!name) return '分类名不能为空';
                if(name===oldName) return '';
                if(charLen(name) > 8) return '分类名最多 8 个字～';
                if(curArchive(loadStore()).cats.includes(name)) return '该分类已存在';
                return '';
            }, { placeholder:'输入新分类名（最多 8 字）', maxchars:8, onCancel:back ? ()=>back(oldName) : null });
        }
        function deleteCat(name, opts){
            if(name==='未分类'){ customAlert('「未分类」是保留分类，不能删除哦～'); return; }
            const store=loadStore(); const a=curArchive(store);
            if(a.cats.length<=1){ customAlert('至少保留一个分类！'); return; }
            const used=a.records.filter(r=>r.cat===name).length;
            const nTpl=(Array.isArray(a.tpls) ? a.tpls : []).filter(t=>t.cat===name).length;
            const hasBudget=!!(a.budgets && a.budgets[name]>0);
            const lines=[used>0 ? `有 ${used} 条记录用着这个分类，删了以后这些记录会变成「未分类」，金额和备注都不动。` : '没有记录用着这个分类。'];
            if(nTpl) lines.push(`${nTpl} 个常用模板也会变成「未分类」。`);
            if(hasBudget) lines.push('这个分类的每月预算会一起删掉。');
            customConfirm(`删除分类「${name}」。\n\n${lines.join('\n')}`, ()=>{
                const s=loadStore(); const ar=curArchive(s);
                ar.cats=ar.cats.filter(c=>c!==name);
                if(!ar.cats.includes('未分类')) ar.cats.unshift('未分类');
                ar.records=ar.records.map(r=>r.cat===name ? Object.assign({}, r, { cat:'未分类' }) : r);
                if(ar.budgets && ar.budgets[name]!=null){ ar.budgets=Object.assign({}, ar.budgets); delete ar.budgets[name]; }
                // 常用模板与记录一致：归入「未分类」
                if(Array.isArray(ar.tpls)) ar.tpls.forEach(t=>{ if(t.cat===name) t.cat='未分类'; });
                // 【1015-B】导入的分类规则：指向这个分类的直接删（「关键词 → 未分类」没有意义）
                impRulesDropCat(ar, name);
                saveStoreSafe(s);
                refreshCatSelectors(); openCatManager(); refreshAllViews(); refreshBillCatChipsIfOpen(); refreshEditCatChipsIfOpen();
            }, '删除分类', { danger:true, okText:`删除分类「${name}」`, onCancel:(opts && opts.back) ? ()=>opts.back(name) : null });
        }
        // 数据变更后统一刷新：账单页总是刷新；统计页若正在显示也立即重算，
        // 避免「新增/删除记录后切到统计页数字没更新」的问题
        function refreshAllViews(){
            renderBill();
            if(currentTab==='stats') renderStats();
            // 「日子」入口卡也一并刷新：它虽与账单无关，但改名等路径会换 currentUser，
            // 收在这里就不必在每个调用点各加一行（漏一个就是显示旧账号的日子）。
            if(typeof renderDaysCard==='function') renderDaysCard();
        }
