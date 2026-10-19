        // ===== 自定义 确认 / 输入 弹窗 =====
        const askMask=$('askMask'), askTitle=$('askTitle'), askMsg=$('askMsg'),
              askInput=$('askInput'), askOk=$('askOk'), askCancel=$('askCancel');
        let askResolve=null, askMode='confirm', askChosen=null;

        const askErr=$('askErr');
        let askValidate=null;
        let askOnCancel=null;   // choose 模式取消回调（AI 导出回上一级用）
        function showAskErr(msg){
            askErr.textContent=msg;
            askErr.style.display = msg ? 'block' : 'none';
        }

        // 1017-S：显示 / 关掉都走这两个（加 / 去 .open：底部面板的往下拉关闭认它）
        function askShow(){ askMask.style.display='flex'; askMask.classList.add('open'); $('askSheet').scrollTop=0; }
        // opts.danger：覆盖、删除、清空、撤销、恢复、批量改这类，确认按钮用警示色；否则主色
        function askBtnLook(opts){ askOk.className='ui-btn block ' + (opts && opts.danger ? 'warn' : 'primary'); }
        function closeAsk(result){
            if(JiwenKeypad.kpTarget===askInput) kpClose();   // 1019-P：提示框里的数字键盘跟着收
            askMask.style.display='none'; askMask.classList.remove('open');
            askMask.classList.remove('as-page');   // 复位「当内容页用」的降档，下次当提示用时回到最顶
            askErr.style.display='none';
            const choices=$('askChoices');
            if(choices){ choices.style.display='none'; choices.innerHTML=''; }
            const extra=$('askExtra');
            if(extra){ extra.style.display='none'; extra.onclick=null; }
            renderAskList(null);
            const r=askResolve; askResolve=null; askValidate=null;
            const oc=askOnCancel; askOnCancel=null;
            if(r) r(result);
            // 取消（result 为 null/false）时若设置了回调，回到上一级
            if(oc && (result===null || result===false)) oc();
        }
        askOk.addEventListener('click', ()=>{
            if(askMode==='prompt'){
                const v=askInput.value.trim();
                if(v===''){ showAskErr('内容不能为空'); return; }
                if(askValidate){
                    const err=askValidate(v);   // 返回错误文案则拦截，返回空则通过
                    if(err){ showAskErr(err); return; }
                }
                closeAsk(v);
            } else if(askMode==='choose'){
                if(askChosen===null){ showAskErr('选一个再确定哦～'); return; }
                closeAsk(askChosen);
            } else closeAsk(true);
        });
        askCancel.addEventListener('click', ()=>closeAsk((askMode==='prompt'||askMode==='choose')?null:false));
        // 1017-S：往下拉关闭 = 返回键 = 取消（提示框就是关掉）；和筛选、选分类同一套手势
        bindSheetDrag(askMask, $('askSheet'), $('askGrip'), ()=>{ if(askMask.style.display==='flex') closeAsk(null); });
        // 禁止点击遮罩外部关闭，避免误触丢失输入；仅按钮可关闭
        askInput.addEventListener('keydown', e=>{ if(e.key==='Enter') askOk.click(); });
        askInput.addEventListener('input', ()=>{ if(askErr.style.display!=='none') showAskErr(''); });

        // 确认框：回调式。opts.okText / opts.cancelText 可自定义按钮文字
        //   opts.extra = { text, onClick } 可选第三按钮（弱化样式）：点击先关闭本弹窗再执行 onClick，
        //   便于在 onClick 里再弹另一个弹窗（两者共用 askMask，必须先关当前的）。
        function customConfirm(msg, onOk, title, opts){
            opts = opts || {};
            askMode='confirm';
            askOnCancel=opts.onCancel||null;   // 可选：点取消时要接着做的事（如导入时问完日子再问进不进账号）
            askValidate=null;   // 防御性复位：本模式不用校验，避免残留上一个 prompt 的校验函数
            askTitle.textContent=title||'确认操作';
            askMsg.textContent=msg;
            askMsg.style.display='';
            askMsg.style.textAlign='';
            askInput.style.display='none';
            askCancel.style.display='';
            askOk.textContent = opts.okText || '确定';
            askCancel.textContent = opts.cancelText || '取消';
            askBtnLook(opts);
            const extra=$('askExtra');
            if(opts.extra && opts.extra.text){
                extra.textContent=opts.extra.text;
                extra.style.display='';
                extra.onclick=()=>{
                    const fn=opts.extra.onClick;
                    askOnCancel=null;         // 点的是附加按钮，不算取消
                    closeAsk(false);          // 先关闭成功弹窗（不触发 onOk，因为传 false）
                    if(fn) fn();              // 再执行（通常是弹出补备注输入框）
                };
            } else {
                extra.style.display='none';
                extra.onclick=null;
            }
            renderAskList(opts.list);   // 可选：附一份记录清单（批量操作的确认）
            askResolve=(r)=>{
                askOk.textContent='确定'; askCancel.textContent='取消';   // 用完恢复默认，避免影响其它弹窗
                if(r && onOk) onOk();
            };
            askShow();
        }
        // 确认弹窗附带的记录清单：每行「时间 / 分类 / 备注 / 金额」四列。
        // 全部用 createElement + textContent 构建——备注、分类都是用户输入，不能拼进 innerHTML。
        // 传空则隐藏清单。按时间倒序（最新在上），和账单列表一致。
        function renderAskList(list){
            const box=$('askList'); if(!box) return;
            box.innerHTML='';
            if(!list || !list.length){ box.style.display='none'; return; }
            const sorted=list.slice().sort((a,b)=>parseRecTime(b.time)-parseRecTime(a.time));
            sorted.forEach(r=>{
                const row=document.createElement('div'); row.className='al-row';
                const t=document.createElement('span'); t.className='al-time';
                t.textContent=String(r.time||'').slice(5,16).replace('T',' ');
                const c=document.createElement('span'); c.className='al-cat';
                const tag=document.createElement('span'); tag.className='cat-tag'; tag.textContent=r.cat||'未分类';
                c.appendChild(tag);
                const rk=document.createElement('span'); rk.className='al-remark';
                rk.textContent=(r.remark||'').trim()||'—';
                const isExp=r.type==='expense';
                const a=document.createElement('span'); a.className='al-amt '+(isExp?'neg':'pos');
                a.textContent=(isExp?'−':'+')+safeNum(r.money).toFixed(2);
                const go=document.createElement('span'); go.className='al-go'; go.textContent='›';
                row.dataset.id=r.id;
                row.appendChild(t); row.appendChild(c); row.appendChild(rk); row.appendChild(a); row.appendChild(go);
                box.appendChild(row);
            });
            box.style.display='';
            box.scrollTop=0;
            // 清单行可点开详情 → 详情弹窗(1020)要盖在这个确认框上面。askMask 默认是最顶的 1040，
            // 这里按「内容页」降到 1010；closeAsk 会复位。
            askMask.classList.add('as-page');
        }

        // 清单行 → 只读详情。批量确认还没执行，此时允许改记录会让清单和即将执行的范围对不上，
        // 所以从这里进的详情隐藏「修改」按钮，只看不改。
        $('askList').addEventListener('click', e=>{
            const row=e.target.closest('.al-row');
            if(row && row.dataset.id) openDetail(row.dataset.id, { readonly:true });
        });

        // 输入框：回调式。validate(value) 返回错误文案则在弹窗内提示且不关闭，返回空则通过
        function customPrompt(msg, defVal, onOk, title, validate, opts){
            opts = opts || {};
            askMode='prompt';
            askOnCancel=opts.onCancel||null;   // 1016-Z8：点取消时要接着做的事（如压缩包密码不输了）
            askTitle.textContent=title||'请输入';
            // msg 为空则隐藏正文，避免与标题重复
            if(msg){ askMsg.textContent=msg; askMsg.style.display=''; }
            else { askMsg.textContent=''; askMsg.style.display='none'; }
            askInput.style.display='block';
            askInput.value=defVal||'';
            askInput.placeholder = opts.placeholder || '';
            // 补金额等场景可指定数字键盘；不传则恢复默认文本键盘，避免影响改名等其它调用
            if(opts.inputmode){ askInput.setAttribute('inputmode', opts.inputmode); }
            else { askInput.removeAttribute('inputmode'); }
            // 1019-P：要金额的（inputmode decimal）用 App 的数字键盘：输入框只读，滑上来以后自动弹数字键盘，大按钮直接提交
            const useKp = opts.inputmode==='decimal' && kpOn();
            askInput.readOnly=useKp; askInput.classList.toggle('kp-field', useKp);
            if(useKp){ askInput.setAttribute('inputmode', 'none'); askInput.dataset.kp='1'; askInput.dataset.kpOk=opts.kpOk||'确定'; }
            else { delete askInput.dataset.kp; delete askInput.dataset.kpOk; }
            // 【1013-C】maxchars：按「字」限长的名字类输入（账号、存档、分类）。输入框自带的 maxlength 按编码单位数，
            //   一个 emoji 占 2 个，「最多 8 个字」的框里只能打 4 个 emoji。所以输入框只放宽到 2 倍兜个底，
            //   真正的字数由各自的校验按实际字数检查（charLen），超了点确定时提示。
            //   不在打字时截断：中文输入法选字时框里是拼音，截了会把字打坏。
            //   maxlen：按原样限长（备注这类长文本，不涉及字数提示）。
            if(opts.maxchars){ askInput.setAttribute('maxlength', opts.maxchars*2); }
            else if(opts.maxlen){ askInput.setAttribute('maxlength', opts.maxlen); }
            else { askInput.removeAttribute('maxlength'); }
            askCancel.style.display='';
            askErr.style.display='none';
            askBtnLook(opts);
            askValidate=validate||null;
            askResolve=(r)=>{ if(r!==null && onOk) onOk(r); };
            askShow();
            afterOpenAnim(askMask, ()=>{ if(askMask.style.display!=='flex' || askInput.style.display==='none') return;
                if(askInput.dataset.kp==='1') kpOpen(askInput, { ok:askInput.dataset.kpOk, onOk:()=>askOk.click() });   // 1019-P
                else { askInput.focus(); askInput.select(); } });   // 1019-O：等滑上来再聚焦
        }
        // 选项弹窗：在弹窗里就地渲染一组可点选标签，选中点确定回调所选值。
        //   options: [{ value, label, cls }]  cls 用于收支的红/绿选中态（sel-out/sel-in）
        //   普通选项（如分类）选中走通用 .sel 态。点取消回调 null。
        //   opts.layout==='list'：选项一行一个、左对齐，多了在框内滑动（批量菜单、选分类用）
        function customChoose(msg, options, onOk, title, onCancel, opts){
            const asList = !!(opts && opts.layout==='list');
            askMode='choose';
            askChosen=null;
            askOnCancel=onCancel||null;   // 取消回调：取消时若设置则调用（用于 AI 导出回上一级）
            askValidate=null;   // 防御性复位：本模式不用校验，避免残留上一个 prompt 的校验函数
            askTitle.textContent=title||'请选择';
            if(msg){ askMsg.textContent=msg; askMsg.style.display=''; askMsg.style.textAlign=asList?'left':''; }
            else { askMsg.style.display='none'; }
            askInput.style.display='none';
            askCancel.style.display='';
            askErr.style.display='none';
            const box=$('askChoices');
            box.innerHTML='';
            box.style.display='flex';
            box.classList.toggle('choose-list', asList);
            // 收支两项且带语义色时撑满一行更协调；分类等正常自适应换行
            box.classList.toggle('io-chips', options.length===2 && options.some(o=>o.cls));
            askBtnLook(null);
            options.forEach(o=>{
                const b=document.createElement('div');
                b.className='cc';
                if(o.desc){
                    // 带说明的选项：标题 + 一行灰字。全部 textContent，不拼 HTML
                    const l=document.createElement('span'); l.className='cc-label'; l.textContent=o.label;
                    const ds=document.createElement('span'); ds.className='cc-desc'; ds.textContent=o.desc;
                    b.appendChild(l); b.appendChild(ds);
                } else {
                    b.textContent=o.label;
                }
                b.onclick=()=>{
                    askChosen=o.value;
                    box.querySelectorAll('.cc').forEach(el=>el.classList.remove('sel','sel-out','sel-in'));
                    b.classList.add(o.cls || 'sel');
                    if(askErr.style.display!=='none') showAskErr('');
                };
                box.appendChild(b);
            });
            askResolve=(r)=>{ if(r!==null && onOk) onOk(r); };
            askShow();
        }

        // 信息弹窗（纯文本）：只有「确定」，可选标题；用于替代 alert 和「查看备注」。
        // 一律走 textContent，无论调用方传什么都不会解析 HTML —— 这是本函数的安全保证。
        // 需要渲染富文本时改用下面的 customAlertHtml()，不要在这里加开关。
        //
        // 【为什么拆成两个函数】原先是 customAlert(msg, title, align, isHtml)，第四个位置参数是
        //   布尔，传个 true 就切到 innerHTML。这种设计在调用处一点都不显眼：customAlert(x,y,z,true)
        //   看上去人畜无害，但它就是全应用唯一的 XSS 入口。哪天有人想弹个带链接的提示，顺手补个
        //   true，再把没转义的备注拼进去，就出事了。
        //   现在把危险路径独立成一个名字里写着 Html 的函数：想用它必须显式写出来，函数名本身就是警告。
        function customAlert(msg, title, align){
            askMode='alert';
            askOnCancel=null;
            askTitle.textContent=title||'提示';
            askMsg.textContent=String(msg);          // 恒为 textContent，无分支、无开关
            askMsg.style.display='';
            askMsg.style.textAlign = (align==='left') ? 'left' : '';
            askInput.style.display='none';
            askCancel.style.display='none';
            askBtnLook(null);
            askResolve=null;
            askShow();
        }

        // 信息弹窗（富文本）：走 innerHTML，仅供确实需要结构化排版的少数场景。
        // 【调用方契约】传进来的 html 必须是「自己拼的安全模板 + 对所有用户数据做过 escapeHtml」。
        //   凡是用户可控的内容（备注、分类名、存档名…）一律先 escapeHtml，绝不能直接拼进来。
        // 目前仅一处调用：历史数据修复提示，已逐字段转义。
        function customAlertHtml(html, title, align){
            askMode='alert';
            askOnCancel=null;
            askTitle.textContent=title||'提示';
            askMsg.innerHTML=html;
            askMsg.style.display='';
            askMsg.style.textAlign = (align==='left') ? 'left' : '';
            askInput.style.display='none';
            askCancel.style.display='none';
            askBtnLook(null);
            askResolve=null;
            askShow();
        }

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

        // ===== 导出账单给 AI 分析 =====
        // 流程：选维度（日/周/月）→ 选具体时段（仅列出有记录的）→ 生成带 prompt 的纯文本 → 复制/分享。
        // 口径与统计页一致：周一为一周起始；金额一律走 safeNum，分类空则「未分类」。

        // 把一条记录格式化成「MM-DD HH:mm 支出 餐饮 16.00 元（备注：打车）」这种明细行
        function aiFmtRecord(r){
            const d=parseRecTime(r.time);
            const md=`${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
            const rf=isRefund(r);
            const io=r.type==='expense'?'支出':(rf?'退款':'收入');
            const amt=safeNum(r.money).toFixed(2);
            const cat=(r.cat||'未分类');
            const remark=(r.remark||'').trim();
            return `${md} ${io} ${cat} ${amt} 元${remark?`（备注：${remark}）`:''}${rf?'【退款】':''}${isSkip(r)?'【不计入收支】':(isFlow(r)?'【只算结余】':'')}`;
        }

        // 给定一批记录 + 范围标签，拼出完整的「prompt + 结构化账单」纯文本
        // budgetLines（可选）：按月导出时传入的预算执行情况，多行文本；不传则不出现这一节
        function buildAiText(records, rangeLabel, dimLabel, budgetLines){
            const inc=records.reduce((s,r)=>s+statContrib(r).inc,0);
            const exp=records.reduce((s,r)=>s+statContrib(r).exp,0);
            const skipN=records.filter(isSkip).length;
            const flowN=records.filter(isFlow).length;
            const refundRecs=records.filter(r=>isRefund(r) && recMode(r)==='normal');
            const refundN=refundRecs.length;
            const refundSum=round2(refundRecs.reduce((s,r)=>s+safeNum(r.money),0));
            const exclParts=[];
            if(skipN) exclParts.push(`${skipN} 笔不计入收支`);
            if(flowN) exclParts.push(`${flowN} 笔只算结余`);
            const bal=inc-exp;

            // 分类占比（按支出）
            const byCat={};
            records.forEach(r=>{ if(recMode(r)==='normal'){ const e=expSigned(r); if(e){ const c=r.cat||'未分类'; byCat[c]=(byCat[c]||0)+e; } } });
            const catLines=Object.keys(byCat).filter(c=>round2(byCat[c])>0).sort((a,b)=>byCat[b]-byCat[a]).map(c=>{
                const pct=exp>0?Math.round(byCat[c]/exp*100):0;
                return `  · ${c}：${byCat[c].toFixed(2)} 元（${pct}%）`;
            }).join('\n') || '  （本期无支出）';

            // 明细（按时间正序）
            const detail=records.slice().sort((a,b)=>parseRecTime(a.time)-parseRecTime(b.time))
                .map(r=>'  '+aiFmtRecord(r)).join('\n') || '  （本期无记录）';

            const prompt =
`【记问 · 消费分析请求】
你是一位务实、直接的个人理财顾问。下面是我某段时间的真实记账数据，请帮我：
1. 概括这段时间的整体消费情况（钱主要花在哪、收支是否健康）；
2. 指出其中值得注意的地方（异常大额、占比过高的分类、可优化的开销）；
3. 给出 3~5 条具体、可执行的省钱或预算建议，别讲空泛的大道理。
如果数据太少不足以分析，直接说明即可。${refundN?'\n标注【退款】的记录是之前某笔支出退回的钱，已从对应分类的支出里扣掉（支出、分类占比都是扣完后的净额），不是收入。':''}${exclParts.length?'\n标注【不计入收支】（重复记录，如信用卡还款）或【只算结余】（资金往来，如期初存款、垫付报销、借出借入）的记录，已从总览和分类占比中排除，分析消费时不要再把它们算进去。':''}

────────────────
■ 统计维度：${dimLabel}
■ 时间范围：${rangeLabel}
■ 总览：收入 ${inc.toFixed(2)} 元，支出 ${exp.toFixed(2)} 元，结余 ${bal.toFixed(2)} 元，共 ${records.length} 笔${exclParts.length?`（其中 ${exclParts.join('、')}）`:''}${refundN?`；含退款 ${refundN} 笔共 ${refundSum.toFixed(2)} 元，已冲抵支出`:''}
${budgetLines?`■ 分类月预算：\n${budgetLines}\n`:''}■ 支出分类占比：
${catLines}
■ 收支明细（按时间正序）：
${detail}
────────────────
请开始你的分析。`;
            return prompt;
        }

        // 打开结果弹窗，填入文本，绑定复制/分享。
        // opts（可选）：{ title, tip } 用于复用到「存档导出兜底」场景；不传则用 AI 分析的默认文案。
        const AIEXP_DEFAULT_TITLE = '导出账单给 AI 分析';
        const AIEXP_DEFAULT_TIP   = '复制或分享后，粘贴给任意 AI（如 Claude、DeepSeek、豆包），让它帮你分析消费、给出建议。';
        // 当前弹窗用途：'ai'=给 AI 分析；'backup'=存档兜底。仅用于让「复制成功」的提示语对得上场景。
        let aiExpMode='ai';
        function openAiExport(text, sub, opts){
            opts = opts || {};
            aiExpMode = opts.mode || 'ai';
            $('aiExpTitle').textContent = opts.title || AIEXP_DEFAULT_TITLE;
            $('aiExpTip').textContent   = opts.tip   || AIEXP_DEFAULT_TIP;
            $('aiExpText').value = text;
            $('aiExpSub').textContent = sub || '';
            $('aiExpMask').style.display='flex';
        }
        // 在 AI 导出弹窗之上弹提示。
        // 【原先的 over-aiexp 已废除】askMask 默认就是 1040，本来就高于 aiExpMask(1010)，
        //   不需要再临时提层。留着一个只在单一场景生效的特例，反而掩盖了「askMask 该始终最顶」
        //   这个真正的规则。
        function aiExpAlert(msg, title){
            customAlert(msg, title);
        }
        $('aiExpClose').addEventListener('click', ()=>{ $('aiExpMask').style.display='none'; });
        $('aiExpCopy').addEventListener('click', async ()=>{
            const text=$('aiExpText').value;
            let ok=false;
            try{ await navigator.clipboard.writeText(text); ok=true; }
            catch(_){
                // 兜底：选中 textarea 走 execCommand
                try{ const ta=$('aiExpText'); ta.focus(); ta.select(); ok=document.execCommand('copy'); }catch(__){}
            }
            aiExpAlert(
                ok ? (aiExpMode==='backup'
                        ? '已复制到剪贴板，请尽快粘贴保存到记事本 / 云笔记，避免剪贴板被覆盖。'
                        : '已复制到剪贴板，去粘贴给 AI 吧。')
                   : '复制失败，请手动长按文本框全选复制。',
                ok ? '复制成功' : '复制未成功');
        });
        $('aiExpShare').addEventListener('click', async ()=>{
            const text=$('aiExpText').value;
            // 优先系统分享（手机端可发微信/AI App）；不支持则退回复制
            if(navigator.share){
                try{ await navigator.share({ text }); return; }
                catch(err){ if(err && err.name==='AbortError') return; /* 用户取消，不提示 */ }
            }
            try{ await navigator.clipboard.writeText(text);
                aiExpAlert('当前环境不支持直接分享，已复制到剪贴板，可手动粘贴分享。', '已复制'); }
            catch(_){ aiExpAlert('当前环境不支持分享，请手动长按文本框复制。', '无法分享'); }
        });

        // 第二步：根据维度列出「有记录的具体时段」，选中后生成文本。
        // 各步「取消」回到第一步（选维度），而非直接退回设置页。
        function aiPickPeriod(dim){
            const all=getUserData();
            if(!all.length){ customAlert('当前存档还没有任何记账记录。', '无数据可导出'); return; }

            if(dim==='day'){
                // 用现成的日历选择器选某一天（比长列表更直观，且不随数据增长变长）。
                // 统计每天笔数（当天 0点~23:59:59），在格子下方显示；取消回到选维度。
                const dayCounts={};
                all.forEach(r=>{ const d=parseRecTime(r.time); const key=`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; dayCounts[key]=(dayCounts[key]||0)+1; });
                const today=new Date();
                const initDay=`${today.getFullYear()}-${pad(today.getMonth()+1)}-${pad(today.getDate())}`;
                openDtPickerDate(initDay, (dayStr)=>{
                    const [y,m,d]=dayStr.split('-').map(Number);
                    // 边界：当天 00:00:00.000 ~ 23:59:59.999
                    const start=new Date(y, m-1, d, 0, 0, 0, 0);
                    const end=new Date(y, m-1, d, 23, 59, 59, 999);
                    const recs=all.filter(r=>{ const t=parseRecTime(r.time); return t>=start && t<=end; });
                    const label=`${y}年${m}月${d}日`;
                    if(!recs.length){ customAlert(`${label} 这天没有记账记录，换一天试试。`, '当天无记录'); return; }
                    openAiExport(buildAiText(recs, label, '按日'), label);
                }, { counts:dayCounts, onCancel:aiChooseDim });
            }
            else if(dim==='week'){
                // 以周一为起始，列出有记录的周（倒序），最多最近 26 周
                const weekMap={};
                all.forEach(r=>{
                    const d=parseRecTime(r.time); d.setHours(0,0,0,0);
                    const lead=(d.getDay()+6)%7;                 // 距本周一的天数
                    const mon=new Date(d); mon.setDate(d.getDate()-lead);
                    const key=`${mon.getFullYear()}-${pad(mon.getMonth()+1)}-${pad(mon.getDate())}`;
                    (weekMap[key]=weekMap[key]||{cnt:0}).cnt++;
                });
                const weeks=Object.keys(weekMap).sort().reverse().slice(0,26);
                const opts=weeks.map(k=>{
                    const [y,m,d]=k.split('-').map(Number);
                    const mon=new Date(y,m-1,d); const sun=new Date(mon); sun.setDate(mon.getDate()+6);
                    const lbl=`${m}月${d}日 ~ ${sun.getMonth()+1}月${sun.getDate()}日（${weekMap[k].cnt} 笔）`;
                    return { label:lbl, value:k };
                });
                customChoose('选择要分析的周（周一起算）：', opts, (k)=>{
                    const [y,m,d]=k.split('-').map(Number);
                    const mon=new Date(y,m-1,d); mon.setHours(0,0,0,0);
                    const end=new Date(mon); end.setDate(mon.getDate()+7);
                    const recs=all.filter(r=>{ const t=parseRecTime(r.time); return t>=mon && t<end; });
                    const sun=new Date(mon); sun.setDate(mon.getDate()+6);
                    const label=`${mon.getFullYear()}年${mon.getMonth()+1}月${mon.getDate()}日 ~ ${sun.getMonth()+1}月${sun.getDate()}日`;
                    openAiExport(buildAiText(recs, label, '按周'), label);
                }, '选择周', aiChooseDim);
            }
            else { // month
                const monSet={};
                all.forEach(r=>{ const d=parseRecTime(r.time); const key=`${d.getFullYear()}-${pad(d.getMonth()+1)}`; monSet[key]=(monSet[key]||0)+1; });
                const months=Object.keys(monSet).sort().reverse().slice(0,36);
                const opts=months.map(k=>({ label:`${k.replace('-','年')}月（${monSet[k]} 笔）`, value:k }));
                customChoose('选择要分析的月份：', opts, (k)=>{
                    const [y,m]=k.split('-').map(Number);
                    const recs=all.filter(r=>{ const t=parseRecTime(r.time); return t.getFullYear()===y && t.getMonth()===m-1; });
                    const label=`${y}年${m}月`;
                    const bud=getBudgets();
                    const bLines=getCats().filter(c=>bud[c]>0)
                        .map(c=>`  · ${c}：预算 ${safeNum(bud[c]).toFixed(2)} 元，${budgetPhrase(budgetSpentIn(recs, c, y, m-1), safeNum(bud[c]))}`)
                        .join('\n');
                    openAiExport(buildAiText(recs, label, '按月', bLines), label);
                }, '选择月份', aiChooseDim);
            }
        }

        // 第一步：选维度（抽出以便各步「取消」回到这里）
        function aiChooseDim(){
            customChoose('想按什么维度分析？', [
                { label:'按日', value:'day' },
                { label:'按周', value:'week' },
                { label:'按月', value:'month' }
            ], (dim)=>aiPickPeriod(dim), '导出账单给 AI 分析');
        }
        $('exportAiBtn').addEventListener('click', aiChooseDim);

        // 导入的文件来自别的账号、里面带着日子时，问一句要不要一起导入。
        // 日子是账号级的唯一一份，导进来就是和现有的合并，所以必须让人点头，不能默认做。
        // done(n)：n = 实际导入的条数（选「不用了」为 0），调用方据此拼最后的提示。
        function askImportOtherDays(pending, targetUser, done){
            if(!pending || !pending.list.length){ done(0); return; }
            const from = pending.fromUser ? `账号「${pending.fromUser}」` : '另一个账号';
            customConfirm(`文件里还有 ${pending.list.length} 个日子（倒数日），原本属于${from}。\n\n`
                + `日子是每个账号只有一份的，导入后会和「${nameOf(targetUser)}」现有的日子放在一起。要一起导入吗？`,
                ()=>done(mergeImportedDays(pending.list, targetUser)),
                '一起导入日子？', { okText:'一起导入', cancelText:'不用了', onCancel:()=>done(0) });
        }

        // 把清洗统计拼成一句人类可读的提示尾巴（没有任何修正则返回空串）
        function importFixSuffix(stats){
            if(!stats) return '';
            const parts=[];
            if(stats.timeFixed>0)  parts.push(`${stats.timeFixed} 条时间不合法（如 2 月 30 日），已修正为该月的有效日期`);
            if(stats.typeFilled>0) parts.push(`${stats.typeFilled} 条缺收支类型，已默认按收入`);
            if(stats.dropped>0)    parts.push(`${stats.dropped} 条金额无效，已跳过`);
            return parts.length ? `\n\n注意：其中 ${parts.join('；')}。` : '';
        }

        // 倒数日导入结果的提示尾巴。0 条时返回空串——没导进来就别提，避免噪音
        // （文件里没有 days、是别人的存档、或全是重复项，都会是 0，用户不需要区分）。
        function importDaysSuffix(n){ return n>0 ? `\n\n同时导入了 ${n} 个日子。` : ''; }

        $('importBtn').addEventListener('click', () => $('importFile').click());

        // ===== 1015-A：账单导入（开发中）=====
        // 导入的代码在 import/ 目录下，平时启动一个都不加载；点开入口时才插入 import/import.js（loadImportModule）。
        // 开关只存在这台手机上（localStorage 的 app_dev_import），不进账本、不进备份、不进云备份。
        const DEV_IMPORT_KEY='app_dev_import';
        const devImportOn=()=>{ try{ return localStorage.getItem(DEV_IMPORT_KEY)==='1'; }catch(_){ return false; } };
        function renderDevImport(){ $('devImportBtn').style.display = $('devRestoreBtn').style.display = $('devLogsBtn').style.display = $('devRulesBtn').style.display = $('devPerfBtn').style.display = $('devSplashBtn').style.display = devImportOn() ? '' : 'none'; if(devImportOn()) splashWaitPaint(); }
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
        $('setBuild').textContent=$('loginBuild').textContent;
        renderDevImport();
        // 2 秒内连点 5 次版本号：开 / 关
        let __buildTaps=[];
        $('setBuild').addEventListener('click', () => {
            const now=Date.now();
            __buildTaps=__buildTaps.filter(t=>now-t<2000); __buildTaps.push(now);
            if(__buildTaps.length<5) return;
            __buildTaps=[];
            const on=!devImportOn();
            try{ if(on) localStorage.setItem(DEV_IMPORT_KEY,'1'); else localStorage.removeItem(DEV_IMPORT_KEY); }catch(_){}
            renderDevImport();
            try{ if(currentUser) renderBill(); }catch(_){}     // 1016-R：空账本的小入口跟着开关出现 / 消失
            renderStorageUse();
            try{ odRefreshStatusUI(); }catch(_){}
            customAlert(on ? '已打开「导入（开发中）」，入口在上面「存档管理」里。只在这台手机上有效。' : '已关闭「导入（开发中）」。', '开发开关');
        });
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
            if(!currentUser){ window.__impOpened=f; return; }
            impOpenFile(f);
        }
        function impOpenFile(f){
            if(!devImportOn()){ customAlert('导入功能还在测试中，暂时不能用记问打开账单文件。', '用记问打开'); return; }
            if(f.error){ customAlert(f.error==='too_big' ? '这个文件太大了（超过 8MB），读不了。' : '这个文件读不出来，换个方式选文件试试（导入页里点「选账单文件」）。', '用记问打开'); return; }
            let bytes;
            try{ const bin=atob(f.data||''); bytes=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i); }
            catch(_){ customAlert('这个文件读不出来。', '用记问打开'); return; }
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

        // 渲染筛选分类标签：「全部」固定第一个，其后按存档 cats 顺序。
        // 草稿模式：点击只更新草稿分类 draftCat + 切换高亮，不提交、不刷新列表；
        //   要点 sheet 的「完成」才会把 draftCat 提交进 filterCat 并筛选。
        function renderFilterChips(){
            const box=$('filterChips'); if(!box) return;
            // 草稿当前值：sheet 打开时用 draftCat；若 sheet 未开（如分类管理触发的重渲染），
            // 以已提交的 filterCat 为准并同步给 draftCat，避免下次打开时草稿是旧值
            const sheetOpen = $('filterSheetMask') && $('filterSheetMask').classList.contains('open');
            let cur;
            if(sheetOpen && window.getDraftCat){
                cur = window.getDraftCat();
            } else {
                cur = filterCat.value || '__all';
                if(window.setDraftCat) window.setDraftCat(cur);
            }
            const prevScroll=box.scrollLeft;
            box.innerHTML='';
            const items=[{v:'__all', t:'全部'}].concat(getCats().map(c=>({v:c, t:c})));
            items.forEach(it=>{
                const b=document.createElement('div');
                b.className='cc'+(it.v===cur?' sel':'');
                b.textContent=it.t;
                b.onclick=()=>{
                    if(window.setDraftCat) window.setDraftCat(it.v);   // 只改草稿
                    box.querySelectorAll('.cc').forEach(el=>el.classList.toggle('sel', el===b));
                    scrollChipIntoView(box, b);
                };
                box.appendChild(b);
            });
            box.scrollLeft=prevScroll;
        }

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
        // 「管理分类」入口已从筛选浮层移到设置页（分类属于存档配置，与筛选语义分离）
        $('manageCatSetting').addEventListener('click', openCatManager);
        $('closeCat').addEventListener('click', ()=>{ $('catMask').style.display='none'; });
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

        // ===== 自定义时间选择器 =====
        const dtMask=$('dtMask'), dtDays=$('dtDays'), dtLabel=$('dtLabel');
        const dtHour=$('dtHour'), dtMin=$('dtMin'), dtPreview=$('dtPreview');
        let dtTargetInput=null;   // 当前正在编辑哪个输入框
        let dtView={ year:new Date().getFullYear(), month:new Date().getMonth() };  // month 0-11，当前显示的月份
        let dtSel={ y:null, m:null, d:null }; // 选中的日期

        // 填充时分下拉
        for(let h=0; h<24; h++){ const o=document.createElement('option'); o.value=h; o.textContent=String(h).padStart(2,'0'); dtHour.appendChild(o); }
        for(let m=0; m<60; m++){ const o=document.createElement('option'); o.value=m; o.textContent=String(m).padStart(2,'0'); dtMin.appendChild(o); }

        // 解析 input 现有值 "YYYY-MM-DDTHH:mm" -> Date 部件；无值则用当前时间
        function parseInputDt(val){
            const m = val && val.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
            if(m) return { y:+m[1], mo:+m[2]-1, d:+m[3], h:+m[4], mi:+m[5] };
            const now=new Date();
            return { y:now.getFullYear(), mo:now.getMonth(), d:now.getDate(), h:now.getHours(), mi:now.getMinutes() };
        }

        let dtDateOnly=false;      // true=仅选日期（隐藏时分，确认时回写 YYYY-MM-DD）
        let dtOnPick=null;         // 仅日期模式下的回调；普通模式为 null，仍走 setDtInput
        let dtOnCancel=null;       // 取消回调；非空则「取消」调它（回上一级）而非直接关闭
        let dtDayCounts=null;      // {'YYYY-MM-DD': 笔数}，非空时格子下方显示当日笔数

        function openDtPicker(input){
            dtDateOnly=false; dtOnPick=null; dtOnCancel=null; dtDayCounts=null;
            dtLevel='day';             // 每次打开都从日网格开始，不残留上次的层级
            $('dtTimeRow').style.display='';
            dtTargetInput=input;
            const p=parseInputDt(getDtInput(input));
            dtView={ year:p.y, month:p.mo };
            dtSel={ y:p.y, m:p.mo, d:p.d };
            dtHour.value=p.h; dtMin.value=p.mi;
            renderDtDays();
            updateDtPreview();
            dtMask.style.display='flex';
            dtWheelsSync();
        }

        // 仅日期选择器：initialDay 为 'YYYY-MM-DD' 或空；选定后回调 onPick(day) / 清空时 onPick('')
        // opts（可选）：{ counts:{日期串:笔数} 格子显示笔数, onCancel:fn 取消时回上级 }
        function openDtPickerDate(initialDay, onPick, opts){
            dtDateOnly=true; dtOnPick=onPick; dtTargetInput=null;
            dtLevel='day';             // 同上，从日网格开始
            dtOnCancel=(opts && opts.onCancel) || null;
            dtDayCounts=(opts && opts.counts) || null;
            $('dtTimeRow').style.display='none';
            let y,mo,d;
            const m=initialDay && initialDay.match(/^(\d{4})-(\d{2})-(\d{2})$/);
            if(m){ y=+m[1]; mo=+m[2]-1; d=+m[3]; }
            else { const now=new Date(); y=now.getFullYear(); mo=now.getMonth(); d=now.getDate(); }
            dtView={ year:y, month:mo };
            dtSel={ y, m:mo, d };
            renderDtDays();
            updateDtPreview();
            dtMask.style.display='flex';
        }

        function renderDtDayGrid(){
            dtLabel.textContent=`${dtView.year}年${pad(dtView.month+1)}月`;
            dtDays.innerHTML='';
            const first=new Date(dtView.year, dtView.month, 1);
            // 周一为起始：getDay() 0=周日
            let lead=(first.getDay()+6)%7;
            const daysInMonth=new Date(dtView.year, dtView.month+1, 0).getDate();
            const today=new Date();
            for(let i=0;i<lead;i++){ const e=document.createElement('div'); e.className='dt-day muted'; dtDays.appendChild(e); }
            for(let d=1; d<=daysInMonth; d++){
                const el=document.createElement('div'); el.className='dt-day';
                // 日期数字（含可选笔数时用子节点，避免 textContent 覆盖）
                if(dtDayCounts){
                    const key=`${dtView.year}-${pad(dtView.month+1)}-${pad(d)}`;
                    const cnt=dtDayCounts[key]||0;
                    const numSpan=document.createElement('span'); numSpan.textContent=d;
                    el.appendChild(numSpan);
                    if(cnt>0){
                        const c=document.createElement('span'); c.className='dt-cnt'; c.textContent=`${cnt}笔`;
                        el.appendChild(c);
                    }
                } else {
                    el.textContent=d;
                }
                if(today.getFullYear()===dtView.year && today.getMonth()===dtView.month && today.getDate()===d) el.classList.add('today');
                if(dtSel.y===dtView.year && dtSel.m===dtView.month && dtSel.d===d) el.classList.add('selected');
                el.onclick=()=>{
                    dtSel={ y:dtView.year, m:dtView.month, d:d };
                    renderDtDays(); updateDtPreview();
                };
                dtDays.appendChild(el);
            }
        }

        function updateDtPreview(){
            if(dtSel.d==null){ dtPreview.textContent='请选择日期'; return; }
            if(dtDateOnly){
                dtPreview.textContent=`${dtSel.y}-${pad(dtSel.m+1)}-${pad(dtSel.d)}`;
            } else {
                dtPreview.textContent=`${dtSel.y}-${pad(dtSel.m+1)}-${pad(dtSel.d)} ${pad(dtHour.value)}:${pad(dtMin.value)}`;
            }
        }

        // ===== 三级下钻：日 → 月 → 年 =====
        // dtLevel: 'day' | 'month' | 'year'
        // 点标题下钻一级；选中后逐级收回（选年→回月网格，选月→回日网格）。
        // ‹ › 与「网格内左右滑动」是同一动作的两个入口，都翻「当前层级」：
        //   日层级翻月、月层级翻年、年层级翻年组（12 年一组）。
        let dtLevel='day';
        // 年份范围：当前年 ±100。足够覆盖任何倒数日（出生纪念、退休、还贷到期…），
        // 又不至于让用户翻到 9999 年。
        const DT_YEAR_MIN=new Date().getFullYear()-100;
        const DT_YEAR_MAX=new Date().getFullYear()+100;
        const DT_YEARS_PER_PAGE=12;
        let dtYearPageStart=0;   // 年网格当前页的起始年

        // 给元素重放一次方向性入场动画。
        // 必须先移除 class 并强制回流（读一次 offsetWidth）——否则连续往同一方向翻页时，
        // class 一直在，浏览器认为没变化，动画不会重新触发（第二次翻页就没动效了）。
        function playSlide(el, dir){
            if(!el || !dir) return;
            el.classList.remove('in-next','in-prev');
            void el.offsetWidth;                                  // 强制回流，重置动画状态
            el.classList.add(dir>0 ? 'in-next' : 'in-prev');
        }

        // 统一入口：按当前层级渲染对应网格 + 头部标题。
        // 保留 renderDtDays 这个名字（其它地方在调），让它变成一个分发器。
        // dir：翻页方向（+1 下一页 / -1 上一页），仅由 dtNav 传入；点标题下钻、
        //      「此刻」、打开弹窗等场景不传 —— 那些不是「翻页」，不该有方向性入场。
        function renderDtDays(dir){
            $('dtPaneDay').style.display   = dtLevel==='day'   ? 'flex' : 'none';
            $('dtPaneMonth').style.display = dtLevel==='month' ? 'flex' : 'none';
            $('dtPaneYear').style.display  = dtLevel==='year'  ? 'flex' : 'none';
            // 已在最顶层(年)时去掉标题的下钻箭头提示
            $('dtLabel').classList.toggle('top', dtLevel==='year');
            if(dtLevel==='day')        renderDtDayGrid();
            else if(dtLevel==='month') renderDtMonthGrid();
            else                       renderDtYearGrid();
            // 动画挂在 pane 上（而非网格上），三个层级共用同一套，视觉一致
            if(dir) playSlide($(dtLevel==='day' ? 'dtPaneDay' : dtLevel==='month' ? 'dtPaneMonth' : 'dtPaneYear'), dir);
        }

        function renderDtMonthGrid(){
            dtLabel.textContent=`${dtView.year}`;
            const box=$('dtMonths');
            box.innerHTML='';
            const now=new Date();
            for(let m=0;m<12;m++){
                const el=document.createElement('div');
                el.className='dt-cell';
                el.textContent=`${m+1}月`;
                if(dtSel.d!=null && dtSel.y===dtView.year && dtSel.m===m) el.classList.add('selected');
                if(now.getFullYear()===dtView.year && now.getMonth()===m) el.classList.add('today');
                el.onclick=()=>{
                    dtView.month=m;
                    dtLevel='day';        // 选完月 → 收回日网格
                    renderDtDays();
                };
                box.appendChild(el);
            }
        }

        function renderDtYearGrid(){
            const end=dtYearPageStart+DT_YEARS_PER_PAGE-1;
            dtLabel.textContent=`${dtYearPageStart} - ${end}`;
            const box=$('dtYears');
            box.innerHTML='';
            const nowY=new Date().getFullYear();
            for(let i=0;i<DT_YEARS_PER_PAGE;i++){
                const y=dtYearPageStart+i;
                const el=document.createElement('div');
                el.className='dt-cell';
                el.textContent=y;
                if(y<DT_YEAR_MIN || y>DT_YEAR_MAX){
                    el.classList.add('muted');           // 超范围的年份不可选
                    box.appendChild(el);
                    continue;
                }
                if(dtSel.d!=null && dtSel.y===y) el.classList.add('selected');
                if(y===nowY) el.classList.add('today');
                el.onclick=()=>{
                    dtView.year=y;
                    dtLevel='month';      // 选完年 → 收回月网格
                    renderDtDays();
                };
                box.appendChild(el);
            }
        }

        // 点标题：下钻一级（日→月→年）。年是顶层，再点无效。
        dtLabel.onclick=()=>{
            if(dtLevel==='day'){
                dtLevel='month';
            } else if(dtLevel==='month'){
                dtLevel='year';
                // 年网格开在「包含当前视图年份」的那一页
                dtYearPageStart = dtView.year - ((dtView.year % DT_YEARS_PER_PAGE) + DT_YEARS_PER_PAGE) % DT_YEARS_PER_PAGE;
            }
            renderDtDays();
        };

        // 翻页：按当前层级决定翻什么。dir = -1 上一页 / +1 下一页
        function dtNav(dir){
            if(dtLevel==='day'){
                dtView.month += dir;
                if(dtView.month<0){ dtView.month=11; dtView.year--; }
                if(dtView.month>11){ dtView.month=0;  dtView.year++; }
            } else if(dtLevel==='month'){
                const y=dtView.year+dir;
                if(y<DT_YEAR_MIN || y>DT_YEAR_MAX) return;
                dtView.year=y;
            } else {
                const s=dtYearPageStart + dir*DT_YEARS_PER_PAGE;
                // 整页都超出范围就不翻了
                if(s+DT_YEARS_PER_PAGE-1 < DT_YEAR_MIN || s > DT_YEAR_MAX) return;
                dtYearPageStart=s;
            }
            // 越界的早退分支在上面就 return 了 —— 没翻动就不该有入场动画，
            // 否则用户在边界反复滑，画面一直在动却什么也没变，反而误导。
            renderDtDays(dir);
        }
        $('dtPrev').onclick=()=>dtNav(-1);
        $('dtNext').onclick=()=>dtNav(1);

        // ===== 网格内左右滑动翻页 =====
        // 只挂在网格容器上，不是整个弹窗：.dt-dialog 有 overflow-y:auto（内容超出要能上下滚），
        // 若整个弹窗吃横向手势，会和纵向滚动打架。
        // 容器 CSS 设了 touch-action:pan-y —— 纵向仍交给浏览器，横向归我们。
        // 判定：位移超过阈值，且横向分量明显大于纵向（避免斜着滑或纵向滚动被误判为翻页）。
        function attachSwipe(el, onSwipe){
            let x0=0, y0=0, tracking=false;
            const MIN_DIST=40;     // 至少滑这么远才算翻页，避免误触
            const RATIO=1.5;       // 横向要比纵向明显（dx > 1.5×dy）才认定为横滑
            el.addEventListener('touchstart', e=>{
                if(e.touches.length!==1){ tracking=false; return; }
                x0=e.touches[0].clientX; y0=e.touches[0].clientY; tracking=true;
            }, {passive:true});
            el.addEventListener('touchend', e=>{
                if(!tracking) return;
                tracking=false;
                const t=e.changedTouches && e.changedTouches[0];
                if(!t) return;
                const dx=t.clientX-x0, dy=t.clientY-y0;
                if(Math.abs(dx) < MIN_DIST) return;
                if(Math.abs(dx) < Math.abs(dy)*RATIO) return;   // 更像纵向滚动，不处理
                onSwipe(dx<0 ? 1 : -1);   // 左滑(dx<0) = 下一页
            }, {passive:true});
        }
        // 左滑 → 下一页，右滑 → 上一页（与 › ‹ 一致）
        attachSwipe($('dtGridBox'), dir=>dtNav(dir));
        dtHour.onchange=updateDtPreview;
        dtMin.onchange=updateDtPreview;
        // ===== 1019-T：时 / 分滚轮 =====
        //   一格 48px，上下各垫一格空白，第 i 项滚到 i*48 时正好在中间那格；滑停（120 毫秒没再动）吸到最近一格，
        //   写回藏着的 select、发 change（照旧走 updateDtPreview）；点某一格直接选它并滚到中间。代码里改了 select 的值调 dtWheelsSync() 跟上。
        const DW_H=48;
        function dtWheelBuild(sel, box){
            box.innerHTML='';
            const pad=()=>{ const e=document.createElement('div'); e.className='dw-pad'; e.setAttribute('aria-hidden','true'); return e; };
            box.appendChild(pad());
            Array.from(sel.options).forEach((o, i)=>{
                const it=document.createElement('div'); it.className='dw-item'; it.setAttribute('role','option'); it.dataset.v=o.value; it.textContent=o.textContent;
                it.addEventListener('click', ()=>{ dtWheelPick(sel, box, i); try{ box.scrollTo({ top:i*DW_H, behavior:'smooth' }); }catch(_){ box.scrollTop=i*DW_H; } });
                box.appendChild(it);
            });
            box.appendChild(pad());
            let t=null;
            box.addEventListener('scroll', ()=>{
                const i=Math.max(0, Math.min(sel.options.length-1, Math.round(box.scrollTop/DW_H)));
                dtWheelPaint(box, i);
                clearTimeout(t); t=setTimeout(()=>dtWheelPick(sel, box, i), 120);
            }, { passive:true });
        }
        function dtWheelPaint(box, i){
            box.querySelectorAll('.dw-item').forEach((e, k)=>{ const on=k===i; e.classList.toggle('sel', on); e.setAttribute('aria-selected', on?'true':'false'); });
        }
        function dtWheelPick(sel, box, i){
            const v=sel.options[i] && sel.options[i].value;
            dtWheelPaint(box, i);
            if(v==null || sel.value===v) return;
            sel.value=v; sel.dispatchEvent(new Event('change', { bubbles:true }));
        }
        function dtWheelSync(sel, box){
            const i=Math.max(0, sel.selectedIndex);
            dtWheelPaint(box, i);
            box.scrollTop=i*DW_H;
            requestAnimationFrame(()=>{ box.scrollTop=i*DW_H; });   // 刚显示出来时还没排版，下一帧再放一次
        }
        function dtWheelsSync(){ dtWheelSync(dtHour, $('dtHourWheel')); dtWheelSync(dtMin, $('dtMinWheel')); }
        dtWheelBuild(dtHour, $('dtHourWheel')); dtWheelBuild(dtMin, $('dtMinWheel'));
        window.dtWheelsSync=dtWheelsSync;   // 给测试用
        $('dtNow').onclick=()=>{
            const now=new Date();
            dtLevel='day';   // 「此刻」选的是具体某一天，若正停在月/年网格要收回日网格
            dtView={ year:now.getFullYear(), month:now.getMonth() };
            dtSel={ y:now.getFullYear(), m:now.getMonth(), d:now.getDate() };
            dtHour.value=now.getHours(); dtMin.value=now.getMinutes();
            renderDtDays(); updateDtPreview(); dtWheelsSync();
        };
        // 关闭时务必一并收起时/分下拉：面板展开时被传送到 <body> 下，
        // 它已不是 dtMask 的后代，隐藏 dtMask 并不会连带隐藏它 —— 不收起就会留下一个悬空浮层。
        function closeDtPicker(){ closeAllCs(); dtMask.style.display='none'; dtTargetInput=null; dtOnPick=null; dtOnCancel=null; dtDayCounts=null; $('dtTimeRow').style.display=''; }
        $('dtCancel').onclick=()=>{
            // AI 导出场景：取消回到「选日/周/月」那一步，而非直接退回设置页
            const back=dtOnCancel;
            closeDtPicker();
            if(back) back();
        };
        // 禁止点击遮罩外部关闭，仅按钮可关闭
        $('dtConfirm').onclick=()=>{
            // 还停在月/年网格时不能确认——此时根本没在选「日」。引导回日网格。
            if(dtLevel!=='day'){ customAlert('请先选到具体的某一天～'); return; }
            if(dtSel.d==null){ customAlert('请先选择日期！'); return; }
            // 选中项必须落在当前正在看的那个月里，否则要求重新点一次。
            // 场景：用户翻年/翻月到 2025年2月，但 dtSel 还停在翻页前选中的 2024年2月29日
            // —— 此时点「确认」会静默提交 2024 年，和用户眼前看到的 2025 年不是一回事。
            // 翻页不改选中项（这是对的，避免误改），但提交前必须确认两者一致。
            if(dtSel.y!==dtView.year || dtSel.m!==dtView.month){
                customAlert('请点选一个日期～');
                return;
            }
            if(dtDateOnly){
                const day=`${dtSel.y}-${pad(dtSel.m+1)}-${pad(dtSel.d)}`;
                const cb=dtOnPick;
                closeDtPicker();
                if(cb) cb(day);
                return;
            }
            const val=`${dtSel.y}-${pad(dtSel.m+1)}-${pad(dtSel.d)}T${pad(dtHour.value)}:${pad(dtMin.value)}`;
            if(dtTargetInput){
                setDtInput(dtTargetInput, val);
            }
            closeDtPicker();
        };

        // 给时间输入框赋值：dataset.value 存规范格式(带T，逻辑用)，显示框去掉T更美观
        // 传空则同时清空
        function setDtInput(input, val){
            if(!val){ input.value=''; input.dataset.value=''; paintRecTime(input); return; }
            input.dataset.value=val;
            input.value=val.replace('T',' ');
            paintRecTime(input);
        }
        // 1019-Q：记一笔 / 修改的记账时间写成一行小字：「今天 11:21 ›」「昨天 …」「10月3日 …」，不是今年的带年份
        function recTimeText(v, now){
            const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})/.exec(v||'');
            if(!m) return '选择记账时间';
            const n=now||new Date(), d=new Date(+m[1], m[2]-1, +m[3]);
            const t0=new Date(n.getFullYear(), n.getMonth(), n.getDate());
            const diff=Math.round((t0-d)/86400000);
            let day;
            if(diff===0) day='今天'; else if(diff===1) day='昨天'; else if(diff===2) day='前天';
            else if(+m[1]===n.getFullYear()) day=`${+m[2]}月${+m[3]}日`;
            else day=`${m[1]}年${+m[2]}月${+m[3]}日`;
            return day+' '+m[4];
        }
        function paintRecTime(input){
            const txt=input && document.getElementById(input.id+'Txt');
            if(txt) txt.textContent=recTimeText(input.dataset.value || String(input.value||'').replace(' ','T'));
        }
        // 读取时间输入框的规范值（带T），供保存逻辑使用
        function getDtInput(input){ return input.dataset.value || input.value.replace(' ','T'); }

        // 绑定两个时间输入框
        billTime.addEventListener('click', ()=>openDtPicker(billTime));
        editTime.addEventListener('click', ()=>openDtPicker(editTime));
        // 1019-Q：那一行小字点了照样弹日期时间选择（原来的框藏起来，值还在它身上）
        $('billTimeLine').addEventListener('click', ()=>openDtPicker(billTime));
        $('editTimeLine').addEventListener('click', ()=>openDtPicker(editTime));
        // 别处直接改了 dataset.value（没走 setDtInput）也跟着改那一行
        [billTime, editTime].forEach(el=>{ try{ new MutationObserver(()=>paintRecTime(el)).observe(el, { attributes:true, attributeFilter:['data-value'] }); }catch(e){} });

        // ===== 筛选浮层（bottom sheet）控件绑定 =====
        // 草稿模式：sheet 内所有改动只写进控件（草稿），不动列表。
        //   完成 → 提交草稿到 searchState/filterCat 并刷新列表；
        //   下滑 / 点遮罩 → 丢弃草稿，列表不变；
        //   清除全部 → 只清草稿，要点完成才生效。
        // draftCat 暂存分类选择，避免直接改 filterCat（filterCat 是已提交状态，renderBill 读它）。
        let draftCat='__all';
        // 统计口径筛选的草稿值：'' 全部 / 'normal' / 'flow' / 'skip'。与 draftCat 同一套草稿规则：
        // 面板里点只改草稿，点「完成」才提交进 searchState.mode。
        let draftMode='';
        const FILTER_MODE_OPTS=[ {v:'', t:'全部'}, {v:'normal', t:'计入'}, {v:'flow', t:'只算结余'}, {v:'skip', t:'不计入'} ];
        function renderFilterModeChips(){
            const box=$('filterModeChips'); if(!box) return;
            if(!box.children.length){
                FILTER_MODE_OPTS.forEach(o=>{
                    const b=document.createElement('div');
                    b.className='cc'; b.textContent=o.t; b.dataset.v=o.v;
                    b.onclick=()=>{ draftMode=o.v; renderFilterModeChips(); };
                    box.appendChild(b);
                });
            }
            box.querySelectorAll('.cc').forEach(el=>el.classList.toggle('sel', el.dataset.v===draftMode));
        }
