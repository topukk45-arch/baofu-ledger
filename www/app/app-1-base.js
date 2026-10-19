        const { $, DEFAULT_CATS, MODE_HINT, PAGE_SIZE, SHEET_MS, addBill, afterOpenAnim, archiveSelect, billCat, billList, billMoney, billRemark, billTime, billType, cancelEdit, editCat, editMask, editMoney, editRemark, editTime, editType, escapeHtml, fabHold, fabWake, fillSelect, filterCat, fitNums, isDirtyTime, isFlow, isSkip, loginBox, logoutBtn, mainBox, normMoney, nowDtValue, nowUser, pad, parseRecTime, recMode, repairTime, round2, safeNum, sanitizeMoney, saveEdit, setRecMode } = window.JiwenBase;   // 旧代码引用表：base 已搬进 app/base.js，旧文件都搬完时删掉
        const { IMPORT_MAX_BYTES, IMP_APPS, MAX_IMPORT_RECORDS, TPL_MAX, TPL_NAME_MAX, __corruptedStores, __ledger, __ledgerKeys, __ledgerMergeNotes, __ledgerPending, accountById, accountNameError, balContrib, budgetPhrase, budgetSpentIn, catSigned, charLen, charSlice, createAccount, curArchive, daysKey, expSigned, genId, getAccounts, getBudgets, getCats, getUserData, idbKeys, impArchFields, impDraftExpire, impExportFields, impGetJson, impLogKey, impOrdersRestoreFromCloud, impPendKey, impRulesDropCat, impRulesRenameCat, impTarget, importArchiveFromText, isAccountId, isRefund, isValidDay, ledgerAcceptDamage, ledgerDamageNotice, ledgerEvictExcept, ledgerExists, ledgerLoad, loadDays, loadStore, mergeImportedDays, migrateAccounts, migrateLedgersToBlocks, migrateLedgersToIdb, modeAmtCls, modeTag, nameOf, nameTaken, odClearLink, odGetLink, odGetOrdLink, odMoveLink, odOrdersSync, odPlugin, odRefreshStatusUI, odScheduleSync, odSetLink, odSetOrdLink, odSyncNow, recoverAccountsIfBroken, refundedMap, refundedTag, refundedTotal, refundsOf, saveAccounts, saveStoreDurable, saveStoreSafe, saveUserData, setAccountHidden, stampAccountName, statContrib, storeKey, syncRefunds, touchAccount, tplName, tplSame, trackBusy } = window.JiwenStore;   // 旧代码引用表：store 已搬进 app/store.js，旧文件都搬完时删掉
        const { closeAllCs } = window.JiwenSelect;   // 旧代码引用表：select 已搬进 app/select.js，旧文件都搬完时删掉
        const { kpClose, kpOn, kpOpen } = window.JiwenKeypad;   // 旧代码引用表：keypad 已搬进 app/keypad.js，旧文件都搬完时删掉
        const { closeText } = window.JiwenText;   // 旧代码引用表：text 已搬进 app/text.js，旧文件都搬完时删掉
        const { bindSheetDrag, sheetGhostsFinish } = window.JiwenPanel;   // 旧代码引用表：sheet 已搬进 app/sheet.js，旧文件都搬完时删掉

        // ===== 1010-K5：点「备注」后，把保存按钮也露出来 =====
        // 键盘弹起时弹窗被压到半屏，WebView 只把备注框本身滚进视野，紧挨着的「添加记录 / 保存」
        // 正好卡在下沿外，得手动再滑一下。这里在备注聚焦后，把弹窗内部再往上滚一点。
        // 只滚弹窗自己（scrollTop），不用 scrollIntoView，免得连带滚动整个页面。
        (function(){
            const PAIRS = [['billRemark','addBill'], ['editRemark','saveEdit']];
            function revealSave(ta, btn){
                const dlg = ta && ta.closest('.edit-dialog');
                if(!dlg || !btn) return;
                const d = dlg.getBoundingClientRect(), b = btn.getBoundingClientRect(), t = ta.getBoundingClientRect();
                let delta = b.bottom + 12 - d.bottom;          // 按钮底边离弹窗可视下沿还差多少
                if(delta <= 0) return;                          // 已经看得见，不动
                delta = Math.min(delta, t.top - d.top - 8);     // 屏幕再小也别把备注框本身滚出顶部
                if(delta > 0) dlg.scrollTop += delta;
            }
            window.__revealSave = revealSave;   // 给测试用
            // 1019-O：备注改成点了弹文字输入小面板，大面板在输入时不动；写完（小面板点「确定」）才让保存按钮露出来（见 txtOk）
            if(false && window.visualViewport){
                window.visualViewport.addEventListener('resize', ()=>{
                    const a = document.activeElement;
                    PAIRS.forEach(([taId, btnId])=>{ if(a && a.id===taId) revealSave(a, document.getElementById(btnId)); });
                });
            }
        })();


        let currentUser = '';
        let currentArchive = '';
        let currentTab = 'ledger';
        let curPage = 1;
        // 账单表事件委托：备注查看 / 修改。用 data-act + data-id 取代内联 onclick，
        // 既杜绝把记录 id 拼进 HTML 属性的注入隐患，也避免每行绑定监听。
        billList.addEventListener('click', e => {
            const el = e.target.closest('[data-act]');
            if(!el || !billList.contains(el)) return;
            const id = el.dataset.id;
            if(el.dataset.act==='remark'){ window.viewRemark && window.viewRemark(id); }
            else if(el.dataset.act==='edit'){ window.openEdit && window.openEdit(id); }
        });

