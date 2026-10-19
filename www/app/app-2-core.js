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
            if(kpTarget===askInput) kpClose();   // 1019-P：提示框里的数字键盘跟着收
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

        // 金额规范化：返回 {ok:true, val} 或 {ok:false, why}，why 用于给出对症提示
        function normMoney(raw){
            const n = Number(raw);
            if(!isFinite(n)) return { ok:false, why:'请输入正确的金额数字～' };  // NaN / Infinity
            if(n > 99999999) return { ok:false, why:'金额太大啦，确认一下没多打几个 0？' };  // 上限挡手滑
            const val = Math.round(n * 100) / 100;  // 先对齐到分
            if(val <= 0) return { ok:false, why:'金额要大于 0 哦～' };  // 含 0、负数、以及 0.001 这类四舍五入后归零的值
            return { ok:true, val };
        }

        // 安全数值：把可能是脏数据（null/undefined/""/"abc" 等）的金额转成有限数，
        // 非法一律按 0，避免 NaN 污染整列汇总（导入不规范 JSON 时尤其有用）。
        function safeNum(x){ const n=Number(x); return isFinite(n) ? n : 0; }
        // 对齐到「分」：消除多笔浮点累加的尾差（如 2.9999999 → 3.00）。
        function round2(n){ return Math.round(n*100)/100; }

        // ===== 统计口径（1010-B）=====
        // 一条记录对「收入 / 支出」各贡献多少。所有求和——账单结余、总览、筛选小计、分类汇总、
        // 统计页日历/当月/饼图、AI 导出——一律走这里，不再各处自己写 type==='expense' 判断。
        // 此前这类判断散在 6 处，只要漏改一处，账单页和统计页的数字就会对不上，而且不报错。
        // 标记了 skip（不计入收支：信用卡还款、内部转账等）的记录贡献为 0：照常显示，不进任何统计。
        // skip 只认严格的 true，旧数据没有这个字段，行为与之前完全一致。
        //
        // 【1010-C】口径分三种：
        //   normal 计入    ：收支统计、结余都算（默认；旧数据没有任何标记即为此）
        //   flow   只算结余：资金往来——期初存款、垫付报销、借出借入、退还父母。钱真实进出了账户，
        //                    结余要算；但它既不是收入也不是消费，收支统计不算。
        //   skip   不计入  ：重复记录——信用卡还款（消费在刷卡时已经记过）。收支、结余都不算。
        // 两个字段互斥，都只认严格的 true；同时存在时 skip 优先。
        function isSkip(r){ return !!(r && r.skip===true); }
        function isFlow(r){ return !!(r && r.flow===true && r.skip!==true); }
        function recMode(r){ return isSkip(r) ? 'skip' : (isFlow(r) ? 'flow' : 'normal'); }
        // 就地改 r：只能用在新对象上（账本缓存里的记录是冻结的，要改先 Object.assign({}, r) 换一个）
        function setRecMode(r, mode){
            delete r.skip; delete r.flow;
            if(mode==='skip') r.skip=true; else if(mode==='flow') r.flow=true;
        }
        // ===== 退款（1010-J）=====
        // 退款记录 = type:'income' + refundOf:原账单 id。分类、口径永远跟原账单一致（写入时同步）。
        // 统计上它是「同分类的负支出」：买 100 退 30，这个分类就是花了 70；不算收入，结余照常 +30。
        // 存成 income 是为了向下兼容：旧版本不认识 refundOf，会把它当普通收入——
        //   正好等于以前手动「退款记成收入」的效果，结余也对；存成 expense 则旧版本会把退款再算一遍支出。
        function isRefund(r){ return !!(r && r.type==='income' && typeof r.refundOf==='string' && r.refundOf); }
        // 「支出」口径下的带符号金额：支出 +a，退款 −a，其他 0。只算金额，口径由调用方判断。
        function expSigned(r){
            if(!r) return 0;
            if(r.type==='expense') return safeNum(r.money);
            if(isRefund(r)) return -safeNum(r.money);
            return 0;
        }
        // 分类金额（饼图、环比、AI 分类占比）：支出口径用 expSigned；收入口径不含退款
        function catSigned(r, wantType){
            if(wantType==='expense') return expSigned(r);
            return (r.type==='income' && !isRefund(r)) ? safeNum(r.money) : 0;
        }
        function refundsOf(data, id){ return data.filter(r=>isRefund(r) && r.refundOf===id); }
        // 某原账单已退的总额；exceptId：改某一笔退款时，把它自己排除在外再算「还能退多少」
        function refundedTotal(data, id, exceptId){
            return round2(refundsOf(data, id).filter(r=>r.id!==exceptId).reduce((s,r)=>s+safeNum(r.money),0));
        }
        function refundedMap(data){
            const m={};
            data.forEach(r=>{ if(isRefund(r)) m[r.refundOf]=round2((m[r.refundOf]||0)+safeNum(r.money)); });
            return m;
        }
        // 原账单的分类 / 口径变了，挂在它上面的退款跟着改
        //   【1013-G】账本里的记录是冻结的：换成新对象，不在原记录上改
        function syncRefunds(data, orig){
            data.forEach((r,i)=>{
                if(isRefund(r) && r.refundOf===orig.id){
                    const n=Object.assign({}, r); n.cat=orig.cat; setRecMode(n, recMode(orig)); data[i]=n;
                }
            });
        }
        // 收支统计口径：只有「计入」算
        function statContrib(r){
            if(recMode(r)!=='normal') return { inc:0, exp:0 };
            const a=safeNum(r.money);
            if(isRefund(r)) return { inc:0, exp:-a };      // 退款：冲抵支出，不算收入
            return r.type==='expense' ? { inc:0, exp:a } : { inc:a, exp:0 };
        }
        // 结余口径：「计入」「只算结余」都算，只有「不计入」不算
        function balContrib(r){
            if(isSkip(r)) return { inc:0, exp:0 };
            const a=safeNum(r.money);
            return r.type==='expense' ? { inc:0, exp:a } : { inc:a, exp:0 };
        }
        // 账单行 / 详情里的口径标签与金额配色（计入时都是空串，输出与旧版逐字节一致）
        function modeTag(r, full){
            const m=recMode(r);
            if(m==='skip') return `<span class="io-skip">${full?'不计入收支':'不计入'}</span>`;
            if(m==='flow') return '<span class="io-flow">只算结余</span>';
            return '';
        }
        // ===== 分类月预算（1010-G）=====
        // 存在存档里：archive.budgets = { 分类名: 每月上限 }，跟着存档走（导出 / 云备份 / 导入都带上）。
        // 已花 = 该月、该分类、支出、且口径为「计入」的金额之和——与统计页、AI 导出同一口径；
        // 不计入 / 只算结余的记录不占预算。月份按记录时间算，不按录入时间。
        function getBudgets(){
            const a=curArchive(loadStore());
            return (a && a.budgets && typeof a.budgets==='object') ? a.budgets : {};
        }
        function budgetSpentIn(records, cat, y, mo){
            let s=0;
            records.forEach(r=>{
                if(r.cat!==cat || recMode(r)!=='normal') return;
                const e=expSigned(r); if(!e) return;      // 支出 +，退款 −
                const t=parseRecTime(r.time);
                if(t.getFullYear()===y && t.getMonth()===mo) s+=e;
            });
            return round2(s);
        }
        // 「已花 x / 上限 y，还剩 / 超出 z」——记账成功提示与 AI 导出共用的一句话
        function budgetPhrase(spent, limit){
            const d=round2(limit-spent);
            return `已花 ${spent.toFixed(2)} / ${limit.toFixed(2)}，${d>=0?`还剩 ${d.toFixed(2)}`:`超出 ${(-d).toFixed(2)}`}`;
        }

        // 原账单上的「已退 x / 已全退」小标签
        function refundedTag(r, rMap){
            if(!r || r.type!=='expense') return '';
            const done=rMap[r.id]; if(!(done>0)) return '';
            return round2(safeNum(r.money)-done)<=0
                ? '<span class="io-refunded">已全退</span>'
                : `<span class="io-refunded">已退 ${done.toFixed(2)}</span>`;
        }
        function modeAmtCls(r){ const m=recMode(r); return m==='skip' ? ' amt-skip' : (m==='flow' ? ' amt-flow' : ''); }

        // 字符数：按 Unicode 码点计（一个汉字算 1）
        function charLen(s){ return Array.from(s).length; }
        function charSlice(s, n){ return Array.from(s).slice(0, n).join(''); }
        // HTML 转义，防止备注/名称里的特殊字符破坏页面
        function escapeHtml(s){
            return String(s).replace(/[&<>"']/g, c => ({
                '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
            }[c]));
        }

        // 导入相关的共用上限常量（预校验与清洗逻辑共用同一个值，避免两处魔数不一致）：
        //   MAX_IMPORT_RECORDS —— 单次导入记录条数上限
        //   IMPORT_MAX_BYTES   —— 导入文件体积上限（避免超大文件 JSON.parse 卡死 UI）。
        //                         【1015-B】8MB → 24MB：备份里多了导入的单号表（12 万单号约 4.3MB），
        //                         12 万单号 + 2 万条记录约 11MB，留一倍余量
        const MAX_IMPORT_RECORDS = 50000;
        const IMPORT_MAX_BYTES = 24 * 1024 * 1024;

        // 数据层统一支持「显式指定用户」：传入 user 则操作该用户的数据，省略则默认当前登录用户。
        // 这样导入到其它账号时无需临时改写全局 currentUser（旧做法在异步/重入下会写错账号）。
        function storeKey(user){ return `store_${user!==undefined ? user : currentUser}`; }

        // ===== 账本存储（1013-G 起按月分块存在 IndexedDB）=====
        // 1013-D 把账本搬进了 IndexedDB，但还是一个账号一整段 JSON：记一笔就整本序列化、整本写库，
        // 每次读数据又整本解析一遍。一年导入的流水（十几万条）在手机上会卡到秒级。现在拆开存：
        //   · led_<账号>_m                    —— 存档级的东西：整个 store 对象，只是每个存档的 records
        //                                       换成存档内部号（分类、预算、模板、last、accountName……原样、顺序不变）
        //   · led_<账号>_<存档号>_<YYYY-MM>   —— 这个存档这个月的记录：{"s":[序号…], "r":[记录…]}
        //   · led_<账号>_<存档号>_none        —— 时间缺失或不合法的记录
        // 存档号是内部号（a + 时间 + 随机），不是存档名：名字里什么字符都不影响键，改名也不用搬记录。
        // 序号用来保住记录在整本里的先后（导出是按这个顺序出的），读的时候按序号合回去。
        //
        // 内存里每个账号一份解析好的账本：
        //   · 进入账号时从库里读一次、解析一次；记录冻结（谁也改不了缓存）；
        //   · getUserData() / loadStore() 给的是数组的浅拷贝：push、filter、删都行；
        //     要改某条记录就换成一个新对象（{...r, cat:新}），直接改会被拦下；
        //   · saveStore() 和缓存逐条比对（看是不是同一个对象），只把涉及的月份标成要写，
        //     再排队把这些月份块 + meta 放进同一个事务写进库：跨月的改动要么全写进去，要么一块都不算。
        // 切到后台时把 meta 和这次动过的月份块强制再写一遍。
        const LEDGER_DB='jiwen', LEDGER_OS='kv';
        let __dbPromise=null;
        const __ledger=new Map();       // storeKey → 账本缓存（见 ledgerNewEntry）
        const __ledgerKeys=new Set();   // IndexedDB 里现有的键（启动时读一次，之后跟着增删）
        const __ledgerPending=new Set();// 账本还没搬完的账号编号：先不让进
        const __busyOps=new Set();      // 进行中的异步存取（ledgerIdle 等它们，测试也靠它）
        // 测试里打开：缓存里的记录被直接改就报错（App 里改冻结对象是静默失败，漏改的地方在测试里要能抓出来）
        const __LEDGER_STRICT = !!window.__LEDGER_STRICT;
        function trackBusy(p){
            __busyOps.add(p);
            const done=()=>__busyOps.delete(p);
            p.then(done, done);
            return p;
        }
        // 等所有进行中的读写、登录都结束（包括它们途中又排上的）
        async function ledgerIdle(){
            for(let i=0;i<100 && __busyOps.size;i++){
                await Promise.all([...__busyOps].map(p=>p.catch(()=>{})));
            }
        }
        function idbOpen(){
            if(__dbPromise) return __dbPromise;
            __dbPromise=new Promise((resolve, reject)=>{
                let req;
                try{ req=window.indexedDB.open(LEDGER_DB, 1); }catch(err){ reject(err); return; }
                req.onupgradeneeded=()=>{
                    const db=req.result;
                    if(!db.objectStoreNames.contains(LEDGER_OS)) db.createObjectStore(LEDGER_OS);
                };
                req.onsuccess=()=>{
                    const db=req.result;
                    db.onversionchange=()=>{ try{ db.close(); }catch(_){} __dbPromise=null; };
                    resolve(db);
                };
                req.onerror=()=>reject(req.error || new Error('idbopen'));
                req.onblocked=()=>reject(new Error('idbblocked'));
            });
            __dbPromise.catch(()=>{ __dbPromise=null; });   // 打开失败，下次再试
            return __dbPromise;
        }
        // 一次读或写一个事务；写要等事务真正提交（oncomplete）才算成功。strict：要求写到磁盘再回报（搬家时用）
        //   【1013-G】往事务里放请求的途中出错（比如存储满直接抛出），整个事务作废，不能留下半批
        async function idbTx(mode, fn, strict){
            const db=await idbOpen();
            return new Promise((resolve, reject)=>{
                let tx, out;
                try{
                    tx = strict ? db.transaction(LEDGER_OS, mode, { durability:'strict' }) : db.transaction(LEDGER_OS, mode);
                    const req=fn(tx.objectStore(LEDGER_OS));
                    if(req) req.onsuccess=()=>{ out=req.result; };
                }catch(err){
                    if(tx){ try{ tx.abort(); }catch(_){} }
                    reject(err); return;
                }
                tx.oncomplete=()=>resolve(out);
                tx.onerror=()=>reject(tx.error || new Error('idbtx'));
                tx.onabort=()=>reject(tx.error || new Error('idbabort'));
            });
        }
        function idbGet(key){ return idbTx('readonly', os=>os.get(key)); }
        function idbKeys(){ return idbTx('readonly', os=>os.getAllKeys()); }
        async function idbPut(key, val, strict){ await idbTx('readwrite', os=>os.put(val, key), strict); __ledgerKeys.add(key); }
        async function idbDel(key){ await idbTx('readwrite', os=>os.delete(key)); __ledgerKeys.delete(key); }
        // 读出某个前缀下的所有键值（一个账号的 meta 和全部月份块），一个事务
        async function idbRange(prefix){
            const range=window.IDBKeyRange.bound(prefix, prefix+'￿');
            let keys=[], vals=[];
            await idbTx('readonly', os=>{
                const a=os.getAllKeys(range), b=os.getAll(range);
                a.onsuccess=()=>{ keys=a.result; };
                b.onsuccess=()=>{ vals=b.result; };
            });
            return keys.map((k,i)=>[String(k), vals[i]]);
        }
        // 一批写和删放进同一个事务：要么全成，要么全不算。ops: [['put', 键, 值] | ['del', 键]]
        async function idbBatch(ops, strict){
            if(!ops.length) return;
            await idbTx('readwrite', os=>{
                ops.forEach(o=>{ if(o[0]==='put') os.put(o[2], o[1]); else os.delete(o[1]); });
            }, strict);
            ops.forEach(o=>{ if(o[0]==='put') __ledgerKeys.add(o[1]); else __ledgerKeys.delete(o[1]); });
        }
        // 库里取出来的不是字符串（理论上不会有）：能转回 JSON 就转，免得被当成「没有账本」后被空账本覆盖
        function asRaw(v){
            if(v===undefined || v===null) return null;
            if(typeof v==='string') return v;
            try{ return JSON.stringify(v); }catch(_){ return '{}'; }
        }

        // ---- 键 ----
        function ledPrefix(id){ return `led_${id}_`; }
        function ledMetaKey(id){ return `led_${id}_m`; }
        function ledBlockKey(id, aid, mon){ return `led_${id}_${aid}_${mon}`; }
        const LED_AID_RE=/^a[0-9a-z]+$/;
        // led_<账号>_<存档号>_<月份> → { aid, mon }；meta → { meta:true }；损坏备份等别的键 → null
        function ledParseKey(id, k){
            const p=ledPrefix(id);
            if(typeof k!=='string' || k.indexOf(p)!==0) return null;
            const rest=k.slice(p.length);
            if(rest==='m') return { meta:true };
            const m=/^(a[0-9a-z]+)_(\d{4}-\d{2}|none)$/.exec(rest);
            return m ? { aid:m[1], mon:m[2] } : null;
        }
        // 记录归哪个月：按 time 的「年-月」；时间缺失或不合法的归 none
        //   （每次写库都要对整个存档算一遍，所以逐个字符判断，不用正则）
        function recMonth(r){
            const t=r && r.time;
            if(typeof t!=='string' || t.length<7 || t.charCodeAt(4)!==45) return 'none';
            for(let i=0;i<7;i++){ if(i===4) continue; const c=t.charCodeAt(i); if(c<48 || c>57) return 'none'; }
            const mm=(t.charCodeAt(5)-48)*10+(t.charCodeAt(6)-48);
            return (mm>=1 && mm<=12) ? t.slice(0,7) : 'none';
        }
        function newArchiveId(e){
            let aid;
            do{ aid='a'+Date.now().toString(36)+Math.floor(Math.random()*1679616).toString(36).padStart(4,'0'); }
            while(e.archs.has(aid) || [...e.keys].some(k=>k.indexOf(ledBlockKey(e.id, aid, ''))===0));
            return aid;
        }

        // ---- 记录：冻结后放进缓存 ----
        const __sealed=new WeakSet();
        const __strictHandler={
            set(){ throw new TypeError('账本记录不能直接改，请换成新对象'); },
            deleteProperty(){ throw new TypeError('账本记录不能直接改，请换成新对象'); },
            defineProperty(){ throw new TypeError('账本记录不能直接改，请换成新对象'); },
        };
        function sealRec(r){
            if(!__LEDGER_STRICT) return Object.isFrozen(r) ? r : Object.freeze(r);
            if(__sealed.has(r)) return r;
            const out=new Proxy(Object.freeze(r), __strictHandler);
            __sealed.add(out);
            return out;
        }
        // 和以前 normArchive 对每条记录做的一样：缺分类 / 编号 / 收支的补上（补的是新对象，不碰调用方的）
        function normRec(r){
            if(r.cat && r.id && r.type) return r;
            const n=Object.assign({}, r);
            if (!n.cat) n.cat = '未分类';
            if (!n.id) n.id = genId();
            if (!n.type) n.type = 'income';
            return n;
        }
        // 存档对象规范化（不改调用方的对象）：旧格式（直接是数组）、缺 records / 分类
        function normArchiveCopy(a){
            if (Array.isArray(a)) return { records:a, cats:DEFAULT_CATS.slice() };
            const o=Object.assign({}, a);
            if (!o.records) o.records = [];
            if (!o.cats || !o.cats.length) o.cats = DEFAULT_CATS.slice();
            return o;
        }

        // ---- 一个账号的缓存 ----
        //   has     有没有账本（没有时 loadStore 给空的默认结构，和以前一样）
        //   meta    meta 原文（records 是存档号）；names 存档名 → 存档号
        //   archs   存档号 → { recs: 记录数组（按序号排好）, seqs: 对应的序号, idx: 记录 → 序号（查「是不是原来那条」用）}
        //   keys    库里这个账号现有的键
        //   dirty   要写的月份块：键 → 第几次修改；metaGen 不为 0 表示 meta 要写
        //   pend    读的时候发现坏掉 / 缺字段的块，下次保存时一起重写（和以前「第一次保存覆盖」一样）
        //   touched 这次打开后写过的块（切后台时强制重写这些）
        function ledgerNewEntry(id){
            return { id, has:false, meta:null, names:new Map(), archs:new Map(), keys:new Set(),
                     dirty:new Map(), metaGen:0, gen:0, pend:new Map(), pendMeta:false,
                     touched:new Set(), busy:null, ver:0, broken:false,
                     damage:[], badBlocks:new Set(), badAids:new Set(),
                     extra:new Map() };
        }
        //   extra   【1015-B】账本以外、要和账本放进同一个事务写的键（导入的单号表、待处理池、导入记录）：
        //           键 → { v: 值（null 表示删）, g: 第几次修改 }。见「导入数据」一节
        function ledgerDirty(e){ return e.dirty.size>0 || e.metaGen>0 || e.extra.size>0; }
        function validMeta(m){
            if(!m || typeof m!=='object' || Array.isArray(m) || !m.archives || typeof m.archives!=='object' || Array.isArray(m.archives)) return false;
            const seen=new Set();
            return Object.keys(m.archives).every(n=>{
                const a=m.archives[n];
                if(!a || typeof a!=='object' || Array.isArray(a) || typeof a.records!=='string' || !LED_AID_RE.test(a.records) || seen.has(a.records)) return false;
                seen.add(a.records); return true;
            });
        }
        function validBlock(b){
            if(!b || typeof b!=='object' || !Array.isArray(b.s) || !Array.isArray(b.r) || b.s.length!==b.r.length || !b.r.length) return false;
            const s=b.s, r=b.r;
            for(let i=0;i<r.length;i++){
                if(typeof s[i]!=='number' || !isFinite(s[i]) || !r[i] || typeof r[i]!=='object' || Array.isArray(r[i])) return false;
            }
            return true;
        }
        // 从库里读出的键值建缓存。quiet：只是拿来比对（搬家核对用），坏了不登记、不另存
        function ledgerBuild(id, rows, quiet){
            const e=ledgerNewEntry(id);
            const skey=`store_${id}`;
            let metaRaw=null, metaSeen=false;
            const blocks=[];
            rows.forEach(([k,v])=>{
                const p=ledParseKey(id, k); if(!p) return;
                e.keys.add(k);
                if(p.meta){ metaSeen=true; metaRaw=asRaw(v); }
                else blocks.push({ k, aid:p.aid, mon:p.mon, raw:asRaw(v) });
            });
            if(!metaSeen && !blocks.length) return e;          // 这个账号还没有账本
            //   【1013-H】坏了什么记进 e.damage（进账号时告诉用户、暂停受影响存档的云同步，见 ledgerReportDamage）
            const bad=(bk, raw, info)=>{
                e.broken=true;
                if(quiet) return;
                e.damage.push(Object.assign({ key:bk, len: raw===null ? 0 : raw.length }, info));
                // 原文另存一份再说（meta 沿用以前整本账本的备份名 store_<编号>__corrupted_）
                if(raw!==null) ledgerBackupCorrupted(bk, raw);
            };
            let meta=null;
            if(metaSeen){
                try{ meta=JSON.parse(metaRaw); }catch(_){ meta=null; }
                if(!validMeta(meta)){ meta=null; bad(skey, metaRaw, { kind:'meta' }); }
            } else bad(skey, null, { kind:'meta' });             // 有月份块却没有 meta：也算坏了
            // 各月份块
            const pairs=new Map();
            blocks.forEach(b=>{
                let arr=null;
                try{ arr=JSON.parse(b.raw); }catch(_){ arr=null; }
                if(!validBlock(arr)){
                    // 坏块：原文另存，这个月的记录先不显示。
                    //   【1013-H】不再在下一次保存（进账号那次就会存）时顺手删掉：留在库里，每次打开都还认得出它坏了，
                    //   云同步也就一直拦得住。真改到这个月、删了这个存档、或者用户点「重新选择备份文件」认可现状时才重写。
                    bad(b.k, b.raw, { kind:'block', aid:b.aid, mon:b.mon });
                    e.badBlocks.add(b.k); e.badAids.add(b.aid);
                    return;
                }
                let list=pairs.get(b.aid);
                if(!list) pairs.set(b.aid, list=[]);
                list.push(arr);
            });
            if(!meta){
                // meta 坏了：用还在的月份块把存档重建出来（名字叫「恢复的存档 N」，分类用默认的），记录不丢
                const aids=[...pairs.keys()].sort();
                if(!aids.length){                // 一条也救不回来：当成没有账本（和以前坏了给空的一样，第一次保存时覆盖）
                    e.damage.forEach(d=>{ if(d.kind==='meta') d.kind='all'; });
                    return e;
                }
                meta={ archives:{} };
                aids.forEach((aid,i)=>{ meta.archives[`恢复的存档 ${i+1}`]={ records:aid, cats:DEFAULT_CATS.slice() }; });
                meta.last=`恢复的存档 1`;
                e.pendMeta=true;
            }
            // 分类为空的存档补默认分类（和以前 normArchive 一样）
            Object.keys(meta.archives).forEach(n=>{
                const a=meta.archives[n];
                if(!a.cats || !a.cats.length){ a.cats=DEFAULT_CATS.slice(); e.pendMeta=true; }
            });
            e.has=true;
            e.meta=JSON.stringify(meta);
            Object.keys(meta.archives).forEach(n=>{
                const aid=meta.archives[n].records;
                e.names.set(n, aid);
                // 各月份块按键（月份）顺序读出来，块内按序号排好；一般记录先后和月份一致，拼起来已经是顺的，
                //   不顺（比如补记了很早以前的账）才整体排一次
                const parts=pairs.get(aid) || [];
                let sAll=[], rAll=[];
                parts.forEach(b=>{ sAll=sAll.length ? sAll.concat(b.s) : b.s; rAll=rAll.length ? rAll.concat(b.r) : b.r; });
                let ordered=true;
                for(let i=1;i<sAll.length;i++){ if(sAll[i]<sAll[i-1]){ ordered=false; break; } }
                if(!ordered){
                    const ord=sAll.map((_,i)=>i).sort((x,y)=>sAll[x]-sAll[y]);
                    sAll=ord.map(i=>sAll[i]); rAll=ord.map(i=>rAll[i]);
                }
                const recs=new Array(rAll.length), seqs=new Array(rAll.length), idx=new Map();
                for(let i=0;i<rAll.length;i++){
                    const s=sAll[i];
                    let r=rAll[i];
                    const n2=normRec(r);
                    if(n2!==r){ r=n2; e.pend.set(ledBlockKey(id, aid, recMonth(r)), true); }
                    r=sealRec(r);
                    recs[i]=r; seqs[i]=s; idx.set(r, s);
                }
                e.archs.set(aid, { recs, seqs, idx });
            });
            return e;
        }
        // 合成一整本（和 1013-F 存的 store 一模一样的结构）
        function ledgerAssemble(e){
            const s=JSON.parse(e.meta);
            Object.keys(s.archives).forEach(n=>{
                const st=e.archs.get(s.archives[n].records);
                s.archives[n].records=st ? st.recs : [];
            });
            return s;
        }
        // 搬家核对用：把读出来的键值合成一整本的 JSON；有坏的就返回 null
        function ledgerAssembleRows(id, rows){
            const e=ledgerBuild(id, rows, true);
            if(e.broken || !e.has) return null;
            return JSON.stringify(ledgerAssemble(e));
        }

        // ---- 把调用方给的 store 和缓存比对，记下要写的块 ----
        function ledgerEmptyArch(){ return { recs:[], seqs:[], idx:new Map() }; }
        // 返回这个存档新的状态；没变就返回 null。dirty：要写的块键
        //   先按「是不是同一个对象」掐掉头尾一样的部分，只看中间变了的那一段（记一笔、改一笔、删一笔都只有几条）；
        //   中间那段太长、或者有记录挪了位置，就整个存档比一遍。
        function ledgerDiffArchive(e, aid, st, R, dirty){
            const n=R.length;
            if(!st) st=ledgerEmptyArch();
            const old=st.recs, m=old.length;
            let p=0;
            while(p<n && p<m && R[p]===old[p]) p++;
            if(p===n && p===m) return null;
            let q=0;
            while(q<n-p && q<m-p && R[n-1-q]===old[m-1-q]) q++;
            if((n-p-q)+(m-p-q) <= 4000){
                const r=ledgerDiffMiddle(e, aid, st, R, p, q, dirty);
                if(r) return r;
            }
            return ledgerDiffFull(e, aid, st, R, dirty);
        }
        function ledgerDiffMiddle(e, aid, st, R, p, q, dirty){
            const old=st.recs, m=old.length, n=R.length;
            const oldMid=new Set();
            for(let i=p;i<m-q;i++) oldMid.add(old[i]);
            const newMid=R.slice(p, n-q);
            const inNew=new Set(newMid);
            for(const r of newMid){ if(st.idx.has(r) && !oldMid.has(r)) return null; }   // 有记录挪了位置：整个比
            const reuse=new Map(), removed=[];
            for(let i=p;i<m-q;i++){
                const r=old[i];
                if(inNew.has(r)) continue;
                removed.push(r);
                if(r.id!=null && !reuse.has(r.id)) reuse.set(r.id, st.seqs[i]);
            }
            const lo=p>0 ? st.seqs[p-1] : -1, hi=q>0 ? st.seqs[m-q] : Infinity;
            const midRecs=[], midSeqs=[], added=[];
            let last=lo;
            for(let r of newMid){
                let s;
                if(oldMid.has(r)){ s=st.idx.get(r); }
                else {
                    if(!r || typeof r!=='object' || Array.isArray(r)) continue;
                    r=sealRec(normRec(r));
                    if(r.id!=null && reuse.has(r.id)){ s=reuse.get(r.id); reuse.delete(r.id); }
                    added.push(r);
                }
                if(s===undefined) s=last+1;
                if(s<=last || s>=hi) return null;               // 顺序对不上（插到中间等）：整个比、重新编号
                midRecs.push(r); midSeqs.push(s); last=s;
            }
            if(new Set(midRecs).size!==midRecs.length) return null;   // 同一个对象放了两次
            removed.forEach(r=>dirty.add(ledBlockKey(e.id, aid, recMonth(r))));
            added.forEach(r=>dirty.add(ledBlockKey(e.id, aid, recMonth(r))));
            // 查找表接着用（只删掉去掉的、加上新来的）；万一要退回旧状态，ledgerRestore 会重建
            const idx=st.idx;
            removed.forEach(r=>idx.delete(r));
            midRecs.forEach((r,i)=>idx.set(r, midSeqs[i]));
            return {
                recs: old.slice(0,p).concat(midRecs, old.slice(m-q)),
                seqs: st.seqs.slice(0,p).concat(midSeqs, st.seqs.slice(m-q)),
                idx,
            };
        }
        function ledgerDiffFull(e, aid, st, R, dirty){
            const n=R.length;
            const inNew=new Set(R);
            const reuse=new Map();            // 被换掉的记录：按编号留下它原来的序号，新对象顶上去时顺序不变
            st.recs.forEach((r,i)=>{
                if(inNew.has(r)) return;
                dirty.add(ledBlockKey(e.id, aid, recMonth(r)));
                if(r.id!=null && !reuse.has(r.id)) reuse.set(r.id, st.seqs[i]);
            });
            const recs=[], seqs=[], idx=new Map();
            let last=-1, broken=false;
            for(let i=0;i<n;i++){
                let r=R[i], s;
                if(st.idx.has(r)){
                    s=st.idx.get(r);
                    if(idx.has(r)) broken=true;          // 同一个对象放了两次
                } else {
                    if(!r || typeof r!=='object' || Array.isArray(r)) continue;   // 不是记录的东西不存（以前存了读回来也会出错）
                    r=sealRec(normRec(r));
                    if(r.id!=null && reuse.has(r.id)){ s=reuse.get(r.id); reuse.delete(r.id); }
                    dirty.add(ledBlockKey(e.id, aid, recMonth(r)));
                }
                if(s===undefined) s=last+1;
                else if(s<=last) broken=true;
                recs.push(r); seqs.push(s); idx.set(r, s); last=Math.max(last, s);
            }
            if(broken){
                // 顺序被打乱了（插到中间、换了位置）：整个存档重新编号，所有月份重写
                idx.clear();
                recs.forEach((r,i)=>{ seqs[i]=i; idx.set(r, i); dirty.add(ledBlockKey(e.id, aid, recMonth(r))); });
                st.recs.forEach(r=>dirty.add(ledBlockKey(e.id, aid, recMonth(r))));
            }
            return { recs, seqs, idx };
        }
        function ledgerApply(e, store){
            snapDrop();   // 1019-U：账本（内存里）要改了，首屏快照作废
            e.ver++;
            const archives=store.archives || {};
            const names=Object.keys(archives);
            const aidName=new Map();
            e.names.forEach((aid, n)=>aidName.set(aid, n));
            // 每个存档对应哪个存档号：同名的沿用；改名的（数组带着原来的存档号、原名字已经不在了）沿用；其余新开一个
            const pick=new Map(), used=new Set();
            names.forEach(n=>{
                const aid=e.names.get(n);
                if(aid && !used.has(aid)){ pick.set(n, aid); used.add(aid); }
            });
            names.forEach(n=>{
                if(pick.has(n)) return;
                const a=archives[n];
                const tag=a && !Array.isArray(a) && a.records && a.records.__aid;
                if(tag && e.archs.has(tag) && !used.has(tag) && !(aidName.has(tag) && archives[aidName.get(tag)]!==undefined)){
                    pick.set(n, tag); used.add(tag); return;
                }
                const aid=newArchiveId(e);
                pick.set(n, aid); used.add(aid);
                e.archs.set(aid, Object.assign(ledgerEmptyArch(), { fresh:true }));   // 先占住，免得后面再新开的撞号
            });
            const dirty=new Set();
            const metaArch={};
            names.forEach(n=>{
                const a=normArchiveCopy(archives[n]);
                const aid=pick.get(n);
                const st0=e.archs.get(aid);
                const st=(st0 && st0.fresh) ? null : st0;
                const next=ledgerDiffArchive(e, aid, st, a.records, dirty);
                if(next) e.archs.set(aid, next);
                else if(!st) e.archs.set(aid, ledgerEmptyArch());
                a.records=aid;
                metaArch[n]=a;
            });
            // 不在了的存档：删掉它的全部月份块
            [...e.archs.keys()].forEach(aid=>{
                if(used.has(aid)) return;
                e.archs.get(aid).recs.forEach(r=>dirty.add(ledBlockKey(e.id, aid, recMonth(r))));
                e.archs.delete(aid);
                impQueueDropArchive(e, aid);     // 【1015-B】单号表、待处理池、导入记录跟着删，和月份块同一个事务
            });
            e.keys.forEach(k=>{ const p=ledParseKey(e.id, k); if(p && !p.meta && !used.has(p.aid) && aidName.has(p.aid)) dirty.add(k); });
            // meta：顶层键的顺序照调用方的（archives 在哪个位置就在哪个位置）
            const meta={};
            Object.keys(store).forEach(k=>{ meta[k] = (k==='archives') ? metaArch : store[k]; });
            if(!('archives' in meta)) meta.archives=metaArch;
            const metaStr=JSON.stringify(meta);
            e.names=new Map(names.map(n=>[n, pick.get(n)]));
            // 读的时候发现坏掉 / 缺字段的块，这次一起重写
            e.pend.forEach((_, k)=>dirty.add(k)); e.pend.clear();
            dirty.forEach(k=>e.dirty.set(k, ++e.gen));
            if(!e.has || metaStr!==e.meta || e.pendMeta){ e.metaGen=++e.gen; e.pendMeta=false; }
            e.meta=metaStr;
            e.has=true;
        }
        // 把要写的块整理成一批（只序列化这些月份）
        function ledgerJob(e){
            const ops=[], done=[];
            const byAid=new Map();
            e.dirty.forEach((g,k)=>{
                done.push([k,g]);
                const p=ledParseKey(e.id, k);
                if(!p || p.meta) return;
                let m=byAid.get(p.aid);
                if(!m) byAid.set(p.aid, m=new Map());
                m.set(p.mon, { s:[], r:[] });
            });
            byAid.forEach((mons, aid)=>{
                const st=e.archs.get(aid);
                if(st){
                    const recs=st.recs, seqs=st.seqs;
                    for(let i=0;i<recs.length;i++){ const b=mons.get(recMonth(recs[i])); if(b){ b.s.push(seqs[i]); b.r.push(recs[i]); } }
                }
                mons.forEach((b, mon)=>{
                    const k=ledBlockKey(e.id, aid, mon);
                    if(b.r.length) ops.push(['put', k, JSON.stringify(b)]);
                    else if(e.keys.has(k)) ops.push(['del', k]);
                });
            });
            const metaGen=e.metaGen;
            if(metaGen) ops.push(['put', ledMetaKey(e.id), e.meta]);
            // 【1015-B】账本以外的键（导入数据）：和账本放进同一批，一起成、一起不算
            const xops=[], xdone=[];
            e.extra.forEach((x, k)=>{ xops.push(x.v===null ? ['del', k] : ['put', k, x.v]); xdone.push([k, x.g]); });
            return { ops, done, metaGen, xops, xdone };
        }
        function ledgerCommit(e, job){
            job.ops.forEach(o=>{
                if(o[0]==='put'){ e.keys.add(o[1]); e.touched.add(o[1]); }
                else { e.keys.delete(o[1]); e.touched.delete(o[1]); }
                e.badBlocks.delete(o[1]);       // 坏块按内存里的样子重写了（原文早已另存）
            });
            job.done.forEach(([k,g])=>{ if(e.dirty.get(k)===g) e.dirty.delete(k); });
            if(job.metaGen && e.metaGen===job.metaGen) e.metaGen=0;
            (job.xdone || []).forEach(([k,g])=>{ const x=e.extra.get(k); if(x && x.g===g) e.extra.delete(k); });
        }
        function ledgerSnap(e){
            return { has:e.has, meta:e.meta, names:new Map(e.names), archs:new Map(e.archs), dirty:new Map(e.dirty),
                     metaGen:e.metaGen, pend:new Map(e.pend), pendMeta:e.pendMeta, extra:new Map(e.extra) };
        }
        // 退回写之前的样子。查找表（idx）是新旧状态共用、就地改的，按记录和序号重建
        function ledgerRestore(e, s){
            Object.assign(e, s);
            e.archs.forEach(st=>{ st.idx=new Map(); st.recs.forEach((r,i)=>st.idx.set(r, st.seqs[i])); });
        }

        // 这个账号有没有账本（库里有，或者还在 localStorage / 1013-F 的整段里等着搬）
        function ledgerExists(id){
            const k=`store_${id}`;
            if(__ledger.has(k)){ const e=__ledger.get(k); if(e.has || e.keys.size) return true; }
            if(__ledgerKeys.has(ledMetaKey(id)) || __ledgerKeys.has(k)) return true;
            const p=ledPrefix(id);
            for(const x of __ledgerKeys){ if(x.indexOf(p)===0 && ledParseKey(id, x)) return true; }
            try{ return localStorage.getItem(k)!==null; }catch(_){ return false; }
        }
        // 进入账号 / 往别的账号导入之前调用：内存里没有就从库里读一次。已经在内存里的不重读（内存是最新的）
        function ledgerLoad(key){
            if(__ledger.has(key)) return Promise.resolve();
            return trackBusy((async()=>{
                const id=key.slice(6);
                const rows=await idbRange(ledPrefix(id));
                if(!__ledger.has(key)){
                    const e=ledgerBuild(id, rows);
                    __ledger.set(key, e);
                    ledgerReportDamage(e);
                    impQueueOrphans(e);
                }
            })());
        }
        // 只留当前账号在内存里；别的账号有没写进去的修改就先留着，等它写完
        function ledgerEvictExcept(key){
            [...__ledger.keys()].forEach(k=>{
                const e=__ledger.get(k);
                if(k!==key && !e.busy && !ledgerDirty(e)) __ledger.delete(k);
            });
        }
        // 测试和排查用：内存里这个账号合成的一整本（JSON，和 1013-F 存的一样）；没读进内存就报错
        function ledgerGet(key){
            const e=__ledger.get(key);
            if(!e) throw new Error('notloaded:'+key);
            return e.has ? JSON.stringify(ledgerAssemble(e)) : null;
        }
        // 写的时候用的缓存：没读进内存、库里却有这个账号的账本，宁可报错也不能拿空的去盖
        function ledgerEntryForWrite(key){
            let e=__ledger.get(key);
            if(e) return e;
            const id=key.slice(6);
            if(__ledgerKeys.has(ledMetaKey(id))) throw new Error('notloaded:'+key);
            e=ledgerNewEntry(id);
            __ledger.set(key, e);
            return e;
        }
        // 把要写的块写进库；返回的 Promise 在「写到最新」时完成，写失败时报错（要写的标记还留着，下次再写）
        function ledgerKick(key){
            const e=__ledger.get(key);
            if(!e) return Promise.resolve();
            if(e.busy) return e.busy;
            if(!ledgerDirty(e)) return Promise.resolve();
            snapDrop();   // 1019-U：要往库里写账本 / 单号表 / 待处理 / 导入记录了（导入、撤销、恢复、AI 修改……），首屏快照作废
            const p=(async()=>{
                try{
                    while(ledgerDirty(e)){
                        const job=ledgerJob(e);
                        await idbBatch(job.xops.length ? job.ops.concat(job.xops) : job.ops);
                        ledgerCommit(e, job);
                    }
                }finally{ e.busy=null; }
            })();
            e.busy=p;
            trackBusy(p);
            return p;
        }
        // 平时的写：失败了提示一次（连续失败不重复弹），下次保存或切后台时再试
        let __ledgerFailShown=false;
        function ledgerWriteSoon(key){
            ledgerKick(key).then(()=>{ __ledgerFailShown=false; }, err=>{
                if(__ledgerFailShown) return;
                __ledgerFailShown=true;
                customAlert(isQuotaErr(err)
                    ? '存储空间已满，本次修改未能保存。请删除部分存档或记录后重试。'
                    : '保存失败，请重试。', '保存失败');
            });
        }
        function isQuotaErr(err){
            return !!err && (err.name==='QuotaExceededError' || err.name==='NS_ERROR_DOM_QUOTA_REACHED'
                || err.code===22 || err.code===1014);
        }
        // 要确认写进去了才往下走的地方（导入、新建账号、修复历史数据）：
        // 写失败就把内存退回写之前的样子，并抛出和以前一样的 quota / savefail 错误
        //   extra(e)：【1015-B】ledgerApply 之后调用（这时新存档已经有存档号了），返回要一起写的 [键, 值]，
        //            和账本放进同一个事务（导入备份带进来的单号表、待处理池、导入记录）
        async function saveStoreDurable(store, user, extra){
            const key=storeKey(user);
            const had=__ledger.has(key);
            const e=ledgerEntryForWrite(key);
            const snap=ledgerSnap(e);
            ledgerApply(e, store);
            if(extra) extra(e).forEach(([k, v])=>impQueue(e, k, v));
            const ver=e.ver;
            try{ await ledgerKick(key); }
            catch(err){
                if(e.ver===ver){
                    if(!had) __ledger.delete(key);
                    else ledgerRestore(e, snap);
                }
                const x=new Error(isQuotaErr(err) ? 'quota' : 'savefail');
                x.cause=err;
                throw x;
            }
        }
        // 新建账号没登记成功：把刚写进去的账本整个删掉
        async function ledgerDropAccount(id){
            const key=storeKey(id);
            const e=__ledger.get(key);
            __ledger.delete(key);
            const ks=new Set(e ? e.keys : []);
            __ledgerKeys.forEach(k=>{ if(ledParseKey(id, k) || k.indexOf(impPrefix(id))===0) ks.add(k); });
            await idbBatch([...ks].map(k=>['del', k]));
        }
        // ===== 导入数据（1015-B，账单导入第一期 ② 数据结构）=====
        // 账单导入要用、平时记账用不到的东西，按「账号 + 存档」单独存，不放进 meta 和月份块：
        //   · imp_<账号>_<存档号>_o_<来源>_<年-月>   单号表：一个来源一个月一块（月份按账单那一行的交易时间，没时间的放 none）
        //   · imp_<账号>_<存档号>_p                  待处理池
        //   · imp_<账号>_<存档号>_i                  导入记录（最近 10 次）
        // 为什么不放进账本：进入账号会把 led_<账号>_ 开头的键全部读出来，一年的单号可能十几万个，这些只在导入时才读。
        // 为什么单号表按月分块、不一个单号一个键：启动时会读一遍库里全部的键名，十几万个键会拖慢每次启动。
        // 和账本在同一个库、同一张表里；写的时候排进账本的写入队列（e.extra），和账本同一个事务，要么全成、要么全不算。
        // 存档删了一起删（同一个事务）；存档改名不用动（键用存档号）；账号移走一起删；进账号时清掉不属于任何存档的（旧版本删存档时留下的）。
        //
        // 单号表一块（库里和备份文件里是同一种写法）：
        //   { ids:[记录id…], bs:[批次…], n:"单号,单号,…", r:"0,0,1,-,…", b:"0,0,1,…" }
        //   r：这个单号对应的记录在 ids 里的位置，「-」= 忽略（点过「不要了」，没有记录）；b：批次在 bs 里的位置。
        //   记录 id 和批次在一块里只写一次：收款按天合并时几百个单号指向同一条记录，每条都写 id 太占地方。
        //   单号里不能有逗号（两家都是数字；没有单号时导入代码拼的指纹也不许带逗号，登记时会拦）。
        // 记录上的新字段（都可有可无，手记不填，没有就不写）：
        //   cp 交易对方（存档里 cps 名单的编号）、pm 支付方式（pms 名单的编号）、oc 原始分类（原文）、
        //   src { app }（alipay / wechat）、batch 导入批次号。名单只往后加，编号就是位置；撤销按导入前的长度截断。
        // 存档里（meta）：cps、pms、importRules { cat:[{kw,cat}], type:[{app, type 或 status, as}], map:[{from,cat}] }。
        //   map（1016-J）：分类对照「推荐分类 → 我的分类」，确认页「新建分类」里手动选了「并到已有」时存；没有就不写这一类。
        // 1017-G：记录上的「AI 标记」aiFlag { k:'dup'（可能重复）|'miss'（可能漏配）, why:理由（≤200 字）, ref:说的是哪一笔（另一条记录的 id，可没有）}；
        //   只由「AI 检查导入结果」写，手记不填；跟着记录进备份、云备份，导入备份时 ref 换成新编号（找不到就去掉 ref，标记照留）。
        //   导入记录里多一种 { kind:'ai', of:原来那次导入的批次号, b, at, add:[], h:[], chg:[{ id, was, now }] }：AI 改了哪几条、改前改后，
        //   撤销照导入撤销那一套；撤原来那次导入要先撤它（undo.js 算依赖）。AI 修改前也自动备份一份（键 …_bk_<时间>_a，和导入前的共用 3 份）。
        const IMP_APPS=['alipay','wechat'];
        const IMP_LOG_MAX=10;
        const IMP_TYPE_AS=['normal','transfer','refund','skip'];   // 新交易类型怎么处理：照收/支、转账不计入、当退款（1.1）、跳过
        const IMP_STATUS_AS=['import','skip'];                      // 新交易状态：导入 / 跳过
        const IMP_BATCH_RE=/^[0-9a-z]{1,40}$/;
        const IMP_AI_FLAGS=['dup','miss'];      // 1017-G：AI 标记的类型：可能重复、可能漏配
        // 1017-G：洗一个 AI 标记；不合格返回 null（记录照留，只是不带标记）。mapId 给了就把 ref 换成新编号（换不了就去掉 ref）
        function impCleanAiFlag(f, mapId){
            if(!f || typeof f!=='object' || Array.isArray(f) || !IMP_AI_FLAGS.includes(f.k)) return null;
            const o={ k:f.k, why:typeof f.why==='string' ? f.why.slice(0, 200) : '' };
            if(typeof f.ref==='string' && f.ref){ const r=mapId ? mapId(f.ref) : f.ref; if(r) o.ref=r; }
            return o;
        }
        function impPrefix(id){ return `imp_${id}_`; }
        function impArchPrefix(id, aid){ return `imp_${id}_${aid}_`; }
        function impOrdKey(id, aid, app, mon){ return `imp_${id}_${aid}_o_${app}_${mon}`; }
        function impPendKey(id, aid){ return `imp_${id}_${aid}_p`; }
        function impLogKey(id, aid){ return `imp_${id}_${aid}_i`; }
        //   · imp_<账号>_<存档号>_d   1019-E：导入草稿（确认页上选好的文件和选择）。只在这台手机上，不进备份、云备份，
        //     不走账本写入队列（不改账本版本，免得「账本变了」拒绝导入）；删存档、删账号、恢复备份时跟着删
        function impDraftKey(id, aid){ return `imp_${id}_${aid}_d`; }
        // 1019-V：导入草稿最多留 24 小时（账单文件只在导入没做完时临时存在这台手机上）；过了就删，下次打开导入页也不问
        const IMP_DRAFT_MAX_MS=24*3600*1000;
        function impDraftStale(v){ return !v || !(typeof v.at==='number') || Date.now()-v.at > IMP_DRAFT_MAX_MS; }
        // 打开 App 进了账号、首屏出来以后过一会儿：这个账号各个存档里超过 24 小时的草稿都删掉（没再打开导入页也删）
        async function impDraftExpire(id){
            const ks=[...__ledgerKeys].filter(k=>k.indexOf(`imp_${id}_`)===0 && /_d$/.test(k));
            for(const k of ks){
                let v=null;
                try{ v=await idbGet(k); }catch(_){ v=null; }
                if(impDraftStale(v)){ try{ await idbBatch([['del', k]]); }catch(_){} }
            }
        }
        function impParseOrdKey(id, aid, k){
            const p=impArchPrefix(id, aid)+'o_';
            if(typeof k!=='string' || k.indexOf(p)!==0) return null;
            const m=/^(alipay|wechat)_(\d{4}-\d{2}|none)$/.exec(k.slice(p.length));
            return m ? { app:m[1], mon:m[2] } : null;
        }
        function impErr(code, extra){ const e=new Error(code); e.code=code; if(extra) Object.assign(e, extra); return e; }

        // ---- 排进账本的写入队列 ----
        function impQueue(e, k, v){ e.extra.set(k, { v, g:++e.gen }); }
        // 存档没了：它的导入数据全删（和月份块同一个事务）
        function impQueueDropArchive(e, aid){
            const p=impArchPrefix(e.id, aid);
            __ledgerKeys.forEach(k=>{ if(k.indexOf(p)===0) impQueue(e, k, null); });
            [...e.extra.keys()].forEach(k=>{ if(k.indexOf(p)===0) impQueue(e, k, null); });
        }
        // 进账号时：不属于任何存档的导入数据（旧版本删存档时不认识它们，会留下来）删掉。账本有坏的时候不动
        function impQueueOrphans(e){
            if(!e.has || e.broken) return;
            const aids=new Set(e.names.values()), p=impPrefix(e.id);
            let n=0;
            __ledgerKeys.forEach(k=>{
                if(k.indexOf(p)!==0) return;
                const m=/^(a[0-9a-z]+)_/.exec(k.slice(p.length));
                if(m && !aids.has(m[1])){ impQueue(e, k, null); n++; }
            });
            if(n) ledgerKick(storeKey(e.id)).catch(()=>{});
        }

        // ---- 单号表一块：编码 / 解码 ----
        // 解码成 [{ no, id, batch, st }]，st：0 已导入、1 忽略（id 为空串）。格式不对返回 null
        function impBlkDecode(v){
            let o=v;
            if(typeof v==='string'){ try{ o=JSON.parse(v); }catch(_){ return null; } }
            if(!o || typeof o!=='object' || Array.isArray(o) || !Array.isArray(o.ids) || !Array.isArray(o.bs)
                || typeof o.n!=='string' || typeof o.r!=='string' || typeof o.b!=='string') return null;
            if(o.n==='') return (o.r==='' && o.b==='') ? [] : null;
            const n=o.n.split(','), r=o.r.split(','), b=o.b.split(',');
            if(r.length!==n.length || b.length!==n.length) return null;
            const out=new Array(n.length);
            for(let i=0;i<n.length;i++){
                if(!n[i]) return null;
                let id='', st=1, batch='';
                if(r[i]!=='-'){
                    const x=Number(r[i]);
                    if(!Number.isInteger(x) || x<0 || x>=o.ids.length || typeof o.ids[x]!=='string' || !o.ids[x]) return null;
                    id=o.ids[x]; st=0;
                }
                if(b[i]!=='-'){
                    const y=Number(b[i]);
                    if(!Number.isInteger(y) || y<0 || y>=o.bs.length || typeof o.bs[y]!=='string') return null;
                    batch=o.bs[y];
                }
                out[i]={ no:n[i], id, batch, st };
            }
            return out;
        }
        function impBlkEncode(list){
            const ids=[], bs=[], im=new Map(), bm=new Map(), n=[], r=[], b=[];
            list.forEach(x=>{
                n.push(x.no);
                if(x.st===1) r.push('-');
                else { let i=im.get(x.id); if(i===undefined){ i=ids.length; im.set(x.id, i); ids.push(x.id); } r.push(i); }
                if(!x.batch) b.push('-');
                else { let j=bm.get(x.batch); if(j===undefined){ j=bs.length; bm.set(x.batch, j); bs.push(x.batch); } b.push(j); }
            });
            return { ids, bs, n:n.join(','), r:r.join(','), b:b.join(',') };
        }
        // 登记一条单号要满足的：来源是两家之一、单号不空不带逗号、已导入的要有记录 id
        function impCleanOrder(x){
            if(!x || typeof x!=='object' || !IMP_APPS.includes(x.app)) return null;
            const no=typeof x.no==='string' ? x.no.trim() : '';
            if(!no || no.length>80 || no.indexOf(',')>=0) return null;
            const st=x.st===1 ? 1 : 0;
            const id=st===0 && typeof x.id==='string' && x.id ? x.id : '';
            if(st===0 && !id) return null;
            const batch=typeof x.batch==='string' && IMP_BATCH_RE.test(x.batch) ? x.batch : '';
            return { app:x.app, no, id, batch, st, mon:recMonth({ time:x.time }) };
        }

        // ---- 读 ----
        // 一个键现在的值：写入队列里还没写进库的为准
        async function impGetRaw(e, k){
            const x=e.extra.get(k);
            if(x) return x.v;
            return asRaw(await idbGet(k));
        }
        async function impGetJson(e, k){
            const raw=await impGetRaw(e, k);
            if(raw===null) return null;
            try{ return JSON.parse(raw); }catch(_){ ledgerBackupCorrupted(k, raw); throw impErr('impdamaged', { keys:[k] }); }
        }
        // 这个存档的单号表全部分块：键 → 解码后的列表。有读不出来的块就报 impdamaged（原文另存一份）
        async function impReadOrders(e, aid){
            const rows=await idbRange(impArchPrefix(e.id, aid)+'o_');
            const raws=new Map();
            rows.forEach(([k, v])=>{ if(impParseOrdKey(e.id, aid, k)) raws.set(k, asRaw(v)); });
            e.extra.forEach((x, k)=>{ if(impParseOrdKey(e.id, aid, k)){ if(x.v===null) raws.delete(k); else raws.set(k, x.v); } });
            const out=new Map(), bad=[];
            [...raws.keys()].sort().forEach(k=>{
                const list=impBlkDecode(raws.get(k));
                if(list===null){ bad.push(k); ledgerBackupCorrupted(k, raws.get(k)); }
                else out.set(k, list);
            });
            if(bad.length) throw impErr('impdamaged', { keys:bad });
            return out;
        }
        // 查询用的单号表：每个来源一张「单号 → 条目」和一份排好序的单号（按开头查用二分）
        function impOrderTable(e, aid, blocks){
            const by=new Map(); IMP_APPS.forEach(a=>by.set(a, { map:new Map(), sorted:null }));
            let size=0;
            blocks.forEach((list, k)=>{
                const p=impParseOrdKey(e.id, aid, k);
                const t=by.get(p.app);
                list.forEach(x=>{
                    if(!t.map.has(x.no)) size++;
                    t.map.set(x.no, { app:p.app, no:x.no, id:x.id, batch:x.batch, st:x.st, mon:p.mon });
                });
            });
            const sortedOf=t=>t.sorted || (t.sorted=[...t.map.keys()].sort());
            // 只读的计数：上一次「按开头查」看了几个单号（二分的步数 + 往后数的条数），测试用它核对查询的代价，不比毫秒
            const stats={ lastScan:0 };
            return {
                size, stats,
                get(app, no){ const t=by.get(app); return (t && t.map.get(no)) || null; },
                // 单号以 prefix 开头的条目（按单号排序），最多 limit 条
                findPrefix(app, prefix, limit){
                    const t=by.get(app); if(!t || typeof prefix!=='string' || !prefix) return [];
                    const arr=sortedOf(t), max=limit>0 ? limit : 50, out=[];
                    let lo=0, hi=arr.length, steps=0;
                    while(lo<hi){ steps++; const mid=(lo+hi)>>1; if(arr[mid]<prefix) lo=mid+1; else hi=mid; }
                    for(let i=lo;i<arr.length && out.length<max && arr[i].startsWith(prefix);i++){ steps++; out.push(t.map.get(arr[i])); }
                    stats.lastScan=steps;
                    return out;
                }
            };
        }

        // ---- 写：排进队列，等它和账本一起写进库；失败就把这几个键退回原样，报 quota / savefail ----
        async function impWrite(e, key, pairs){
            const prev=pairs.map(([k])=>[k, e.extra.get(k)]);
            pairs.forEach(([k, v])=>impQueue(e, k, v));
            try{ await ledgerKick(key); }
            catch(err){
                prev.forEach(([k, x])=>{ if(x===undefined) e.extra.delete(k); else e.extra.set(k, x); });
                const x=new Error(isQuotaErr(err) ? 'quota' : 'savefail'); x.cause=err; throw x;
            }
        }

        // ---- 清洗（导入备份和对外的写函数共用）。mapId(旧记录 id) → 新 id，找不到返回 null ----
        function impCleanNames(a){
            if(!Array.isArray(a)) return [];
            // 不能删掉不合格的：编号就是位置，删一个后面的全错位。不合格的换成空串占位
            return a.slice(0, 200000).map(x=>typeof x==='string' ? x.slice(0, 64) : '');
        }
        function impCleanRules(r, cats){
            if(!r || typeof r!=='object' || Array.isArray(r)) return null;
            const cat=(Array.isArray(r.cat) ? r.cat : []).slice(0, 5000).map(x=>{
                if(!x || typeof x!=='object') return null;
                const kw=typeof x.kw==='string' ? x.kw.trim().slice(0, 32) : '';
                const c=typeof x.cat==='string' ? x.cat : '';
                return (kw && cats.includes(c)) ? { kw, cat:c } : null;
            }).filter(Boolean);
            const type=(Array.isArray(r.type) ? r.type : []).slice(0, 500).map(x=>{
                if(!x || typeof x!=='object' || !IMP_APPS.includes(x.app)) return null;
                if(typeof x.type==='string' && x.type.trim() && x.status===undefined && IMP_TYPE_AS.includes(x.as))
                    return { app:x.app, type:x.type.trim().slice(0, 32), as:x.as };
                if(typeof x.status==='string' && x.status.trim() && x.type===undefined && IMP_STATUS_AS.includes(x.as))
                    return { app:x.app, status:x.status.trim().slice(0, 32), as:x.as };
                return null;
            }).filter(Boolean);
            // 分类对照：from 是推荐分类名，同一个 from 只留第一条；目标分类必须在存档里
            const seenFrom=new Set();
            const map=(Array.isArray(r.map) ? r.map : []).slice(0, 500).map(x=>{
                if(!x || typeof x!=='object') return null;
                const from=typeof x.from==='string' ? x.from.trim().slice(0, 32) : '';
                const c=typeof x.cat==='string' ? x.cat : '';
                if(!from || !cats.includes(c) || seenFrom.has(from)) return null;
                seenFrom.add(from);
                return { from, cat:c };
            }).filter(Boolean);
            if(!cat.length && !type.length && !map.length) return null;
            return map.length ? { cat, type, map } : { cat, type };
        }
        function impCleanPending(items, mapId){
            if(!Array.isArray(items)) return [];
            const str=(v, n)=>typeof v==='string' ? v.slice(0, n) : '';
            return items.map(x=>{
                if(!x || typeof x!=='object' || !IMP_APPS.includes(x.app)) return null;
                const amt=Number(x.amt);
                if(!Number.isInteger(amt) || amt<0) return null;
                const o={ app:x.app, no:str(x.no, 80), t:str(x.t, 16), amt, io:x.io==='income' ? 'income' : 'expense',
                          cp:str(x.cp, 64), d:str(x.d, 200),
                          cand:(Array.isArray(x.cand) ? x.cand : []).map(mapId).filter(Boolean),
                          b:typeof x.b==='string' && IMP_BATCH_RE.test(x.b) ? x.b : '', why:str(x.why, 32) };
                return o;
            }).filter(Boolean);
        }
        function impCleanLog(list, mapId, cats, cpsLen, pmsLen){
            if(!Array.isArray(list)) return [];
            const str=(v, n)=>typeof v==='string' ? v.slice(0, n) : '';
            const len=(v, max)=>Number.isInteger(v) && v>=0 && v<=max ? v : max;
            return list.slice(-IMP_LOG_MAX).map(x=>{
                if(!x || typeof x!=='object' || typeof x.b!=='string' || !IMP_BATCH_RE.test(x.b)) return null;
                const chg=(Array.isArray(x.chg) ? x.chg : []).map(c=>{
                    if(!c || typeof c!=='object') return null;
                    const id=mapId(c.id); if(!id) return null;
                    const was={};
                    if(c.was && typeof c.was==='object' && !Array.isArray(c.was)){
                        Object.keys(c.was).slice(0, 20).forEach(k=>{ const v=c.was[k]; if(v===null || ['string','number','boolean'].includes(typeof v)) was[k]=v; });
                    }
                    const nos=(Array.isArray(c.nos) ? c.nos : []).filter(p=>Array.isArray(p) && IMP_APPS.includes(p[0]) && typeof p[1]==='string' && p[1]).map(p=>[p[0], p[1].slice(0, 80)]);
                    // 第二期（1016-Z6）：合并进去的账单（账单详情里「拆开」用）。名单编号超出现在名单长度的去掉
                    const bills=(Array.isArray(c.bills) ? c.bills : []).slice(0, 50).map(b=>{
                        if(!b || typeof b!=='object' || !IMP_APPS.includes(b.app)) return null;
                        const fen=Number(b.fen); if(!Number.isInteger(fen) || fen<0) return null;
                        const o={ app:b.app, no:typeof b.no==='string' ? b.no.slice(0, 80) : '', fen, time:typeof b.time==='string' ? b.time.slice(0, 16) : '',
                                  type:b.type==='income' ? 'income' : 'expense', remark:typeof b.remark==='string' ? b.remark.slice(0, 5000) : '' };
                        if(Number.isInteger(b.cp) && b.cp>=0 && b.cp<cpsLen) o.cp=b.cp;
                        if(Number.isInteger(b.pm) && b.pm>=0 && b.pm<pmsLen) o.pm=b.pm;
                        if(typeof b.oc==='string' && b.oc) o.oc=b.oc.slice(0, 32);
                        return o;
                    }).filter(Boolean);
                    const withB=o=>{ if(bills.length) o.bills=bills; return o; };
                    // 1016-K：导入写进去的值（撤销时比一比，不一样就是你后来改过）。旧批次没有
                    if(c.now && typeof c.now==='object' && !Array.isArray(c.now)){
                        const now={};
                        Object.keys(c.now).slice(0, 20).forEach(k=>{ const v=c.now[k]; if(v===null || ['string','number','boolean'].includes(typeof v)) now[k]=v; });
                        return withB({ id, was, now, nos });
                    }
                    return withB({ id, was, nos });
                }).filter(Boolean);
                // 新增的记录 id 和指纹（1016-K 起，一一对应）一起换编号、一起丢
                const add0=Array.isArray(x.add) ? x.add : [], withH=Array.isArray(x.h) && x.h.length===add0.length;
                const addPairs=add0.map((id, k)=>[mapId(id), withH && typeof x.h[k]==='string' ? x.h[k].slice(0, 16) : '']).filter(p=>p[0]);
                const endOk=(v, from, max)=>Number.isInteger(v) && v>=from && v<=max;
                const ra=impCleanRules(x.rulesAdded, cats) || { cat:[], type:[] };
                const o={ b:x.b, at:str(x.at, 16),
                         apps:(Array.isArray(x.apps) ? x.apps : []).filter(a=>IMP_APPS.includes(a)),
                         from:str(x.from, 10), to:str(x.to, 10),
                         add:addPairs.map(p=>p[0]) };
                if(withH) o.h=addPairs.map(p=>p[1]);
                o.chg=chg; o.cpLen=len(x.cpLen, cpsLen); o.pmLen=len(x.pmLen, pmsLen);
                if(endOk(x.cpEnd, o.cpLen, cpsLen)) o.cpEnd=x.cpEnd;
                if(endOk(x.pmEnd, o.pmLen, pmsLen)) o.pmEnd=x.pmEnd;
                o.catsAdded=(Array.isArray(x.catsAdded) ? x.catsAdded : []).filter(c=>typeof c==='string' && cats.includes(c));
                o.rulesAdded=ra;
                if(x.only===true) o.only=true;      // 1016-Q：只对账（只补了勾选的几笔）
                // 1017-G：AI 修改（不是导入）：改的是哪一次导入的记录
                if(x.kind==='ai'){ o.kind='ai'; if(typeof x.of==='string' && IMP_BATCH_RE.test(x.of)) o.of=x.of; }
                // 1017-H：这次导入交给 AI 检查时的导出时间（最近 5 次），AI 回复里的导出时间要是其中之一才认
                if(Array.isArray(x.aiAt)){ const aa=x.aiAt.filter(v=>typeof v==='string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v)).slice(-5); if(aa.length) o.aiAt=aa; }
                // 1016-Y：这次改了你已有的哪几条规则（关键词、原来的分类、改成的分类），撤销时改回去
                if(Array.isArray(x.rulesChanged)){
                    const rc=x.rulesChanged.filter(r=>r && typeof r.kw==='string' && r.kw && typeof r.from==='string' && typeof r.to==='string').map(r=>({ kw:r.kw.slice(0, 32), from:r.from, to:r.to }));
                    if(rc.length) o.rulesChanged=rc;
                }
                // 1016-U：每个来源各自的账单起止 { 来源: [起, 止] }（记住上次导到哪天）
                if(x.rng && typeof x.rng==='object' && !Array.isArray(x.rng)){
                    const rng={};
                    IMP_APPS.forEach(app=>{ const r=x.rng[app]; if(Array.isArray(r) && /^\d{4}-\d{2}-\d{2}$/.test(r[0]) && /^\d{4}-\d{2}-\d{2}$/.test(r[1])) rng[app]=[r[0], r[1]]; });
                    if(Object.keys(rng).length) o.rng=rng;
                }
                // 1016-O：这批从待处理池里拿掉的（有了结论），带原来的位置；撤销时放回去
                if(Array.isArray(x.pendTaken) && x.pendTaken.length){
                    const pt=x.pendTaken.filter(p=>p && Number.isInteger(p.i) && p.i>=0).map(p=>{ const c=impCleanPending([p.x], mapId)[0]; return c ? { i:p.i, x:c } : null; }).filter(Boolean);
                    if(pt.length) o.pendTaken=pt;
                }
                return o;
            }).filter(Boolean);
        }
        // 备份文件里的单号表 { 来源: { 月份: 一块 } } → 库里的 [键, 值]。记录 id 换成新的；已导入但记录找不到的不要（按规则本来就等于没导过）
        function impCleanOrdersFromBackup(o, mapId, id, aid){
            const out=[]; let kept=0, dropped=0;
            if(!o || typeof o!=='object' || Array.isArray(o)) return { pairs:out, kept, dropped };
            IMP_APPS.forEach(app=>{
                const months=o[app];
                if(!months || typeof months!=='object' || Array.isArray(months)) return;
                Object.keys(months).forEach(mon=>{
                    if(!/^(\d{4}-\d{2}|none)$/.test(mon)) return;
                    const list=impBlkDecode(months[mon]);
                    if(!list){ dropped++; return; }
                    const seen=new Set(), next=[];
                    list.forEach(x=>{
                        if(seen.has(x.no)) return;
                        if(x.st===0){ const nid=mapId(x.id); if(!nid){ dropped++; return; } x={ ...x, id:nid }; }
                        if(x.batch && !IMP_BATCH_RE.test(x.batch)) x={ ...x, batch:'' };
                        seen.add(x.no); next.push(x); kept++;
                    });
                    if(next.length) out.push([impOrdKey(id, aid, app, mon), JSON.stringify(impBlkEncode(next))]);
                });
            });
            return { pairs:out, kept, dropped };
        }
        // 存档里和导入有关的设置（在 meta 里，跟着备份 / 云备份走）。空的不写，没导入过的存档备份内容不变
        function impArchFields(a){
            const o={};
            if(Array.isArray(a.cps) && a.cps.length) o.cps=a.cps;
            if(Array.isArray(a.pms) && a.pms.length) o.pms=a.pms;
            if(a.importRules && ((a.importRules.cat||[]).length || (a.importRules.type||[]).length || (a.importRules.map||[]).length)) o.importRules=a.importRules;
            return o;
        }
        // 单独存的那几样（导出备份 / 云同步时读）。withOrders：要不要带单号表（云同步不带，见 odSyncNow）
        async function impExportFields(user, archive, withOrders){
            const e=__ledger.get(storeKey(user)), aid=e && e.names.get(archive);
            const o={};
            if(!aid) return o;
            const log=await impGetJson(e, impLogKey(e.id, aid));
            if(log && Array.isArray(log.list) && log.list.length) o.imports=log.list;
            const pend=await impGetJson(e, impPendKey(e.id, aid));
            if(pend && Array.isArray(pend.items) && pend.items.length) o.pending=pend.items;
            if(withOrders){
                const blocks=await impReadOrders(e, aid);
                if(blocks.size){
                    o.orders={};
                    blocks.forEach((list, k)=>{
                        const p=impParseOrdKey(e.id, aid, k);
                        (o.orders[p.app]=o.orders[p.app]||{})[p.mon]=impBlkEncode(list);
                    });
                }
            }
            return o;
        }
        // 分类改名 / 删除时，分类规则、分类对照（1016-J）跟着改 / 一起删
        function impRulesRenameCat(a, from, to){
            if(!a.importRules) return;
            const o=Object.assign({}, a.importRules);
            if(Array.isArray(o.cat)) o.cat=o.cat.map(r=>r.cat===from ? { kw:r.kw, cat:to } : r);
            if(Array.isArray(o.map)) o.map=o.map.map(m=>m.cat===from ? { from:m.from, cat:to } : m);
            a.importRules=o;
        }
        function impRulesDropCat(a, name){
            if(!a.importRules) return;
            const o=Object.assign({}, a.importRules);
            if(Array.isArray(o.cat)) o.cat=o.cat.filter(r=>r.cat!==name);
            if(Array.isArray(o.map)){ o.map=o.map.filter(m=>m.cat!==name); if(!o.map.length) delete o.map; }
            a.importRules=o;
        }

        // ---- 存储估算：导入前预检用 ----
        //   records：要新增的记录条数；orders：要登记的单号数；names：名单要新加的词（字符串数组）或个数
        //   返回 { chars: 多占的字符数, bytes: 按每个字符 2 字节估的字节数（库里中文占 2 字节，偏保守）}
        //   记录按这个存档现有记录的平均长度算（没有记录或没带导入字段时按导入记录的典型长度）；
        //   单号表按每条 40 字符（单号约 30 + 两个位置编号和逗号；记录 id、批次一块里只写一次，分摊下来很少）
        const IMP_EST={ rec:150, recExtra:70, order:40, name:12 };
        function impEstimate(o, archive){
            o=o||{};
            const n=Math.max(0, Math.floor(+o.records||0)), k=Math.max(0, Math.floor(+o.orders||0));
            let recLen=IMP_EST.rec;
            try{
                const t=impTarget(archive);
                const st=t.e.archs.get(t.aid), recs=st ? st.recs : [];
                if(recs.length){
                    const step=Math.max(1, Math.floor(recs.length/500));
                    let sum=0, cnt=0, withSrc=0;
                    for(let i=0;i<recs.length;i+=step){ sum+=JSON.stringify(recs[i]).length; cnt++; if(recs[i].src) withSrc++; }
                    // 现有记录多半是手记（不带导入字段），要加上导入字段的长度
                    recLen=Math.round(sum/cnt) + (withSrc*2>=cnt ? 0 : IMP_EST.recExtra) + 8;   // 8：序号和逗号
                }
            }catch(_){}
            let nameChars=0;
            if(Array.isArray(o.names)) o.names.forEach(s=>{ nameChars+=String(s).length+3; });
            else nameChars=Math.max(0, Math.floor(+o.names||0))*IMP_EST.name;
            const chars=n*recLen + k*IMP_EST.order + nameChars;
            return { chars, bytes:chars*2 };
        }

        // ---- 对外：给以后的导入代码用的一组读写函数（这一版不接界面）----
        // 都是当前账号；archive 是存档名，不传就是当前存档。
        function impTarget(archive){
            if(!currentUser) throw impErr('nologin');
            const key=storeKey(currentUser), e=__ledger.get(key);
            if(!e || !e.has) throw impErr('notloaded');
            const name=archive!==undefined ? archive : currentArchive;
            const aid=e.names.get(name);
            if(!aid) throw impErr('noarchive');
            return { e, key, aid, name };
        }
        // ===== 1016-F：写入（账单导入第一期 ⑥b）=====
        // 导入前备份：现有备份格式（和「导出存档」一样的字段）+ _arch（存档设置原样，恢复时逐字节还原用）。
        //   存在本机库里 imp_<账号>_<存档号>_bk_<时间>，不进备份、不进云备份，存档删了跟着删。
        //   一份是一整套：账本（含 AI 标记）、存档设置（分类、预算、模板、importRules、对方 / 支付方式名单……）、单号表、待处理池、导入记录。
        // 1017-O：备份按种类分开放、各留几份（原来几种共用 3 份，连撤两次就把导入前那份挤掉了）：
        //   import 导入前（键 …_bk_<时间>）/ undo 撤销前（…_u，1016-K）/ ai AI 修改前（…_a，1017-G）/ restore 恢复前（…_r，1017-O）。
        //   12 万条一份约 22MB，全满时约 7 份；每次写前看剩余空间，放不下就不做那件事（照旧提示）。
        //   新备份先写进去，那件事做成了才删同种里最旧的（做失败了删掉新的、旧的照留）。
        //   …_bk_M：备份目录（每份的种类、时间、是哪一次操作之前、有几条记录），和备份同一个事务写；没有目录的旧备份打开时现读。
        const IMP_BK_SLOTS={ import:3, undo:2, ai:1, restore:1 };
        const IMP_BK_MAX=3;      // 老的「共用 3 份」只剩 restoreLast 的说明里用；份数看 IMP_BK_SLOTS
        const IMP_BK_SUF={ import:'', undo:'_u', ai:'_a', restore:'_r' };
        function impBkPrefix(id, aid){ return `imp_${id}_${aid}_bk_`; }
        function impBkMetaKey(id, aid){ return impBkPrefix(id, aid)+'M'; }
        const IMP_BK_RE=/^([0-9a-z]+)(_[uar])?$/;
        function impBkKindOf(k){ return /_u$/.test(k) ? 'undo' : /_a$/.test(k) ? 'ai' : /_r$/.test(k) ? 'restore' : 'import'; }
        function impBkTime(id, aid, k){ const m=IMP_BK_RE.exec(k.slice(impBkPrefix(id, aid).length)); return m ? parseInt(m[1], 36) : 0; }
        // 这个存档的备份键（旧的在前；目录键不算）
        function impBkKeys(id, aid){
            const p=impBkPrefix(id, aid);
            return [...__ledgerKeys].filter(k=>k.indexOf(p)===0 && IMP_BK_RE.test(k.slice(p.length)))
                .sort((x, y)=>impBkTime(id, aid, x)-impBkTime(id, aid, y) || (x<y ? -1 : x>y ? 1 : 0));
        }
        // kind：见上面；IMP_BK_KIND 是备份里写的 kind（恢复时认这几种）
        const IMP_BK_KIND={ import:'导入前备份', undo:'撤销前备份', ai:'AI 修改前备份', restore:'恢复前备份' };
        async function impMakeBackup(t, batch, kind){
            const store=loadStore(t.e.id), a=store.archives[t.name];
            const ex=await impExportFields(t.e.id, t.name, true);
            const arch={}; Object.keys(a).forEach(k=>{ arch[k] = k==='records' ? null : a[k]; });
            return JSON.stringify({ app:'记问', kind:IMP_BK_KIND[kind] || IMP_BK_KIND.import, user:nameOf(t.e.id), accountId:t.e.id, archive:t.name, aid:t.aid, batch,
                cats:a.cats, budgets:a.budgets||{}, tpls:a.tpls||[], ...impArchFields(a), data:a.records, ...ex,
                _arch:arch, exportedAt:new Date().toLocaleString() });
        }
        async function impBkMetaRead(t){
            try{ const raw=asRaw(await idbGet(impBkMetaKey(t.e.id, t.aid))); const o=raw ? JSON.parse(raw) : null; return o && o.list && typeof o.list==='object' ? o.list : {}; }
            catch(_){ return {}; }
        }
        // 1017-O：做一份备份并写进去（先看剩余空间）。meta：{ what（是哪一次操作之前，大白话）, b（那次操作的批次号）}
        //   返回 { key, drop }：drop 是那件事做成以后要删的同种旧备份（impBkDone），做失败了调 impBkFail 删掉这份
        async function impBkSave(t, kind, batch, meta, extraNeed){
            const bk=await impMakeBackup(t, batch, kind);
            const free=await impFreeBytes(), need=Math.ceil(bk.length*2*1.2 + (extraNeed||0));
            if(free!==null && free<need) throw impErr('nospace', { need, free });
            if(window.__impFailAt==='backup') throw impErr('test');
            const p=impBkPrefix(t.e.id, t.aid);
            let ts=Date.now(), key;
            do { key=p+ts.toString(36)+IMP_BK_SUF[kind]; ts++; } while(__ledgerKeys.has(key));
            const same=impBkKeys(t.e.id, t.aid).filter(k=>impBkKindOf(k)===kind);
            const drop=same.slice(0, Math.max(0, same.length-(IMP_BK_SLOTS[kind]-1)));
            const idx=await impBkMetaRead(t), live=new Set(impBkKeys(t.e.id, t.aid));
            Object.keys(idx).forEach(k=>{ if(!live.has(k)) delete idx[k]; });
            const a=loadStore(t.e.id).archives[t.name];
            idx[key]=Object.assign({ kind, t:ts-1, n:(a.records||[]).length }, meta||{});
            await idbBatch([['put', key, bk], ['put', impBkMetaKey(t.e.id, t.aid), JSON.stringify({ v:1, list:idx })]]);
            return { key, drop, bytes:bk.length*2 };
        }
        async function impBkDone(t, saved){
            if(!saved || !saved.drop.length) return;
            try{
                const idx=await impBkMetaRead(t); saved.drop.forEach(k=>delete idx[k]);
                await idbBatch(saved.drop.map(k=>['del', k]).concat([['put', impBkMetaKey(t.e.id, t.aid), JSON.stringify({ v:1, list:idx })]]));
            }catch(_){}
        }
        async function impBkFail(t, saved){
            if(!saved) return;
            try{
                const idx=await impBkMetaRead(t); delete idx[saved.key];
                await idbBatch([['del', saved.key], ['put', impBkMetaKey(t.e.id, t.aid), JSON.stringify({ v:1, list:idx })]]);
            }catch(_){}
        }
        // 剩余空间：拿不到（浏览器不支持）就不拦
        async function impFreeBytes(){
            try{
                if(!navigator.storage || !navigator.storage.estimate) return null;
                const q=await navigator.storage.estimate();
                return q && q.quota ? q.quota-(q.usage||0) : null;
            }catch(_){ return null; }
        }
        // 单号表登记：同来源同单号覆盖（和 ordersRegister 一样），返回要写的 [键, 值]
        async function impOrderPairs(e, aid, entries){
            const byKey=new Map();
            entries.forEach(x=>{ const k=impOrdKey(e.id, aid, x.app, x.mon); let a=byKey.get(k); if(!a) byKey.set(k, a=[]); a.push(x); });
            const pairs=[];
            for(const [k, xs] of byKey){
                const raw=await impGetRaw(e, k);
                const cur=raw===null ? [] : impBlkDecode(raw);
                if(cur===null){ ledgerBackupCorrupted(k, raw); throw impErr('impdamaged', { keys:[k] }); }
                const at=new Map(cur.map((x, i)=>[x.no, i]));
                xs.forEach(x=>{
                    const v={ no:x.no, id:x.id, batch:x.batch, st:x.st };
                    if(at.has(x.no)) cur[at.get(x.no)]=v; else { at.set(x.no, cur.length); cur.push(v); }
                });
                pairs.push([k, JSON.stringify(impBlkEncode(cur))]);
            }
            return pairs;
        }
        const impYield=()=>new Promise(r=>setTimeout(r, 0));
        // 按写入清单（import/write.js 的结果）改账本：一个事务，要么全写进去，要么一条都不写
        async function impApplyWrite(t, ws, prog){
            const user=t.e.id, store=loadStore(user), a=store.archives[t.name];
            const recs=a.records, at=new Map();
            recs.forEach((r, i)=>at.set(r.id, i));
            // 新记录：先发编号（退款要挂到这批新建的原单上）
            const idOf={}; ws.records.forEach(r=>{ idOf[r.tmp]=genId(); });
            const res=ref=>!ref ? null : (ref.tmp ? idOf[ref.tmp] : ref.id);
            const made=[], madeBy={};
            for(let i=0;i<ws.records.length;i++){
                const x=ws.records[i];
                const r={ id:idOf[x.tmp], time:x.time, money:x.money, cat:x.cat||'未分类', remark:x.remark||'', type:x.type };
                if(x.skip===true) r.skip=true; else if(x.flow===true) r.flow=true;
                if(x.src && IMP_APPS.includes(x.src.app)){ r.src={ app:x.src.app }; if(x.src.sum) r.src.sum=x.src.sum; }
                if(typeof x.batch==='string' && IMP_BATCH_RE.test(x.batch)) r.batch=x.batch;
                if(Number.isInteger(x.cp)) r.cp=x.cp;
                if(Number.isInteger(x.pm)) r.pm=x.pm;
                if(typeof x.oc==='string' && x.oc) r.oc=x.oc.slice(0, 32);
                if(x.refundOf) r.refundOf=res(x.refundOf);
                made.push(r); madeBy[r.id]=r;
                if(i%200===199){ prog && prog('build', i+1, ws.records.length); await impYield(); }
            }
            // 改以前的记录（合并进手记、往合并记录上加、旧退款挂到新原单），原值记进导入记录
            const chg=[];
            ws.changes.forEach(c=>{
                const i=at.get(c.id);
                if(i===undefined) throw impErr('gone', { id:c.id });
                const old=recs[i], n=Object.assign({}, old), was={};
                Object.keys(c.set).forEach(k=>{
                    was[k]= (k in old) ? (old[k]!==null && typeof old[k]==='object' ? JSON.stringify(old[k]) : old[k]) : null;
                    n[k]= k==='refundOf' ? res(c.set[k]) : c.set[k];
                });
                if(c.addFen){ was.money=old.money; n.money=round2(safeNum(old.money)+c.addFen/100); }
                if(c.kind==='link'){
                    const o=madeBy[n.refundOf];
                    if(o){ was.cat=old.cat; was.skip=old.skip===true ? true : null; was.flow=old.flow===true ? true : null; n.cat=o.cat; setRecMode(n, recMode(o)); }
                }
                recs[i]=n;
                // 1016-K：导入写进去的值，和原值同样的写法（对象存 JSON 文本，没有记 null）
                const now={};
                Object.keys(was).forEach(k=>{ const v=n[k]; now[k]= v===undefined ? null : (v!==null && typeof v==='object' ? JSON.stringify(v) : v); });
                const ce={ id:c.id, was, now, nos:c.nos };
                if(Array.isArray(c.bills) && c.bills.length) ce.bills=c.bills;      // 第二期：合并进去的账单（拆开时用）
                chg.push(ce);
            });
            // 退款：分类、口径照原单
            const byId=new Map(recs.map(r=>[r.id, r])); made.forEach(r=>byId.set(r.id, r));
            made.forEach(r=>{ if(r.refundOf){ const o=byId.get(r.refundOf); if(o){ r.cat=o.cat; setRecMode(r, recMode(o)); } else delete r.refundOf; } });
            made.forEach(r=>recs.push(r));
            // 存档设置：名单、新分类、规则
            if(ws.cps.length>(a.cps||[]).length) a.cps=ws.cps.slice();
            if(ws.pms.length>(a.pms||[]).length) a.pms=ws.pms.slice();
            ws.catsAdded.forEach(c=>{ if(!a.cats.includes(c)) a.cats.push(c); });
            if(ws.rulesAdd.length){
                const r0=a.importRules||{};
                a.importRules=Object.assign({}, r0, { cat:(r0.cat||[]).concat(ws.rulesAdd), type:(r0.type||[]) });
            }
            // 1016-Y：改你已有的规则（确认页上选了「以后都改」）：现在还是原来那个分类才改，原值记进导入记录（撤销时改回去）
            const rulesChanged=[];
            (Array.isArray(ws.rulesChange) ? ws.rulesChange : []).forEach(x=>{
                if(!x || typeof x.kw!=='string' || !a.cats.includes(x.to)) return;
                const r0=a.importRules||{}, list=(r0.cat||[]).slice(), i=list.findIndex(r=>r.kw===x.kw && r.cat===x.from);
                if(i<0) return;
                list[i]={ kw:x.kw, cat:x.to };
                a.importRules=Object.assign({}, r0, { cat:list, type:(r0.type||[]) });
                rulesChanged.push({ kw:x.kw, from:x.from, to:x.to });
            });
            // 1016-M：类型规则（没见过的交易类型 / 状态选了怎么处理）：同一来源、同一类型（状态）已有规则的不重复存
            const typesAdd0=(Array.isArray(ws.typesAdd) ? ws.typesAdd : []).filter(x=>x && IMP_APPS.includes(x.app) && (
                (typeof x.type==='string' && x.type && x.status===undefined && IMP_TYPE_AS.includes(x.as)) ||
                (typeof x.status==='string' && x.status && x.type===undefined && IMP_STATUS_AS.includes(x.as))));
            let typesDone=[];
            if(typesAdd0.length){
                const r0=a.importRules||{}, had=new Set((r0.type||[]).map(x=>x.type!==undefined ? 't|'+x.app+'|'+x.type : 's|'+x.app+'|'+x.status));
                typesDone=typesAdd0.filter(x=>!had.has(x.type!==undefined ? 't|'+x.app+'|'+x.type : 's|'+x.app+'|'+x.status))
                    .map(x=>x.type!==undefined ? { app:x.app, type:x.type, as:x.as } : { app:x.app, status:x.status, as:x.as });
                if(typesDone.length) a.importRules=Object.assign({}, r0, { cat:(r0.cat||[]), type:(r0.type||[]).concat(typesDone) });
            }
            // 分类对照（1016-J）：上面已经先建了新分类，目标是这一批新建的也认；同一个推荐分类已有对照的不重复存
            const mapsAdd=(Array.isArray(ws.mapsAdd) ? ws.mapsAdd : []).filter(m=>m && typeof m.from==='string' && m.from && a.cats.includes(m.cat));
            let mapsDone=[];
            if(mapsAdd.length){
                const r0=a.importRules||{}, had=new Set((r0.map||[]).map(m=>m.from));
                const add=mapsAdd.filter(m=>!had.has(m.from));
                mapsDone=add.map(m=>({ from:m.from, cat:m.cat }));
                if(add.length) a.importRules=Object.assign({}, r0, { cat:(r0.cat||[]), type:(r0.type||[]), map:(r0.map||[]).concat(add.map(m=>({ from:m.from, cat:m.cat }))) });
            }
            prog && prog('write', 0, 1);
            // 单号表、待处理池、导入记录
            const orders=ws.orders.map(x=>impCleanOrder({ app:x.app, no:x.no, time:x.time, id:res(x.ref)||'', batch:ws.batch, st:x.st })).filter(Boolean);
            const pairs=await impOrderPairs(t.e, t.aid, orders);
            // 1016-O：原来在待处理池里、这次有了结论的拿掉，拿掉的（带原来的位置）记进导入记录，撤销时放回原处
            const taken=new Set(Array.isArray(ws.pendTaken) ? ws.pendTaken : []), pendTaken=[];
            if(ws.pending.length || taken.size){
                const cur=await impGetJson(t.e, impPendKey(t.e.id, t.aid));
                let list=((cur && cur.items) || []).slice();
                if(taken.size){
                    const keep=[];
                    list.forEach((x, i)=>{ if(taken.has(x.app+'|'+x.no)) pendTaken.push({ i, x }); else keep.push(x); });
                    list=keep;
                }
                const seen=new Set(list.map(x=>x.app+'|'+x.no));
                ws.pending.forEach(x=>{ if(!seen.has(x.app+'|'+x.no)){ seen.add(x.app+'|'+x.no); list.push(x); } });
                const clean=impCleanPending(list, x=>typeof x==='string' && x ? x : null);
                if(pendTaken.length || ws.pending.length) pairs.push([impPendKey(t.e.id, t.aid), clean.length ? JSON.stringify({ v:1, items:clean }) : null]);
            }
            const curLog=await impGetJson(t.e, impLogKey(t.e.id, t.aid));
            const logs=((curLog && curLog.list) || []).slice();
            const ra0=(ws.log && ws.log.rulesAdded) || { cat:[], type:[] };
            const ra={ cat:ra0.cat||[], type:typesDone }; if(mapsDone.length) ra.map=mapsDone;   // 1016-M：类型规则也只记真存进去的   // 导入记录里只记真存进去的对照（给 ⑦ 撤销）
            // 1016-K：新增记录的指纹（撤销时认「导入后你改过没有」）、导完时名单多长
            const W=window.JiwenImportWrite, hs=W && W.recHash ? made.map(r=>W.recHash(r)) : null;
            const lg=Object.assign({}, ws.log, { add:made.map(r=>r.id), chg, rulesAdded:ra, cpEnd:(a.cps||[]).length, pmEnd:(a.pms||[]).length });
            if(pendTaken.length) lg.pendTaken=pendTaken;
            if(rulesChanged.length) lg.rulesChanged=rulesChanged;
            if(hs) lg.h=hs;
            logs.push(lg);
            const cleanLog=impCleanLog(logs, x=>typeof x==='string' && x ? x : null, a.cats, (a.cps||[]).length, (a.pms||[]).length);
            pairs.push([impLogKey(t.e.id, t.aid), JSON.stringify({ v:1, list:cleanLog })]);
            if(window.__impFailAt==='beforeSave') throw impErr('test');
            store.last=store.last || t.name;
            await saveStoreDurable(store, user, ()=>pairs);
            return { added:made.length, changed:chg.length, ids:made.map(r=>r.id) };
        }
        // 恢复一份备份：原地替换（不重新编号），账本、存档设置、单号表、待处理池、导入记录和做那份备份时逐字节一样。
        //   1017-O：用过的那份不删（还能再恢复一次）；恢复前先备份一份「恢复前」（恢复错了能回来，放不下就不恢复）；
        //   恢复本身一个事务，失败什么都不改、刚做的「恢复前」也删掉
        async function impReadBackup(t, key){
            const raw=await idbGet(key);
            if(typeof raw!=='string') throw impErr('nobackup');
            let bk=null; try{ bk=JSON.parse(raw); }catch(_){}
            if(!bk || !Object.values(IMP_BK_KIND).includes(bk.kind) || bk.aid!==t.aid || !bk._arch || !Array.isArray(bk.data)) throw impErr('badbackup');
            return bk;
        }
        async function impRestoreFrom(t, key, opts){
            opts=opts||{};
            const bk=await impReadBackup(t, key);
            if(opts.ver!==undefined && opts.ver!==t.e.ver) throw impErr('stale');
            const what=(IMP_BK_KIND[impBkKindOf(key)]||'备份').replace(/备份$/, '');
            const saved=opts.noSafety ? null : await impBkSave(t, 'restore', '', { what:'恢复 ' + new Date(impBkTime(t.e.id, t.aid, key)).toLocaleString() + ' 的' + what + '备份' });
            try{
                const store=loadStore(t.e.id);
                const a={}; Object.keys(bk._arch).forEach(k=>{ a[k] = k==='records' ? bk.data : bk._arch[k]; });
                if(!('records' in a)) a.records=bk.data;
                store.archives[t.name]=a;
                // 导入数据：这个存档现有的全删（备份和备份目录不算），再照备份写回
                const p=impArchPrefix(t.e.id, t.aid), bp=impBkPrefix(t.e.id, t.aid), pairs=new Map();
                [...__ledgerKeys, ...t.e.extra.keys()].forEach(k=>{ if(k.indexOf(p)===0 && k.indexOf(bp)!==0) pairs.set(k, null); });
                if(bk.orders) Object.keys(bk.orders).forEach(app=>Object.keys(bk.orders[app]).forEach(mon=>{ pairs.set(impOrdKey(t.e.id, t.aid, app, mon), JSON.stringify(bk.orders[app][mon])); }));
                if(Array.isArray(bk.pending) && bk.pending.length) pairs.set(impPendKey(t.e.id, t.aid), JSON.stringify({ v:1, items:bk.pending }));
                if(Array.isArray(bk.imports) && bk.imports.length) pairs.set(impLogKey(t.e.id, t.aid), JSON.stringify({ v:1, list:bk.imports }));
                if(window.__impFailAt==='restoreSave') throw impErr('test');
                await saveStoreDurable(store, t.e.id, ()=>[...pairs]);
            }catch(err){ await impBkFail(t, saved); throw err; }
            await impBkDone(t, saved);
            return { records:bk.data.length, at:bk.exportedAt, batch:bk.batch||'', safety:saved ? saved.key : '' };
        }
        // 1017-O：恢复这份备份会改掉什么（只读；给确认面板写影响）：现在的账本 / 导入记录 vs 备份里的
        function impBackupDiff(cur, bk){
            const now=new Map((cur.records||[]).map(r=>[r.id, r])), was=new Map((bk.data||[]).map(r=>[r.id, r]));
            const out={ records:was.size, now:now.size, goneMan:0, goneImp:0, back:0, changed:0, logsGone:0, aiGone:0, logsBack:0, pendNow:(cur.pending||[]).length, pendBk:(bk.pending||[]).length,
                        catsChange:JSON.stringify(cur.cats||[])!==JSON.stringify(bk._arch && bk._arch.cats || bk.cats || []),
                        rulesChange:JSON.stringify(cur.importRules||null)!==JSON.stringify(bk._arch && bk._arch.importRules || null),
                        budgetsChange:JSON.stringify(cur.budgets||{})!==JSON.stringify(bk._arch && bk._arch.budgets || {}) };
            now.forEach((r, id)=>{ const w=was.get(id); if(!w){ if(r.src || r.batch) out.goneImp++; else out.goneMan++; } else if(JSON.stringify(w)!==JSON.stringify(r)) out.changed++; });
            was.forEach((r, id)=>{ if(!now.has(id)) out.back++; });
            const lb=new Set((bk.imports||[]).map(l=>l.b)), ln=new Set((cur.logs||[]).map(l=>l.b));
            (cur.logs||[]).forEach(l=>{ if(!lb.has(l.b)){ if(l.kind==='ai') out.aiGone++; else out.logsGone++; } });
            (bk.imports||[]).forEach(l=>{ if(!ln.has(l.b)) out.logsBack++; });
            return out;
        }
        // ---- 1016-K：撤销要的存档样子（交给 import/undo.js）和照撤完的样子写回 ----
        async function impUndoState(t){
            const a=loadStore(t.e.id).archives[t.name];
            const blocks=await impReadOrders(t.e, t.aid), orders={};
            blocks.forEach((list, k)=>{ orders[k]={ app:impParseOrdKey(t.e.id, t.aid, k).app, list }; });
            const pend=await impGetJson(t.e, impPendKey(t.e.id, t.aid));
            const log=await impGetJson(t.e, impLogKey(t.e.id, t.aid));
            return { records:a.records, cats:(a.cats||[]).slice(), budgets:a.budgets||{}, tpls:a.tpls||[], importRules:a.importRules,
                     cps:Array.isArray(a.cps) ? a.cps : undefined, pms:Array.isArray(a.pms) ? a.pms : undefined, orders,
                     pending:(pend && Array.isArray(pend.items)) ? pend.items : [], logs:(log && Array.isArray(log.list)) ? log.list : [] };
        }
        async function impApplyUndo(t, after){
            const user=t.e.id, store=loadStore(user), a=store.archives[t.name];
            a.records=after.records; a.cats=after.cats.slice();
            ['importRules', 'cps', 'pms'].forEach(k=>{ if(after[k]===undefined) delete a[k]; else a[k]=after[k]; });
            const pairs=[];
            const blocks=await impReadOrders(t.e, t.aid);
            blocks.forEach((list, k)=>{
                const x=after.orders[k];
                if(!x) pairs.push([k, null]);
                else if(x.list.length!==list.length) pairs.push([k, JSON.stringify(impBlkEncode(x.list))]);
            });
            const pend=await impGetJson(t.e, impPendKey(t.e.id, t.aid)), pl=(pend && pend.items) || [];
            if(JSON.stringify(pl)!==JSON.stringify(after.pending)) pairs.push([impPendKey(t.e.id, t.aid), after.pending.length ? JSON.stringify({ v:1, items:after.pending }) : null]);
            const cleanLog=impCleanLog(after.logs, x=>typeof x==='string' && x ? x : null, a.cats, (a.cps||[]).length, (a.pms||[]).length);
            pairs.push([impLogKey(t.e.id, t.aid), cleanLog.length ? JSON.stringify({ v:1, list:cleanLog }) : null]);
            if(window.__impFailAt==='undoSave') throw impErr('test');
            await saveStoreDurable(store, user, ()=>pairs);
        }
        // ---- 1016-N：待处理（交给 import/pending.js 算，照它的清单写）----
        // 候选记录的样子：id → { id, time, money, type, cat, src }
        function impPendRecs(t, items){
            const want=new Set(); items.forEach(x=>(x.cand||[]).forEach(id=>want.add(id)));
            const out={};
            if(!want.size) return out;
            ((t.e.archs.get(t.aid)||{ recs:[] }).recs).forEach(r=>{
                if(want.has(r.id)) out[r.id]={ id:r.id, time:r.time||'', money:r.money, type:r.type, cat:r.cat||'', src:r.src ? { app:r.src.app } : null };
            });
            return out;
        }
        async function impApplyPending(t, acts){
            const user=t.e.id, store=loadStore(user), a=store.archives[t.name];
            const pend=await impGetJson(t.e, impPendKey(t.e.id, t.aid)), items=(pend && Array.isArray(pend.items)) ? pend.items : [];
            const curLog=await impGetJson(t.e, impLogKey(t.e.id, t.aid)), logs=((curLog && curLog.list) || []).map(l=>Object.assign({}, l));
            const P=window.JiwenImportPending.build({ items, recById:impPendRecs(t, items), cps:a.cps||[], logs }, acts);
            if(!P.drop.length) throw impErr(P.errors.length && P.errors[0].why==='candgone' ? 'candgone' : 'nothing', { errors:P.errors });
            const recs=a.records, at=new Map(); recs.forEach((r, i)=>at.set(r.id, i));
            const idOf={}, made=[];
            P.records.forEach(x=>{
                // 1017-X：选的分类在这期间被删了（待处理页开着时去删了分类）：落未分类，不写一个不存在的分类
                const r={ id:idOf[x.tmp]=genId(), time:x.time, money:x.money, cat:(x.cat && (a.cats||[]).includes(x.cat)) ? x.cat : '未分类', remark:x.remark||'', type:x.type };
                if(x.flow===true) r.flow=true;
                r.src={ app:x.src.app };
                if(Number.isInteger(x.cp)) r.cp=x.cp;
                r.batch=x.batch;
                if(x.refundOf){
                    const o=at.has(x.refundOf) ? recs[at.get(x.refundOf)] : null;
                    if(o){ r.refundOf=o.id; r.cat=o.cat; setRecMode(r, recMode(o)); }
                    else { delete r.refundOf; r.flow=true; }
                }
                made.push(r);
            });
            const chgOf={};
            P.changes.forEach(c=>{
                const i=at.get(c.id); if(i===undefined) throw impErr('gone', { id:c.id });
                const old=recs[i], n=Object.assign({}, old), was={}, now={};
                Object.keys(c.set).forEach(k=>{ was[k]=(k in old) ? (old[k]!==null && typeof old[k]==='object' ? JSON.stringify(old[k]) : old[k]) : null; n[k]=c.set[k]; });
                Object.keys(was).forEach(k=>{ const v=n[k]; now[k]= v===undefined ? null : (v!==null && typeof v==='object' ? JSON.stringify(v) : v); });
                recs[i]=n;
                chgOf[c.id]={ id:c.id, was, now, nos:c.nos };
            });
            made.forEach(r=>recs.push(r));
            if(P.cps.length>(a.cps||[]).length) a.cps=P.cps.slice();
            // 单号表、待处理池
            const orders=P.orders.map(x=>impCleanOrder({ app:x.app, no:x.no, time:x.time, id:x.ref ? (x.ref.tmp ? idOf[x.ref.tmp] : x.ref.id) : '', batch:x.batch, st:x.st })).filter(Boolean);
            const pairs=await impOrderPairs(t.e, t.aid, orders);
            const drop=new Set(P.drop), left=items.filter(x=>!drop.has(x.app+'|'+x.no));
            pairs.push([impPendKey(t.e.id, t.aid), left.length ? JSON.stringify({ v:1, items:left }) : null]);
            // 算进原来那批：新记录、改过的手记写进那批的导入记录（撤销那批时一起撤）。那批的记录已经被挤掉（只留 10 次）就只带批次号
            const W=window.JiwenImportWrite;
            let logged=0;
            Object.keys(P.logs).forEach(b=>{
                const lg=logs.find(l=>l.b===b); if(!lg) return;
                const x=P.logs[b], ids=x.add.map(tmp=>idOf[tmp]);
                const hadH=Array.isArray(lg.h) && lg.h.length===(lg.add||[]).length;
                lg.add=(lg.add||[]).concat(ids);
                if(hadH && W && W.recHash){ const byId=new Map(made.map(r=>[r.id, r])); lg.h=lg.h.concat(ids.map(id=>W.recHash(byId.get(id)))); }
                lg.chg=(lg.chg||[]).concat(x.chg.map(id=>chgOf[id]));
                if(Number.isInteger(x.cpEnd)) lg.cpEnd=x.cpEnd;
                logged++;
            });
            if(logged){
                const cleanLog=impCleanLog(logs, x=>typeof x==='string' && x ? x : null, a.cats, (a.cps||[]).length, (a.pms||[]).length);
                pairs.push([impLogKey(t.e.id, t.aid), cleanLog.length ? JSON.stringify({ v:1, list:cleanLog }) : null]);
            }
            if(window.__impFailAt==='pendingSave') throw impErr('test');
            await saveStoreDurable(store, user, ()=>pairs);
            return { done:P.drop.length, errors:P.errors, added:made.length, merged:P.changes.length, left:left.length };
        }
        window.JiwenImportStore={
            // 单号表：{ size, get(app, no), findPrefix(app, 开头, 最多几条) }；条目 { app, no, id, batch, st, mon }
            async ordersRead(archive){
                const t=impTarget(archive);
                return impOrderTable(t.e, t.aid, await impReadOrders(t.e, t.aid));
            },
            // 批量登记 [{ app, no, time, id, batch, st }]：同来源同单号的覆盖。一个事务写进去
            async ordersRegister(archive, entries){
                const t=impTarget(archive);
                const list=(Array.isArray(entries) ? entries : []).map(impCleanOrder);
                const badAt=list.indexOf(null);
                if(badAt>=0) throw impErr('badorder', { index:badAt });
                const byKey=new Map();
                list.forEach(x=>{ const k=impOrdKey(t.e.id, t.aid, x.app, x.mon); let a=byKey.get(k); if(!a) byKey.set(k, a=[]); a.push(x); });
                const pairs=[]; let added=0, updated=0;
                for(const [k, xs] of byKey){
                    const raw=await impGetRaw(t.e, k);
                    const cur=raw===null ? [] : impBlkDecode(raw);
                    if(cur===null){ ledgerBackupCorrupted(k, raw); throw impErr('impdamaged', { keys:[k] }); }
                    const at=new Map(cur.map((x, i)=>[x.no, i]));
                    xs.forEach(x=>{
                        const v={ no:x.no, id:x.id, batch:x.batch, st:x.st };
                        if(at.has(x.no)){ cur[at.get(x.no)]=v; updated++; }
                        else { at.set(x.no, cur.length); cur.push(v); added++; }
                    });
                    pairs.push([k, JSON.stringify(impBlkEncode(cur))]);
                }
                if(pairs.length) await impWrite(t.e, t.key, pairs);
                return { added, updated };
            },
            async pendingRead(archive){
                const t=impTarget(archive);
                const o=await impGetJson(t.e, impPendKey(t.e.id, t.aid));
                return o && Array.isArray(o.items) ? o.items : [];
            },
            async pendingWrite(archive, items){
                const t=impTarget(archive);
                const clean=impCleanPending(items, x=>typeof x==='string' && x ? x : null);
                await impWrite(t.e, t.key, [[impPendKey(t.e.id, t.aid), clean.length ? JSON.stringify({ v:1, items:clean }) : null]]);
                return clean.length;
            },
            async importsRead(archive){
                const t=impTarget(archive);
                const o=await impGetJson(t.e, impLogKey(t.e.id, t.aid));
                return o && Array.isArray(o.list) ? o.list : [];
            },
            // 只留最近 10 次（数组末尾是最新的）
            async importsWrite(archive, list){
                const t=impTarget(archive);
                const a=ledgerAssembleArchive(t.e, t.aid);
                const clean=impCleanLog(list, x=>typeof x==='string' && x ? x : null, a.cats, (a.cps||[]).length, (a.pms||[]).length);
                await impWrite(t.e, t.key, [[impLogKey(t.e.id, t.aid), clean.length ? JSON.stringify({ v:1, list:clean }) : null]]);
                return clean.length;
            },
            estimate(o, archive){ return impEstimate(o, archive); },
            // ---- 1016-F：写入 ----
            // ws：import/write.js 的写入清单；opts：{ ver（算方案时 archiveInfo().ver，变了就拒绝）, onProgress(阶段, 已做, 共) }
            //   先在本机备份一份当前存档（放不下就不导入），再一个事务写进去；写失败什么都不改，刚做的备份也删掉
            async commit(ws, opts){
                opts=opts||{};
                const t=impTarget(opts.archive), prog=opts.onProgress;
                if(opts.ver!==undefined && opts.ver!==t.e.ver) throw impErr('stale');
                const clock=()=>(window.performance && typeof performance.now==='function') ? performance.now() : Date.now();
                const t0=clock(), ms={};
                prog && prog('backup', 0, 1);
                const lw=ws.log || {}, apps=(lw.apps||[]).map(x=>x==='wechat' ? '微信' : x==='alipay' ? '支付宝' : x).join('、');
                const saved=await impBkSave(t, 'import', ws.batch, { b:ws.batch, what:'导入' + (apps ? apps + '账单' : '账单') + (lw.from ? '（' + String(lw.from).slice(0, 10) + ' 至 ' + String(lw.to||'').slice(0, 10) + '）' : '') + (ws.only ? '（只对账）' : '') },
                    ws.records.length*400 + ws.orders.length*100);
                ms.backup=Math.round(clock()-t0);
                let r;
                try{ r=await impApplyWrite(t, ws, prog); }
                catch(err){ await impBkFail(t, saved); throw err; }
                await impBkDone(t, saved);
                ms.total=Math.round(clock()-t0);
                prog && prog('done', 1, 1);
                if(t.e.id===currentUser && t.name===currentArchive){
                    try{ refreshCatSelectors(); refreshAllViews(); }catch(_){}
                    try{ odScheduleSync(); }catch(_){}
                }
                odOrdersSync(t.e.id, t.name).catch(()=>{});
                return Object.assign(r, { batch:ws.batch, ms, backupBytes:saved.bytes });
            },
            // 本机的导入前备份（新的在后）：[{ key, at, batch, records }]（只读键名和开头，不整个解析）
            backups(archive){
                const t=impTarget(archive);
                return impBkKeys(t.e.id, t.aid).map(k=>({ key:k, t:impBkTime(t.e.id, t.aid, k), kind:impBkKindOf(k) }));
            },
            // ---- 1016-K：撤销（第一期 ⑦a）----
            // 撤销方案（只读）：import/undo.js 算，带上算的时候账本的版本号。batch：要撤的批次号
            async undoPlan(batch, archive){
                const t=impTarget(archive);
                if(!window.JiwenImportUndo) throw impErr('nomodule');
                const st=await impUndoState(t);
                const p=window.JiwenImportUndo.plan(st, batch);
                p.ver=t.e.ver; p.archive=t.name;
                return p;
            },
            // 照方案撤：账本变了就拒绝（重算）；先备份「撤销前」（放不下就不撤），再一个事务写；失败什么都不改，刚做的备份也删掉
            async undo(p, opts){
                opts=opts||{};
                const t=impTarget(opts.archive!==undefined ? opts.archive : p && p.archive);
                if(!p || !p.ok || !p.after) throw impErr('badplan');
                if(p.ver!==t.e.ver) throw impErr('stale');
                const lgs=(p.chain||[]).length, tgt=((await impGetJson(t.e, impLogKey(t.e.id, t.aid)))||{ list:[] }).list.filter(l=>l.b===p.target)[0];
                const tgtWhat=tgt ? (tgt.kind==='ai' ? String(tgt.at||'').replace('T', ' ') + ' 那次 AI 修改' : String(tgt.at||'').replace('T', ' ') + ' 那次导入') : '一次导入';
                const saved=await impBkSave(t, 'undo', p.target, { b:p.target, what:'撤销 ' + tgtWhat + (lgs>1 ? '（连同之后的 ' + (lgs-1) + ' 次）' : '') });
                try{ await impApplyUndo(t, p.after); }
                catch(err){ await impBkFail(t, saved); throw err; }
                await impBkDone(t, saved);
                if(t.e.id===currentUser && t.name===currentArchive){
                    try{ refreshCatSelectors(); refreshAllViews(); }catch(_){}
                    try{ odScheduleSync(); }catch(_){}
                }
                odOrdersSync(t.e.id, t.name).catch(()=>{});
                return { chain:p.chain.slice(), totals:p.totals };
            },
            // ---- 1017-H：AI 检查导入结果：导出 ----
            // 这次导入写进账本的记录，按导入记录里的顺序编临时号（新增的在前、改过的以前的记录在后），同一批每次编号一样；
            //   删掉了的那一笔号留空（gone）。只读。返回 { batch, at（那次导入的时间）, cats, rows:[{ n, id, time, fen, type, cat, mode, dest, cp, desc, remark, oc, gone }], aiAt }
            async aiExportRows(batch, archive){
                const t=impTarget(archive);
                const log=await impGetJson(t.e, impLogKey(t.e.id, t.aid));
                const lg=((log && log.list) || []).filter(l=>l.kind!=='ai' && l.b===batch).pop();
                if(!lg) throw impErr('nolog');
                const a=ledgerAssembleArchive(t.e, t.aid), cps=a.cps||[];
                const recs=(t.e.archs.get(t.aid)||{ recs:[] }).recs, byId=new Map(recs.map(r=>[r.id, r]));
                const ids=[], kind={};
                (lg.add||[]).forEach(id=>{ if(!(id in kind)){ ids.push(id); kind[id]={ add:true }; } });
                (lg.chg||[]).forEach(c=>{ if(!(c.id in kind)){ ids.push(c.id); kind[c.id]={ chg:c }; } });
                const refunded=new Set(); recs.forEach(r=>{ if(r.refundOf) refunded.add(r.refundOf); });
                const rows=ids.map((id, i)=>{
                    const r=byId.get(id), n=i+1;
                    if(!r) return { n, id, gone:true };
                    const c=kind[id].chg, w=c && c.was || {};
                    let dest=kind[id].add ? (r.refundOf ? '新建（退款）' : '新建') : ('src' in w) ? '和账单合并' : ('refundOf' in w) ? '退款改挂' : ('money' in w) ? '汇总记录（追加了几笔）' : '改过';
                    // 合并进去的账单金额和这条记录不一样：写明「金额差一点」（导入记录里存着合并进去的账单，1016-Z6 起）
                    const bf=(c && Array.isArray(c.bills) ? c.bills : []).reduce((x, b)=>x+(b.fen||0), 0), rf=Math.round(safeNum(r.money)*100);
                    if(('src' in w) && bf && bf!==rf) dest+='（金额差一点：账单 '+(bf/100).toFixed(2)+'）';
                    // 1017-J：导入后你改过没有（新建的比指纹，改过的以前的记录比导入写进去的值）
                    let edited=false;
                    if(kind[id].add){ const k=(lg.add||[]).indexOf(id), h=Array.isArray(lg.h) ? lg.h[k] : ''; edited=!!h && impRecHash(r)!==h; }
                    else if(c && c.now) edited=Object.keys(c.now).some(f=>{ const v=(f in r && r[f]!==undefined) ? (r[f]!==null && typeof r[f]==='object' ? JSON.stringify(r[f]) : r[f]) : null; return v!==c.now[f]; });
                    return { n, id, time:r.time||'', fen:Math.round(safeNum(r.money)*100), type:r.type, cat:r.cat||'未分类', mode:recMode(r), dest,
                             cp:Number.isInteger(r.cp) ? (cps[r.cp]||'') : '', desc:'', remark:r.remark||'', oc:r.oc||'', edited, aiFlag:r.aiFlag||null, refund:!!r.refundOf, hasRefunds:refunded.has(id) };
                });
                return { batch, at:lg.at||'', cats:(a.cats||[]).slice(), rows, aiAt:(lg.aiAt||[]).slice() };
            },
            // 记下这一批交给 AI 时的导出时间（最近 5 次；AI 回复里的导出时间要对得上才认）。只改导入记录这一项
            async aiExportMark(batch, at, archive){
                const t=impTarget(archive);
                const log=await impGetJson(t.e, impLogKey(t.e.id, t.aid)), list=((log && log.list) || []).map(l=>Object.assign({}, l));
                let hit=null; for(let i=list.length-1;i>=0 && !hit;i--) if(list[i].kind!=='ai' && list[i].b===batch) hit=list[i];
                if(!hit) throw impErr('nolog');
                hit.aiAt=(Array.isArray(hit.aiAt) ? hit.aiAt : []).filter(v=>v!==at).concat([at]).slice(-5);
                const a=ledgerAssembleArchive(t.e, t.aid);
                const clean=impCleanLog(list, x=>typeof x==='string' && x ? x : null, a.cats, (a.cps||[]).length, (a.pms||[]).length);
                await impWrite(t.e, t.key, [[impLogKey(t.e.id, t.aid), JSON.stringify({ v:1, list:clean })]]);
                return hit.aiAt.slice();
            },
            // ---- 1017-K：AI 检查导入结果：写进账本 ----
            // changes：import/ai.js 的 changesOf 算的 [{ id, set:{ cat | remark | skip | flow | aiFlag（null = 去掉）} }]；of：改的是哪一次导入
            //   先备份一份「AI 修改前」（和导入前、撤销前的共用 3 份；放不下就不改），再一个事务写：改记录、导入记录里加一条 kind ai（chg 记 was / now）。
            //   不进单号表、不动待处理池、不存分类规则、名单长度不变。有一条记录不在了（删了）就整批不改（gone）
            async aiApply(o, opts){
                opts=opts||{};
                const t=impTarget(opts.archive);
                if(opts.ver!==undefined && opts.ver!==t.e.ver) throw impErr('stale');
                const changes=(o && Array.isArray(o.changes) ? o.changes : []).filter(c=>c && typeof c.id==='string' && c.set && typeof c.set==='object');
                if(!changes.length) throw impErr('nothing');
                const log0=await impGetJson(t.e, impLogKey(t.e.id, t.aid)), logs=((log0 && log0.list) || []).slice();
                if(!logs.some(l=>l.kind!=='ai' && l.b===o.of)) throw impErr('nolog');
                const store=loadStore(t.e.id), a=store.archives[t.name], recs=a.records, at=new Map(recs.map((r, i)=>[r.id, i]));
                const FIELDS=['cat','remark','skip','flow','aiFlag'];
                const cur=(r, k)=>(k in r && r[k]!==undefined) ? (r[k]!==null && typeof r[k]==='object' ? JSON.stringify(r[k]) : r[k]) : null;
                const chg=[];
                changes.forEach(c=>{
                    const i=at.get(c.id);
                    if(i===undefined) throw impErr('gone', { id:c.id });
                    const old=recs[i], n=Object.assign({}, old), was={}, now={};
                    Object.keys(c.set).forEach(k=>{
                        if(!FIELDS.includes(k)) return;
                        let v=c.set[k];
                        if(k==='cat'){ if(typeof v!=='string' || !a.cats.includes(v)) return; }
                        if(k==='remark'){ if(typeof v!=='string') return; v=v.slice(0, 5000); }
                        if(k==='skip' || k==='flow'){ v=v===true ? true : null; }
                        if(k==='aiFlag' && v!==null){ const f=impCleanAiFlag(v, id=>at.has(id) ? id : null); if(!f) return; v=f; }
                        was[k]=cur(old, k);
                        if(v===null) delete n[k]; else n[k]=v;
                        now[k]=cur(n, k);
                    });
                    if(!Object.keys(was).length) return;
                    if(n.skip && n.flow) delete n.flow;
                    recs[i]=n;
                    chg.push({ id:c.id, was, now, nos:[] });
                });
                if(!chg.length) throw impErr('nothing');
                const b='a'+Date.now().toString(36);
                const ofLog=logs.filter(l=>l.kind!=='ai' && l.b===o.of)[0];
                const saved=await impBkSave(t, 'ai', b, { b, what:'按 AI 的建议改 ' + chg.length + ' 条记录' + (ofLog ? '（' + String(ofLog.at||'').replace('T', ' ') + ' 那次导入的）' : '') });
                const d=new Date(), cl=(a.cps||[]).length, pl=(a.pms||[]).length;
                logs.push({ kind:'ai', of:o.of, b, at:`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`, apps:[], from:'', to:'',
                            add:[], h:[], chg, cpLen:cl, pmLen:pl, cpEnd:cl, pmEnd:pl, catsAdded:[], rulesAdded:{ cat:[], type:[] } });
                const cleanLog=impCleanLog(logs, x=>typeof x==='string' && x ? x : null, a.cats, cl, pl);
                try{
                    if(window.__impFailAt==='aiSave') throw impErr('test');
                    await saveStoreDurable(store, t.e.id, ()=>[[impLogKey(t.e.id, t.aid), JSON.stringify({ v:1, list:cleanLog })]]);
                }catch(err){ await impBkFail(t, saved); throw err; }
                await impBkDone(t, saved);
                if(t.e.id===currentUser && t.name===currentArchive){
                    try{ refreshCatSelectors(); refreshAllViews(); }catch(_){}
                    try{ odScheduleSync(); }catch(_){}
                }
                odOrdersSync(t.e.id, t.name).catch(()=>{});
                return { b, changed:chg.length };
            },
            // ---- 1016-Z2：「当作退款，挂到某一笔」的候选（只读）：账本里的支出，时间不晚于这笔、180 天以内、还没退完的够挂；新的在前，最多 50 条
            refundTargets(q, archive){
                const t=impTarget(archive);
                const recs=(t.e.archs.get(t.aid)||{ recs:[] }).recs, cps=(ledgerAssembleArchive(t.e, t.aid).cps)||[];
                const refunded=new Map(); recs.forEach(r=>{ if(r.refundOf) refunded.set(r.refundOf, (refunded.get(r.refundOf)||0)+Math.round(safeNum(r.money)*100)); });
                const tq=String(q && q.time || ''), fen=Number(q && q.fen)||0;
                const from=new Date(parseRecTime(tq).getTime()-180*86400000), fromStr=`${from.getFullYear()}-${pad(from.getMonth()+1)}-${pad(from.getDate())}`;
                return recs.filter(r=>r.type==='expense' && !r.refundOf && typeof r.time==='string' && r.time<=tq && r.time.slice(0, 10)>=fromStr)
                    .map(r=>{ const f=Math.round(safeNum(r.money)*100); return { id:r.id, time:r.time, fen:f, left:f-(refunded.get(r.id)||0), cat:r.cat||'', remark:(r.remark||'').split('\n')[0].slice(0, 30), cp:Number.isInteger(r.cp) ? (cps[r.cp]||'') : '' }; })
                    .filter(x=>x.left>=fen).sort((a, b)=>a.time<b.time ? 1 : a.time>b.time ? -1 : 0).slice(0, 50);
            },
            // ---- 第二期（1016-Z6）：账单详情里「拆开」一条和账单合并过的手记 ----
            //   找到合并它的那次导入记录：手记还原成合并前的样子（你后来改过的字段不动）；导入记录里存了合并进去的账单（1016-Z6 起），
            //   就把账单另记一条（分类「未分类」、带那次的批次号，单号改登记到它，写进那次的导入记录，撤销那次时一起撤）；
            //   旧的导入记录没存账单的：只还原手记，把那几个单号从单号表里拿掉（下次再导同一份账单，它会作为新增出现）。一个事务写
            async splitMerge(id, archive){
                const t=impTarget(archive);
                const user=t.e.id, store=loadStore(user), a=store.archives[t.name], recs=a.records;
                const i=recs.findIndex(r=>r.id===id);
                if(i<0) throw impErr('gone');
                const rec=recs[i];
                if(!rec.src || !rec.src.merged) throw impErr('notmerged');
                const curLog=await impGetJson(t.e, impLogKey(t.e.id, t.aid)), logs=((curLog && curLog.list) || []).map(l=>Object.assign({}, l));
                let li=-1, ci=-1;
                for(let k=logs.length-1;k>=0 && li<0;k--){ const j=(logs[k].chg||[]).findIndex(c=>c.id===id && c.was && ('src' in c.was)); if(j>=0){ li=k; ci=j; } }
                if(li<0) throw impErr('nolog');
                const lg=logs[li], c=lg.chg[ci];
                const cur=(r, k)=>(k in r && r[k]!==undefined) ? (r[k]!==null && typeof r[k]==='object' ? JSON.stringify(r[k]) : r[k]) : null;
                const n=Object.assign({}, rec);
                Object.keys(c.was||{}).forEach(k=>{
                    if(c.now && (k in c.now) && cur(n, k)!==c.now[k]) return;        // 你后来改过的字段不动
                    const w=c.was[k];
                    if(w===null) delete n[k];
                    else if(k==='src' && typeof w==='string'){ try{ n[k]=JSON.parse(w); }catch(_){ n[k]=w; } }
                    else n[k]=w;
                });
                if(n.src && n.src.merged){ delete n.src; }      // 来源一定拿掉（它就是因为合并才有的）
                recs[i]=n;
                const made=[], orders=[];
                (Array.isArray(c.bills) ? c.bills : []).forEach(b=>{
                    // 1017-Q：账单那条默认用手记的分类（原来落未分类）；手记的分类不在分类列表里了才落未分类
                    const r={ id:genId(), time:b.time, money:round2(b.fen/100), cat:(n.cat && (a.cats||[]).includes(n.cat)) ? n.cat : '未分类', remark:b.remark||'', type:b.type==='income' ? 'income' : 'expense', src:{ app:b.app }, batch:lg.b };
                    if(Number.isInteger(b.cp)) r.cp=b.cp;
                    if(Number.isInteger(b.pm)) r.pm=b.pm;
                    if(b.oc) r.oc=b.oc;
                    made.push(r);
                    const o=b.no ? impCleanOrder({ app:b.app, no:b.no, time:b.time, id:r.id, batch:lg.b, st:0 }) : null;
                    if(o) orders.push(o);
                });
                made.forEach(r=>recs.push(r));
                const pairs=orders.length ? await impOrderPairs(t.e, t.aid, orders) : [];
                if(!made.length){
                    // 没存账单：单号从单号表里拿掉
                    const drop=new Set((c.nos||[]).map(p=>p[0]+'|'+p[1]));
                    const blocks=await impReadOrders(t.e, t.aid);
                    blocks.forEach((list, k)=>{
                        const app=impParseOrdKey(t.e.id, t.aid, k).app, keep=list.filter(x=>!(x.id===id && drop.has(app+'|'+x.no)));
                        if(keep.length!==list.length) pairs.push([k, keep.length ? JSON.stringify(impBlkEncode(keep)) : null]);
                    });
                }
                lg.chg=lg.chg.filter((_, k)=>k!==ci);
                if(made.length){
                    const hadH=Array.isArray(lg.h) && lg.h.length===(lg.add||[]).length;
                    lg.add=(lg.add||[]).concat(made.map(r=>r.id));
                    if(hadH) lg.h=lg.h.concat(made.map(r=>impRecHash(r)));
                }
                const cleanLog=impCleanLog(logs, x=>typeof x==='string' && x ? x : null, a.cats, (a.cps||[]).length, (a.pms||[]).length);
                pairs.push([impLogKey(t.e.id, t.aid), cleanLog.length ? JSON.stringify({ v:1, list:cleanLog }) : null]);
                if(window.__impFailAt==='splitSave') throw impErr('test');
                await saveStoreDurable(store, user, ()=>pairs);
                if(t.e.id===currentUser && t.name===currentArchive){ try{ refreshCatSelectors(); refreshAllViews(); }catch(_){} try{ odScheduleSync(); }catch(_){} }
                odOrdersSync(t.e.id, t.name).catch(()=>{});
                return { added:made.length, ids:made.map(r=>r.id) };
            },
            // ---- 第二期：管理导入规则。rules：{ cat:[{kw,cat}], type:[{app,type|status,as}], map:[{from,cat}] }，洗过再存（同导入备份）；
            //   只改存档设置里的 importRules，不动记录、不动导入记录（以后撤销某次导入时，规则被你改过的那条就不删）
            async rulesSave(rules, archive){
                const t=impTarget(archive);
                const user=t.e.id, store=loadStore(user), a=store.archives[t.name];
                const clean=impCleanRules(rules, a.cats||[]);
                if(clean) a.importRules=clean; else delete a.importRules;
                await saveStoreDurable(store, user, ()=>[]);
                if(t.e.id===currentUser && t.name===currentArchive){ try{ odScheduleSync(); }catch(_){} }
                return clean || { cat:[], type:[] };
            },
            // ---- 1016-N：待处理（第一期 ⑧）----
            // 打开待处理页时读池子，顺便看一遍候选还在不在（import/pending.js 的 check）
            async pendingCheck(archive){
                const t=impTarget(archive);
                if(!window.JiwenImportPending) throw impErr('nomodule');
                const pend=await impGetJson(t.e, impPendKey(t.e.id, t.aid)), items=(pend && Array.isArray(pend.items)) ? pend.items : [];
                return window.JiwenImportPending.check(items, impPendRecs(t, items));
            },
            // 处理几条：acts 见 pending.js。一个事务写账本、单号表、待处理池和那几批的导入记录；动作全都做不了时什么都不写
            async pendingApply(acts, archive){
                const t=impTarget(archive);
                if(!window.JiwenImportPending) throw impErr('nomodule');
                const r=await impApplyPending(t, acts);
                if(t.e.id===currentUser && t.name===currentArchive){
                    try{ refreshCatSelectors(); refreshAllViews(); }catch(_){}
                    try{ odScheduleSync(); }catch(_){}
                }
                odOrdersSync(t.e.id, t.name).catch(()=>{});
                return r;
            },
            // 恢复最新的一份（「恢复前」那种不算）。界面上用 backupList / restoreBackup 选一份
            async restoreLast(archive){
                const t=impTarget(archive);
                const ks=impBkKeys(t.e.id, t.aid).filter(k=>impBkKindOf(k)!=='restore');
                if(!ks.length) throw impErr('nobackup');
                return this.restoreBackup(ks[ks.length-1], { archive });
            },
            // 1017-O：现存的每一份备份（新的在前）：{ key, kind, t, what, n（恢复后账本有几条）}。目录里没有的旧备份现读一遍
            async backupList(archive){
                const t=impTarget(archive);
                const idx=await impBkMetaRead(t), out=[];
                for(const k of impBkKeys(t.e.id, t.aid).reverse()){
                    let m=idx[k];
                    if(!m || typeof m.n!=='number'){
                        try{ const bk=await impReadBackup(t, k); m={ n:bk.data.length, b:bk.batch||'', what:'' }; }catch(_){ m={ n:null, what:'', bad:true }; }
                    }
                    out.push({ key:k, kind:impBkKindOf(k), t:impBkTime(t.e.id, t.aid, k), what:m.what||'', b:m.b||'', n:m.n, bad:!!m.bad });
                }
                return { list:out, now:((t.e.archs.get(t.aid)||{ recs:[] }).recs||[]).length, ver:t.e.ver };
            },
            // 恢复这份会改掉什么（只读）
            async backupDiff(key, archive){
                const t=impTarget(archive);
                const bk=await impReadBackup(t, key);
                const st=await impUndoState(t);
                return Object.assign(impBackupDiff({ records:st.records, logs:st.logs, pending:st.pending, cats:st.cats, importRules:st.importRules, budgets:st.budgets }, bk), { ver:t.e.ver });
            },
            // 恢复这份备份：opts { ver（看影响时的账本版本，变了就拒绝）}
            async restoreBackup(key, opts){
                opts=opts||{};
                const t=impTarget(opts.archive);
                if(impBkKeys(t.e.id, t.aid).indexOf(key)<0) throw impErr('nobackup');
                const r=await impRestoreFrom(t, key, { ver:opts.ver });
                if(t.e.id===currentUser && t.name===currentArchive){ try{ refreshCatSelectors(); refreshAllViews(); }catch(_){} try{ odScheduleSync(); }catch(_){} }
                odOrdersSync(t.e.id, t.name).catch(()=>{});
                return r;
            },

            // ---- 1019-E：导入草稿：确认页每改一处存一份（{ v:1, at, files:[{ name, data:ArrayBuffer }], edits, types, statuses, view, labels, sig }）----
            //   直接写库（不排进账本队列、不改账本版本）；导入成功、主动退出、选了「重新开始」就删
            async draftSave(d, archive){
                const t=impTarget(archive);
                if(!d || d.v!==1) return false;
                await idbBatch([['put', impDraftKey(t.e.id, t.aid), d]]);
                return true;
            },
            async draftLoad(archive){
                const t=impTarget(archive);
                let v=null;
                try{ v=await idbGet(impDraftKey(t.e.id, t.aid)); }catch(_){ return null; }
                if(v && impDraftStale(v)){ try{ await idbBatch([['del', impDraftKey(t.e.id, t.aid)]]); }catch(_){} return null; }   // 1019-V：超过 24 小时，删掉、不问
                return v && v.v===1 && Array.isArray(v.files) && v.files.length ? v : null;
            },
            async draftDrop(archive){
                const t=impTarget(archive), k=impDraftKey(t.e.id, t.aid);
                if(__ledgerKeys.has(k)) await idbBatch([['del', k]]);
            },
            // 账本现在的样子（记录、分类、导入记录）一个指纹：草稿存下以后账本改没改过（只在存草稿第一次、接着来时各算一次）
            draftSig(archive){
                const t=impTarget(archive), st=t.e.archs.get(t.aid), a=ledgerAssembleArchive(t.e, t.aid);
                let h=5381;
                const add=x=>{ const str=String(x); for(let i=0;i<str.length;i++) h=((h*33) ^ str.charCodeAt(i))>>>0; };
                (st ? st.recs : []).forEach(r=>add(JSON.stringify(r)));
                add((a.cats||[]).join('|'));
                return (st ? st.recs.length : 0)+':'+h.toString(36);
            },
            // ---- 1016-B：导入确认页要的只读数据（不写任何东西）----
            // 存档的分类、规则、对方名单，是不是新用户（记录少于 30 条、分类还是默认那 7 个）
            archiveInfo(archive){
                const t=impTarget(archive);
                const a=ledgerAssembleArchive(t.e, t.aid), st=t.e.archs.get(t.aid), n=st ? st.recs.length : 0;
                const cats=(a.cats||[]).slice(), rules=a.importRules||{};
                const isDefault=cats.length===DEFAULT_CATS.length && DEFAULT_CATS.every(c=>cats.includes(c));
                // 1016-Z：每个分类以前的支出（计入、不是退款）有几笔、第 80 百分位多少分（异常金额提醒用）
                const byCat=new Map();
                (st ? st.recs : []).forEach(r=>{ if(r.type!=='expense' || r.refundOf || recMode(r)!=='normal') return; const f=Math.round(safeNum(r.money)*100); if(!(f>0)) return; let x=byCat.get(r.cat||'未分类'); if(!x) byCat.set(r.cat||'未分类', x=[]); x.push(f); });
                const catStats={};
                byCat.forEach((xs, c)=>{ xs.sort((p, q)=>p-q); catStats[c]={ n:xs.length, p80:xs[Math.min(xs.length-1, Math.floor(xs.length*0.8))] }; });
                return { name:t.name, cats, catRules:(rules.cat||[]).slice(), typeRules:(rules.type||[]).slice(), catMaps:(rules.map||[]).slice(),
                         cps:(a.cps||[]).slice(), pms:(a.pms||[]).slice(), records:n, isNewUser: n<30 && isDefault, ver:t.e.ver, aid:t.aid, catStats };
            },
            // 按定去向的 lookups() 查单号表和同月（同日）已有的合并记录，拼成 known（见 route.js 开头）
            async knownFor(lk, archive){
                const t=impTarget(archive);
                const blocks=await impReadOrders(t.e, t.aid), T=impOrderTable(t.e, t.aid, blocks);
                const recs=(t.e.archs.get(t.aid)||{ recs:[] }).recs, byId=new Map(), refunded=new Map(), nOf=new Map();
                recs.forEach(r=>{
                    byId.set(r.id, r);
                    if(r.refundOf) refunded.set(r.refundOf, (refunded.get(r.refundOf)||0)+Math.round(safeNum(r.money)*100));
                });
                blocks.forEach(list=>list.forEach(x=>{ if(x.st===0) nOf.set(x.id, (nOf.get(x.id)||0)+1); }));
                const info=id=>{ const r=byId.get(id); return r ? { type:r.type, fen:Math.round(safeNum(r.money)*100), refunded:refunded.get(id)||0, mode:recMode(r), time:r.time, cat:r.cat } : null; };
                const known={};
                (lk && lk.orders || []).forEach(key=>{
                    const i=key.indexOf('|'); if(i<0) return;
                    const ent=T.get(key.slice(0,i), key.slice(i+1));
                    if(ent) known[key]={ st:ent.st, id:ent.id, rec: ent.st===0 ? info(ent.id) : null };
                });
                (lk && lk.groups || []).forEach(g=>{
                    const r=recs.find(x=>x.src && x.src.app===g.app && x.src.sum && x.oc===g.oc && typeof x.time==='string' && x.time.indexOf(g.period)===0);
                    if(r) known[g.key]={ rec:{ id:r.id, fen:Math.round(safeNum(r.money)*100), n:nOf.get(r.id)||1 } };
                });
                // 1016-C：已全额退款的原单，以前导入过退款没有。支付宝：单号表里有「原单号_…」；
                //   微信：以前导入的退款记录（单号表里登记过、来源微信、是退款：挂了原单或原始类型是「…-退款」），同对方、同金额、时间在后。手记的收入不算
                const cps=(ledgerAssembleArchive(t.e, t.aid).cps)||[];
                const wxImported=new Set();
                blocks.forEach((list, k)=>{ if(impParseOrdKey(t.e.id, t.aid, k).app!=='wechat') return; list.forEach(x=>{ if(x.st===0 && x.id) wxImported.add(x.id); }); });
                (lk && lk.fullRefunds || []).forEach(f=>{
                    if(f.app==='alipay' && f.no){
                        const hit=T.findPrefix('alipay', f.no+'_', 1)[0];
                        if(hit) known[f.key]={ found:true, id: hit.st===0 ? hit.id : null };
                        return;
                    }
                    if(f.app==='wechat'){
                        const r=recs.find(x=>wxImported.has(x.id) && x.src && x.src.app==='wechat' && (x.refundOf || (typeof x.oc==='string' && /-退款$/.test(x.oc)))
                            && Math.round(safeNum(x.money)*100)===f.fen && typeof x.time==='string' && x.time>=f.time && cps[x.cp]===f.cp);
                        if(r) known[f.key]={ found:true, id:r.id };
                    }
                });
                // 1016-E：微信退款记号（原单被忽略时登记，键 RW金额-对方-原单日期），带上用过没有（RU 同样的后半截）
                (lk && lk.markers || []).forEach(m=>{
                    const marks=T.findPrefix(m.app, m.prefix, 50).filter(x=>x.st===1).map(x=>({
                        key:m.app+'|'+x.no, day:x.no.slice(-8), used:!!T.get(m.app, 'RU'+x.no.slice(2)) }));
                    if(marks.length) known[m.key]={ marks };
                });
                // 1016-F：已经在待处理池里的（同一份文件导第二次），不再加一遍
                const pend=await impGetJson(t.e, impPendKey(t.e.id, t.aid));
                const inPend=new Set(((pend && pend.items) || []).map(x=>x.app+'|'+x.no));
                (lk && lk.orders || []).forEach(key=>{ if(!known[key] && inPend.has(key)) known[key]={ pend:true }; });
                // 1016-F：没有单号表（换了手机、只恢复了账本）：存档里导入过，单号表却是空的，或者找不到最后一批的批次号 → 按指纹认
                const log=await impGetJson(t.e, impLogKey(t.e.id, t.aid));
                const logs=((log && Array.isArray(log.list)) ? log.list : []).filter(l=>l.kind!=='ai');   // 1017-G：AI 修改不算导入
                let fpMode=false;
                if(logs.length){
                    const lastB=logs[logs.length-1].b, bs=new Set();
                    blocks.forEach(list=>list.forEach(x=>{ if(x.batch) bs.add(x.batch); }));
                    fpMode = T.size===0 || !bs.has(lastB);
                }
                if(fpMode){
                    // 一对一按数量认：同来源、同一分钟、同金额、同对方的已导入记录有几条，就最多认几笔；
                    //   多出来的、只有日期和金额对得上的 → 进待处理，不新增
                    const exact=new Map(), loose=new Set();
                    recs.forEach(r=>{
                        if(!r.src || !IMP_APPS.includes(r.src.app) || r.src.sum || typeof r.time!=='string') return;
                        const f=Math.round(safeNum(r.money)*100), cp=Number.isInteger(r.cp) ? (cps[r.cp]||'') : '';
                        const k=r.src.app+'|'+r.time.slice(0,16)+'|'+f+'|'+cp;
                        let a=exact.get(k); if(!a) exact.set(k, a=[]); a.push(r);
                        loose.add(r.src.app+'|'+r.time.slice(0,10)+'|'+f);
                    });
                    (lk && lk.rows || []).slice().sort((x, y)=>x.time<y.time ? -1 : x.time>y.time ? 1 : 0).forEach(x=>{
                        if(known[x.key]) return;
                        const a=exact.get(x.app+'|'+x.time.slice(0,16)+'|'+x.fen+'|'+x.cp);
                        if(a && a.length){ const r=a.shift(); known[x.key]={ st:0, id:r.id, rec:info(r.id), fp:true }; return; }
                        if(loose.has(x.app+'|'+x.time.slice(0,10)+'|'+x.fen)) known[x.key]={ fpLoose:true };
                    });
                    (lk && lk.groups || []).forEach(g=>{ if(known[g.key]) known[g.key].fpMode=true; });
                }
                return known;
            },
            // 按 match.ledgerQuery() 取手记和退款候选（见 match.js 开头）
            ledgerFor(q, archive){
                const t=impTarget(archive);
                const a=ledgerAssembleArchive(t.e, t.aid), cps=a.cps||[];
                const recs=(t.e.archs.get(t.aid)||{ recs:[] }).recs, refunded=new Map();
                recs.forEach(r=>{ if(r.refundOf) refunded.set(r.refundOf, (refunded.get(r.refundOf)||0)+Math.round(safeNum(r.money)*100)); });
                const fen=r=>Math.round(safeNum(r.money)*100);
                const manual=[], cands=[], seen=new Set();
                const m=q && q.manual;
                recs.forEach(r=>{
                    if(typeof r.time!=='string') return;
                    if(m && !r.src && !r.refundOf){
                        const d=r.time.slice(0,10);
                        if(d>=m.from && d<=m.to) manual.push({ id:r.id, time:r.time, type:r.type, fen:fen(r), cat:r.cat, mode:recMode(r), remark:r.remark||'' });   // 1017-UI8：备注只给确认页显示（配对卡、为什么没配上），配对不看它
                    }
                    if(r.src && r.type==='expense' && Number.isInteger(r.cp)){
                        (q && q.refunds || []).forEach(x=>{
                            if(seen.has(r.id) || r.time<x.from || r.time>=x.before || fen(r)-(refunded.get(r.id)||0)<x.minFen) return;
                            seen.add(r.id);
                            cands.push({ id:r.id, time:r.time, type:r.type, fen:fen(r), refunded:refunded.get(r.id)||0, cp:cps[r.cp]||'', cat:r.cat });
                        });
                    }
                });
                return { manual, refundCands:cands };
            }
        };
        // meta 里这个存档的设置（分类、名单……，不含记录）
        function ledgerAssembleArchive(e, aid){
            const s=JSON.parse(e.meta);
            const n=Object.keys(s.archives).find(k=>s.archives[k].records===aid);
            return n ? s.archives[n] : { cats:[] };
        }

        // 切到后台：当前账号的 meta 和这次写过的月份块强制再写一遍，别的账号有没写完的也写掉
        let __forceFlushing=null;
        function ledgerFlushOnHide(){
            if(__forceFlushing) return __forceFlushing;
            const cur=currentUser ? storeKey(currentUser) : null;
            const jobs=[];
            __ledger.forEach((e, k)=>{
                if(k===cur && e.has){
                    e.metaGen=++e.gen;
                    e.touched.forEach(bk=>{ if(e.keys.has(bk)) e.dirty.set(bk, ++e.gen); });
                }
                jobs.push(ledgerKick(k).catch(()=>{}));
            });
            __forceFlushing=trackBusy(Promise.all(jobs).then(()=>{ __forceFlushing=null; }));
            return __forceFlushing;
        }
        document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='hidden') ledgerFlushOnHide(); });
        window.addEventListener('pagehide', ()=>ledgerFlushOnHide());
        (function bindPause(){
            function tryBind(){
                const cap=window.Capacitor;
                if(!cap || !cap.Plugins || !cap.Plugins.App || typeof cap.Plugins.App.addListener!=='function') return false;
                try{ cap.Plugins.App.addListener('pause', ()=>ledgerFlushOnHide()); }catch(_){ return false; }
                return true;
            }
            if(tryBind()) return;
            let done=false;
            const again=()=>{ if(!done) done=tryBind(); };
            document.addEventListener('deviceready', again, { once:true });
            setTimeout(again, 800);
        })();
        // 损坏的原文另存一份（存到库里），只留最近 1 份旧的，连同这次共 2 份
        //   【1013-H】坏块留在库里、每次打开都会再认出来：已经另存过一模一样的原文就不再存（不然两份备份很快都是同一个东西）
        function ledgerBackupCorrupted(key, raw){
            const prefix=`${key}__corrupted_`;
            const olds=[...__ledgerKeys].filter(k=>k.indexOf(prefix)===0).sort();
            trackBusy((async()=>{
                for(const k of olds){
                    try{ if(asRaw(await idbGet(k))===raw) return; }catch(_){}
                }
                for(const k of olds.slice(0, Math.max(0, olds.length-1))){ try{ await idbDel(k); }catch(_){} }
                try{ await idbPut(`${prefix}${Date.now()}`, raw); }catch(_){}
            })());
        }
        // 账本读进内存时发现坏了：
        //   · 马上（不等云同步那 1.5 秒）把受影响存档的云备份连接标成「已暂停」——存在 localStorage 里，
        //     重启 App 也不会自己恢复，只有用户点「重新选择备份文件」才解除（见 odSyncNow 开头）。
        //     坏了一个月 → 只停这个存档；存档设置（meta）坏了 → 存档名都对不上了，停这个账号的全部连接。
        //   · 登记会话级损坏名单（odSyncNow 守卫一）。
        function ledgerReportDamage(e){
            if(!e.damage.length) return;
            const skey=`store_${e.id}`;
            const aidName=new Map(); e.names.forEach((aid, n)=>aidName.set(aid, n));
            const whole=e.damage.some(d=>d.kind!=='block');
            if(whole) __corruptedStores.add(skey);
            const arcs=new Set(e.damage.filter(d=>d.kind==='block').map(d=>aidName.get(d.aid)).filter(n=>n!==undefined));
            const prefix=`onedrive_link_${e.id}__`;
            const ks=[];
            try{ for(let i=0;i<localStorage.length;i++){ const k=localStorage.key(i); if(k && k.indexOf(prefix)===0) ks.push(k); } }catch(_){}
            ks.forEach(k=>{
                const arc=k.slice(prefix.length);
                if(!whole && !arcs.has(arc)) return;
                try{
                    const link=JSON.parse(localStorage.getItem(k));
                    if(!link || !link.uri || link.blocked) return;
                    link.blocked=true;
                    link.lastError = whole ? '本地账本有一部分读不出来，已暂停自动同步以保护云端备份'
                                           : '本地存档有一个月的记录读不出来，已暂停自动同步以保护云端备份';
                    localStorage.setItem(k, JSON.stringify(link));
                }catch(_){}
            });
        }
        // 进账号时告诉用户哪里坏了（同一处坏了只说一次；坏块留在库里、下次打开不会再说）
        function ledgerDamageNotice(id){
            const e=__ledger.get(`store_${id}`);
            if(!e || !e.damage.length) return '';
            const seenKey=`ledger_damage_seen_${id}`;
            let seen=[];
            try{ seen=JSON.parse(localStorage.getItem(seenKey)) || []; if(!Array.isArray(seen)) seen=[]; }catch(_){ seen=[]; }
            const fresh=e.damage.filter(d=>!seen.includes(`${d.key}:${d.len}`));
            if(!fresh.length) return '';
            try{ localStorage.setItem(seenKey, JSON.stringify(seen.concat(fresh.map(d=>`${d.key}:${d.len}`)).slice(-50))); }catch(_){}
            const aidName=new Map(); e.names.forEach((aid, n)=>aidName.set(aid, n));
            const lines=[];
            fresh.forEach(d=>{
                if(d.kind==='all') lines.push('这个账号的账本读不出来，先给你一个空账本。');
                else if(d.kind==='meta') lines.push('存档设置（存档名、分类、预算、常用模板）读不出来，已经用还在的记录重建成「恢复的存档」，分类等回到了默认。');
                else {
                    const n=aidName.get(d.aid);
                    const when = d.mon==='none' ? '没写时间的那些记录' : `${+d.mon.slice(0,4)}年${+d.mon.slice(5)}月的记录`;
                    lines.push(`存档「${n!==undefined ? n : '?'}」${when}读不出来，暂时看不到。`);
                }
            });
            const hasLink=(()=>{ try{ for(let i=0;i<localStorage.length;i++){ const k=localStorage.key(i); if(k && k.indexOf(`onedrive_link_${id}__`)===0) return true; } }catch(_){} return false; })();
            return lines.join('\n') + '\n\n读不出来的原文已经另存在手机里，没有删。'
                + (hasLink ? '\n为保护云备份，受影响存档的自动同步已暂停；确认现在的数据没问题后，到设置里点「重新选择备份文件」恢复。' : '');
        }
        // 用户点「重新选择备份文件」= 认可这个存档现在的样子：把它读不出来的月份按内存里的样子重写掉（原文早已另存），
        //   以后打开不会再认出坏块、不会再暂停同步
        function ledgerAcceptDamage(id, archive){
            const key=`store_${id}`;
            const e=__ledger.get(key);
            if(!e) return;
            const aid=e.names.get(archive);
            if(aid===undefined) return;
            e.badAids.delete(aid);
            let any=false;
            e.badBlocks.forEach(k=>{ const p=ledParseKey(id, k); if(p && p.aid===aid){ e.dirty.set(k, ++e.gen); any=true; } });
            if(any) ledgerWriteSoon(key);
        }

        // ===== 账本搬家（1013-G）：1013-D～F 的整段账本 store_<编号> → 按月分块 =====
        // 做法和 1013-D 一样：写新 → 读回逐条核对 → 删旧。旧的删掉之前，账本在两边都有。
        //   · 新块整批放在一个事务里写：被杀掉的话，要么全在，要么一块没有。
        //   · 已经有分块（上次搬到一半旧的还没删，或者装回过 1013-F 又在那边记了账）：
        //     【1013-H】两边按编号合并（见 ledgerMergeOld），不再二选一——以前「旧位置那份算最新」，
        //     装回旧版记一笔再升级，全部历史就被藏进了备份。合并结果和分块一模一样（上次已经搬好 / 已经合并过）就只删旧的；
        //     真合并了，原来的分块合成一整本另存为 migrate_conflict_store_<编号>_<时间>，进 App 时告诉用户。
        //   · 旧的那份里有不是对象的记录 / 存档：丢掉，旧的原文原样另存为 migrate_skipped_store_<编号>（和新块同一个事务）。
        //   · 缺编号的记录补上固定的编号（同一份数据算几次都一样），被杀后续搬时才对得上。
        //   · 旧的那份本身就坏了：分块好好的就留着分块、旧的原文另存成损坏备份；没有分块就把原文原样放到 meta 的位置——
        //     进账号时和 1013-F 一样另存原文、给空账本、暂停云同步，第一次保存才覆盖。
        //   · 任何一步失败，这个账号就算没搬完：这次先不让进，下次打开 App 接着搬。
        const __ledgerMergeNotes=[];     // 这次启动合并了装回旧版时记的账：{ id, added:[{ archive, n }] }
        async function dropOldLedgerKey(k){
            try{ await idbTx('readwrite', os=>os.delete(k), true); }catch(_){ return false; }
            let v;
            try{ v=await idbGet(k); }catch(_){ return false; }
            if(v!==undefined) return false;
            __ledgerKeys.delete(k);
            return true;
        }
        // 整理旧的整段账本（就地改刚解析出来的 store）。返回丢掉了几样东西
        function ledgerTidyOld(store){
            let dropped=0;
            Object.keys(store.archives).forEach((n, ai)=>{
                let a=store.archives[n];
                if(Array.isArray(a)) a={ records:a, cats:DEFAULT_CATS.slice() };
                if(!a || typeof a!=='object'){ dropped++; a={ records:[] }; }
                if(a.records!==undefined && !Array.isArray(a.records)){ dropped++; a.records=[]; }
                const recs=a.records || [];
                const ids=new Set(recs.filter(r=>isRecObj(r) && r.id).map(r=>r.id));
                a.records=[];
                recs.forEach((r, i)=>{
                    if(!isRecObj(r)){ dropped++; return; }
                    if(!r.id){
                        let id=`rfix${ai}x${i}`;
                        while(ids.has(id)) id+='x';
                        ids.add(id); r.id=id;
                    }
                    a.records.push(r);
                });
                store.archives[n]=normArchive(a);
            });
            return dropped;
        }
        // 两边都有时按编号合并。have：分块那份（历史都在这里）；old：旧位置那份（多半是装回旧版本后记的）。
        //   · 同一个编号两边都有：用旧位置那份（沿用「旧位置的更新」）；只在旧位置有的：接在这个存档后面。
        //   · 同名存档：分类取并集，预算补上没有的，常用模板按编号补上；只在旧位置有的存档整个加进来。
        //   · 合并几次结果都一样（被杀后续搬时，合并结果和已写好的分块逐字相同，就只删旧的）。
        function ledgerMergeOld(have, old){
            const out=JSON.parse(JSON.stringify(have));
            const added=[];
            Object.keys(old.archives).forEach(n=>{
                const o=old.archives[n], h=out.archives[n];
                if(!h){
                    out.archives[n]=o;
                    if(o.records.length) added.push({ archive:n, n:o.records.length });
                    return;
                }
                const pos=new Map(h.records.map((r,i)=>[r.id, i]));
                let cnt=0;
                o.records.forEach(r=>{
                    if(pos.has(r.id)){ h.records[pos.get(r.id)]=r; return; }
                    pos.set(r.id, h.records.length); h.records.push(r); cnt++;
                });
                if(cnt) added.push({ archive:n, n:cnt });
                (o.cats||[]).forEach(c=>{ if(!h.cats.includes(c)) h.cats.push(c); });
                if(o.budgets && typeof o.budgets==='object' && !Array.isArray(o.budgets)){
                    Object.keys(o.budgets).forEach(c=>{
                        if(h.budgets && typeof h.budgets==='object' && c in h.budgets) return;
                        h.budgets=Object.assign({}, h.budgets||{}); h.budgets[c]=o.budgets[c];
                    });
                }
                if(Array.isArray(o.tpls) && o.tpls.length){
                    if(!Array.isArray(h.tpls)) h.tpls=[];
                    const seen=new Set(h.tpls.map(t=>(t && t.id) ? 'id:'+t.id : JSON.stringify(t)));
                    o.tpls.forEach(t=>{
                        const k=(t && t.id) ? 'id:'+t.id : JSON.stringify(t);
                        if(!seen.has(k)){ seen.add(k); h.tpls.push(t); }
                    });
                }
            });
            if(!out.archives[out.last]) out.last=Object.keys(out.archives)[0];
            return { store:out, added };
        }
        async function moveStoreToBlocks(id){
            const oldKey=`store_${id}`;
            let raw;
            try{ raw=asRaw(await idbGet(oldKey)); }catch(_){ return false; }
            if(raw===null){ __ledgerKeys.delete(oldKey); return true; }
            let store=null;
            try{ store=JSON.parse(raw); }catch(_){ store=null; }
            if(store && (typeof store!=='object' || Array.isArray(store) || !store.archives || typeof store.archives!=='object' || Array.isArray(store.archives))) store=null;
            let rows;
            try{ rows=(await idbRange(ledPrefix(id))).filter(([k])=>ledParseKey(id, k)); }catch(_){ return false; }
            // 已有的分块（读不全也照样合成能读的部分）
            let haveObj=null, have=null, rowsBroken=false;
            if(rows.length){
                const e0=ledgerBuild(id, rows, true);
                rowsBroken=e0.broken;
                if(e0.has){ haveObj=ledgerAssemble(e0); have=JSON.stringify(haveObj); }
            }
            const rowsRaw=()=>JSON.stringify(Object.fromEntries(rows.map(([k,v])=>[k, asRaw(v)])));
            const stamp=Date.now();
            let ops, check, added=null;
            const extra=[];
            if(store===null){
                if(haveObj && !rowsBroken){
                    // 分块好好的，旧的坏了：留着分块，旧的原文另存成损坏备份，删掉旧的就算完
                    try{ await idbBatch([['put', `${oldKey}__corrupted_${stamp}`, raw]], true); }catch(_){ return false; }
                    if(!(await dropOldLedgerKey(oldKey))) return false;
                    __ledger.delete(oldKey);
                    return true;
                }
                // 坏的：原文原样放进 meta 的位置（见上）
                ops=[['put', ledMetaKey(id), raw]];
                check=back=>{ const m=back.find(([k])=>k===ledMetaKey(id)); return !!m && asRaw(m[1])===raw; };
                if(rows.length){
                    if(check(rows)) return await dropOldLedgerKey(oldKey);   // 上次已经放好了，只差删旧的
                    extra.push(['put', `migrate_conflict_${oldKey}_${stamp}`, have!==null ? have : rowsRaw()]);
                }
            } else {
                if(ledgerTidyOld(store)) extra.push(['put', `migrate_skipped_${oldKey}`, raw]);
                let target=store;
                if(haveObj){
                    const m=ledgerMergeOld(haveObj, store);
                    target=m.store;
                    if(!rowsBroken && JSON.stringify(target)===have){
                        // 上次已经写好了（或者已经合并过），只差删旧的
                        if(extra.length){ try{ await idbBatch(extra, true); }catch(_){ return false; } }
                        if(!(await dropOldLedgerKey(oldKey))) return false;
                        __ledger.delete(oldKey);
                        return true;
                    }
                    // 真的要合并：原来的分块合成一整本另存（读不全时连原样的块一起另存）
                    extra.push(['put', `migrate_conflict_${oldKey}_${stamp}`, have]);
                    if(rowsBroken) extra.push(['put', `migrate_conflict_${oldKey}_${stamp}_raw`, rowsRaw()]);
                    if(m.added.length) added=m.added;
                } else if(rows.length){
                    // 分块一条都读不出来：原样另存
                    extra.push(['put', `migrate_conflict_${oldKey}_${stamp}`, rowsRaw()]);
                }
                const want=JSON.stringify(target);
                const e=ledgerNewEntry(id);
                ledgerApply(e, target);
                ops=ledgerJob(e).ops;
                check=back=>ledgerAssembleRows(id, back)===want;
            }
            const putKeys=new Set(ops.map(o=>o[1]));
            rows.forEach(([k])=>{ if(!putKeys.has(k)) ops.push(['del', k]); });
            try{ await idbBatch(extra.concat(ops), true); }catch(_){ return false; }
            // 读回来核对：合成的一整本必须和要写的逐字一样（每条记录、顺序、分类预算模板都在里面）
            let back;
            try{ back=(await idbRange(ledPrefix(id))).filter(([k])=>ledParseKey(id, k)); }catch(_){ return false; }
            if(!check(back)) return false;
            if(!(await dropOldLedgerKey(oldKey))) return false;
            __ledger.delete(oldKey);
            if(added) __ledgerMergeNotes.push({ id, added });
            return true;
        }
        async function migrateLedgersToBlocks(){
            const ids=[...__ledgerKeys].filter(k=>k.indexOf('store_')===0 && isAccountId(k.slice(6))).map(k=>k.slice(6)).sort();
            let ok=true;
            for(const id of ids){
                // 还在 localStorage 那一步没搬完的，先不动（两边都有时 localStorage 那份更新，等它先搬进来）
                if(__ledgerPending.has(id)){ ok=false; continue; }
                const acc=accountById(id);
                if(acc && typeof acc.legacy==='string'){ __ledgerPending.add(id); ok=false; continue; }
                let moved=false;
                try{ moved=await moveStoreToBlocks(id); }catch(_){ moved=false; }
                if(!moved){ __ledgerPending.add(id); ok=false; }
            }
            return ok;
        }

        // ===== 账本搬家：localStorage → IndexedDB（只跑一次；没搬完下次打开接着搬）=====
        // 做法和 1010-K7 一样：写新 → 读回确认 → 删旧。旧的删掉之前，账本在两边都有。
        //   · 新位置已经有一份、而且和旧的不一样（比如装回过旧版本又用了几天）：旧位置那份才是最新的，
        //     放进新位置；新位置原来那份另存为 migrate_conflict_store_<编号>_<时间>，一条都不删。
        //   · 任何一步失败，这个账号就算没搬完：这次先不让进，下次打开 App 接着搬。
        //   · 只搬 store_<编号>（账本本身）；旧的损坏备份、日子、设置都留在 localStorage。
        async function moveLedgerToIdb(key){
            let v;
            try{ v=localStorage.getItem(key); }catch(_){ return false; }
            if(v===null) return true;
            let cur;
            try{ cur=await idbGet(key); }catch(_){ return false; }
            if(cur!==undefined && cur!==v){
                try{ await idbPut(`migrate_conflict_${key}_${Date.now()}`, cur, true); }catch(_){ return false; }
                cur=undefined;
            }
            if(cur===undefined){
                try{ await idbPut(key, v, true); }catch(_){ return false; }
                let back;
                try{ back=await idbGet(key); }catch(_){ return false; }
                if(back!==v) return false;
            }
            // 旧的必须真删掉才算搬完：留着的话，下次启动会把它当成「更新的那份」盖回来
            try{ localStorage.removeItem(key); }catch(_){ return false; }
            try{ if(localStorage.getItem(key)!==null) return false; }catch(_){ return false; }
            __ledger.delete(key);
            return true;
        }
        async function migrateLedgersToIdb(){
            const ks=[];
            for(let i=0;i<localStorage.length;i++){
                const k=localStorage.key(i);
                if(k && k.indexOf('store_')===0 && isAccountId(k.slice(6))) ks.push(k);
            }
            ks.sort();
            let ok=true;
            for(const k of ks){
                const id=k.slice(6);
                const acc=accountById(id);
                // 名字→编号那一步还没搬完的账号（1010-K7）：账本还得留在原处给它用，等它整理完下次再搬
                if(acc && typeof acc.legacy==='string'){ __ledgerPending.add(id); ok=false; continue; }
                if(await moveLedgerToIdb(k)) __ledgerPending.delete(id);
                else { __ledgerPending.add(id); ok=false; }
            }
            return ok;
        }

        // 自增序列持久化：旧实现每次刷新归零，刷新前后同一毫秒生成 id 时，
        // 时间戳与 seq 都可能相同，仅靠 4 位随机区分（万分之一碰撞），
        // 而 editId/删除按 id 精确匹配，碰撞会误改/误删另一条。
        // 改为从 localStorage 续读，跨刷新单调递增（mod 100万循环），彻底规避同毫秒同序列。
        let __idSeq = (function(){
            const n = parseInt(localStorage.getItem('app_id_seq'), 10);
            return (isFinite(n) && n >= 0) ? (n % 1000000) : 0;
        })();
        // 生成定长、可按字符串直接比较先后的 id：
        //   r + 13位毫秒时间戳 + 6位自增序列 + 4位随机
        // 各段都补零定长，故字符串比较结果与时间顺序一致；自增序列保证同毫秒内不重复，
        // 末尾随机进一步降低多端/导入时的碰撞概率。
        function genId(){
            const ts=String(Date.now()).padStart(13,'0');
            const cur=__idSeq++ % 1000000;
            // 持久化下一个序列值；写失败（如隐私模式）不影响本次 id 生成
            try{ localStorage.setItem('app_id_seq', String(__idSeq % 1000000)); }catch(_){}
            const seq=String(cur).padStart(6,'0');
            const rnd=String(Math.floor(Math.random()*10000)).padStart(4,'0');
            return 'r'+ts+seq+rnd;
        }

        // 就地改 a 和里面的记录：只能用在刚解析出来的数据上（账本缓存里的记录是冻结的，改了也改不动）
        //   【1013-H】不是对象的存档 / 记录不再让它报错：存档当成空的，记录丢掉（搬家时原文另存，见 ledgerTidyOld）
        function isRecObj(r){ return !!r && typeof r==='object' && !Array.isArray(r); }
        function normArchive(a){
            if (Array.isArray(a)) a = { records:a, cats:DEFAULT_CATS.slice() };
            if (!a || typeof a!=='object') a = { records:[] };
            if (!Array.isArray(a.records)) a.records = [];
            if (!a.cats || !a.cats.length) a.cats = DEFAULT_CATS.slice();
            a.records = a.records.filter(isRecObj);
            a.records.forEach(r => {
                if (!r.cat) r.cat = '未分类';
                if (!r.id) r.id = genId();
                if (!r.type) r.type = 'income';   // 旧记录无收支类型，默认按收入
            });
            return a;
        }

        // 【P0 守卫】本次会话中「曾被检测到损坏」的 store key 集合。
        //   账本读进内存时发现损坏（1013-G 起在 ledgerBuild：坏了的月份块先不显示，meta 坏了用月份块重建，
        //   一条都救不回来就回退一个空结构）以保证界面不白屏——这是对的，
        //   但云同步（odSyncNow）也是通过 loadStore 取数据的，于是形成一条致命链路：
        //     存档损坏 → 界面显示空账本 → 用户记一笔 → 触发同步 → 空数据覆盖云端完好备份。
        //   偏偏这正是最需要备份的时刻。所以在此登记，同步前据此拒绝写入。
        //   只存在于内存：重启 App 后若数据已正常，自然解除；仍损坏则会被重新登记。
        const __corruptedStores = new Set();

        // 【1013-G】从内存缓存里取（进入账号时已从 IndexedDB 读好、解析好）。每次给一个新的 store：
        //   meta 部分（分类、预算、模板、last……）是新解析出来的副本，随便改；
        //   records 是缓存数组的浅拷贝，push / filter / 删都行，但里面的记录是冻结的——要改就换成新对象。
        //   坏了的块在读进内存时已经另存原文、登记了损坏（见 ledgerBuild），这里不用再管。
        function ledgerTagRecords(arr, aid){
            Object.defineProperty(arr, '__aid', { value:aid, enumerable:false, writable:true, configurable:true });
            return arr;
        }
        function loadStore(user){
            const u = (user!==undefined) ? user : currentUser;
            const e = __ledger.get(storeKey(u));
            if (!e) throw new Error('notloaded:'+storeKey(u));
            if (!e.has) {
                // 还没有账本（或者坏到一条也救不回来）：和以前一样给一个空的默认结构，最早期的 billData 也带上
                const old = localStorage.getItem(`billData_${u}`);
                let arr = [];
                try { arr = old ? JSON.parse(old) : []; } catch(_){ arr = []; }
                if (!Array.isArray(arr)) arr = [];
                const store = { archives:{ '默认存档':{ records:arr, cats:DEFAULT_CATS.slice() } }, last:'默认存档' };
                Object.keys(store.archives).forEach(k => { store.archives[k] = normArchive(store.archives[k]); });
                return store;
            }
            const store = JSON.parse(e.meta);
            Object.keys(store.archives).forEach(k => {
                const a = store.archives[k], st = e.archs.get(a.records);
                a.records = ledgerTagRecords(st ? st.recs.slice() : [], a.records);
            });
            return store;
        }
        // 写存档：先改内存（只标出改动涉及的月份），马上排队写 IndexedDB。写库是异步的，失败时由 ledgerWriteSoon 提示，
        //   内存里的修改留着，下次保存 / 切后台时再写。必须确认写进去才能往下走的地方用 saveStoreDurable。
        function saveStore(store, user){
            snapDrop();   // 1019-U：账本改了，快照作废
            const key=storeKey(user);
            ledgerApply(ledgerEntryForWrite(key), store);
            ledgerWriteSoon(key);
            return true;
        }
        // 安全写：吞掉异常并弹窗提示，用于「写失败也不该中断流程」的高频场景
        // 【P1】odBuildPayload 打包的是 records + cats + days 三样，但此前只有 saveUserData
        //   一条路会触发同步，改分类、排序、建/删存档全都不同步——得等下次记一笔才顺带补上。
        //   收在这里统一触发：saveStoreSafe 是所有「当前用户」写存档的必经之路。
        //   带 user 参数且不是当前用户的（导入到别的账号）不触发，避免把 A 的操作
        //   记成 B 的同步时机。odScheduleSync 本身有 1.5s 防抖，连续操作不会打满。
        function saveStoreSafe(store, user){
            try{
                const ok = saveStore(store, user);
                if(ok && (user===undefined || user===currentUser)) odScheduleSync();
                return ok;
            }
            catch(err){
                customAlert(err && err.message==='quota'
                    ? '存储空间已满，本次修改未能保存。请删除部分存档或记录后重试。'
                    : '保存失败，请重试。', '保存失败');
                return false;
            }
        }
        function curArchive(store){ return store.archives[currentArchive]; }

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

        // ===== 账号（1010-K7）=====
        // 账号 = 一个永远不变的内部编号 + 一个给人看的名字。所有数据按编号存（store_<编号>、days_<编号>…），
        // 名字只是标签：改名只改这里一个字段，什么数据都不用搬。
        // 以前是拿名字直接当钥匙，改名要搬好几处数据，导入时也只能比名字判断「是不是同一个人」。
        //
        // 账号列表存在 accounts：[{ id, name, hidden? }]，最近用过的排最前。
        //   hidden：从登录页列表里移走的账号。数据还在，登录页底部能找回（与以前「移出最近账号」同义）。
        // 名字同时抄一份在该账号的 store.accountName 里：万一账号列表坏了，能从数据里把名字找回来。
        const ACCOUNTS_KEY='accounts';
        const ACCOUNT_ID_RE=/^u\d{19}$/;
        function isAccountId(s){ return typeof s==='string' && ACCOUNT_ID_RE.test(s); }
        function newAccountId(list){
            let id;
            do{ id='u'+String(Date.now()).padStart(13,'0')+String(Math.floor(Math.random()*1e6)).padStart(6,'0'); }
            while((list||[]).some(a=>a.id===id) || ledgerExists(id));
            return id;
        }
        function readAccountsRaw(){
            const raw=localStorage.getItem(ACCOUNTS_KEY);
            if(raw===null) return null;
            try{
                const a=JSON.parse(raw);
                if(!Array.isArray(a)) return null;
                return a.filter(x=>x && isAccountId(x.id) && typeof x.name==='string');
            }catch(_){ return null; }
        }
        function getAccounts(){ return readAccountsRaw() || []; }
        // 写失败（配额满）会抛错，由调用方决定怎么提示
        function saveAccounts(list){ localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list)); }
        function accountById(id){ return getAccounts().find(a=>a.id===id) || null; }
        function nameOf(id){ const a=accountById(id); return a ? a.name : String(id||''); }
        function nameTaken(name, exceptId){ return getAccounts().some(a=>a.name===name && a.id!==exceptId); }
        // 账号名校验：返回错误文案，合格返回空串（新建、改名、导入时新建共用）
        function accountNameError(name, exceptId){
            if(!name) return '名字不能为空';
            if(charLen(name) > 8) return '名字最多 8 个字～';
            const clash=getAccounts().find(a=>a.name===name && a.id!==exceptId);
            // 【1013-C】撞上的是「已移走」的账号：它不在列表里显示，直接说「已经有了」会让人找不着北
            if(clash && clash.hidden) return '「已移走的账号」里有一个叫这个名字的，可以在登录页下方找回它，或者换个名字';
            if(clash) return '这台手机上已经有叫这个名字的账号了，换一个吧';
            return '';
        }
        // 把名字抄进 store，供账号列表损坏时找回。失败不影响主流程。
        //   【1013-D】账本在内存缓存里（当前账号）就改缓存再写库；1010-K7 迁移途中账本还在 localStorage，用 stampAccountNameLS
        function stampAccountName(id, name){
            //   【1013-G】名字在 meta 里，只改 meta、只写 meta 这一个小键，月份块不动
            try{
                const key=`store_${id}`;
                const e=__ledger.get(key);
                if(!e || !e.has) return;
                const s=JSON.parse(e.meta);
                if(!s || typeof s!=='object' || s.accountName===name) return;
                s.accountName=name;
                e.meta=JSON.stringify(s);
                e.metaGen=++e.gen;
                ledgerWriteSoon(key);
            }catch(_){}
        }
        function stampAccountNameLS(id, name){
            try{
                const raw=localStorage.getItem(`store_${id}`);
                if(raw===null) return;
                const s=JSON.parse(raw);
                if(!s || typeof s!=='object' || s.accountName===name) return;
                s.accountName=name;
                localStorage.setItem(`store_${id}`, JSON.stringify(s));
            }catch(_){}
        }
        // 新建账号：写好空账本和名字，排到列表最前。preferId：导入别的手机的备份时沿用它原来的编号
        //   【1013-D】账本确认写进 IndexedDB 之后才登记进账号列表（和以前先写账本、再写列表的顺序一样）
        async function createAccount(name, preferId){
            const list=getAccounts();
            const id=(isAccountId(preferId) && !list.some(a=>a.id===preferId)
                      && !ledgerExists(preferId)) ? preferId : newAccountId(list);
            const store={ archives:{ '默认存档':{ records:[], cats:DEFAULT_CATS.slice() } }, last:'默认存档', accountName:name };
            await saveStoreDurable(store, id);
            try{ saveAccounts([{ id, name }].concat(list)); }
            catch(err){
                try{ await ledgerDropAccount(id); }catch(_){}
                throw err;
            }
            return id;
        }
        // 进入某账号时把它排到最前、并取消隐藏
        function touchAccount(id){
            const list=getAccounts();
            const i=list.findIndex(a=>a.id===id); if(i<0) return;
            const a=Object.assign({}, list[i]); delete a.hidden;
            list.splice(i,1); list.unshift(a);
            try{ saveAccounts(list); }catch(_){}
        }
        function setAccountHidden(id, hidden){
            const list=getAccounts().map(a=>{
                if(a.id!==id) return a;
                const b=Object.assign({}, a); if(hidden) b.hidden=true; else delete b.hidden; return b;
            });
            saveAccounts(list);
        }

        // 账号列表丢了或坏了：从数据里把账号找回来（名字取 store.accountName，没有就叫「账号1」…）。
        // 坏掉的原文先另存一份，不覆盖。
        //   【1013-D】账本可能在 IndexedDB（搬过家的），也可能还在 localStorage（没搬完的），两边都要找
        async function recoverAccountsIfBroken(){
            const raw=localStorage.getItem(ACCOUNTS_KEY);
            if(raw!==null && readAccountsRaw()!==null) return;
            const ids=[];
            for(let i=0;i<localStorage.length;i++){
                const k=localStorage.key(i);
                if(k && k.indexOf('store_')===0 && isAccountId(k.slice(6))) ids.push(k.slice(6));
            }
            //   【1013-G】分块存的账本看 meta 键（led_<编号>_m），还没搬成分块的看 store_<编号>
            __ledgerKeys.forEach(k=>{
                let id=null;
                if(k.indexOf('store_')===0 && isAccountId(k.slice(6))) id=k.slice(6);
                else { const m=/^led_(.+)_m$/.exec(k); if(m && isAccountId(m[1])) id=m[1]; }
                if(id && !ids.includes(id)) ids.push(id);
            });
            if(raw===null && !ids.length) return;              // 新装的 App：本来就没有账号
            if(raw!==null){ try{ localStorage.setItem(`${ACCOUNTS_KEY}__corrupted_${Date.now()}`, raw); }catch(_){} }
            ids.sort();
            const list=[]; let n=1;
            for(const id of ids){
                let name='';
                try{
                    let r=localStorage.getItem(`store_${id}`);
                    if(r===null) r=asRaw(await idbGet(`store_${id}`));
                    if(r===null) r=asRaw(await idbGet(ledMetaKey(id)));
                    const s=JSON.parse(r); name=(s && typeof s.accountName==='string') ? charSlice(s.accountName.trim(), 8) : '';
                }catch(_){}
                while(!name || list.some(a=>a.name===name)) name=`账号${n++}`;
                list.push({ id, name });
            }
            try{ saveAccounts(list); }catch(_){}
        }

        // ===== 老数据迁移：按名字存 → 按编号存（只跑一次，失败了下次启动接着跑）=====
        // 每个老账号先在账号列表里登记一个编号（记下 legacy = 老名字），再把它名下的数据逐个
        // 「写新 → 读回确认 → 删旧」地搬过去。账号列表先落盘，所以中途断了，下次能按同一个编号续上。
        // 全部搬完才打 accounts_v=1 标记、去掉 legacy。
        // 老账号从哪来：store_名字（每个登录过的账号都有）、更早期的 billData_名字。
        // 以前登录页「移出最近账号」的账号不在 users_index 里，迁移后记为 hidden，登录页底部能找回。
        const ACCOUNTS_VERSION='1';
        function migrateMoveKey(from, to){
            let v;
            try{ v=localStorage.getItem(from); }catch(_){ return false; }
            if(v===null) return true;
            let cur=null;
            try{ cur=localStorage.getItem(to); }catch(_){}
            // 【1013-B】新位置已经有别的内容（1013-A 里没搬完时能往这个账号导入，会先在新位置建出账本）：
            //   以前这里「两份都留着」却报成功，迁移随即收尾，老数据就永远留在旧名字下、界面上再也看不到。
            //   现在老数据才是这个账号真正的内容，放回新位置；新位置原来那份另存一份（不以 store_/billData_ 开头，
            //   免得被当成老账号再搬一遍），一条都不删。另存失败就算这一项没搬完，下次接着来。
            if(cur!==null && cur!==v){
                try{ localStorage.setItem(`migrate_conflict_${to}_${Date.now()}`, cur); }catch(_){ return false; }
                cur=null;
            }
            if(cur===null){
                try{ localStorage.setItem(to, v); }catch(_){ return false; }
                if(localStorage.getItem(to)!==v) return false;
            }
            try{ localStorage.removeItem(from); }catch(_){}
            return true;
        }
        function migrateKeysWithPrefix(oldPrefix, newPrefix){
            const ks=[];
            for(let i=0;i<localStorage.length;i++){
                const k=localStorage.key(i);
                if(k && k.indexOf(oldPrefix)===0) ks.push(k);
            }
            let ok=true;
            ks.forEach(k=>{ ok=migrateMoveKey(k, newPrefix+k.slice(oldPrefix.length)) && ok; });
            return ok;
        }
        function migrateOneAccount(name, id){
            let ok=true;
            ok=migrateMoveKey(`store_${name}`, `store_${id}`) && ok;
            ok=migrateMoveKey(`billData_${name}`, `billData_${id}`) && ok;
            ok=migrateMoveKey(`days_${name}`, `days_${id}`) && ok;
            ok=migrateMoveKey(`days_card_n_${name}`, `days_card_n_${id}`) && ok;
            ok=migrateMoveKey(`app_time_repaired_${name}`, `app_time_repaired_${id}`) && ok;
            ok=migrateKeysWithPrefix(`store_${name}__corrupted_`, `store_${id}__corrupted_`) && ok;
            ok=migrateKeysWithPrefix(`days_${name}__corrupted_`, `days_${id}__corrupted_`) && ok;
            // 云备份连接：按这个账号自己的存档名逐个搬，不用前缀扫描——
            // 别的老账号名恰好是「名字__xxx」时，前缀匹配会把别人的连接一起搬走。
            let archives=[];
            try{
                const s=JSON.parse(localStorage.getItem(`store_${id}`));
                if(s && s.archives && typeof s.archives==='object') archives=Object.keys(s.archives);
            }catch(_){}
            archives.forEach(arc=>{ ok=odMoveLink(name, arc, id, arc) && ok; });
            return ok;
        }
        //   【1013-D】「账号列表坏了先找回」要读 IndexedDB，挪到 initApp 里在这之前调用
        function migrateAccounts(){
            if(localStorage.getItem('accounts_v')===ACCOUNTS_VERSION) return true;
            let indexNames=[];
            try{ const u=JSON.parse(localStorage.getItem('users_index')||'[]'); if(Array.isArray(u)) indexNames=u.filter(x=>typeof x==='string' && x); }catch(_){}
            const found=[];
            for(let i=0;i<localStorage.length;i++){
                const k=localStorage.key(i); if(!k) continue;
                let n=null;
                if(k.indexOf('store_')===0) n=k.slice(6);
                else if(k.indexOf('billData_')===0) n=k.slice(9);
                if(n===null || !n || n.indexOf('__corrupted_')>=0 || isAccountId(n)) continue;
                if(!found.includes(n)) found.push(n);
            }
            const names=indexNames.filter(n=>found.includes(n)).concat(found.filter(n=>!indexNames.includes(n)).sort());
            const list=getAccounts();
            names.forEach(n=>{
                if(list.some(a=>a.legacy===n)) return;
                let name=charSlice(n.trim(), 8) || '账号';
                const base=name; let k=2;
                while(list.some(a=>a.name===name)) name=charSlice(base, 6)+k++;
                const entry={ id:newAccountId(list), name, legacy:n };
                if(!indexNames.includes(n)) entry.hidden=true;
                list.push(entry);
            });
            try{ saveAccounts(list); }catch(_){ return false; }
            // 自动登录记的是名字的话，换成编号
            let ok=true;
            const remembered=localStorage.getItem('app_logged_in_user');
            const hit=list.find(a=>a.legacy===remembered);
            if(hit){ try{ localStorage.setItem('app_logged_in_user', hit.id); }catch(_){ ok=false; } }
            // 【1013-B】逐个账号收尾：哪个账号的数据全搬完了，就马上去掉它的老名字记号，它就能进了。
            //   以前要等所有账号都搬完才统一去掉，一个账号卡住（比如存储满），所有账号都进不去。
            list.forEach(a=>{
                if(typeof a.legacy!=='string') return;
                if(!migrateOneAccount(a.legacy, a.id)){ ok=false; return; }
                const cur=getAccounts().map(x=>{
                    if(x.id!==a.id) return x;
                    const b=Object.assign({}, x); delete b.legacy; return b;
                });
                try{ saveAccounts(cur); }catch(_){ ok=false; return; }
                stampAccountNameLS(a.id, a.name);
            });
            if(!ok) return false;
            try{
                localStorage.removeItem('users_index');
                localStorage.setItem('accounts_v', ACCOUNTS_VERSION);
            }catch(_){ return false; }
            return true;
        }

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

        // ===== 云备份：自动同步到 OneDrive（不走微软官方登录）=====
        // 原理：调用安卓系统的「创建/打开文档」选择器（Storage Access Framework）。用户选一次
        // OneDrive 里的目标文件后，系统会给我们一个可持久使用的读写授权
        // （ContentResolver.takePersistableUriPermission，见原生插件 OneDriveLinkPlugin），
        // 之后每次记账/修改都能直接往这个文件写，不用重新弹窗，也不需要登录微软账号——
        // OneDrive App 自己早就登录了，SAF 只是把它当一个「文档提供方」接进来。
        // 局限：手机 OneDrive 是「云端优先」，写入这一下需要联网；断网时静默失败，
        // 不重试轰炸、不打断记账，下次保存成功时自然补上。
        // 每个「账号+存档」独立连接一个文件（跟导出/导入的粒度保持一致）。
        function odBuildPayload(){
            const store=loadStore(); const a=curArchive(store);
            // 【1015-B】导入用的名单、规则在 meta 里（空的不写）；导入记录、待处理池在 odSyncNow 里另读
            return { app:'记问', user:nameOf(currentUser), accountId:currentUser, archive:currentArchive,
                cats:a.cats, budgets:a.budgets||{}, tpls:a.tpls||[], ...impArchFields(a), data:a.records, days:loadDays(),
                exportedAt:new Date().toLocaleString() };
        }
        function odPlugin(){
            const cap = window.Capacitor;
            return (cap && cap.isNativePlatform && cap.isNativePlatform() && cap.Plugins && cap.Plugins.OneDriveLink) || null;
        }
        function odKey(user, archive){ return `onedrive_link_${user}__${archive}`; }
        function odGetLink(user, archive){
            try{
                const raw = localStorage.getItem(odKey(
                    user!==undefined ? user : currentUser,
                    archive!==undefined ? archive : currentArchive
                ));
                return raw ? JSON.parse(raw) : null;
            }catch(_){ return null; }
        }
        function odSetLink(user, archive, link){
            try{ localStorage.setItem(odKey(user, archive), JSON.stringify(link)); }catch(_){}
        }
        function odClearLink(user, archive){
            try{ localStorage.removeItem(odKey(user, archive)); }catch(_){}
            try{ localStorage.removeItem(odOrdKey(user, archive)); }catch(_){}   // 1016-W：单号表的云端文件连接一起断
        }
        // 把一条连接从 (旧用户, 旧存档) 搬到 (新用户, 新存档)。
        // 必须「写新 → 读回确认 → 删旧」：odSetLink 写失败是静默的，
        // 若先删旧再写新，配额满时连接就彻底丢了。返回是否搬成功（没有连接也算成功）。
        function odMoveLink(fromUser, fromArchive, toUser, toArchive){
            let raw=null;
            try{ raw=localStorage.getItem(odKey(fromUser, fromArchive)); }catch(_){ return false; }
            if(raw===null) return true;
            try{ localStorage.setItem(odKey(toUser, toArchive), raw); }catch(_){ return false; }
            let back=null;
            try{ back=localStorage.getItem(odKey(toUser, toArchive)); }catch(_){}
            if(back!==raw) return false;
            // 1016-W：单号表的云端文件连接跟着搬（尽力而为，搬不成只是要重新连一次）
            try{ const ro=localStorage.getItem(odOrdKey(fromUser, fromArchive)); if(ro!==null) localStorage.setItem(odOrdKey(toUser, toArchive), ro); }catch(_){}
            odClearLink(fromUser, fromArchive);
            return true;
        }

        // ===== 1016-W：单号表上云（第一期 ⑨）=====
        // 主云备份（上面那个文件）格式一点不改、照旧不带单号表（十几万单号不能每记一笔都传）。单号表单独放一个云端文件：
        //   在设置里另选（新建）一个文件连上，连接存在 onedrive_orders_<账号>__<存档>（和主连接分开）；
        //   只在导入、撤销、处理待处理、恢复到导入前之后写一次，平时记一笔不碰它；只写这一个文件，不动、不删云端别的东西。
        // 文件内容：{ app:'记问', kind:'单号表', v:1, accountId, archive, exportedAt, orders（和导出备份里的 orders 一样）,
        //   recs:{ 记录 id: 指纹 } }（单号表里指到的记录的指纹，和 write.js 的 recHash 一样：不含 id，恢复时按它找回新编号）
        // 恢复：只在这个存档的单号表是空的时候（换了手机、从主云备份恢复了账本以后），按指纹一对一认回记录，认不出的「已导入」条目不要
        //   （按规则本来就等于没导过），忽略的照留。主云备份恢复后记录会重新编号，所以不按 id 认。
        function odOrdKey(user, archive){ return `onedrive_orders_${user}__${archive}`; }
        function odGetOrdLink(user, archive){
            try{ const raw=localStorage.getItem(odOrdKey(user!==undefined ? user : currentUser, archive!==undefined ? archive : currentArchive)); return raw ? JSON.parse(raw) : null; }catch(_){ return null; }
        }
        function odSetOrdLink(user, archive, link){ try{ localStorage.setItem(odOrdKey(user, archive), JSON.stringify(link)); }catch(_){} }
        // 指纹：和 import/write.js 的 recHash 一样的算法（主页面平时不载入 write.js，这里抄一份；测试里比对两边一致）
        function impRecHash(r){
            const canon=v=>{
                if(v===null || typeof v!=='object') return JSON.stringify(v===undefined ? null : v);
                if(Array.isArray(v)) return '['+v.map(canon).join(',')+']';
                return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canon(v[k])).join(',')+'}';
            };
            const o={}; Object.keys(r||{}).forEach(k=>{ if(k!=='id' && k!=='refundOf' && r[k]!==undefined) o[k]=r[k]; });
            const str=canon(o); let h1=0xdeadbeef, h2=0x41c6ce57;
            for(let i=0;i<str.length;i++){ const ch=str.charCodeAt(i); h1=Math.imul(h1^ch, 2654435761); h2=Math.imul(h2^ch, 1597334677); }
            h1=Math.imul(h1^(h1>>>16), 2246822507) ^ Math.imul(h2^(h2>>>13), 3266489909);
            h2=Math.imul(h2^(h2>>>16), 2246822507) ^ Math.imul(h1^(h1>>>13), 3266489909);
            return (4294967296*(2097151 & h2) + (h1>>>0)).toString(36);
        }
        async function impOrdersCloudPayload(user, archive){
            const f=await impExportFields(user, archive, true);
            const e=__ledger.get(storeKey(user)), aid=e && e.names.get(archive);
            const recs=(e && aid && e.archs.get(aid)) ? e.archs.get(aid).recs : [], want=new Set(), hs={};
            Object.values(f.orders||{}).forEach(months=>Object.values(months).forEach(blk=>{ (impBlkDecode(blk)||[]).forEach(x=>{ if(x.st===0 && x.id) want.add(x.id); }); }));
            recs.forEach(r=>{ if(want.has(r.id)) hs[r.id]=impRecHash(r); });
            return { app:'记问', kind:'单号表', v:1, accountId:user, archive, exportedAt:new Date().toLocaleString(), orders:f.orders||{}, recs:hs };
        }
        // 导入相关的写完以后调：连了单号表云端文件才写；主连接被暂停（本地数据有问题）时也不写
        async function odOrdersSync(user, archive){
            user=user!==undefined ? user : currentUser; archive=archive!==undefined ? archive : currentArchive;
            const plugin=odPlugin(), link=odGetOrdLink(user, archive);
            if(!plugin || !link || !link.uri) return;
            const main=odGetLink(user, archive);
            const le=__ledger.get(storeKey(user)), aid=le ? le.names.get(archive) : undefined;
            if((main && main.blocked) || __corruptedStores.has(storeKey(user)) || (aid!==undefined && le.badAids.has(aid))){
                link.lastError='本地数据有问题，单号表暂停上传'; odSetOrdLink(user, archive, link); return;
            }
            try{
                const payload=await impOrdersCloudPayload(user, archive);
                await plugin.writeText({ uri:link.uri, text:JSON.stringify(payload) });
                link.lastSyncAt=Date.now(); link.lastError=null; link.lastCount=Object.keys(payload.recs).length;
            }catch(err){ link.lastError=String((err && (err.code || err.message)) || err || '未知错误'); }
            odSetOrdLink(user, archive, link);
            try{ odRefreshStatusUI(); }catch(_){}
        }
        // 从云端文件恢复单号表：text 是文件内容。这个存档的单号表不是空的就不动（不覆盖）
        async function impOrdersRestoreFromCloud(text, archive){
            const t=impTarget(archive);
            let o; try{ o=JSON.parse(text); }catch(_){ throw impErr('badfile'); }
            if(!o || o.app!=='记问' || o.kind!=='单号表' || !o.orders || typeof o.orders!=='object') throw impErr('badfile');
            const cur=await impReadOrders(t.e, t.aid);
            if(cur.size) throw impErr('notempty');
            // 指纹 → 现在的记录（同一指纹几条的，按顺序一对一）
            const byHash=new Map();
            ((t.e.archs.get(t.aid)||{ recs:[] }).recs).forEach(r=>{ const h=impRecHash(r); let a=byHash.get(h); if(!a) byHash.set(h, a=[]); a.push(r.id); });
            const recs=o.recs && typeof o.recs==='object' ? o.recs : {}, got=new Map();
            const mapId=oldId=>{
                if(got.has(oldId)) return got.get(oldId);
                const h=recs[oldId], a=h ? byHash.get(h) : null, nid=a && a.length ? a.shift() : null;
                got.set(oldId, nid); return nid;
            };
            const r=impCleanOrdersFromBackup(o.orders, mapId, t.e.id, t.aid);
            if(r.pairs.length) await impWrite(t.e, t.key, r.pairs);
            return { kept:r.kept, dropped:r.dropped };
        }

        let odTimer=null;
        function odScheduleSync(){
            const plugin = odPlugin();
            if(!plugin) return;
            const link = odGetLink();
            if(!link || !link.uri) return;
            clearTimeout(odTimer);
            odTimer = setTimeout(odSyncNow, 1500);
        }
        async function odSyncNow(){
            const plugin = odPlugin();
            const user = currentUser, archive = currentArchive;
            const link = odGetLink(user, archive);
            if(!plugin || !link || !link.uri) return;

            // 【守卫零】1013-H：已经暂停的就一直停着，直到用户点「重新选择备份文件」（界面上就是这么说的）。
            //   以前这里不看 blocked：损坏只记在内存里，重启 App 后坏数据不再被认出来，就会拿缺了一块的账本覆盖云端。
            if(link.blocked){ odRefreshStatusUI(); return; }

            // 【守卫一】本地存档本次会话被检测到损坏过：坚决不写。
            //   此时 loadStore 给出的是空回退结构，写上去等于亲手销毁唯一的完好备份。
            const __le=__ledger.get(storeKey(user));
            const __aid=__le ? __le.names.get(archive) : undefined;
            if(__corruptedStores.has(storeKey(user)) || (__aid!==undefined && __le.badAids.has(__aid))){
                link.lastError = '本地存档曾损坏，已暂停自动同步以保护云端备份';
                link.blocked = true;
                odSetLink(user, archive, link);
                odRefreshStatusUI();
                return;
            }

            const payload = odBuildPayload();
            const cnt = Array.isArray(payload.data) ? payload.data.length : 0;
            // 【1015-B】导入记录、待处理池（都很小）一起带上。单号表不带：每记一笔都同步，十几万单号不能每次都传，
            //   以后单独放一个云端文件、只在导入时传（第 ⑥ / ⑨ 版接界面时做）。读不出来就暂停同步，不拿缺了的去盖云端
            try{ Object.assign(payload, await impExportFields(user, archive, false)); }
            catch(err){
                if(err && err.code==='impdamaged'){
                    link.lastError = '导入数据有一部分读不出来，已暂停自动同步以保护云端备份';
                    link.blocked = true;
                    odSetLink(user, archive, link);
                    odRefreshStatusUI();
                    return;
                }
                throw err;
            }

            // 【守卫二】记录数从「有」塌到「零」：兜住守卫一覆盖不到的未知路径。
            //   正常使用绝不会出现这种跳变，出现即说明本地数据异常。
            //   （真要清空存档重来，点「重新选择备份文件」即可解除——那是明确的用户意图。）
            if(link.lastCount > 0 && cnt === 0){
                link.lastError = `本地记录为 0（云端有 ${link.lastCount} 条），已暂停自动同步以防误覆盖`;
                link.blocked = true;
                odSetLink(user, archive, link);
                odRefreshStatusUI();
                return;
            }

            try{
                const json = JSON.stringify(payload, null, 2);
                await plugin.writeText({ uri: link.uri, text: json });
                link.lastSyncAt = Date.now();
                link.lastError = null;
                link.blocked = false;
                link.lastCount = cnt;      // 供下次做塌陷判定
            }catch(err){
                link.lastError = String((err && err.message) || err || '未知错误');
            }
            odSetLink(user, archive, link);
            odRefreshStatusUI();
        }
        function odRefreshStatusUI(){
            const statusEl = $('odStatus'), connBtn = $('odConnectBtn'), disBtn = $('odDisconnectBtn'), nameEl = $('odArchiveName');
            if(!statusEl) return;
            // 1016-W：单号表那一行（开发开关开着、在手机 App 里才有）
            {
                let dev=false; try{ dev=localStorage.getItem('app_dev_import')==='1'; }catch(_){}
                const bar=$('odOrdersBar'), st=$('odOrdersStatus');
                if(bar && st){
                    const show=dev && !!odPlugin();
                    bar.style.display = show ? 'flex' : 'none'; st.style.display = show ? '' : 'none';
                    if(show){
                        const ol=odGetOrdLink();
                        $('odOrdersBtn').textContent = ol && ol.uri ? '换一个单号表云端文件' : '单号表也存一份到云盘（开发中）';
                        st.textContent = !(ol && ol.uri) ? '单号表没上云：换手机后再导同一份账单，要按时间金额认（拿不准的进待处理）'
                            : ol.lastError ? `单号表文件「${ol.name||''}」上次没传上：${ol.lastError}`
                            : ol.lastSyncAt ? `单号表文件「${ol.name||''}」，每次导入后更新（上次 ${new Date(ol.lastSyncAt).toLocaleString()}）`
                            : `单号表文件「${ol.name||''}」，下次导入后更新`;
                    }
                }
            }
            if(nameEl) nameEl.textContent = currentArchive || '';
            const plugin = odPlugin();
            if(!plugin){
                statusEl.textContent = '当前平台不支持（仅安卓 App 内可用）';
                if(connBtn) connBtn.style.display='none';
                if(disBtn) disBtn.style.display='none';
                return;
            }
            if(connBtn) connBtn.style.display='';
            const link = odGetLink();
            if(!link || !link.uri){
                statusEl.textContent = '未连接，记账不会自动同步到云盘';
                if(disBtn) disBtn.style.display='none';
                connBtn.textContent = '连接云盘自动备份';
            } else {
                if(disBtn) disBtn.style.display='';
                connBtn.textContent = '重新选择备份文件';
                // 存档改名后连接仍指向原文件（系统授权只认那一个文件），文件名对不上时说一句，免得误以为断了
                const nameNote = (link.name && link.name!==`记问存档_${currentArchive}.json`)
                    ? '（云盘文件名不随存档改名）' : '';
                if(link.blocked){
                    // 守卫拦下：这不是「会自动重试」的失败，是刻意停住。文案必须说清，
                    // 否则用户以为过会儿就好了，实际永远不会好。
                    statusEl.textContent = `⚠ 自动同步已暂停：${link.lastError}。云端文件保持原样未被改动；`
                        + `确认本地数据无误后，点「重新选择备份文件」恢复同步。`;
                } else if(link.lastError){
                    statusEl.textContent = `已连接「${link.name||'备份文件'}」${nameNote}，最近一次同步失败（${link.lastError}），下次记账会自动重试`;
                } else if(link.lastSyncAt){
                    statusEl.textContent = `已连接「${link.name||'备份文件'}」${nameNote}，最近同步于 ${new Date(link.lastSyncAt).toLocaleString()}`;
                } else {
                    statusEl.textContent = `已连接「${link.name||'备份文件'}」${nameNote}，等待下一次记账/修改后首次同步`;
                }
            }
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
        // 校验并清洗导入的单条记录：金额非正数/非法、类型非法都会被拒，避免脏数据污染结余。
        // 返回 { records, stats }，stats 记录做了哪些「静默修正」，供导入后如实提示用户。
        //   ctx：【1015-B】{ cpsLen, pmsLen } 存档里对方 / 支付方式名单的长度，记录上的编号超出就丢掉这个字段
        function sanitizeImportedRecords(records, ctx){
            const cpsLen=(ctx && ctx.cpsLen) || 0, pmsLen=(ctx && ctx.pmsLen) || 0;
            // 条数上限：超大数组会让 localStorage 写入与后续渲染卡死，直接拒绝
            if(records.length > MAX_IMPORT_RECORDS){ throw new Error('toomany'); }
            const out=[];
            const stats={ dropped:0, timeFixed:0, typeFilled:0 };
            const idMap=new Map(), pend=[];     // 1010-J：旧 id → 新记录；待挂回的退款
            for(const r of records){
                if(!r || typeof r!=='object'){ stats.dropped++; continue; }
                const m=normMoney(r.money);
                if(!m.ok){ stats.dropped++; continue; }              // 金额非法直接丢弃这条

                // 类型：仅接受 expense/income，缺失或非法补为 income 并计数
                let type;
                if(r.type==='expense'||r.type==='income'){ type=r.type; }
                else { type='income'; stats.typeFilled++; }

                // 时间：与存量数据的自检修复共用同一套判定/修复逻辑（isDirtyTime / repairTime），
                //   避免「导入」和「自检」两条路对同一个脏值给出不同结果。
                //   干净值原样保留；脏值优先按「钳制到当月最后一天」修（保住月份归属，
                //   2月30 → 2月28，而不是滚成 3月2 或直接抹成导入时刻）；实在修不出来才回退当前时刻。
                let time;
                const canon=(typeof r.time==='string') ? r.time.trim().replace(' ','T') : r.time;
                // 带秒/毫秒/时区的先截到分钟，再判定
                const mSec=(typeof canon==='string') && canon.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}):\d{2}/);
                const cand=mSec ? mSec[1] : canon;
                if(!isDirtyTime(cand)){
                    time=cand;
                } else {
                    time=repairTime(r.time) || nowDtValue();
                    stats.timeFixed++;
                }

                // 分类名限长，与手动输入的 8 字校验对齐，防止超长名污染分类表/下拉
                let cat = (typeof r.cat==='string' && r.cat.trim()) ? charSlice(r.cat.trim(), 8) : '未分类';
                let remark = (typeof r.remark==='string') ? r.remark.slice(0,5000) : '';
                const rec={ id:genId(), time, money:m.val, cat, remark, type };
                // 不重建会丢：从备份还原后口径标记必须还在
                if(r.skip===true) rec.skip=true; else if(r.flow===true) rec.flow=true;
                // 【1015-B】账单导入带来的字段：合格的照搬，不合格的这个字段不要（记录照留）
                if(r.src && typeof r.src==='object' && IMP_APPS.includes(r.src.app)){
                    rec.src={ app:r.src.app };
                    if(r.src.merged===true) rec.src.merged=true;                                   // 1016-F：本来是手记，合并了账单
                    if(['petty','receipt','suspect'].includes(r.src.sum)) rec.src.sum=r.src.sum;   // 1016-F：分分捐 / 收款这类合并记录
                }
                if(typeof r.batch==='string' && IMP_BATCH_RE.test(r.batch)) rec.batch=r.batch;
                if(Number.isInteger(r.cp) && r.cp>=0 && r.cp<cpsLen) rec.cp=r.cp;
                if(Number.isInteger(r.pm) && r.pm>=0 && r.pm<pmsLen) rec.pm=r.pm;
                if(typeof r.oc==='string' && r.oc.trim()) rec.oc=r.oc.trim().slice(0, 32);
                // 1017-G：AI 标记照搬（ref 等全部记录编好号再换，见下面）
                const af=impCleanAiFlag(r.aiFlag, null); if(af) rec.aiFlag=af;
                if(r.id!=null) idMap.set(String(r.id), rec);
                if(type==='income' && r.refundOf!=null && r.refundOf!=='') pend.push([rec, String(r.refundOf)]);
                out.push(rec);
            }
            // 1017-G：AI 标记说的那一笔换成新编号；文件里没有那一笔就去掉 ref（标记照留）
            out.forEach(rec=>{ if(rec.aiFlag && rec.aiFlag.ref){ const o=idMap.get(rec.aiFlag.ref); if(o && o!==rec) rec.aiFlag.ref=o.id; else delete rec.aiFlag.ref; } });
            // 退款挂回原账单：原账单不在文件里 / 不是支出 / 累计超过原金额的，退化成普通收入（不丢、结余也对）
            const used=new Map();
            pend.forEach(([rec, oldId])=>{
                const o=idMap.get(oldId);
                if(!o || o===rec || o.type!=='expense') return;
                const tot=round2((used.get(o)||0)+rec.money);
                if(tot>o.money) return;
                used.set(o, tot);
                rec.refundOf=o.id; rec.cat=o.cat; setRecMode(rec, recMode(o));
            });
            return { records:out, stats, idMap };
        }

        // 导入的倒数日条数上限。倒数日是账号级的唯一一份（不像存档能并存多个），
        // 没有「新建一个」的退路，所以必须挡住构造出来的超大 days 数组撑爆 localStorage。
        const MAX_IMPORT_DAYS = 200;

        // 清洗导入文件里的 days。口径与 sanitizeImportedRecords 一致：
        // 结构不对一律静默丢弃，绝不抛错——一个坏掉的 days 字段不该拖垮整个账单导入。
        function sanitizeImportedDays(raw){
            if(!Array.isArray(raw)) return [];
            const out=[];
            for(const d of raw){
                if(out.length >= MAX_IMPORT_DAYS) break;
                if(!d || typeof d!=='object') continue;
                const name=(typeof d.name==='string') ? charSlice(d.name.trim(), 8) : '';
                if(!name) continue;
                if(!isValidDay(d.date)) continue;   // '2026-02-30' 在此被拒
                out.push({ id:genId(), name, date:d.date, pin:!!d.pin });
            }
            return out;
        }

        // 把导入的倒数日并进目标账号已有的那份。
        // 按 name+date 去重，已存在的跳过——不覆盖用户自己的数据。
        // 返回实际新增的条数（0 表示全是重复的，或没得可导）。
        function mergeImportedDays(list, targetUser){
            if(!list.length) return 0;
            const cur=loadDays(targetUser);
            const seen=new Set(cur.map(d=>`${d.name}|${d.date}`));
            let added=0;
            for(const d of list){
                const k=`${d.name}|${d.date}`;
                if(seen.has(k)) continue;
                if(cur.length >= MAX_IMPORT_DAYS) break;   // 合并后的总量也受同一上限约束
                seen.add(k); cur.push(d); added++;
            }
            if(added){
                // 存不下就当没导——倒数日不该让已经成功的账单导入回滚
                try{ localStorage.setItem(`days_${targetUser}`, JSON.stringify(cur)); }
                catch(_){ return 0; }
            }
            return added;
        }

        // 核心导入逻辑：解析文本 → 清洗 → 存为目标用户名下的新存档。
        // 返回 { finalName, stats } 或抛错；stats 用于导入后提示静默修正情况。
        //   【1013-D】要等账本确认写进 IndexedDB 才算导入成功（写失败照旧报 quota，什么都不改），所以是 async
        async function importArchiveFromText(text, targetUser){
            const parsed=JSON.parse(text);   // 解析失败由调用方 catch
            const rawRecords=Array.isArray(parsed)?parsed:parsed.data;
            if(!Array.isArray(rawRecords)) throw new Error('bad');
            // 【1015-B】对方 / 支付方式名单先清洗：记录上的编号要对着它们查
            const cps=impCleanNames(parsed && parsed.cps), pms=impCleanNames(parsed && parsed.pms);
            const { records, stats, idMap }=sanitizeImportedRecords(rawRecords, { cpsLen:cps.length, pmsLen:pms.length });
            // 一条有效记录都没有：视为无效文件，避免悄悄建一个空存档
            if(records.length===0) throw new Error('empty');

            // 分类：清洗去空、限长（与记录侧/手动输入的 8 字一致）、去重，确保含「未分类」
            let cats=(parsed && Array.isArray(parsed.cats) && parsed.cats.length)
                ? parsed.cats.map(c=>charSlice(String(c).trim(), 8)).filter(Boolean)
                : DEFAULT_CATS.slice();
            cats=[...new Set(cats)];
            if(!cats.includes('未分类')) cats.unshift('未分类');
            // 把记录里用到、但分类表没有的分类补进去（记录侧分类名已在清洗时限长）
            records.forEach(r=>{ if(!cats.includes(r.cat)) cats.push(r.cat); });

            // 存档名清洗：去空、限长，重名自动加序号
            let name=(parsed && typeof parsed.archive==='string' && parsed.archive.trim())
                ? parsed.archive.trim().slice(0,16) : '导入存档';

            // 直接对目标用户的 store 读写，全程不触碰全局 currentUser。
            // 这样即便中途有异步回调/重入读到 currentUser，也始终是当前登录用户，不会写错账号。
            let finalName=name;
            const store=loadStore(targetUser);
            let n=1;
            while(store.archives[finalName]) finalName=`${name}(${n++})`;
            // 预算：只收「分类表里存在、金额合法」的项，旧备份没有 budgets 字段 → 空对象
            const budgets={};
            if(parsed && parsed.budgets && typeof parsed.budgets==='object' && !Array.isArray(parsed.budgets)){
                Object.keys(parsed.budgets).forEach(k=>{
                    const c=charSlice(String(k).trim(), 8);
                    const v=normMoney(parsed.budgets[k]);
                    if(c && cats.includes(c) && v.ok) budgets[c]=v.val;
                });
            }
            // 常用模板：逐条清洗，分类不在分类表里的丢掉；旧备份没有 tpls 字段 → 空数组
            const tpls=sanitizeTpls(parsed && parsed.tpls, cats);
            // 【1015-B】导入的规则、名单照原样保留；导入记录、待处理池、单号表里的记录 id 换成这次重新编的号
            //   （导入备份总是新建一个存档、每条记录重新编号，idMap：文件里的旧 id → 新记录）
            const mapId=old=>{ const r=(typeof old==='string' && old) ? idMap.get(old) : null; return r ? r.id : null; };
            const importRules=impCleanRules(parsed && parsed.importRules, cats);
            const arch={ records, cats, budgets, tpls };
            if(cps.length) arch.cps=cps;
            if(pms.length) arch.pms=pms;
            if(importRules) arch.importRules=importRules;
            const impLog=impCleanLog(parsed && parsed.imports, mapId, cats, cps.length, pms.length);
            const impPend=impCleanPending(parsed && parsed.pending, mapId);
            store.archives[finalName]=arch;
            store.last=finalName;
            // 单号表、待处理池、导入记录和账本放进同一个事务：要么全进去，要么全不算
            await saveStoreDurable(store, targetUser, e=>{
                const aid=e.names.get(finalName);
                const pairs=impCleanOrdersFromBackup(parsed && parsed.orders, mapId, e.id, aid).pairs;
                if(impLog.length) pairs.push([impLogKey(e.id, aid), JSON.stringify({ v:1, list:impLog })]);
                if(impPend.length) pairs.push([impPendKey(e.id, aid), JSON.stringify({ v:1, items:impPend })]);
                return pairs;
            });   // 抛错（配额满等）由调用方 catch 处理

            // 倒数日：「文件里的账号 === 要导进的账号」时自动合并。
            //   存档可以并存十份（重名自动加序号，从不覆盖），倒数日却是账号级的唯一一份，
            //   没有「新建一个」的退路——写进去就只能是合并或覆盖。所以别的账号的倒数日不能默认收。
            //   主流场景是换手机自导自，user 天然相等，无感还原。
            //   旧备份文件没有 days 字段 → sanitize 收到 undefined 返回 []，向后兼容。
            //   【1010-K6】账号不同时不再悄悄跳过：把「目标账号里还没有的」那几条交回调用方，
            //   由调用方问一句要不要一起导入（见 askImportOtherDays）。旧备份没有 user 字段的照旧不收。
            let daysAdded=0, daysPending=null;
            //   【1010-K7】「同一个账号」先看账号编号；旧备份没有编号，退回去比名字。
            const hasId=parsed && isAccountId(parsed.accountId);
            if(parsed && (hasId || typeof parsed.user==='string')){
                const list=sanitizeImportedDays(parsed.days);
                const same = hasId ? parsed.accountId===targetUser : parsed.user===nameOf(targetUser);
                if(same){
                    daysAdded=mergeImportedDays(list, targetUser);
                } else if(list.length){
                    const seen=new Set(loadDays(targetUser).map(d=>`${d.name}|${d.date}`));
                    const fresh=list.filter(d=>!seen.has(`${d.name}|${d.date}`));
                    if(fresh.length) daysPending={ list:fresh, fromUser:(typeof parsed.user==='string' ? parsed.user : '') };
                }
            }
            return { finalName, stats, daysAdded, daysPending };
        }

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

        function getCats(){ return curArchive(loadStore()).cats; }
        function fillSelect(sel, cats, selected){
            sel.innerHTML='';
            cats.forEach(c=>{
                const o=document.createElement('option');
                o.value=c; o.textContent=c;
                if(c===selected) o.selected=true;
                sel.appendChild(o);
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

        // 【1013-G】只拷当前存档的记录数组（浅拷贝），不用把整个 store 都拼出来
        function getUserData(){
            const e=__ledger.get(storeKey());
            const aid=e && e.has ? e.names.get(currentArchive) : undefined;
            const st=aid ? e.archs.get(aid) : undefined;
            if(!st) return curArchive(loadStore()).records;
            return ledgerTagRecords(st.recs.slice(), aid);
        }
        // silent=true 时不弹通用失败提示，由调用方自行给出对症提示（避免同一次失败连弹两个弹窗）
        //   【1013-D】saveStore 改成先改内存、再异步写库，这里不会再同步拿到失败；
        //   写库失败由 ledgerWriteSoon 统一提示一次，修改留在内存里，下次保存 / 切后台时再写。
        function saveUserData(data, silent){
            const store=loadStore(); curArchive(store).records=data;
            store.last=currentArchive;
            let ok;
            if(silent){
                try{ ok = saveStore(store); }
                catch(_){ ok = false; }
            } else {
                ok = saveStoreSafe(store);
            }
            if(ok) odScheduleSync(); // 记一笔/改一笔成功后，防抖着自动同步到已连接的 OneDrive 文件
            return ok;
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

        function pad(n){ return String(n).padStart(2,'0'); }

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
        // 当前时刻的规范格式 YYYY-MM-DDTHH:mm
        function nowDtValue(){
            const n=new Date();
            return `${n.getFullYear()}-${pad(n.getMonth()+1)}-${pad(n.getDate())}T${pad(n.getHours())}:${pad(n.getMinutes())}`;
        }

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
        // ===== 底部浮层的「往下拉关闭」（1017-UI1 从筛选浮层里抽出来，筛选浮层和导入页的选择面板共用）=====
        //   sheetMask：遮罩（带 .open 时才接手势）；sheet：面板（.sheet）；grip：顶部抓手区（鼠标拖拽用）；onDismiss：拉够了要关时调
        //   返回 { reset }：把拖到一半的位移、过渡复位（打开 / 关闭时调）
        // 1019-B：.form-mask（老弹窗换成的底部面板）显示出来（display:flex）就算开着，不靠 .open 类
        function sheetShown(m){ return m.classList.contains('open') || (m.classList.contains('form-mask') && m.style.display==='flex'); }
        function bindSheetDrag(sheetMask, sheet, grip, onDismiss){
            // ===== 下滑手势关闭 =====
            // 【1010-F】触屏上整片面板都能下拉关闭（此前只有顶部抓手区能拉）。
            //   规则：手指向下、偏竖直、且面板内容已滚到顶 → 接管为「下拉关闭」；
            //         否则交还给原生滚动（面板内容没到顶时往下拉就是往回滚）。
            //   点按不受影响：位移不超过 DRAG_SLOP 不算拖。
            //   刻意不做「点面板外关闭」：误触一下就丢掉填好的条件，代价太大。
            // 灵敏度比之前调低一档：
            //   · 关闭距离：至少 140px，且不少于面板高度的 28%
            //   · 快速甩动：要拉过 80px 且末段速度 > 0.8px/ms 才算
            //   · 跟手有 0.8 的阻尼，拉起来略「沉」，不容易一碰就飞
            const DRAG_SLOP=10, DISMISS_MIN=140, DISMISS_RATIO=0.28, FLING_MIN_PX=80, FLING_V=0.8, DRAG_RESIST=0.8;
            function dismissDistance(){ return Math.max(DISMISS_MIN, (sheet.offsetHeight||0)*DISMISS_RATIO); }
            let tCand=false, tDrag=false, tY0=0, tX0=0, tDY=0, tLastY=0, tLastT=0, tVel=0;
            function touchReset(){ tCand=false; tDrag=false; tDY=0; tVel=0; }
            sheet.addEventListener('touchstart', e=>{
                if(!sheetShown(sheetMask) || e.touches.length!==1){ touchReset(); return; }
                const p=e.touches[0];
                tCand=true; tDrag=false; tY0=p.clientY; tX0=p.clientX; tDY=0;
                tLastY=p.clientY; tLastT=Date.now(); tVel=0;
            }, {passive:true});
            sheet.addEventListener('touchmove', e=>{
                if(!tCand) return;
                const p=e.touches[0];
                const dy=p.clientY-tY0, dx=p.clientX-tX0;
                if(!tDrag){
                    const atTop = sheet.scrollTop<=0;
                    // 已在顶部还往下拉：原生这时也滚不动，先拦住，免得浏览器把这次手势「认领」成滚动
                    if(dy>0 && atTop && e.cancelable) e.preventDefault();
                    if(Math.abs(dy)<DRAG_SLOP && Math.abs(dx)<DRAG_SLOP) return;
                    if(dy>0 && atTop && Math.abs(dy)>Math.abs(dx)*1.2){
                        tDrag=true; sheet.style.transition='none';
                    } else { tCand=false; return; }   // 横向 / 向上 / 内容没到顶：交给原生
                }
                if(e.cancelable) e.preventDefault();
                tDY=Math.max(0, dy-DRAG_SLOP)*DRAG_RESIST;
                sheet.style.transform=`translateY(${tDY}px)`;
                const now=Date.now();
                if(now>tLastT){ tVel=(p.clientY-tLastY)/(now-tLastT); tLastY=p.clientY; tLastT=now; }
            }, {passive:false});
            sheet.addEventListener('touchend', ()=>{
                if(!tDrag){ touchReset(); return; }
                const close = tDY>dismissDistance() || (tDY>FLING_MIN_PX && tVel>FLING_V);
                if(close) sheet.__dragY=tDY;   // 1019-N：关掉时的影子从手指拉到的地方接着往下滑
                sheet.style.transition=''; sheet.style.transform='';
                touchReset();
                if(close) onDismiss();
            }, {passive:true});
            sheet.addEventListener('touchcancel', ()=>{
                sheet.style.transition=''; sheet.style.transform=''; touchReset();
            }, {passive:true});

            // 鼠标（桌面调试）仍走抓手区拖拽；触屏的 pointer 事件交给上面的 touch 逻辑，避免双触发。
            const DRAG_DISMISS_PX = DISMISS_MIN;   // 与触屏同一档
            const DRAG_FLING_PX   = FLING_MIN_PX;
            let dragStartY=0, dragDY=0, dragging=false, dragStartT=0, dragId=null;

            function resetSheetDrag(){
                dragging=false; dragDY=0; dragId=null;
                touchReset();
                sheet.style.transition='';
                sheet.style.transform='';
            }
            function onDragStart(e){
                if(!sheetShown(sheetMask)) return;
                if(e.pointerType && e.pointerType!=='mouse') return;   // 触屏走 touch 那套
                const pt=e.touches?e.touches[0]:e;
                dragging=true; dragStartY=pt.clientY; dragDY=0; dragStartT=Date.now();
                dragId = (e.pointerId!=null)?e.pointerId:null;
                sheet.style.transition='none';
                // 锁定后续 pointer 事件到 grip，保证 move/up 一定收得到
                if(dragId!=null && grip.setPointerCapture){
                    try{ grip.setPointerCapture(dragId); }catch(_){}
                }
            }
            function onDragMove(e){
                if(!dragging) return;
                const pt=e.touches?e.touches[0]:e;
                dragDY=(pt.clientY-dragStartY)*DRAG_RESIST;
                if(dragDY<0) dragDY=0;             // 只允许下拉
                // 非 passive：阻止默认滚动/回弹，手势完全归我们
                if(e.cancelable) e.preventDefault();
                sheet.style.transform=`translateY(${dragDY}px)`;
            }
            function onDragEnd(){
                if(!dragging) return;
                const dt=Date.now()-dragStartT;
                const fling = dragDY>DRAG_FLING_PX && dt<200;   // 快速下滑也算关闭（门槛与触屏同档）
                sheet.style.transition='';
                sheet.style.transform='';
                if(dragId!=null && grip.releasePointerCapture){
                    try{ grip.releasePointerCapture(dragId); }catch(_){}
                }
                const shouldClose = dragDY>DRAG_DISMISS_PX || fling;
                if(shouldClose) sheet.__dragY=dragDY;
                dragging=false; dragDY=0; dragId=null;
                if(shouldClose) onDismiss();
            }
            // 有 PointerEvent 用 pointer 一套，否则回退 touch，避免双触发。
            // move 用 {passive:false} 才能 preventDefault。
            if(window.PointerEvent){
                grip.addEventListener('pointerdown', onDragStart, {passive:true});
                grip.addEventListener('pointermove', onDragMove, {passive:false});
                grip.addEventListener('pointerup', onDragEnd, {passive:true});
                grip.addEventListener('pointercancel', onDragEnd, {passive:true});
            }
            // 没有 PointerEvent 的老 WebView：触屏已由上面整片面板的 touch 逻辑覆盖，这里不再重复绑。
            return { reset: resetSheetDrag };
        }
