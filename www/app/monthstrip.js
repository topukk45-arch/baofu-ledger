(function(){
        const { fabHold, fabWake } = window.JiwenBase;   // 用到前面模块的
        // ===== 1023-C：月份浮条（账单页、统计页共用）=====
        //   底栏上方一条横着的月份带：中间深色选中框，离中间越远越小越淡，每格下面一根小柱子是那个月花了多少，左上角写年份。
        //   左右拨，松手吸到最近一个月（停 MS_SETTLE 毫秒没再动）才真正切换；拨的过程中只改高亮，不叫页面重画。点某个月也行。
        //   出现 / 收起走共用的 fabWake / fabHold：叫 wake() 就出来，停 1.5 秒淡出；手指碰着它不收。
        //   用法：const s=JiwenMonthStrip.create({ id, onPick(ym) })；s.set([{ ym:'2026-10', v:支出, over:超预算 }], 选中的 ym)；s.wake()
        const MS_W=64;          // 一格多宽（和样式表 .ms-item 的宽一样）
        const MS_SETTLE=160;    // 停下多久算松手吸好了
        function create(o){
            const el=document.createElement('div'); el.className='mstrip'; el.id=o.id;
            el.innerHTML='<div class="ms-sel" aria-hidden="true"></div><span class="ms-year"></span><div class="ms-track" role="listbox" aria-label="选择月份"></div>';
            document.body.appendChild(el);
            const track=el.querySelector('.ms-track'), yearEl=el.querySelector('.ms-year');
            let months=[], sel=-1, pre=-1, settleT=null, progT=null, prog=false, touching=false, sig='';
            fabHold(el);
            function clamp(i){ return Math.max(0, Math.min(months.length-1, i)); }
            function paint(){
                track.querySelectorAll('.ms-item').forEach((b, i)=>{
                    const d=Math.abs(i-pre), on=i===pre;
                    b.style.transform=`scale(${on ? 1.06 : Math.max(0.84, 1-d*0.06)})`;
                    b.style.opacity=String(on ? 1 : Math.max(0.4, 1-d*0.2));
                    b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false');
                });
                if(months[pre]) yearEl.textContent=months[pre].ym.slice(0, 4)+'年';
            }
            function go(i, smooth){
                prog=true; clearTimeout(progT); progT=setTimeout(()=>{ prog=false; }, smooth ? 450 : 60);
                try{ track.scrollTo({ left:i*MS_W, behavior:smooth ? 'smooth' : 'instant' }); }catch(_){ track.scrollLeft=i*MS_W; }
            }
            function commit(){
                if(touching) return;
                if(pre>=0 && pre!==sel){ sel=pre; if(o.onPick) o.onPick(months[sel].ym); }
            }
            track.addEventListener('scroll', ()=>{
                fabWake(el, true);
                if(prog) return;
                const i=clamp(Math.round(track.scrollLeft/MS_W));
                if(i!==pre){ pre=i; paint(); }
                clearTimeout(settleT); settleT=setTimeout(commit, MS_SETTLE);
            }, { passive:true });
            el.addEventListener('pointerdown', ()=>{ touching=true; });
            ['pointerup', 'pointercancel'].forEach(ev=>el.addEventListener(ev, ()=>{ touching=false; clearTimeout(settleT); settleT=setTimeout(commit, MS_SETTLE); }));
            track.addEventListener('click', e=>{
                const b=e.target.closest('.ms-item'); if(!b) return;
                const i=+b.dataset.i; pre=i; paint(); go(i, true);
                if(i!==sel){ sel=i; if(o.onPick) o.onPick(months[i].ym); }
                fabWake(el, true);
            });
            // 月份表或选中的变了才重画（每次重画列表都会调，没变就不动，免得拨到一半被拉回去）
            function set(list, ym){
                const s2=JSON.stringify(list)+'|'+ym;
                if(s2===sig) return; sig=s2;
                months=list;
                const max=Math.max(1, ...list.map(m=>m.v||0));
                track.innerHTML=list.map((m, i)=>`<button type="button" class="ms-item${m.over ? ' over' : ''}" role="option" data-i="${i}" data-ym="${m.ym}"><span class="ms-bar"><i style="height:${Math.max(3, Math.round((m.v||0)/max*16))}px"></i></span><span class="ms-lab">${+m.ym.slice(5, 7)}月</span></button>`).join('');
                sel=list.findIndex(m=>m.ym===ym); if(sel<0) sel=list.length-1;
                pre=sel; paint(); go(sel, false);
            }
            function wake(){
                if(!touching && !prog && Math.abs(track.scrollLeft-sel*MS_W)>1) go(sel, false);   // 藏着时滚不动，出来时放回选中的那格
                fabWake(el, true);
            }
            function hide(){ fabWake(el, false); }
            return { el, set, wake, hide, get ym(){ return months[sel] ? months[sel].ym : null; } };
        }
        window.JiwenMonthStrip = { create };   // monthstrip 模块对外只有这一个入口
})();
