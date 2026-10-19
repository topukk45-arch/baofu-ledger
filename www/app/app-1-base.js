        const { $, DEFAULT_CATS, MODE_HINT, PAGE_SIZE, SHEET_MS, addBill, afterOpenAnim, archiveSelect, billCat, billList, billMoney, billRemark, billTime, billType, cancelEdit, editCat, editMask, editMoney, editRemark, editTime, editType, escapeHtml, fabHold, fabWake, fillSelect, filterCat, fitNums, isDirtyTime, isFlow, isSkip, loginBox, logoutBtn, mainBox, normMoney, nowDtValue, nowUser, pad, parseRecTime, recMode, repairTime, round2, safeNum, sanitizeMoney, saveEdit, setRecMode } = window.JiwenBase;   // 旧代码引用表：base 已搬进 app/base.js，旧文件都搬完时删掉
        const { IMPORT_MAX_BYTES, IMP_APPS, MAX_IMPORT_RECORDS, TPL_MAX, TPL_NAME_MAX, __corruptedStores, __ledger, __ledgerKeys, __ledgerMergeNotes, __ledgerPending, accountById, accountNameError, balContrib, budgetPhrase, budgetSpentIn, catSigned, charLen, charSlice, createAccount, curArchive, daysKey, expSigned, genId, getAccounts, getBudgets, getCats, getUserData, idbKeys, impArchFields, impDraftExpire, impExportFields, impGetJson, impLogKey, impOrdersRestoreFromCloud, impPendKey, impRulesDropCat, impRulesRenameCat, impTarget, importArchiveFromText, isAccountId, isRefund, isValidDay, ledgerAcceptDamage, ledgerDamageNotice, ledgerEvictExcept, ledgerExists, ledgerLoad, loadDays, loadStore, mergeImportedDays, migrateAccounts, migrateLedgersToBlocks, migrateLedgersToIdb, modeAmtCls, modeTag, nameOf, nameTaken, odClearLink, odGetLink, odGetOrdLink, odMoveLink, odOrdersSync, odPlugin, odRefreshStatusUI, odScheduleSync, odSetLink, odSetOrdLink, odSyncNow, recoverAccountsIfBroken, refundedMap, refundedTag, refundedTotal, refundsOf, saveAccounts, saveStoreDurable, saveStoreSafe, saveUserData, setAccountHidden, stampAccountName, statContrib, storeKey, syncRefunds, touchAccount, tplName, tplSame, trackBusy } = window.JiwenStore;   // 旧代码引用表：store 已搬进 app/store.js，旧文件都搬完时删掉
        const { closeAllCs } = window.JiwenSelect;   // 旧代码引用表：select 已搬进 app/select.js，旧文件都搬完时删掉
        const { kpClose, kpOn, kpOpen } = window.JiwenKeypad;   // 旧代码引用表：keypad 已搬进 app/keypad.js，旧文件都搬完时删掉
        const { closeText } = window.JiwenText;   // 旧代码引用表：text 已搬进 app/text.js，旧文件都搬完时删掉
        const { bindSheetDrag, sheetGhostsFinish } = window.JiwenPanel;   // 旧代码引用表：sheet 已搬进 app/sheet.js，旧文件都搬完时删掉
        const { askCancel, askMask, closeAsk, customAlert, customAlertHtml, customChoose, customConfirm, customPrompt } = window.JiwenAsk;   // 旧代码引用表：ask 已搬进 app/ask.js，旧文件都搬完时删掉
        const { DT_YEAR_MAX, DT_YEAR_MIN, attachSwipe, closeDtPicker, getDtInput, openDtPicker, openDtPickerDate, playSlide, setDtInput } = window.JiwenDate;   // 旧代码引用表：date 已搬进 app/date.js，旧文件都搬完时删掉
        const { askImportOtherDays, importDaysSuffix, importFixSuffix, openAiExport } = window.JiwenAiExport;   // 旧代码引用表：ai 已搬进 app/ai-export.js，旧文件都搬完时删掉
        const { DEV_IMPORT_KEY, devImportOn, impOpenFile, loadImportUI, renderDevImport, scrollChipIntoView } = window.JiwenImportEntry;   // 旧代码引用表：impentry 已搬进 app/import-entry.js，旧文件都搬完时删掉
        const { closeEditModal, closeRefund, closeTplEditor, formSnaps, formState, getModeChips, openAddModal, refreshBillCatChipsIfOpen, refreshEditCatChipsIfOpen, refundLineHtml, renderEditCatChips, renderEditTypeChips, setModeChips } = window.JiwenForms;   // 旧代码引用表：forms 已搬进 app/forms.js，旧文件都搬完时删掉
        const { clearAllFilters, renderBill, renderFilterChips, resetSearch } = window.JiwenLedger;   // 旧代码引用表：ledger 已搬进 app/ledger.js，旧文件都搬完时删掉


        let currentUser = '';
        let currentArchive = '';
        let currentTab = 'ledger';
        let curPage = 1;

