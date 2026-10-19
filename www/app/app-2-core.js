
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
        archiveSelect.addEventListener('change', () => {
            currentArchive = archiveSelect.value;
            const store=loadStore(); store.last=currentArchive; saveStoreSafe(store);
            curPage=1; JiwenStats.statSelDay=null; resetSearch(); refreshCatSelectors(); refreshAllViews();
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
        // 数据变更后统一刷新：账单页总是刷新；统计页若正在显示也立即重算，
        // 避免「新增/删除记录后切到统计页数字没更新」的问题
        function refreshAllViews(){
            renderBill();
            if(currentTab==='stats') renderStats();
            // 「日子」入口卡也一并刷新：它虽与账单无关，但改名等路径会换 currentUser，
            // 收在这里就不必在每个调用点各加一行（漏一个就是显示旧账号的日子）。
            if(typeof renderDaysCard==='function') renderDaysCard();
        }
