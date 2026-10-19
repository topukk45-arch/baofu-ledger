        function saveDays(list, user){
            try{
                localStorage.setItem(daysKey(user), JSON.stringify(list));
                // 倒数日也在 odBuildPayload 的打包范围内，改完同样要同步（见 saveStoreSafe 处注释）
                if(user===undefined || user===currentUser) odScheduleSync();
                return true;
            }catch(err){
                customAlert('存储空间已满，这个日子没能保存。请删除部分记录后重试。', '保存失败');
                return false;
            }
        }

        // 计算天数差。
        // 【不用 (t1-t0)/86400000】那种毫秒除法在有夏令时的时区会算错（少/多一天），
        //   国内虽无夏令时，但没必要留这个坑。直接把两个日期都归一到「当天 00:00 的本地时刻」
        //   再比较，语义清楚且与时区无关。
        // 返回 { state:'today'|'future'|'past', n }，n 为天数（today 时为 0）。
        function calcDay(dateStr){
            const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
            if(!m) return { state:'today', n:0 };
            const target=new Date(+m[1], +m[2]-1, +m[3]);   // 本地 00:00
            const now=new Date();
            const today=new Date(now.getFullYear(), now.getMonth(), now.getDate());
            // 两者都是本地零点，相差必为整数天（夏令时下也用 round 兜一层）
            const diff=Math.round((target-today)/86400000);
            if(diff===0) return { state:'today',  n:0 };
            if(diff>0)   return { state:'future', n:diff };
            return { state:'past', n:-diff };
        }

        const DAY_WEEK=['日','一','二','三','四','五','六'];
        function fmtDayDate(s){
            const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
            if(!m) return s;
            const d=new Date(+m[1], +m[2]-1, +m[3]);
            return `${s} 星期${DAY_WEEK[d.getDay()]}`;
        }

        // 排序：置顶优先 → 今天 → 未来（近→远）→ 过去（近→远）。
        // 【只做置顶 + 自动排序，不做拖拽】草图里两者并存是矛盾的——用户手动拖完，
        //   下次打开又被自动排序打乱。倒数日的核心诉求就是「最近的那个」，自动排序
        //   天然满足；「置顶」已经提供了「我要它在最上面」的能力，够用了。
        //
        // 【坑】calcDay().n 是绝对值：3 天前和 3 天后都是 n=3。早先直接拿 n 升序排，
        //   等于把过去和未来混在一起——「3 天前的纪念日」会压在「5 天后的截止日」上面，
        //   「100 天前的旧事」又插在「200 天后的远期」前面。倒数日的重心是未来，
        //   必须先按 state 分组，再在组内比距离。
        const DAY_STATE_RANK={ today:0, future:1, past:2 };
        function sortedDays(list){
            return list.slice().sort((a,b)=>{
                const pa=a.pin?1:0, pb=b.pin?1:0;
                if(pa!==pb) return pb-pa;                     // 置顶在前
                const ca=calcDay(a.date), cb=calcDay(b.date);
                const ra=DAY_STATE_RANK[ca.state], rb=DAY_STATE_RANK[cb.state];
                if(ra!==rb) return ra-rb;                     // 今天 → 未来 → 过去
                return ca.n - cb.n;                           // 组内：距今越近越靠前
            });
        }

        // 渲染一行的「还有/已经 N 天」右侧部分（入口卡与管理页共用同一套口径）
        function dayNumHtml(c, cls){
            if(c.state==='today') return `<span class="${cls}-today">就是今天</span>`;
            const word = c.state==='future' ? '还有' : '已经';
            const fut  = c.state==='future' ? ' future' : '';
            return `<span class="${cls}-word">${word}</span>`
                 + `<span class="${cls}-num${fut}">${c.n}</span>`
                 + `<span class="${cls}-unit">天</span>`;
        }

        // ===== 入口卡显示条数（可配置）=====
        // 【为什么有上限 99】需求是「上不封顶」，但输入框只允许两位数，所以实际天花板就是 99。
        //   这没有削弱需求：入口卡是记账页顶部的一张小卡，真要展示 99 条也早就滚出屏幕了；
        //   而且超出的条目在日子页里一条不少，纯粹是「露多少」的问题，不涉及丢数据。
        const DAYS_CARD_MIN=3, DAYS_CARD_MAX=99, DAYS_CARD_DEFAULT=3;
        function daysCardKey(user){ return `days_card_n_${user!==undefined ? user : currentUser}`; }
        // 读取时也钳一道：localStorage 是用户可改的，别信它写回来的值
        function getDaysCardN(){
            const raw=parseInt(localStorage.getItem(daysCardKey()), 10);
            if(!isFinite(raw)) return DAYS_CARD_DEFAULT;
            return Math.min(Math.max(raw, DAYS_CARD_MIN), DAYS_CARD_MAX);
        }
        function setDaysCardN(n){
            const v=Math.min(Math.max(safeNum(n)|0, DAYS_CARD_MIN), DAYS_CARD_MAX);
            localStorage.setItem(daysCardKey(), String(v));
            return v;
        }

        // ===== 记账页的入口卡 =====
        function renderDaysCard(){
            const box=$('daysEntryRows');
            if(!box) return;
            const list=sortedDays(loadDays());
            if(!list.length){
                // 空态：整行变成添加入口，点一下直接进管理页并弹出添加表单
                box.innerHTML='<div class="days-empty-row" data-day-act="add">＋ 添加你的第一个日子</div>';
                return;
            }
            box.innerHTML=list.slice(0, getDaysCardN()).map(d=>{
                const c=calcDay(d.date);
                return `<div class="days-row" data-day-act="edit" data-day-id="${escapeHtml(d.id)}">`
                    + `<span class="d-name">${d.pin?'<span class="pin">★</span>':''}${escapeHtml(d.name)}</span>`
                    + `<span class="d-right">${dayNumHtml(c,'d')}</span>`
                    + `</div>`;
            }).join('');
        }

        // 入口卡事件委托：点某一条 → 直接编辑它（常用操作不必先进管理页）；点空态 → 去添加
        $('daysEntryRows').addEventListener('click', e=>{
            const el=e.target.closest('[data-day-act]');
            if(!el) return;
            if(el.dataset.dayAct==='add'){ gotoDaysPage(); openDayDialog(null); }
            else if(el.dataset.dayAct==='edit'){ openDayDialog(el.dataset.dayId); }
        });
        $('daysManageBtn').addEventListener('click', gotoDaysPage);

        // ===== 管理页 =====
        // 它是记账页的子页：进入时把 pageLedger 藏起来、pageDays 显示，底部 tab 仍停在「记账」。
        function gotoDaysPage(){
            saveLedgerScroll();   // 1017-F：从「日子」管理页回来也放回原处
            $('pageLedger').style.display='none';
            $('pageDays').style.display='block';
            $('actionBar').style.display='none';    // 子页里不该有「筛选 / 记一笔」
            const tt=$('toTopBtn');        if(tt) tt.classList.remove('show');
            const cf=$('clearFilterFab');  if(cf) cf.classList.remove('show');
            document.body.classList.remove('tab-ledger');   // 去掉为记账页底部常驻条留的内边距
            renderDaysList();
            window.scrollTo(0,0);
        }
        function backFromDaysPage(){
            if(daysSelecting) exitSelectMode();   // 别把选择模式带出这一页
            $('pageDays').style.display='none';
            switchTab('ledger');            // 交回 switchTab 统一处理显隐/底栏/浮钮，别自己拼
            renderDaysCard();               // 可能改过，刷新入口卡
        }
        $('daysBack').addEventListener('click', backFromDaysPage);
        $('daysAdd').addEventListener('click', ()=>openDayDialog(null));

        // ===== 1019-B：底部面板式的弹窗，往下拉 / 返回键关闭走同一个出口 =====
        //   记一笔、修改账单、日子这三个填表的：填过东西（和打开时比变了）先问「放弃这次填写？」，没填过直接关；
        //   别的弹窗直接关（和点它的「关闭 / 取消」一样）。点弹窗里的「关闭 / 取消」按钮照旧直接关，不问。
        const FORM_CLOSE={
            addMask:()=>{ $('addMask').style.display='none'; },
            editMask:()=>closeEditModal(),
            detailMask:()=>closeDetail(),
            refundMask:()=>closeRefund(),
            tplMask:()=>{ $('tplMask').style.display='none'; },
            tplEditMask:()=>closeTplEditor(),
            txtMask:()=>closeText(),
            kpMask:()=>kpClose(),
            catMask:()=>{ $('catMask').style.display='none'; },
            themeMask:()=>{ $('themeMask').style.display='none'; },
            dtMask:()=>closeDtPicker(),   // 和原来返回键一样：直接关，不算「取消」回调
            devImportMask:()=>{ const c=$('devImportClose'); if(c) c.click(); },
            aiExpMask:()=>{ $('aiExpMask').style.display='none'; },
            dayMask:()=>closeDayDialog(),
            dayMgrMask:()=>closeDayMgr(),
            ymMask:()=>{ $('ymMask').style.display='none'; },
        };
        const FORM_ASK=['addMask','editMask','dayMask','tplEditMask','txtMask'];
        const formSnaps={};
        // 表单现在的样子：输入框、日期、选中的标签、开关（打开时记一份，关的时候比一比）
        function formState(id){
            const m=$(id); if(!m) return '';
            const parts=[];
            m.querySelectorAll('input,textarea,select').forEach(e=>parts.push(e.value));
            m.querySelectorAll('.dt-input').forEach(e=>parts.push(e.dataset.day||'', e.dataset.value||'', e.value||'', e.textContent));
            m.querySelectorAll('.cc, .day-switch').forEach(e=>parts.push(e.className));
            return JSON.stringify(parts);
        }
        function formDirty(id){ return formSnaps[id]!=null && formState(id)!==formSnaps[id]; }
        function formBackClose(id){
            const close=FORM_CLOSE[id]; if(!close) return;
            if(!FORM_ASK.includes(id) || !formDirty(id)){ close(); return; }
            customConfirm('填的内容还没保存，关掉就没了。', ()=>{ if($(id).style.display==='flex') close(); },
                '放弃这次填写？', { danger:true, okText:'放弃，关掉', cancelText:'接着填' });
        }
        window.__formDirty=formDirty;   // 给测试用
        Object.keys(FORM_CLOSE).forEach(id=>{
            const m=$(id); if(!m) return;
            const sheet=m.querySelector('.sheet'), grip=m.querySelector('.sheet-grip');
            if(sheet && grip) bindSheetDrag(m, sheet, grip, ()=>{ if(m.style.display==='flex') formBackClose(id); });
            if(FORM_ASK.includes(id)){
                // 一打开就记下表单的样子（打开的代码同步写完值以后，MutationObserver 才回调）
                let was=m.style.display;
                new MutationObserver(()=>{
                    const now=m.style.display;
                    if(now==='flex' && was!=='flex') formSnaps[id]=formState(id);
                    if(now!=='flex'){ delete formSnaps[id]; if(was==='flex' && currentUser) try{ localStorage.removeItem('app_formdraft_'+currentUser); }catch(_){} }   // 1019-F：关掉了，填到一半的草稿不要了
                    was=now;
                }).observe(m, { attributes:true, attributeFilter:['style'] });
            }
        });

        // ===== 1019-P：金额用 App 自己的数字键盘 =====
        //   记一笔 / 修改的金额、模板的固定金额、筛选的金额区间、要金额的输入提示框（预算、补金额）：点了从底部滑出数字键盘，不弹系统输入法。
        //   每按一个键金额框实时变；不做加减、不做粘贴，只从末尾输入和退格，最多两位小数、开头不能多个 0、整数最多 KP_INT_MAX 位。
        //   关法：大按钮、键盘外面点一下或滑一下（这一下照常交给页面，不吞掉）、往下拉、返回键，都走收起动画；不管怎么关，输入的数字原样留着。
        //   已经有金额再打开：接着输（照微信转账），不整个替换——替换容易一碰就把原来的数清掉。
        //   设置里「用系统键盘输入金额」打开就照旧用系统输入法。
        const KP_INT_MAX=8;
        const KP_FIELDS={ billMoney:'确定', editMoney:'确定', tplEditMoney:'确定', searchMin:'确定', searchMax:'确定' };
        let kpTarget=null, kpOnOk=null, kpHost=null;
        function kpOn(){ try{ return localStorage.getItem('app_sys_money_kb')!=='1'; }catch(_){ return true; } }
        function kpFieldSet(el, on){
            if(!el) return;
            el.readOnly=on; el.classList.toggle('kp-field', on);
            if(on) el.setAttribute('inputmode', 'none'); else el.setAttribute('inputmode', 'decimal');
        }
        function kpApply(){ Object.keys(KP_FIELDS).forEach(id=>kpFieldSet($(id), kpOn())); }
        function kpPaint(){
            const v=kpTarget ? kpTarget.value : '';
            $('kpVal').textContent=v || '0.00'; $('kpVal').classList.toggle('kp-empty', !v);
        }
        function kpKey(k){
            const el=kpTarget; if(!el) return;
            let v=el.value||'';
            if(k==='del') v=v.slice(0, -1);
            else if(k==='.'){ if(v.indexOf('.')>=0) return; v = v ? v+'.' : '0.'; }
            else {
                const p=v.split('.');
                if(p.length>1){ if(p[1].length>=2) return; v+=k; }
                else if(p[0]==='0') v=k;
                else { if(p[0].length>=KP_INT_MAX) return; v+=k; }
            }
            el.value=v;
            el.dispatchEvent(new Event('input', { bubbles:true }));
            kpPaint();
        }
        // 把金额框滚到键盘上面：它所在的面板底下先垫一块键盘那么高的空白，再滚
        function kpReveal(){
            const el=kpTarget; if(!el) return;
            const host=el.closest('.sheet'); kpHost=host;
            const kh=$('kpSheet').getBoundingClientRect().height || 320;
            // 1019-Y：记一笔 / 修改（有贴底的保存那排）不垫空白：键盘盖住保存那排，金额、收支、分类在键盘上面；别的（模板、筛选、提示框）照旧垫一块再滚
            if(host && !host.querySelector('.rec-foot')){ host.style.setProperty('--kp-h', Math.round(kh)+'px'); host.classList.add('kp-lift'); }
            const kTop=(window.visualViewport ? visualViewport.height : window.innerHeight) - kh;
            const r=el.getBoundingClientRect(), over=r.bottom + 12 - kTop;
            if(over>0 && host) host.scrollTop += over;
        }
        function kpOpen(el, opts){
            opts=opts||{};
            if(kpTarget && kpTarget!==el) kpTarget.classList.remove('kp-on');
            kpTarget=el; kpOnOk=opts.onOk||null;
            el.classList.add('kp-on');
            $('kpOk').textContent=opts.ok || KP_FIELDS[el.id] || '确定';
            kpPaint();
            const shownNow=$('kpMask').style.display==='flex';
            $('kpMask').style.display='flex';
            if(shownNow) kpReveal(); else requestAnimationFrame(kpReveal);
        }
        function kpClose(){
            kpDelStop();   // 1019-Z2：长按退格时键盘关了，停下
            if($('kpMask').style.display!=='flex' && !kpTarget) return;
            $('kpMask').style.display='none';
            if(kpTarget) kpTarget.classList.remove('kp-on');
            if(kpHost) kpHost.classList.remove('kp-lift');
            kpTarget=null; kpOnOk=null; kpHost=null;
        }
        window.kpOpen=kpOpen; window.kpClose=kpClose;   // 给测试用
        $('kpGrid').addEventListener('click', e=>{
            const b=e.target.closest('.kp-key'); if(!b) return;
            if(b.id==='kpOk'){ const f=kpOnOk; kpClose(); if(f) f(); return; }
            if(b.id==='kpDel' && kpDelSkipClick){ kpDelSkipClick=false; return; }   // 1019-Z2：按下时已经删过了（长按那套），这一下 click 不再删
            kpKey(b.dataset.k);
        });
        // 1019-Z2：退格长按连续删：按下先删一个，停 KP_DEL_FIRST（400 毫秒）后开始连续删，先每 100 毫秒一个，按住超过 1 秒后每 50 毫秒一个，
        //   删到空为止；松手、被打断、手指滑出按键立刻停（触屏按下以后事件一直送给这个键，所以每次移动都看手指还在不在键上）
        const KP_DEL_FIRST=400, KP_DEL_SLOW=100, KP_DEL_FAST=50, KP_DEL_SPEEDUP=1000;
        var kpDelT=null, kpDelAt=0, kpDelSkipClick=false;   // var：kpClose 在上面，早调用也不会因为还没初始化报错
        function kpDelStop(){ if(kpDelT){ clearTimeout(kpDelT); kpDelT=null; } $('kpDel').classList.remove('kp-pressed'); }
        function kpDelTick(){
            kpDelT=null;
            if(!kpTarget || !(kpTarget.value||'')){ kpDelStop(); return; }
            kpKey('del');
            if(!(kpTarget.value||'')){ kpDelStop(); return; }
            kpDelT=setTimeout(kpDelTick, (performance.now()-kpDelAt)>=KP_DEL_SPEEDUP ? KP_DEL_FAST : KP_DEL_SLOW);
        }
        (function(){
            const del=$('kpDel');
            del.addEventListener('pointerdown', e=>{
                if(e.button!=null && e.button>0) return;
                kpDelSkipClick=true; kpDelStop();
                del.classList.add('kp-pressed');
                kpDelAt=performance.now();
                kpKey('del');
                if(kpTarget && (kpTarget.value||'')) kpDelT=setTimeout(kpDelTick, KP_DEL_FIRST);
            });
            del.addEventListener('pointermove', e=>{
                if(!del.classList.contains('kp-pressed') || e.clientX==null) return;
                const r=del.getBoundingClientRect();
                if(r.width && (e.clientX<r.left || e.clientX>r.right || e.clientY<r.top || e.clientY>r.bottom)) kpDelStop();
            });
            ['pointerup','pointercancel','pointerleave'].forEach(ev=>del.addEventListener(ev, kpDelStop));
        })();
        // 键盘外面点一下 / 开始滑：收起键盘，这一下照常交给页面（不拦）；点的是另一个金额框就换过去
        const kpOutside=e=>{
            if($('kpMask').style.display!=='flex') return;
            const t=e.target;
            if($('kpSheet').contains(t) || t===kpTarget) return;
            if(t && t.classList && t.classList.contains('kp-field')) return;   // 换到另一个金额框：由它自己的点击接手
            kpClose();
        };
        if(window.PointerEvent) document.addEventListener('pointerdown', kpOutside, true);
        else document.addEventListener('touchstart', kpOutside, { capture:true, passive:true });
        Object.keys(KP_FIELDS).forEach(id=>{
            const el=$(id); if(!el) return;
            const go=e=>{ if(!kpOn()) return; if(e && e.type==='focus') el.blur(); kpOpen(el); };
            el.addEventListener('click', go);
            el.addEventListener('focus', go);
        });
        // 输入提示框要金额的（预算、补金额）：也用数字键盘，大按钮直接提交提示框
        askInput.addEventListener('click', ()=>{ if(askInput.dataset.kp==='1') kpOpen(askInput, { ok:askInput.dataset.kpOk||'确定', onOk:()=>askOk.click() }); });
        askInput.addEventListener('focus', ()=>{ if(askInput.dataset.kp==='1'){ askInput.blur(); kpOpen(askInput, { ok:askInput.dataset.kpOk||'确定', onOk:()=>askOk.click() }); } });
        kpApply();
        (function(){
            const seg=$('sysMoneyKbSeg'); if(!seg) return;
            function paint(){ const sys=!kpOn(); seg.querySelectorAll('button').forEach(b=>b.classList.toggle('on', (b.dataset.v==='on')===sys)); }
            seg.querySelectorAll('button').forEach(b=>b.addEventListener('click', ()=>{
                try{ if(b.dataset.v==='on') localStorage.setItem('app_sys_money_kb', '1'); else localStorage.removeItem('app_sys_money_kb'); }catch(_){}
                kpClose(); kpApply(); paint();
            }));
            paint();
        })();

        // ===== 1019-O：文字输入的小面板 =====
        //   这些输入框不再直接弹系统键盘（readonly + inputmode=none）：点了弹 #txtMask（标题、一个输入框、确定 / 取消），
        //   等小面板滑上来再聚焦；确定把字写回原来的框（发 input / change），取消什么都不改；回到原来的面板。
        //   返回键：键盘开着时系统先收键盘，再按关小面板，再按才关原来的面板。
        const TXT_FIELDS={
            billRemark:{ title:'备注', multi:true }, editRemark:{ title:'备注', multi:true }, refundRemark:{ title:'备注（选填）', multi:true },
            tplEditName:{ title:'模板名字（最多 10 字）' }, tplEditRemark:{ title:'备注', multi:true },
            dayName:{ title:'日子名称（最多 8 字）' }, newCatName:{ title:'新分类名称（最多 8 字）' }, searchKeyword:{ title:'备注关键词' },
        };
        // 写完以后让原来面板的保存按钮露出来（原来 1010-K5 是点备注时滚）
        const TXT_REVEAL={ billRemark:'addBill', editRemark:'saveEdit' };
        let txtTarget=null;
        const txtIn=()=>$(TXT_FIELDS[txtTarget.id].multi ? 'txtArea' : 'txtInput');
        function txtCount(){ const el=txtIn(), mx=txtTarget && txtTarget.maxLength>0 ? txtTarget.maxLength : 0; $('txtCount').textContent = mx && mx<200 ? `${charLen(el.value)} 字` : ''; }
        function openTextPanel(el){
            const cfg=TXT_FIELDS[el.id]; if(!cfg) return;
            txtTarget=el;
            $('txtTitle').textContent=cfg.title;
            const multi=!!cfg.multi;
            $('txtArea').style.display=multi ? '' : 'none'; $('txtInput').style.display=multi ? 'none' : '';
            const inp=txtIn();
            inp.value=el.value; inp.placeholder=el.placeholder||'';
            if(el.maxLength>0) inp.maxLength=el.maxLength; else inp.removeAttribute('maxlength');
            txtCount();
            $('txtMask').style.display='flex';
            afterOpenAnim($('txtMask'), ()=>{ if($('txtMask').style.display!=='flex' || txtTarget!==el) return; try{ inp.focus(); const n=inp.value.length; inp.setSelectionRange(n, n); }catch(_){} });
        }
        function closeText(){ $('txtMask').style.display='none'; try{ txtIn().blur(); }catch(_){} txtTarget=null; }
        function txtOk(){
            const el=txtTarget; if(!el) return;
            el.value=txtIn().value;
            closeText();
            el.dispatchEvent(new Event('input', { bubbles:true })); el.dispatchEvent(new Event('change', { bubbles:true }));
            const b=TXT_REVEAL[el.id];
            if(b && window.__revealSave){ setTimeout(()=>window.__revealSave(el, $(b)), 60); }
        }
        $('txtOk').addEventListener('click', txtOk);
        $('txtCancel').addEventListener('click', closeText);
        $('txtInput').addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); txtOk(); } });
        ['txtInput','txtArea'].forEach(id=>$(id).addEventListener('input', txtCount));
        Object.keys(TXT_FIELDS).forEach(id=>{
            const el=$(id); if(!el) return;
            el.readOnly=true; el.setAttribute('inputmode', 'none'); el.classList.add('txt-field');
            const go=e=>{ if($('txtMask').style.display==='flex') return; if(e && e.type==='focus') el.blur(); openTextPanel(el); };
            el.addEventListener('click', go);
            el.addEventListener('focus', go);
        });
        window.openTextPanel=openTextPanel;   // 给测试用

        // ===== 1019-N：所有底部面板关闭都有收起动画 =====
        //   不管怎么关（返回键、侧滑返回、取消 / 确定、往下拉、代码里关），面板一 display:none，就在原地放一个「影子」：
        //   照着关之前的样子复制一份（没有 id、点不动），往下滑走 + 遮罩淡出（SHEET_OUT_MS，和往下拉松手后差不多），收完就移除。
        //   真正的面板当场就关了，所以关掉以后的状态、逻辑和以前完全一样，不用每个面板各写一份。
        //   影子在的时候再按返回：先把影子立刻收完，再收下一层（handleBack 里调 sheetGhostsFinish）。系统设了「减少动画」时改成很短的淡出。
        const SHEET_OUT_MS=SHEET_MS, SHEET_FADE_MS=80;   // 1019-Z3：收起和打开同一个时长（SHEET_MS），减少动画时照旧 80 毫秒淡出
        const SHEET_GHOST_SKIP={};
        const __ghosts=new Set();
        function reduceMotion(){ try{ return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(_){ return false; } }
        function sheetGhostsFinish(){ [...__ghosts].forEach(g=>g.__fin && g.__fin()); }
        window.__sheetGhosts=()=>__ghosts.size;   // 给测试用
        function sheetGhost(m){
            // 1019-Q：面板关了，对着它里面金额框的数字键盘一起收起（不然下一层按返回先收的是它）
            if(m.querySelector('.kp-on') && window.kpClose) window.kpClose();
            const sh=m.querySelector('.sheet') || m.firstElementChild;
            if(!sh || !document.body) return;
            const t0=window.JiwenPerf ? window.JiwenPerf.now() : Date.now();
            const g=m.cloneNode(true);
            g.removeAttribute('id'); g.querySelectorAll('[id]').forEach(x=>x.removeAttribute('id'));
            g.querySelectorAll('[name]').forEach(x=>x.removeAttribute('name'));
            // 输入框里填的字（cloneNode 不带）照抄过去，免得滑走时一下子空了
            const src=m.querySelectorAll('input,textarea,select'), dst=g.querySelectorAll('input,textarea,select');
            src.forEach((x, i)=>{ if(dst[i]){ if(x.type==='checkbox' || x.type==='radio') dst[i].checked=x.checked; else dst[i].value=x.value; } });
            g.classList.remove('mask', 'open', 'closing');
            g.classList.add('sheet-ghost', reduceMotion() ? 'ghost-fade' : 'ghost-down');
            g.setAttribute('aria-hidden', 'true');
            g.style.display='flex'; g.style.zIndex=getComputedStyle(m).zIndex || '1000';
            g.style.height=m.__ghostH || '';
            document.body.appendChild(g);
            const gs=g.querySelector('.sheet') || g.firstElementChild;
            if(gs){ gs.scrollTop=sh.__lastScroll || 0; gs.style.transform=''; g.style.setProperty('--gy', (sh.__dragY||0)+'px'); }
            sh.__dragY=0;
            __ghosts.add(g);
            let done=false;
            g.__fin=()=>{ if(done) return; done=true; __ghosts.delete(g); g.remove();
                if(window.JiwenPerf) window.JiwenPerf.add({ kind:'关闭面板', ms:Math.round((window.JiwenPerf.now())-t0), what:m.id }); };
            if(gs) gs.addEventListener('animationend', ()=>g.__fin(), { once:true });
            setTimeout(()=>g.__fin(), (reduceMotion() ? SHEET_FADE_MS : SHEET_OUT_MS)+60);   // 动画事件没来（被打断、没有布局）的兜底
        }
        function sheetGhostWatch(m){
            if(m.__ghostWatch || SHEET_GHOST_SKIP[m.id]) return; m.__ghostWatch=1;
            const sh=()=>m.querySelector('.sheet') || m.firstElementChild;
            // 面板里滚到哪了（关掉以后读不到了，影子要照着摆）
            m.addEventListener('scroll', e=>{ const x=sh(); if(x && e.target===x) x.__lastScroll=x.scrollTop; }, true);
            // 按每次改动之前的样子判断（同一拍里开了又关也认得出）
            new MutationObserver(recs=>{
                const now=m.style.display;
                if(now==='flex'){ m.__ghostH=m.style.height || ''; return; }   // 键盘弹起时 mask 被收成可视区高度，影子照着
                if(!m.__noGhost && recs.some(r=>/display:\s*flex/.test(r.oldValue||''))) sheetGhost(m);
            }).observe(m, { attributes:true, attributeFilter:['style'], attributeOldValue:true });
        }
        document.querySelectorAll('.mask').forEach(sheetGhostWatch);
        new MutationObserver(ms=>ms.forEach(x=>x.addedNodes.forEach(n=>{ if(n.nodeType===1 && n.classList && n.classList.contains('mask')) sheetGhostWatch(n); }))).observe(document.body, { childList:true });

        // ===== 1019-M：性能记录：点输入框到能输入、键盘弹起时面板动了几次、面板打开用了多久 =====
        (function(){
            const P=window.JiwenPerf;
            const nameOf=el=>{ if(!el) return ''; const m=el.closest && el.closest('.mask'); return (el.id||el.tagName.toLowerCase())+(m ? '@'+m.id : ''); };
            // 点输入框 → 获得焦点 → 再过两帧（键盘这时已经在动了）算「能输入」
            let downAt=0;
            document.addEventListener('pointerdown', e=>{ const el=e.target && e.target.closest && e.target.closest('input,textarea'); downAt=el ? P.now() : 0; }, true);
            document.addEventListener('focusin', e=>{
                const el=e.target; if(!downAt || !el.matches || !el.matches('input,textarea')) return;
                const t0=downAt; downAt=0;
                requestAnimationFrame(()=>requestAnimationFrame(()=>P.add({ kind:'点输入框', ms:Math.round(P.now()-t0), what:nameOf(el) })));
            }, true);
            // 键盘弹起 / 收起：可视区一变，就一帧一帧看最上面那个面板的顶边，900 毫秒里变了几次、最慢一帧多久
            const vv=window.visualViewport;
            function topSheet(){
                const ms=[...document.querySelectorAll('.mask')].filter(m=>m.style.display==='flex');
                ms.sort((a, b)=>(parseInt(getComputedStyle(b).zIndex)||0)-(parseInt(getComputedStyle(a).zIndex)||0));
                return ms[0] ? (ms[0].querySelector('.sheet') || ms[0].firstElementChild) : null;
            }
            let watching=false, lastH=vv ? vv.height : 0;
            if(vv) vv.addEventListener('resize', ()=>{
                const h0=lastH; lastH=vv.height;
                if(watching || !P.on()) return;
                const sh=topSheet(); if(!sh) return;
                watching=true;
                const t0=P.now(), tops=[], frames=[]; let last=null, prev=t0, blank=0;
                const tick=()=>{
                    const r=sh.getBoundingClientRect(), top=Math.round(r.top), n=P.now();
                    if(top!==last){ tops.push(top); last=top; }
                    // 1019-W：这一帧露没露出空白底：面板（或它的遮罩）下沿够不到看得见的屏幕底
                    const vis=(vv.offsetTop||0)+vv.height, mk=sh.closest('.mask'), mb=mk ? mk.getBoundingClientRect().bottom : r.bottom;
                    if(Math.min(r.bottom, mb) < vis-1) blank++;
                    frames.push(n-prev); prev=n;
                    if(n-t0<900) requestAnimationFrame(tick);
                    else { watching=false; const fs=frames.slice(1);
                        P.add({ kind:'键盘', moves:Math.max(0, tops.length-1), blank, maxFrame:Math.round(Math.max(0, ...fs)), avgFrame:fs.length ? Math.round(fs.reduce((a, b)=>a+b, 0)/fs.length) : 0, vv:Math.round(h0)+'→'+Math.round(vv.height), what:nameOf(sh) }); }
                };
                requestAnimationFrame(tick);
            });
            // 面板打开：display 变成 flex 到面板滑入动画走完（没有动画就是下一帧）
            function watchMask(m){
                if(m.__perfWatch) return; m.__perfWatch=1;
                let was=m.style.display;
                new MutationObserver(()=>{
                    const nowD=m.style.display;
                    if(nowD==='flex' && was!=='flex' && P.on()){
                        const t0=P.now(), sh=m.querySelector('.sheet') || m.firstElementChild; let done=false;
                        const fin=()=>{ if(done) return; done=true; P.add({ kind:'打开面板', ms:Math.round(P.now()-t0), what:m.id }); };
                        if(sh){ sh.addEventListener('animationend', fin, { once:true }); sh.addEventListener('transitionend', fin, { once:true }); }
                        setTimeout(()=>requestAnimationFrame(fin), 450);   // 没有动画（或动画被打断）的兜底
                    }
                    was=nowD;
                }).observe(m, { attributes:true, attributeFilter:['style'] });
            }
            document.querySelectorAll('.mask').forEach(watchMask);
            new MutationObserver(ms=>ms.forEach(x=>x.addedNodes.forEach(n=>{ if(n.nodeType===1 && n.classList.contains('mask')) watchMask(n); }))).observe(document.body, { childList:true });
            // 「性能记录（开发中）」页：一行一条，能一键复制全部、清空
            function fmt(e){
                if(typeof e.ts==='number') e=Object.assign({}, e, { at:P.localAt(e.ts) });   // 1019-Z4：有时间戳的按当地时间重新写（老记录没有，照原样）
                if(e.kind==='启动' && e.nat){ const n=e.nat, v=x=>x!=null ? x : '-';
                    return `${e.at} 启动全程（${n.proc ? '从点图标' : '从 Activity 创建'}算）：Activity 创建 ${v(n.act)} · WebView 建好 ${v(n.web)} · 网页开始 ${v(n.page)} · 首屏画好 ${v(n.first)} · 收到画好了 ${v(n.ready)} · 启动画面收起 ${n.wait ? v(n.gone) : '（没等首屏，系统第一帧就收）'}｜网页里：${e.snap!=null?'快照先出来 '+e.snap+' · ':''}脚本开始 ${e.script} · 数据库 ${e.db!=null?e.db:'-'} · 读完账本 ${e.read!=null?e.read:'-'} · 画好 ${e.render!=null?e.render:'-'} · 首屏出来 ${e.paint}；${e.n!=null?e.n+' 条':''}`; }
                if(e.kind==='启动') return `${e.at} 启动 ${e.ms}ms（${e.snap!=null?'快照先出来 '+e.snap+' · ':''}脚本开始 ${e.script} · 数据库 ${e.db!=null?e.db:'-'} · 读完账本 ${e.read!=null?e.read:'-'} · 画好 ${e.render!=null?e.render:'-'} · 首屏出来 ${e.paint}；${e.n!=null?e.n+' 条':''}）`;
                if(e.kind==='点输入框') return `${e.at} 点输入框到能输入 ${e.ms}ms（${e.what}）`;
                if(e.kind==='键盘') return `${e.at} 键盘 面板位置变了 ${e.moves} 次${e.blank!=null ? `，露出空白 ${e.blank} 帧` : ''}，最慢一帧 ${e.maxFrame}ms、平均 ${e.avgFrame}ms，可视区 ${e.vv}（${e.what}）`;
                if(e.kind==='打开面板' || e.kind==='关闭面板') return `${e.at} ${e.kind} ${e.ms}ms（${e.what}）`;
                return e.at+' '+JSON.stringify(e);
            }
            function openPerfPage(){
                const rows=P.list().slice().reverse();
                const text=['记问性能记录（'+navigator.userAgent.replace(/^.*?\(([^)]*)\).*$/, '$1')+'）'].concat(rows.map(fmt)).join('\n');
                window.JiwenSheet.open({ title:'性能记录（开发中）', sub:rows.length ? `最近 ${rows.length} 条，新的在上（最多留 50 条，只在这台手机）` : '还没有记录：关掉 App 再打开、点几个输入框、开关几个面板，这里就有了。',
                    body(box){ const pre=document.createElement('pre'); pre.id='perfList'; pre.className='perf-list'; pre.textContent=rows.map(fmt).join('\n'); box.appendChild(pre); },
                    foot(box, done){
                        const st=document.createElement('div'); st.className='ui-stack';
                        const cp=document.createElement('button'); cp.type='button'; cp.className='ui-btn primary block'; cp.id='perfCopy'; cp.textContent='复制全部';
                        cp.addEventListener('click', ()=>{ const ok=()=>{ cp.textContent='已复制'; }; try{ navigator.clipboard.writeText(text).then(ok, ()=>{ window.prompt && window.prompt('复制下面的文字', text); }); }catch(_){ } });
                        const cl=document.createElement('button'); cl.type='button'; cl.className='ui-btn block'; cl.id='perfClear'; cl.textContent='清空';
                        cl.addEventListener('click', ()=>{ P.clear(); done(); openPerfPage(); });
                        const x=document.createElement('button'); x.type='button'; x.className='ui-btn block'; x.id='perfClose'; x.textContent='关闭';
                        x.addEventListener('click', ()=>done());
                        st.appendChild(cp); st.appendChild(cl); st.appendChild(x); box.appendChild(st);
                    } });
            }
            window.openPerfPage=openPerfPage;
            const b=$('devPerfBtn'); if(b) b.addEventListener('click', openPerfPage);
        })();

        // ===== 系统返回键 / 侧滑返回 =====
        // 【问题】日子管理页是「记账页的子页」——只是把 pageLedger 藏起来、pageDays 显示，
        //   并没有产生任何浏览器历史。安卓的返回手势只认 WebView 的 history，看不到这层 UI 状态，
        //   于是直接把唯一那条历史 pop 掉 —— 表现为「在子页里侧滑返回，整个 App 退了」。
        //   同理，所有弹窗（修改、日期选择、分类管理…）在返回键眼里也都不存在。
        //
        // 【做法：单哨兵】不去维护一个跟 UI 状态一一对应的真实历史栈——那种做法要在每个
        //   open/close 里配对 push/back，漏一次就错位，且用户连点返回时时序无法保证。
        //   这里只压**一条**哨兵历史：只要「有任何东西可以被关掉」，就保证哨兵在。
        //   返回键触发 popstate → 关掉最上面那一层 → 若还有东西开着，把哨兵补回去。
        //   UI 状态是唯一事实来源，历史只是个「拦一下返回键」的钩子，二者不需要同步。
        //
        // 【层级顺序】必须按**视觉最上层**先关，否则会出现「返回键关掉了被盖住的那个」。
        //   顺序直接对应上面 CSS 里写死的 z-index：
        //   askMask(1010) > dtMask(1005) > aiExpMask(1002) > editMask(1001,over-detail)
        //   > detailMask(1000) > 其余同级弹窗(999) > 筛选浮层 > 日子子页。
        (function(){
            const SENTINEL='__back_guard__';

            function isOpen(id){
                const el=$(id);
                if(!el) return false;
                const d=el.style.display;
                // 弹窗用 display:flex 显示、none 隐藏；空串表示「没被显式设过」= 未显示
                return d!=='none' && d!=='';
            }
            function hide(id){ const el=$(id); if(el) el.style.display='none'; }

            // 从上到下的可关闭层，顺序**必须**与 CSS 里的 z-index 阶梯一致，
            // 否则会出现「返回键关掉了被盖住的那个」。一次返回只关一层。
            //
            // 【askMask 要拆成两条】它身兼二职（见 CSS 注释）：
            //   - 当提示/确认用（无 .as-page，z1040）：最顶层，第一个关。
            //   - 当内容页用（有 .as-page，z1010，即批量确认清单）：它上面还压着详情，
            //     必须排到 detailMask/editMask **之后**才关，否则会先把清单关掉、
            //     把详情孤零零留在屏幕上。
            function askIsPrompt(){ return isOpen('askMask') && !askMask.classList.contains('as-page'); }
            function askIsPage(){   return isOpen('askMask') &&  askMask.classList.contains('as-page'); }

            const LAYERS=[
                // 1040 提示/确认：走 closeAsk(null)，等价于「取消」，会触发它自己的 onCancel
                // 1019-P 数字键盘（盖在一切上面）：返回键先收它，数字留着
                { can:()=>isOpen('kpMask'),     close:()=>kpClose() },
                { can:askIsPrompt,              close:()=>closeAsk(null) },
                // 1019-O 文字输入的小面板（盖在记一笔、修改等上面）
                { can:()=>isOpen('txtMask'),    close:()=>formBackClose('txtMask') },
                // 1017-UI1 底部选择 / 确认面板（JiwenSheet，z1000 的 sheet-mask，盖在导入页上面）：返回键等于「取消 / 再看看 / 继续导入」，写入中不关
                { can:()=>!!(window.JiwenSheet && window.JiwenSheet.isOpen()), close:()=>window.JiwenSheet.back() },
                // 1016-B 导入页（整页，盖在别的页面上面）：里面先关哪一层（行详情 → 进度 → 整页）由它自己定
                { can:()=>!!(window.JiwenImportUI && window.JiwenImportUI.canBack()), close:()=>window.JiwenImportUI.back() },
                // 1035 日期时间选择器
                { can:()=>isOpen('dtMask'),     close:()=>formBackClose('dtMask') },
                // 1032 退款弹窗（从修改账单里打开）
                { can:()=>isOpen('refundMask'), close:()=>formBackClose('refundMask') },
                // 1030 详情里点进来的「修改」：必须走唯一出口（closeEditModal），
                //      否则 editId / over-detail 等状态复位不掉；1019-B 起填过东西先问一句
                { can:()=>isOpen('editMask'),   close:()=>formBackClose('editMask') },
                // 1020 账单详情
                { can:()=>isOpen('detailMask'), close:()=>formBackClose('detailMask') },
                // 1010 批量确认清单（askMask 当内容页用）—— 排在详情之后
                { can:askIsPage,                close:()=>closeAsk(null) },
                { can:()=>isOpen('aiExpMask'),  close:()=>formBackClose('aiExpMask') },
                { can:()=>isOpen('devImportMask'), close:()=>formBackClose('devImportMask') },
                // 1000 普通表单弹窗，互不叠加
                { can:()=>isOpen('dayMask'),    close:()=>formBackClose('dayMask') },
                { can:()=>isOpen('dayMgrMask'), close:()=>formBackClose('dayMgrMask') },
                { can:()=>isOpen('catMask'),    close:()=>formBackClose('catMask') },
                { can:()=>isOpen('tplEditMask'), close:()=>formBackClose('tplEditMask') },
                { can:()=>isOpen('tplMask'),    close:()=>formBackClose('tplMask') },
                { can:()=>isOpen('themeMask'),  close:()=>formBackClose('themeMask') },
                // 统计页的年月选择器。它和 dtMask 是两套独立实现，别忘了这一个
                // —— 漏掉的后果不是"关不掉"，而是 handleBack 返回 false、
                // Capacitor 直接 exitApp()：选择器开着时按返回键会退出整个 App。
                { can:()=>isOpen('ymMask'),     close:()=>formBackClose('ymMask') },
                { can:()=>isOpen('addMask'),    close:()=>formBackClose('addMask') },
                // 筛选浮层是 class 驱动（.open），不是 display
                { can:()=>{ const m=$('filterSheetMask'); return !!m && m.classList.contains('open'); },
                  close:()=>{ if(window.closeFilterSheet) window.closeFilterSheet(); } },
                // 选择模式排在子页之前：返回键先退出选择、**留在日子页**，
                // 而不是带着一堆勾选状态直接跳回记账页。
                { can:()=>daysSelecting, close:()=>exitSelectMode() },
                // 最后才是子页：前面全关完了，返回键才把日子页收回记账页
                { can:()=>{ const p=$('pageDays'); return !!p && p.style.display==='block'; },
                  close:()=>backFromDaysPage() },
            ];

            function topLayer(){ return LAYERS.find(l=>{ try{ return l.can(); }catch(_){ return false; } }); }
            function anyOpen(){ return !!topLayer(); }

            // 只要有东西开着，就确保哨兵在栈里；全关完了就不再补——
            // 此时再按返回键就该正常退出 App（用户的预期本来就是这样）。
            function ensureSentinel(){
                if(!anyOpen()) return;
                // 不用 history.state?.g —— 全文都刻意避开可选链（同样的理由：迁就老 WebView）
                const st=history.state;
                if(!st || st.g!==SENTINEL){
                    history.pushState({ g:SENTINEL }, '');
                }
            }

            // 【真正的关键：安卓上返回手势根本不走 popstate】
            //   在 Capacitor 里，硬件返回键/侧滑返回先交给**原生层**。默认行为是直接
            //   finish() 掉 Activity —— 也就是退出 App，WebView 的 history 压根没被碰。
            //   所以只监听 popstate 是不够的：它在浏览器里测得好好的，装到手机上却毫无反应，
            //   因为那个事件从来没被触发过。
            //
            //   正确做法是同时接住原生的 backButton 事件。两条路都绑，谁先到算谁的：
            //   - 有 Capacitor App 插件 → 走 backButton（安卓真机的实际路径）
            //   - 没有插件 / 纯浏览器调试 → 走 popstate（哨兵机制照旧）
            //   handleBack 是唯一的处理入口，两条路复用同一套层级逻辑，不会有两套行为。
            let backLock=false;   // 防抖：两条路都触发时别关掉两层
            function handleBack(){
                sheetGhostsFinish();                 // 1019-N：还在滑走的面板立刻收完，再收下一层
                if(backLock) return true;
                const l=topLayer();
                if(!l) return false;                 // 没东西可关 → 让调用方决定（退出 App）
                backLock=true;
                try{ l.close(); }catch(_){}
                setTimeout(()=>{ backLock=false; }, 120);
                ensureSentinel();                    // 下面还压着别的就把哨兵补回去
                return true;                         // 已消费掉这次返回
            }

            window.addEventListener('popstate', ()=>{
                if(!handleBack()) return;            // 没东西可关 → 放行，正常退出
            });

            // Capacitor 原生返回键。插件不一定存在（纯 HTML 项目里 Plugins.App 可能没打进来），
            // 所以全程防御式取值，取不到就静默降级到上面的 popstate。
            (function bindNativeBack(){
                function tryBind(){
                    const cap=window.Capacitor;
                    if(!cap || !cap.Plugins || !cap.Plugins.App) return false;
                    cap.Plugins.App.addListener('backButton', ()=>{
                        if(handleBack()) return;     // 关掉一层，吃掉这次返回
                        // 没东西可关：不在子页、不在弹窗 → 才真的退出 App
                        try{ cap.Plugins.App.exitApp(); }catch(_){}
                    });
                    return true;
                }
                if(tryBind()) return;
                // 插件可能比这段脚本晚就绪，等一拍再试；仍失败就认了（浏览器里本就没有）
                document.addEventListener('deviceready', tryBind, { once:true });
                setTimeout(tryBind, 800);
            })();

            // 【为什么用轮询而不是在每个 open() 里手动 push】
            //   弹窗的打开入口散在几十处（按钮、事件委托、校验失败自动弹 ask…），
            //   逐个去插 pushState 必漏，而且漏了不报错——只在某条冷门路径上返回键失灵。
            //   这里反过来：不管谁、怎么把弹窗打开的，只要它「显示出来了」，
            //   下一帧就自动补上哨兵。UI 是事实，代码只负责跟上。
            //   250ms 一次、只做几个 style.display 读取，开销可以忽略。
            //   后台时跳过：切走后没有 UI 变化，轮询没有意义，也免得被系统判定为后台活动频繁。
            setInterval(()=>{ if(document.visibilityState==='visible') ensureSentinel(); }, 250);
            document.addEventListener('click', ()=>setTimeout(ensureSentinel, 0), true);
        })();

        // ===== 日子管理弹窗 =====
        const dayMgrMask=$('dayMgrMask'), dmCount=$('dmCount');

        // 只放行数字。参照 sanitizeMoney 的做法：不用 <input type=number>
        //  —— 它在安卓 WebView 上仍能通过键盘/粘贴塞进 'e'、'+'、'-'，而且拿到的 value 会是空串，
        //     校验反而更难写。用 text + inputmode=numeric：手机照样弹数字键盘，
        //     同时这里手工过滤，粘贴、长按输入法、物理键盘三条路径全都拦住。
        function sanitizeCount(v){
            return String(v||'').replace(/[^\d]/g, '').slice(0, 2);   // 只留数字，最多两位
        }
        dmCount.addEventListener('input', ()=>{
            const s=sanitizeCount(dmCount.value);
            if(dmCount.value!==s) dmCount.value=s;   // 只在真被改动时写回，避免打断光标
        });
        // 【不在 input 里钳到 3】用户想输 12，必然先经过「1」这个中间态；
        //   当场纠正成 3 会让人根本没法往下打。钳制只在失焦和保存时做。
        dmCount.addEventListener('blur', ()=>{ dmCount.value=String(clampCount(dmCount.value)); });
        function clampCount(v){
            const n=parseInt(sanitizeCount(v), 10);
            if(!isFinite(n)) return DAYS_CARD_DEFAULT;
            return Math.min(Math.max(n, DAYS_CARD_MIN), DAYS_CARD_MAX);
        }

        function openDayMgr(){
            dmCount.value=String(getDaysCardN());
            // 没有日子时，「批量删除」无意义，禁用掉而不是让人点进去看空列表
            const has=loadDays().length>0;
            $('dmBatch').disabled=!has;
            $('dmBatch').textContent = has ? '批量删除日子' : '批量删除日子（暂无日子）';
            // 走既有的键盘安全打开口：不留透明帧、不抢在绘制前聚焦。
            // 但这里不自动 focus —— 一进来就弹键盘会盖住下面的「批量删除」按钮，
            // 用户多半只是想点它。要改条数的人自己点输入框即可。
            window.__openModalAfterKeyboard(dayMgrMask, null);
        }
        function closeDayMgr(){
            dmCount.blur();               // 收键盘，避免弹窗关了键盘还杵着
            dayMgrMask.style.display='none';
        }
        $('daysManage').addEventListener('click', openDayMgr);
        $('dmClose').addEventListener('click', closeDayMgr);
        $('dmSave').addEventListener('click', ()=>{
            const n=clampCount(dmCount.value);
            setDaysCardN(n);
            closeDayMgr();
            renderDaysCard();             // 入口卡立刻按新条数重绘
            customAlert(`入口卡将显示最多 ${n} 条日子`);
        });
        // 批量删除：先关掉弹窗，再把列表原地切成选择模式（不叠层）
        $('dmBatch').addEventListener('click', ()=>{
            closeDayMgr();
            enterSelectMode();
        });

        // ===== 选择模式（批量删除）=====
        let daysSelecting=false;
        const daysSel=new Set();   // 选中的 id

        function enterSelectMode(){
            daysSelecting=true;
            daysSel.clear();
            document.body.classList.add('days-selecting');
            $('daysHeadNormal').style.display='none';
            $('daysHeadSelect').style.display='flex';
            renderDaysList();
            syncSelBar();
        }
        function exitSelectMode(){
            daysSelecting=false;
            daysSel.clear();
            document.body.classList.remove('days-selecting');
            $('daysHeadNormal').style.display='flex';
            $('daysHeadSelect').style.display='none';
            renderDaysList();
        }
        function toggleDaySel(id){
            if(daysSel.has(id)) daysSel.delete(id); else daysSel.add(id);
            renderDaysList();
            syncSelBar();
        }
        // 头部计数 + 底部删除按钮，统一在这里同步（别在三个地方各写一遍）
        function syncSelBar(){
            const n=daysSel.size;
            const total=loadDays().length;
            $('daysSelCount').textContent=`已选 ${n} 项`;
            $('daysSelAll').textContent = (n>0 && n===total) ? '取消全选' : '全选';
            const btn=$('daysDelBtn');
            btn.disabled = n===0;
            btn.textContent = `删除选中的 ${n} 项`;
        }
        $('daysSelCancel').addEventListener('click', exitSelectMode);
        $('daysSelAll').addEventListener('click', ()=>{
            const list=loadDays();
            if(daysSel.size===list.length) daysSel.clear();       // 已全选 → 取消全选
            else list.forEach(d=>daysSel.add(d.id));
            renderDaysList();
            syncSelBar();
        });
        $('daysDelBtn').addEventListener('click', ()=>{
            const n=daysSel.size;
            if(!n) return;
            // 二次确认：批量删除不可撤销，不能一下就没了
            customConfirm(`删除选中的 ${n} 个日子，删掉的找不回来。`, ()=>{
                const left=loadDays().filter(d=>!daysSel.has(d.id));
                saveDays(left);
                exitSelectMode();      // 内部会 renderDaysList
                renderDaysCard();      // 入口卡同步
                customAlert(`已删除 ${n} 个日子`);
            }, '批量删除', { danger:true, okText:`删除这 ${n} 个日子` });
        });

        function renderDaysList(){
            const box=$('daysList'), empty=$('daysEmpty');
            const list=sortedDays(loadDays());
            if(!list.length){
                box.innerHTML='';
                empty.style.display='block';
                if(daysSelecting) exitSelectMode();   // 全删光了就自动退出选择模式
                return;
            }
            empty.style.display='none';
            box.innerHTML=list.map(d=>{
                const c=calcDay(d.date);
                const on=daysSel.has(d.id);
                // 勾选圈平时 display:none（由 body.days-selecting 控制显隐），
                // 所以常态下这段 DOM 是不可见的、不影响布局，不必分两套模板。
                return `<div class="day-item${d.pin?' pinned':''}${on?' sel':''}" data-day-id="${escapeHtml(d.id)}">`
                    + `<div class="di-check">${on?'✓':''}</div>`
                    + `<div class="di-l">`
                    +   `<div class="di-name">${d.pin?'<span class="pin">★置顶</span>':''}${escapeHtml(d.name)}</div>`
                    +   `<div class="di-date">${escapeHtml(fmtDayDate(d.date))}</div>`
                    + `</div>`
                    + `<div class="di-r">${dayNumHtml(c,'di')}</div>`
                    + `</div>`;
            }).join('');
        }
        // 管理页列表：事件委托（与账单表格/明细行同一套模式，不写内联 onclick）
        // 选择模式下改为「点行 = 勾选/取消」，不再进编辑——同一个 DOM，两种语义。
        $('daysList').addEventListener('click', e=>{
            const el=e.target.closest('[data-day-id]');
            if(!el) return;
            if(daysSelecting) toggleDaySel(el.dataset.dayId);
            else openDayDialog(el.dataset.dayId);
        });

        // ===== 编辑/添加弹窗 =====
        let dayEditId=null;   // null = 新增
        const dayMask=$('dayMask'), dayName=$('dayName'), dayDate=$('dayDate'), dayPin=$('dayPin');

        function todayStr(){
            const n=new Date();
            return `${n.getFullYear()}-${pad(n.getMonth()+1)}-${pad(n.getDate())}`;
        }
        // 预览行：实时告诉用户这个日期会显示成什么，省得存完才发现方向反了
        function updateDayPreview(){
            const s=dayDate.dataset.day || '';
            const el=$('dayPreview');
            if(!isValidDay(s)){ el.textContent='请选择一个目标日期'; return; }
            const c=calcDay(s);
            if(c.state==='today')      el.textContent='就是今天 —— 将显示为「就是今天」';
            else if(c.state==='future') el.textContent=`该日在今天之后 → 将显示为「还有 ${c.n} 天」`;
            else                        el.textContent=`该日在今天之前 → 将显示为「已经 ${c.n} 天」`;
        }
        function setDayDate(s){
            dayDate.dataset.day=s||'';
            dayDate.value = s ? fmtDayDate(s) : '';
            updateDayPreview();
        }
        // 复用现有的纯日期选择器（openDtPickerDate），不另造一个
        dayDate.addEventListener('click', ()=>{
            openDtPickerDate(dayDate.dataset.day || todayStr(), (day)=>setDayDate(day));
        });
        dayPin.addEventListener('click', ()=>dayPin.classList.toggle('on'));

        function openDayDialog(id){
            dayEditId = id || null;
            const list=loadDays();
            const rec = dayEditId ? list.find(d=>d.id===dayEditId) : null;
            if(dayEditId && !rec){ customAlert('这个日子不存在了'); return; }

            $('dayDlgTitle').textContent = rec ? '编辑日子' : '添加日子';
            dayName.value = rec ? rec.name : '';
            setDayDate(rec ? rec.date : todayStr());
            dayPin.classList.toggle('on', !!(rec && rec.pin));
            $('dayDelete').style.display = rec ? 'block' : 'none';
            dayMask.style.display='flex';
        }
        function closeDayDialog(){
            dayMask.style.display='none';
            dayEditId=null;
        }
        $('dayCancel').addEventListener('click', closeDayDialog);

        $('daySave').addEventListener('click', ()=>{
            const name=dayName.value.trim();
            const date=dayDate.dataset.day || '';
            if(!name){ customAlert('给这个日子起个名字吧～'); return; }
            if(charLen(name) > 8){ customAlert('名称最多 8 个字～'); return; }
            if(!isValidDay(date)){ customAlert('请选择一个目标日期～'); return; }

            const list=loadDays();
            const pin=dayPin.classList.contains('on');
            if(dayEditId){
                const i=list.findIndex(d=>d.id===dayEditId);
                if(i<0){ closeDayDialog(); customAlert('这个日子不存在了，可能已被删除。'); renderDaysAll(); return; }
                list[i]={ ...list[i], name, date, pin };
            } else {
                list.push({ id:genId(), name, date, pin });
            }
            if(!saveDays(list)) return;    // 写失败已提示，保持弹窗开着别关
            closeDayDialog();
            renderDaysAll();
        });

        $('dayDelete').addEventListener('click', ()=>{
            const id=dayEditId;
            if(!id) return;
            const rec=loadDays().find(d=>d.id===id);
            customConfirm(`删除日子「${rec?rec.name:''}」，删掉的找不回来。`, ()=>{
                const list=loadDays().filter(d=>d.id!==id);
                if(!saveDays(list)) return;
                closeDayDialog();
                renderDaysAll();
            }, '删除日子', { danger:true, okText:'删除这个日子' });
        });

        // 数据变更后统一刷新两处视图（入口卡 + 管理页，管理页没显示时刷了也无害）
        function renderDaysAll(){
            renderDaysCard();
            if($('pageDays').style.display!=='none') renderDaysList();
        }

