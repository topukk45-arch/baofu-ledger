(function(){
        const { fabHold, fabWake } = window.JiwenBase;   // 用到前面模块的
        // ===== 1023-C：月份浮条（账单页、统计页共用）；1023-J 改：靠右、点一下切月份、右端带回顶箭头；1025-UX 改：拨动松手切月份 =====
        //   1025-UX：中间一个深色选中框（.ms-sel，不动），月份在它下面左右拨；松手、停下来（MS_SETTLE 毫秒没再滚、手指离开）就切到框里那个月。
        //   两头各垫半条宽的空白（.ms-pad），最早的月份和这个月都能拨到中间；这个月右边是空的，一看就知道没有更晚的了。点某个月也行（滚到中间并切过去）。
        //   1023-J 那次「打开 App 显示成最早的月份」：页面没露出来时浮条宽度是 0，露出来浏览器补发一次滚动，被当成拨到了最左边。
        //   现在只认手指真拨过的（touchstart 之后这一次手势里滚过、松手停下了；鼠标滚轮也算），代码自己滚的（放回选中的那格）、
        //   浏览器补发的滚动、宽度是 0 时的滚动一概不算，所以不会再自己跳月份。
        //   超了预算的月份，月份字下面一个带白圈的小红点（和预算卡「超支」同一个红），选中框里也看得见。
        //   右端可以带一个回顶箭头（setTop(true) 才露出来）。
        //   出现 / 收起走共用的 fabWake / fabHold：叫 wake() 就出来，停 1.5 秒淡出；手指碰着它不收；pin(true) 时一直显示（列表不满一屏）。
        //   用法：const s=JiwenMonthStrip.create({ id, onPick(ym), onTop() })；s.set([{ ym:'2026-10', over:超预算 }], 选中的 ym)；s.wake()
        const MS_SETTLE=160;    // 松手以后停多久没再滚，算拨好了
        const UP_SVG='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg>';
        function create(o){
            const el=document.createElement('div'); el.className='mstrip'; el.id=o.id;
            el.innerHTML='<div class="ms-sel" aria-hidden="true"></div><span class="ms-year"></span><div class="ms-track" role="listbox" aria-label="选择月份，左右拨"></div>'
                + '<button type="button" class="ms-top" aria-label="回到顶部" tabindex="-1">'+UP_SVG+'</button>';
            document.body.appendChild(el);
            const track=el.querySelector('.ms-track'), yearEl=el.querySelector('.ms-year'), topBtn=el.querySelector('.ms-top');
            let months=[], sel=-1, pre=-1, sig='', pinned=false;
            let touching=false, gest=false, moved=false, settleT=null, progT=null, prog=false;
            fabHold(el);
            function clamp(i){ return Math.max(0, Math.min(months.length-1, i)); }
            function items(){ return track.querySelectorAll('.ms-item'); }
            // 现在框里（浮条正中）是哪一格
            function centered(){
                const its=items(); if(!its.length || !track.clientWidth) return -1;
                const mid=track.scrollLeft+track.clientWidth/2;
                let best=-1, bd=1e9;
                its.forEach((b, i)=>{ const d=Math.abs(b.offsetLeft+b.offsetWidth/2-mid); if(d<bd){ bd=d; best=i; } });
                return best;
            }
            function paint(){
                items().forEach((b, i)=>{
                    const on=i===pre;
                    b.classList.toggle('on', on); b.setAttribute('aria-selected', i===sel ? 'true' : 'false');
                });
                const m=months[pre>=0 ? pre : sel];
                yearEl.textContent = m ? m.ym.slice(0, 4)+'年' : '';
            }
            // 代码自己把第 i 格滚到正中（不算拨）；浮条还没排版（宽度 0）就先不动，wake() 时再放
            function go(i, smooth){
                const b=items()[i];
                if(!b || !track.clientWidth) return;
                const x=b.offsetLeft+b.offsetWidth/2-track.clientWidth/2;
                prog=true; clearTimeout(progT); progT=setTimeout(()=>{ prog=false; }, smooth ? 450 : 80);
                if(smooth && !reduce()){ try{ track.scrollTo({ left:x, behavior:'smooth' }); return; }catch(_){} }
                track.scrollLeft=x;
            }
            function reduce(){ try{ return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(_){ return false; } }
            function place(){ go(sel, false); }
            // 松手停好了：手指真拨过才切
            function settle(){
                clearTimeout(settleT); settleT=null;
                if(touching || !gest) return;
                const ok=moved;
                gest=false; moved=false;
                if(!ok || !track.clientWidth || !el.classList.contains('show')) return;
                const i=centered(); if(i<0) return;
                pre=i;
                if(i!==sel){ sel=i; paint(); if(o.onPick) o.onPick(months[i].ym); }
                else paint();
                go(sel, true);   // 停在两格中间的（没吸好的老 WebView）摆正
            }
            function arm(){ clearTimeout(settleT); settleT=setTimeout(settle, MS_SETTLE); }
            track.addEventListener('scroll', ()=>{
                fabWake(el, true);   // 拨着看的时候别收
                if(prog || !gest || !track.clientWidth) return;
                moved=true;
                const i=centered();
                if(i>=0 && i!==pre){ pre=i; paint(); }
                if(!touching) arm();
            }, { passive:true });
            if('onscrollend' in track) track.addEventListener('scrollend', ()=>{ if(gest && !touching) settle(); });
            track.addEventListener('touchstart', ()=>{ touching=true; gest=true; moved=false; prog=false; clearTimeout(progT); clearTimeout(settleT); clearTimeout(el._fabT); }, { passive:true });
            ['touchend', 'touchcancel'].forEach(ev=>track.addEventListener(ev, ()=>{ touching=false; fabWake(el, true); arm(); }, { passive:true }));
            track.addEventListener('wheel', ()=>{ gest=true; arm(); }, { passive:true });   // 电脑上用滚轮 / 触控板拨
            track.addEventListener('click', e=>{
                const b=e.target.closest('.ms-item'); if(!b) return;
                const i=+b.dataset.i;
                gest=false; moved=false; clearTimeout(settleT);
                pre=i;
                if(i!==sel){ sel=i; paint(); if(o.onPick) o.onPick(months[i].ym); }
                else paint();
                go(i, true);
                fabWake(el, true);
            });
            topBtn.addEventListener('click', ()=>{ if(o.onTop) o.onTop(); });
            // 月份表或选中的变了才重画（每次重画列表都会调，没变就不动，免得拨到一半被拉回去）
            function set(list, ym){
                const s2=JSON.stringify(list)+'|'+ym;
                if(s2===sig){ if(!touching && !gest) place(); return; } sig=s2;
                months=list;
                track.innerHTML='<span class="ms-pad" aria-hidden="true"></span>'
                    + list.map((m, i)=>`<button type="button" class="ms-item${m.over ? ' over' : ''}" role="option" data-i="${i}" data-ym="${m.ym}"><span class="ms-lab">${+m.ym.slice(5, 7)}月</span>${m.over ? '<i class="ms-dot" aria-label="超了预算"></i>' : ''}</button>`).join('')
                    + '<span class="ms-pad" aria-hidden="true"></span>';
                sel=list.findIndex(m=>m.ym===ym); if(sel<0) sel=list.length-1;
                pre=sel; gest=false; moved=false; clearTimeout(settleT);
                paint(); place();
            }
            function wake(){
                if(!touching && !gest && !prog) place();   // 藏着时滚不动，出来时放回选中的那格
                fabWake(el, true);
            }
            function hide(){ if(!pinned) fabWake(el, false); }
            // 列表不满一屏：一直显示，不再自己收起
            function pin(on){
                on=!!on; if(on===pinned) return;
                pinned=on;
                el._fabIdle = on ? 1e9 : 0;   // fabWake / fabHold 照常调，停多久按这个：钉住时等于不收
                if(on){ fabWake(el, true); if(!touching && !gest) place(); }
                else fabWake(el, true);
            }
            // 回顶箭头：滑过一屏才露出来，回到顶部就藏
            function setTop(on){ el.classList.toggle('has-top', !!on); topBtn.tabIndex = on ? 0 : -1; }
            return { el, set, wake, hide, pin, setTop, get ym(){ return months[sel] ? months[sel].ym : null; }, get pinned(){ return pinned; } };
        }
        window.JiwenMonthStrip = { create };   // monthstrip 模块对外只有这一个入口
})();
