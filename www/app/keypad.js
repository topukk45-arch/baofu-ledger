(function(){
        const { $ } = window.JiwenBase;   // 用到前面模块的

        // ===== 1019-P：金额用 App 自己的数字键盘 =====
        //   记一笔 / 修改的金额、模板的固定金额、筛选的金额区间、要金额的输入提示框（预算、补金额）：点了从底部滑出数字键盘，不弹系统输入法。
        //   每按一个键金额框实时变；不做加减、不做粘贴，只从末尾输入和退格，最多两位小数、开头不能多个 0、整数最多 KP_INT_MAX 位。
        //   关法：大按钮、键盘外面点一下或滑一下（这一下照常交给页面，不吞掉）、往下拉、返回键，都走收起动画；不管怎么关，输入的数字原样留着。
        //   已经有金额再打开：接着输（照微信转账），不整个替换——替换容易一碰就把原来的数清掉。
        //   设置里「用系统键盘输入金额」打开就照旧用系统输入法。
        const KP_INT_MAX=8;
        const KP_FIELDS={ billMoney:'确定', editMoney:'确定', tplEditMoney:'确定', searchMin:'确定', searchMax:'确定', refundMoney:'确定' };   // 1020-I：退款金额（部分退款时才弹，全额时 data-kp-lock）
        // 1020-J：整数模式（个数用；同一个键盘，小数点那一格空着不能点）：最多 len 位、开头不能是 0；关键盘（确定 / 点外面 / 往下拉 / 返回键）时小于 lo 的按 lo、大于 hi 的按 hi。
        //   以后再加数字框都接这个键盘：金额用小数模式（KP_FIELDS），个数用整数模式（再在 KP_INT 里登记）。
        const KP_INT={};      // 导入简化 2a：日子管理的条数（dmCount）去掉了，现在没有整数框；以后加的用 kpRegister(id, { int }) 登记
        const kpIntOf=el=>el && KP_INT[el.id];
        let kpTarget=null, kpOnOk=null, kpHost=null;
        function kpOn(){ try{ return localStorage.getItem('app_sys_money_kb')!=='1'; }catch(_){ return true; } }
        function kpFieldSet(el, on){
            if(!el) return;
            el.readOnly=on; el.classList.toggle('kp-field', on);
            if(on) el.setAttribute('inputmode', 'none'); else el.setAttribute('inputmode', kpIntOf(el) ? 'numeric' : 'decimal');
        }
        function kpApply(){ Object.keys(KP_FIELDS).forEach(id=>kpFieldSet($(id), kpOn())); }
        // 1020-J：键盘顶上那个重复的大字金额去掉了（金额框就在键盘上面、后面有闪动光标）；这里只管整数模式时小数点那一格空着
        function kpPaint(){
            const dot=$('kpGrid').querySelector('.kp-key[data-k="."]'); if(!dot) return;
            const int=!!kpIntOf(kpTarget);
            dot.disabled=int; dot.classList.toggle('kp-off', int); dot.textContent=int ? '' : '.';
            if(int) dot.setAttribute('aria-hidden', 'true'); else dot.removeAttribute('aria-hidden');
        }
        function kpKey(k){
            const el=kpTarget; if(!el) return;
            let v=el.value||'';
            const int=kpIntOf(el);
            if(int){
                if(k==='del') v=v.slice(0, -1);
                else if(k==='.' || (k==='0' && !v) || v.length>=int.len) return;
                else v+=k;
            }
            else if(k==='del') v=v.slice(0, -1);
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
            if(kpCaretEl){ kpCaretEl.style.animation='none'; void kpCaretEl.offsetWidth; kpCaretEl.style.animation=''; kpCaretPlace(); }
        }
        // ===== 1020-J：键盘自己定高，顶边落在两排之间的空白里，不压按钮 =====
        //   原来键盘高度是死的（每个键 56px），顶边压到哪全看屏幕多高（有的手机切过收入 / 支出那排，360×780 切过分类那排）。
        //   现在：正在输的那一行（金额那一行、列表卡的一行、提示框的输入框）往下，找出面板里横着的空白（一条横线上没有任何按钮、字、框），
        //   从下往上试，取能放下键盘（每个键至少 KP_KEY_MIN）的最靠下那一条，键盘顶边落在那条空白里；按键高度在 KP_KEY_MIN～KP_KEY_MAX 之间
        //   自动调、正好填满（放到最高还有多的，多出来的垫在键盘顶上）。正在输的那一行一定完整露在键盘上面。
        //   哪一条都放不下（面板太矮）：按 KP_KEY_DEF 定高，把面板滚到正在输的那一行正好在键盘上面（记一笔 / 修改不滚，金额本来就在最上面）。
        //   贴底的按钮排（保存那排、「清除全部 | 完成」、提示框的按钮）当一整块，键盘顶边不落在它中间。
        const KP_KEY_MIN=52, KP_KEY_MAX=76, KP_KEY_DEF=56, KP_GAP=8;
        const KP_ROW='.rec-row, .rec-money-row, .ask-input-row, .rec-time, .field, .search-field';
        const KP_SOLID='.rec-foot, .ui-sheet-foot, .ask-btns, .dialog-btn, .form-btns, .sheet-grip';
        const KP_INK='button, input, textarea, select, label, .cc, .dt-input, [role="button"], [role="radio"], h3, .rec-row, .rec-money-row, .field-label, .search-label, .ask-msg, .dm-hint, .refund-sum, .rs-what, .rs-nums';
        function kpRowOf(el){ return el.closest(KP_ROW) || el; }
        // 面板里横着的「有东西」的区段（屏幕坐标），合并以后取空白
        function kpBands(host, from, to){
            const segs=[];
            const add=(t, b)=>{ if(b>from && t<to && b-t>0.5) segs.push([Math.max(t, from), Math.min(b, to)]); };
            const sr=host.getBoundingClientRect();
            host.querySelectorAll(KP_INK).forEach(n=>{
                if(n.closest('.rec-remark, .rec-time-raw')) return;
                const solid=n.closest(KP_SOLID); const r=(solid||n).getBoundingClientRect();
                if(!(r.width>0 && r.height>0) || r.bottom<=sr.top || r.top>=sr.bottom) return;
                const cs=getComputedStyle(n); if(cs.visibility==='hidden' || cs.display==='none') return;
                add(r.top, r.bottom);
            });
            segs.sort((a, b)=>a[0]-b[0]);
            const gaps=[]; let y=from;
            segs.forEach(([t, b])=>{ if(t>=y-0.5) gaps.push([y, Math.max(y, t)]); y=Math.max(y, b); });
            if(to>y) gaps.push([y, to]);
            return gaps;
        }
        function kpSetKey(keyH, extra){
            const sh=$('kpSheet');
            sh.style.setProperty('--kp-key', Math.round(keyH*10)/10+'px');
            sh.style.setProperty('--kp-extra', Math.max(0, Math.round(extra))+'px');
        }
        let kpFitInfo=null;   // 给 audit / 测试看：最后一次定高的结果
        function kpFit(){
            const el=kpTarget; if(!el) return null;
            const sh=$('kpSheet'), grid=$('kpGrid');
            kpSetKey(KP_KEY_DEF, 0);
            const H=sh.getBoundingClientRect().height, gH=grid.getBoundingClientRect().height;
            const mb=$('kpMask').getBoundingClientRect().bottom || (window.visualViewport ? visualViewport.height : window.innerHeight);
            const host=el.closest('.sheet');
            if(!(H>0) || !(gH>0) || !host){ kpFitInfo=null; return null; }
            const chrome=H-gH;                     // 拖动条、上下内边距（含手机底部横条那条）
            const keyOf=top=>((mb-top) - chrome - 3*KP_GAP)/4;
            const row=kpRowOf(el);
            const yMin=mb-chrome-3*KP_GAP-4*KP_KEY_MIN;   // 顶边最低能到哪（再低按键就不够高）
            // 能落的空白：正在输的那一行下沿往下、屏幕底以上；从下往上试，落在这条空白靠上的地方，按键不够 KP_KEY_MIN 就往上挪到刚好够
            const search=()=>{
                const rb=row.getBoundingClientRect().bottom;
                const gaps=kpBands(host, rb, mb);
                for(let i=gaps.length-1; i>=0; i--){
                    const [a, b]=gaps[i];
                    const y=Math.min(a + Math.min(8, (b-a)/2), yMin);   // 窄的（两行挨着）落在正中；宽的离上面那排 8px
                    if(y>=a-0.5) return y;
                }
                return null;
            };
            let top=search(), scrolled=0;
            if(top===null && !host.querySelector('.rec-foot')){
                // 放不下：按默认高度，面板底下垫一块键盘那么高的空白（这样才滚得动），把正在输的那一行下面那条空白滚到键盘顶边
                //   （1020-J：原来按「框的下沿 + 12」滚，筛选里点金额区间会滚过头，金额两个框被滚到上面看不见）
                const t56=mb-chrome-3*KP_GAP-4*KP_KEY_DEF;
                host.style.setProperty('--kp-h', Math.round(mb-t56)+'px'); host.classList.add('kp-lift');
                const rb=row.getBoundingClientRect().bottom, g=kpBands(host, rb, mb)[0];
                const gy = g ? g[0] + Math.min(6, (g[1]-g[0])/2) : rb + 6;
                // 贴底的按钮排（提示框的「确定 / 取消」这种 sticky 的）垫了空白以后跟着停在键盘上面，正在输的那一行还要在它上面（360×640 设预算时输入框被它盖住）
                const foot=[...host.children].find(c=>c.matches('.ask-btns, .ui-sheet-foot, .rec-foot') && getComputedStyle(c).position==='sticky');
                const ft = foot ? foot.getBoundingClientRect().top : Infinity;
                const over=Math.max(gy - t56, rb + 6 - ft);
                if(over>0){ const s0=host.scrollTop; host.scrollTop += over; scrolled=host.scrollTop-s0; }
                top=search();
            }
            if(top===null) top=mb-chrome-3*KP_GAP-4*KP_KEY_DEF;   // 实在找不到（面板比键盘还矮）：按默认高度
            const avail=mb-top-chrome-3*KP_GAP;
            const keyH=Math.max(KP_KEY_MIN, Math.min(KP_KEY_MAX, avail/4));
            kpSetKey(keyH, avail-4*keyH);
            kpFitInfo={ top:Math.round(top), keyH:Math.round(keyH*10)/10, scrolled };
            return kpFitInfo;
        }
        // 1020-J：面板底下只在放不下、要滚的时候才垫空白（kpFit 里）；原来每次都垫，底朝下的面板一垫整个往上挪，算好的位置就不对了
        function kpReveal(){
            const el=kpTarget; if(!el) return;
            const host=el.closest('.sheet');
            if(kpHost && kpHost!==host) kpHost.classList.remove('kp-lift');
            kpHost=host;
            kpFit();
        }
        // 1020-G：正在输的金额框里，数字后面一根闪动的竖线（原来 1019-Z1 是把下面那条线换成主色、加粗）。
        //   框是只读的（不弹系统输入法），浏览器自己的光标出不来，所以另画一根：每一帧按框的位置、字的宽度、靠左 / 靠右放过去
        //   （面板会滚、会滑，跟着走），数字键盘关了就收起来。系统「减少动画」时不闪。
        let kpCaretEl=null, kpCaretRaf=0, kpCaretCtx=null;
        function kpTextW(el, txt){
            if(!txt) return 0;
            try{
                if(!kpCaretCtx){ const c=document.createElement('canvas'); kpCaretCtx=c.getContext && c.getContext('2d'); }
                if(!kpCaretCtx) return 0;
                const cs=getComputedStyle(el);
                kpCaretCtx.font=`${cs.fontStyle||'normal'} ${cs.fontWeight||'400'} ${cs.fontSize||'16px'} ${cs.fontFamily||'sans-serif'}`;
                return kpCaretCtx.measureText(txt).width || 0;
            }catch(_){ return 0; }
        }
        function kpCaretPlace(){
            const el=kpTarget, c=kpCaretEl; if(!c) return;
            if(!el || !el.isConnected){ c.style.display='none'; return; }
            const r=el.getBoundingClientRect();
            if(!(r.width>0 && r.height>0)){ c.style.display='none'; return; }
            const cs=getComputedStyle(el), px=v=>parseFloat(v)||0;
            const left=r.left+px(cs.borderLeftWidth)+px(cs.paddingLeft), right=r.right-px(cs.borderRightWidth)-px(cs.paddingRight);
            const w=Math.min(kpTextW(el, el.value||''), Math.max(0, right-left));
            const al=cs.textAlign;
            // 1020-J：光标和数字之间留一点空（原来贴在一起）
            const KP_CARET_GAP=3;
            let x = (al==='right'||al==='end') ? right+KP_CARET_GAP : (al==='center' ? (left+right)/2 + w/2 + KP_CARET_GAP : left+w+KP_CARET_GAP);
            x=Math.max(left, Math.min(right+KP_CARET_GAP, x));
            const fs=px(cs.fontSize)||16, h=Math.round(fs*1.05);
            const top=r.top + (r.height-h)/2;
            const ks=$('kpSheet').getBoundingClientRect();   // 金额框被数字键盘盖住时（还没滚上来）不画；空的时候光标放在提示字前面
            if(ks.height>0 && top+h/2>ks.top){ c.style.display='none'; return; }
            c.style.left=Math.round(x)+'px'; c.style.top=Math.round(top)+'px'; c.style.height=h+'px';
            c.style.display='block';
        }
        function kpCaretLoop(){ kpCaretPlace(); kpCaretRaf = kpTarget ? requestAnimationFrame(kpCaretLoop) : 0; }
        function kpCaretOn(){
            if(!kpCaretEl){ kpCaretEl=document.createElement('div'); kpCaretEl.id='kpCaret'; kpCaretEl.setAttribute('aria-hidden','true'); document.body.appendChild(kpCaretEl); }
            kpCaretEl.style.animation='none'; void kpCaretEl.offsetWidth; kpCaretEl.style.animation='';   // 每次换框、每按一下从「亮」开始闪
            if(!kpCaretRaf) kpCaretLoop(); else kpCaretPlace();
        }
        function kpCaretOff(){ if(kpCaretRaf){ cancelAnimationFrame(kpCaretRaf); kpCaretRaf=0; } if(kpCaretEl) kpCaretEl.style.display='none'; }
        // 1025-UX：大按钮能看情况换成别的事（上层登记进来）：kpOkWhen(id, ()=>({ ok:'保存', onOk })|null)，打开键盘那一刻问一次，
        //   给了就用它的字、点了先收键盘再做它的事；没给（null）照旧「确定」= 收起键盘。记一笔 / 修改账单用它：分类、收支都选好了，大按钮写「保存」，点了直接存
        const KP_OK_WHEN={};
        function kpOkWhen(id, fn){ KP_OK_WHEN[id]=fn; }
        function kpOpen(el, opts){
            opts=opts||{};
            if(!opts.ok && !opts.onOk && KP_OK_WHEN[el.id]){ let x=null; try{ x=KP_OK_WHEN[el.id](); }catch(_){} if(x) opts=Object.assign({}, opts, x); }
            if(kpTarget && kpTarget!==el) kpTarget.classList.remove('kp-on');
            kpTarget=el; kpOnOk=opts.onOk||null;
            el.classList.add('kp-on');
            $('kpOk').textContent=opts.ok || KP_FIELDS[el.id] || '确定';
            kpPaint();
            const shownNow=$('kpMask').style.display==='flex';
            $('kpMask').style.display='flex';
            if(shownNow) kpReveal(); else requestAnimationFrame(kpReveal);
            kpCaretOn();
        }
        // 整数模式关键盘时按范围收一下（小于 lo 的按 lo、大于 hi 的按 hi），发 input / change
        function kpIntClamp(el){
            const int=kpIntOf(el); if(!int || int.lo==null) return;
            const n=parseInt(el.value, 10);
            const v=String(isFinite(n) ? Math.min(Math.max(n, int.lo), int.hi) : int.lo);
            if(v===el.value) return;
            el.value=v;
            el.dispatchEvent(new Event('input', { bubbles:true })); el.dispatchEvent(new Event('change', { bubbles:true }));
        }
        function kpClose(){
            kpHoldStop();   // 1019-Z2：长按时键盘关了，停下
            if($('kpMask').style.display!=='flex' && !kpTarget) return;
            if(kpTarget) kpIntClamp(kpTarget);
            $('kpMask').style.display='none';
            if(kpTarget) kpTarget.classList.remove('kp-on');
            if(kpHost) kpHost.classList.remove('kp-lift');
            kpTarget=null; kpOnOk=null; kpHost=null;
            kpCaretOff();
        }
        window.kpOpen=kpOpen; window.kpClose=kpClose;   // 给测试用
        // 屏幕转了 / 可视区变了：重新定高
        window.addEventListener('resize', ()=>{ if(kpTarget && $('kpMask').style.display==='flex') kpReveal(); });
        $('kpGrid').addEventListener('click', e=>{
            const b=e.target.closest('.kp-key'); if(!b) return;
            if(b.id==='kpOk'){ const f=kpOnOk; kpClose(); if(f) f(); return; }
            if(kpHoldSkip===b && performance.now()-kpHoldSkipAt<1500){ kpHoldSkip=null; return; }
            kpHoldSkip=null;   // 1019-Z2 / 1020-C：按下时已经输过了（长按那套），这一下 click 不再输
            kpKey(b.dataset.k);
        });
        // 1019-Z2：退格长按连续删；1020-C 起数字键、小数点也一样（长按连续输入）：按下先输 / 删一个，停 KP_DEL_FIRST（400 毫秒）后开始连续，
        //   先每 100 毫秒一个，按住超过 1 秒后每 50 毫秒一个；输不进去了（超过位数、小数点已经有了、开头的 0）或删到空就自己停；
        //   松手、被打断、手指滑出按键立刻停（触屏按下以后事件一直送给这个键，所以每次移动都看手指还在不在键上）
        const KP_DEL_FIRST=400, KP_DEL_SLOW=100, KP_DEL_FAST=50, KP_DEL_SPEEDUP=1000;
        var kpHoldT=null, kpHoldAt=0, kpHoldKey=null, kpHoldEl=null, kpHoldSkip=null, kpHoldSkipAt=0;   // var：kpClose 在上面，早调用也不会因为还没初始化报错
        function kpHoldStop(){ if(kpHoldT){ clearTimeout(kpHoldT); kpHoldT=null; } if(kpHoldEl) kpHoldEl.classList.remove('kp-pressed'); kpHoldEl=null; kpHoldKey=null; }
        // 按一下：值变了返回 true（没变 = 输不进去 / 删空了，长按就该停）
        function kpStep(k){ if(!kpTarget) return false; const v0=kpTarget.value||''; kpKey(k); return !!kpTarget && (kpTarget.value||'')!==v0; }
        function kpHoldTick(){
            kpHoldT=null;
            if(!kpTarget || !kpHoldKey){ kpHoldStop(); return; }
            if(!kpStep(kpHoldKey) || (kpHoldKey==='del' && !(kpTarget.value||''))){ kpHoldStop(); return; }
            kpHoldT=setTimeout(kpHoldTick, (performance.now()-kpHoldAt)>=KP_DEL_SPEEDUP ? KP_DEL_FAST : KP_DEL_SLOW);
        }
        (function(){
            const grid=$('kpGrid');
            grid.addEventListener('pointerdown', e=>{
                const b=e.target.closest && e.target.closest('.kp-key');
                if(!b || b.id==='kpOk' || b.dataset.k==null) return;
                if(e.button!=null && e.button>0) return;
                kpHoldStop();
                kpHoldSkip=b; kpHoldSkipAt=performance.now(); kpHoldEl=b; kpHoldKey=b.dataset.k;
                b.classList.add('kp-pressed');
                kpHoldAt=performance.now();
                const moved=kpStep(kpHoldKey);
                if(moved && !(kpHoldKey==='del' && !(kpTarget && kpTarget.value))) kpHoldT=setTimeout(kpHoldTick, KP_DEL_FIRST);
            });
            grid.addEventListener('pointermove', e=>{
                const b=kpHoldEl; if(!b || e.clientX==null) return;
                const r=b.getBoundingClientRect();
                if(r.width && (e.clientX<r.left || e.clientX>r.right || e.clientY<r.top || e.clientY>r.bottom)) kpHoldStop();
            });
            ['pointerup','pointercancel'].forEach(ev=>grid.addEventListener(ev, kpHoldStop));
            grid.addEventListener('pointerout', e=>{ if(kpHoldEl && e.target===kpHoldEl && !kpHoldEl.contains(e.relatedTarget)) kpHoldStop(); });   // 相当于这个键的 pointerleave
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
        function kpBind(id){
            const el=$(id); if(!el) return;
            const go=e=>{ if(!kpOn() || el.dataset.kpLock==='1') return; if(e && e.type==='focus') el.blur(); kpOpen(el); };
            el.addEventListener('click', go);
            el.addEventListener('focus', go);
        }
        Object.keys(KP_FIELDS).forEach(kpBind);
        kpApply();
        // 导入简化 2a：以后新加的数字框在这里登记（页面上已经有这个元素时）：o = { ok: 大按钮的字, int: { len, lo, hi }（个数用整数模式，不给就是金额） }
        function kpRegister(id, o){
            o=o||{}; if(!$(id) || KP_FIELDS[id]) return false;
            KP_FIELDS[id]=o.ok || '确定'; if(o.int) KP_INT[id]=o.int;
            kpBind(id); kpFieldSet($(id), kpOn()); return true;
        }
        (function(){
            const seg=$('sysMoneyKbSeg'); if(!seg) return;
            function paint(){ const sys=!kpOn(); seg.querySelectorAll('button').forEach(b=>b.classList.toggle('on', (b.dataset.v==='on')===sys)); }
            seg.querySelectorAll('button').forEach(b=>b.addEventListener('click', ()=>{
                try{ if(b.dataset.v==='on') localStorage.setItem('app_sys_money_kb', '1'); else localStorage.removeItem('app_sys_money_kb'); }catch(_){}
                kpClose(); kpApply(); paint();
            }));
            paint();
        })();
        window.JiwenKeypad = { kpClose, kpOn, kpOpen, kpFit, kpOkWhen, kpRegister, get kpTarget(){ return kpTarget; }, get kpFitInfo(){ return kpFitInfo; } };   // keypad 模块对外只有这一个入口（get 的是会变的，读的时候才取）
})();
