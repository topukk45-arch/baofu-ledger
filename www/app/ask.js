(function(){
        const { $, afterOpenAnim, parseRecTime, safeNum } = window.JiwenBase;   // 用到前面模块的
        const { kpClose, kpOn, kpOpen } = window.JiwenKeypad;   // 用到前面模块的
        const { bindSheetDrag } = window.JiwenPanel;   // 用到前面模块的
        // ===== 自定义 确认 / 输入 弹窗 =====
        const askMask=$('askMask'), askTitle=$('askTitle'), askMsg=$('askMsg'),
              askInput=$('askInput'), askOk=$('askOk'), askCancel=$('askCancel');
        let askResolve=null, askMode='confirm', askChosen=null;

        const askErr=$('askErr');
        let askValidate=null;
        let askOnCancel=null;   // choose 模式取消回调（AI 导出回上一级用）
        let askAlt=null;        // 实测 10-30：确认框下面那颗按钮另有去处（opts.alt），往下拉 / 返回键照旧算取消
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
            askAlt=null; askCancel.classList.remove('alt');
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
        askCancel.addEventListener('click', ()=>{
            if(askAlt){ const fn=askAlt; askOnCancel=null; closeAsk(false); fn(); return; }   // opts.alt：点的是另一个选择，不算取消
            closeAsk((askMode==='prompt'||askMode==='choose')?null:false);
        });
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
            // opts.alt = { text, onClick }：下面那颗按钮换成另一个选择（描边、强调色字），点了做 onClick；往下拉 / 返回键照旧走 onCancel
            askAlt=opts.alt && opts.alt.text ? opts.alt.onClick || (()=>{}) : null;
            if(askAlt){ askCancel.textContent=opts.alt.text; askCancel.classList.add('alt'); }
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

        // 输入框：回调式。validate(value) 返回错误文案则在弹窗内提示且不关闭，返回空则通过
        function customPrompt(msg, defVal, onOk, title, validate, opts){
            opts = opts || {};
            askMode='prompt'; askAlt=null; askCancel.classList.remove('alt');
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
            askMode='choose'; askAlt=null; askCancel.classList.remove('alt');
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
            askMode='alert'; askAlt=null; askCancel.classList.remove('alt');
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
            askMode='alert'; askAlt=null; askCancel.classList.remove('alt');
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
        // 输入提示框要金额的（预算、补金额）：也用数字键盘，大按钮直接提交提示框
        askInput.addEventListener('click', ()=>{ if(askInput.dataset.kp==='1') kpOpen(askInput, { ok:askInput.dataset.kpOk||'确定', onOk:()=>askOk.click() }); });
        askInput.addEventListener('focus', ()=>{ if(askInput.dataset.kp==='1'){ askInput.blur(); kpOpen(askInput, { ok:askInput.dataset.kpOk||'确定', onOk:()=>askOk.click() }); } });
        window.customConfirm = customConfirm;   // 老入口：原来是顶层的，自己就在 window 上，搬进来以后照旧挂上
        window.customPrompt = customPrompt;   // 老入口：原来是顶层的，自己就在 window 上，搬进来以后照旧挂上
        window.customAlert = customAlert;   // 老入口：原来是顶层的，自己就在 window 上，搬进来以后照旧挂上
        window.JiwenAsk = { askCancel, askMask, closeAsk, customAlert, customAlertHtml, customChoose, customConfirm, customPrompt };   // ask 模块对外只有这一个入口
})();
