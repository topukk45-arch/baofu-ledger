(function(){
        const { $ } = window.JiwenBase;   // 用到前面模块的

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
            kpHoldStop();   // 1019-Z2：长按时键盘关了，停下
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
        Object.keys(KP_FIELDS).forEach(id=>{
            const el=$(id); if(!el) return;
            const go=e=>{ if(!kpOn()) return; if(e && e.type==='focus') el.blur(); kpOpen(el); };
            el.addEventListener('click', go);
            el.addEventListener('focus', go);
        });
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
        window.JiwenKeypad = { kpClose, kpOn, kpOpen, get kpTarget(){ return kpTarget; } };   // keypad 模块对外只有这一个入口（get 的是会变的，读的时候才取）
})();
