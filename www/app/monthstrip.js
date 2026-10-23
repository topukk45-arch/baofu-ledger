(function(){
        const { fabHold, fabWake } = window.JiwenBase;   // 用到前面模块的
        // ===== 1023-C：月份浮条（账单页、统计页共用）；1023-J 改：靠右、点一下切月份、右端带回顶箭头 =====
        //   底栏上方一条横着的月份带，靠右排：最右边一格是这个月，越往左越早（月份多了往左拨着看）。选中的那格深色底。
        //   点某个月就切过去；拨动只是滚着看，不会切月份（1023-C 原来「拨到中间、停下就切」：页面没露出来时浮条宽度是 0、滚不到选中的那格，
        //   露出来时浏览器补发一次滚动，就被当成拨到了最左边、切到了最早的月份——用户看到的「打开 App 显示成最早的月份」，这一版整个去掉）。
        //   超了预算的月份，月份字下面一个带白圈的小红点（和预算卡「超支」同一个红），选中的深色格子上也看得见。
        //   右端可以带一个回顶箭头（setTop(true) 才露出来）。
        //   出现 / 收起走共用的 fabWake / fabHold：叫 wake() 就出来，停 1.5 秒淡出；手指碰着它不收；pin(true) 时一直显示（列表不满一屏）。
        //   用法：const s=JiwenMonthStrip.create({ id, onPick(ym), onTop() })；s.set([{ ym:'2026-10', over:超预算 }], 选中的 ym)；s.wake()
        const UP_SVG='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg>';
        function create(o){
            const el=document.createElement('div'); el.className='mstrip'; el.id=o.id;
            el.innerHTML='<span class="ms-year"></span><div class="ms-track" role="listbox" aria-label="选择月份"></div>'
                + '<button type="button" class="ms-top" aria-label="回到顶部" tabindex="-1">'+UP_SVG+'</button>';
            document.body.appendChild(el);
            const track=el.querySelector('.ms-track'), yearEl=el.querySelector('.ms-year'), topBtn=el.querySelector('.ms-top');
            let months=[], sel=-1, sig='', pinned=false, placed=false;
            fabHold(el);
            function paint(){
                track.querySelectorAll('.ms-item').forEach((b, i)=>{
                    const on=i===sel;
                    b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false');
                });
                yearEl.textContent = months[sel] ? months[sel].ym.slice(0, 4)+'年' : '';
            }
            // 让选中的那格露在浮条里（选中的是最后一个月时贴到最右边）；浮条还没排版（宽度 0）就先不动，wake() 时再放
            function place(){
                const b=track.querySelectorAll('.ms-item')[sel];
                if(!b || !track.clientWidth) return;
                const max=track.scrollWidth-track.clientWidth;
                let x=track.scrollLeft;
                if(sel===months.length-1 || !placed) x=b.offsetLeft+b.offsetWidth-track.clientWidth+12;
                else if(b.offsetLeft<x) x=b.offsetLeft-12;
                else if(b.offsetLeft+b.offsetWidth>x+track.clientWidth) x=b.offsetLeft+b.offsetWidth-track.clientWidth+12;
                track.scrollLeft=Math.max(0, Math.min(max, x));
                placed=true;
            }
            track.addEventListener('scroll', ()=>fabWake(el, true), { passive:true });   // 拨着看的时候别收
            track.addEventListener('click', e=>{
                const b=e.target.closest('.ms-item'); if(!b) return;
                const i=+b.dataset.i;
                if(i!==sel){ sel=i; paint(); place(); if(o.onPick) o.onPick(months[i].ym); }
                wake();
            });
            topBtn.addEventListener('click', ()=>{ if(o.onTop) o.onTop(); });
            // 月份表或选中的变了才重画
            function set(list, ym){
                const s2=JSON.stringify(list)+'|'+ym;
                if(s2===sig){ place(); return; } sig=s2;
                months=list;
                track.innerHTML='<span class="ms-pad" aria-hidden="true"></span>'
                    + list.map((m, i)=>`<button type="button" class="ms-item${m.over ? ' over' : ''}" role="option" data-i="${i}" data-ym="${m.ym}"><span class="ms-lab">${+m.ym.slice(5, 7)}月</span>${m.over ? '<i class="ms-dot" aria-label="超了预算"></i>' : ''}</button>`).join('');
                sel=list.findIndex(m=>m.ym===ym); if(sel<0) sel=list.length-1;
                placed=false; paint(); place();
            }
            function wake(){
                place();
                fabWake(el, true);
            }
            function hide(){ if(!pinned) fabWake(el, false); }
            // 列表不满一屏：一直显示，不再自己收起
            function pin(on){
                on=!!on; if(on===pinned) return;
                pinned=on;
                el._fabIdle = on ? 1e9 : 0;   // fabWake / fabHold 照常调，停多久按这个：钉住时等于不收
                if(on){ fabWake(el, true); place(); }
                else fabWake(el, true);
            }
            // 回顶箭头：滑过一屏才露出来，回到顶部就藏
            function setTop(on){ el.classList.toggle('has-top', !!on); topBtn.tabIndex = on ? 0 : -1; }
            return { el, set, wake, hide, pin, setTop, get ym(){ return months[sel] ? months[sel].ym : null; }, get pinned(){ return pinned; } };
        }
        window.JiwenMonthStrip = { create };   // monthstrip 模块对外只有这一个入口
})();
