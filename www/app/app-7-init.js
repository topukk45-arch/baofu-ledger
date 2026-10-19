        // ===== 页面初始化：若上次已登录且未退出，自动进入主界面；否则显示登录页 =====
        // 【1013-D】账本在 IndexedDB 里，启动要先打开库、把老账本搬过去，所以是 async。
        //   准备好之前把登录框藏起来，免得自动登录的人先闪一下登录页、或者在没准备好时点了按钮。
        //   1019-A：登录框在 HTML 里就用样式藏着（不靠脚本，第一帧也不画），只有确定不自动登录、
        //   要显示账号列表，或者自动登录出了错，才放出来；自动登录成功的中间一直不露登录框。
        (function initApp(){
            loginBox.style.visibility='hidden';
            trackBusy((async()=>{
                let dbOk=true;
                try{ (await idbKeys()).forEach(k=>__ledgerKeys.add(String(k))); }catch(_){ dbOk=false; }
                window.JiwenPerf.bootMark('db');
                // 账号列表坏了先找回（要看 IndexedDB 里有哪些账本）
                try{ await recoverAccountsIfBroken(); }catch(_){}
                // 1010-K7：先把老的「按名字存」的数据搬到账号编号下（只跑一次；没搬完下次接着搬）
                let migrated=true;
                try{ migrated=migrateAccounts(); }catch(_){ migrated=false; }
                // 1013-D：再把账本从 localStorage 搬进 IndexedDB（只跑一次；没搬完下次接着搬）
                let moved=true;
                if(dbOk){ try{ moved=await migrateLedgersToIdb(); }catch(_){ moved=false; } }
                // 1013-G：再把整段的账本拆成按月分块（只跑一次；没搬完下次接着搬）
                if(dbOk){ let ok2=true; try{ ok2=await migrateLedgersToBlocks(); }catch(_){ ok2=false; } moved=moved && ok2; }
                else {
                    moved=false;
                    getAccounts().forEach(a=>__ledgerPending.add(a.id));   // 库打不开：哪个账号都读不了账本
                }
                const remembered=localStorage.getItem('app_logged_in_user');
                const rememberedAcc=remembered ? accountById(remembered) : null;
                // 记住的账号自己已经整理好了，就照常自动进入（别的账号没整理完不影响它）
                if(rememberedAcc && typeof rememberedAcc.legacy!=='string' && !__ledgerPending.has(remembered) && ledgerExists(remembered)){
                    window.__autoLogin=true;   // 1019-F：只有打开 App 时的自动登录才接着上次被关掉前的样子
                    await login(remembered);   // 自动登录，按设置进入默认页
                } else {
                    // 没整理完时先留着，下次整理完还能自动进入
                    if(remembered && migrated && moved) localStorage.removeItem('app_logged_in_user');
                    document.body.classList.add('login-mode');
                    renderRecentUsers();
                    loginBox.style.visibility='';
                }
                // 【1013-B】如实说是哪几个账号没整理完：只有它们暂时进不去，其它账号照常用。
                //   放在自动登录之后，免得进入账号时弹出的别的提示把它盖掉。
                // 【1013-H】装回过旧版本、在那边记的账合并进来了：说一声，别让人以为账多出来了
                const mergeText=__ledgerMergeNotes.length
                    ? '装回过旧版本期间记的账已经合并进来：' + __ledgerMergeNotes.map(m=>
                        m.added.map(x=>`账号「${nameOf(m.id)}」存档「${x.archive}」${x.n} 笔`).join('、')).join('、')
                      + '。合并前的那份另存在手机里，没有删。'
                    : '';
                if(!dbOk){
                    customAlert('打不开手机上的账本数据库，暂时进不了账号。请关掉 App 重新打开；还不行的话，先别清除 App 数据，联系开发者。', '提示');
                } else if(mergeText && migrated && moved){
                    customAlert(mergeText, '提示');
                } else if(!migrated || !moved){
                    const pendingNames=getAccounts()
                        .filter(a=>typeof a.legacy==='string' || __ledgerPending.has(a.id))
                        .map(a=>`「${a.name}」`);
                    customAlert('升级时整理账号数据没有全部完成（可能是手机存储空间不足）。'
                        + (pendingNames.length ? `${pendingNames.join('、')}暂时进不去，其它账号可以正常使用。` : '')
                        + '下次打开 App 会接着整理。' + (mergeText ? '\n\n' + mergeText : ''), '提示');
                }
            })().finally(()=>{
                // 自动登录成功时登录框已经 display:none，放不放都看不见；没进去（出错）就把登录页放出来
                if(mainBox.style.display!=='block'){ loginBox.style.display='block'; document.body.classList.add('login-mode'); try{ renderRecentUsers(); }catch(_){} }
                loginBox.style.visibility='';
                snapUnveil();   // 1019-U：真的首屏（或登录页）出来了，拿掉快照、收启动画面
                if(JiwenBase.currentUser){ const id=JiwenBase.currentUser; setTimeout(()=>{ impDraftExpire(id).catch(()=>{}); }, 3000); }   // 1019-V：超过 24 小时的导入草稿删掉（等首屏出来一会儿再读库，不挡打开）
            }));
        })();

