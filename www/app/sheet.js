(function(){
        const { $, SHEET_MS } = window.JiwenBase;   // 用到前面模块的
        const { getCats, recentCats } = window.JiwenStore;   // 用到前面模块的
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
            let tCand=false, tDrag=false, tY0=0, tX0=0, tDY=0, tLastY=0, tLastT=0, tVel=0, tChain=[];
            function touchReset(){ tCand=false; tDrag=false; tDY=0; tVel=0; tChain=[]; }
            // 1020-C：手指按下的地方往上数，一直到面板，哪些框能上下滚（textarea、列表、overflow 能滚的块，面板自己也算）。
            //   规矩：这些框只要有一个没在最顶上，往下拉就是滚框（交给原生）；都在最顶上、手指还往下拉，才算拉面板。
            //   往上滑永远是滚框，不动面板。原来只看面板自己 sheet.scrollTop，框里滑到底以后就划不回去（AI 导出的文字框）。
            function scrollsY(n){
                if(!(n.scrollHeight>n.clientHeight+1)) return false;
                if(n===sheet || n.tagName==='TEXTAREA') return true;
                const oy=getComputedStyle(n).overflowY; return oy==='auto' || oy==='scroll' || oy==='overlay';
            }
            function chainOf(el){
                const a=[];
                for(let n=el; n && n.nodeType===1; n=n.parentElement){ if(scrollsY(n)) a.push(n); if(n===sheet) break; }
                return a;
            }
            const chainAtTop=()=>sheet.scrollTop<=0 && tChain.every(n=>n.scrollTop<=0);
            sheet.addEventListener('touchstart', e=>{
                if(!sheetShown(sheetMask) || e.touches.length!==1){ touchReset(); return; }
                if(e.target && e.target.closest && e.target.closest('[data-nodrag]')){ touchReset(); return; }   // 1020-E：选色面板的色相 / 深浅条上拖，不算拉面板
                const p=e.touches[0];
                tCand=true; tDrag=false; tY0=p.clientY; tX0=p.clientX; tDY=0;
                tLastY=p.clientY; tLastT=Date.now(); tVel=0; tChain=chainOf(e.target);
            }, {passive:true});
            sheet.addEventListener('touchmove', e=>{
                if(!tCand) return;
                const p=e.touches[0];
                const dy=p.clientY-tY0, dx=p.clientX-tX0;
                if(!tDrag){
                    const atTop = chainAtTop();
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
        // ===== 1017-UI1：共用的底部面板（选分类 / 选一项 / 确认）=====
        //   和「筛选」浮层同一套样式和代码：.mask.sheet-mask > .sheet（顶上 .sheet-grip 拖动条 + 标题），往下拉关闭用 bindSheetDrag。
        //   JiwenSheet.open({ title, sub, body(容器, 关面板), foot(容器, 关面板), onDismiss, busy })：
        //     onDismiss：下拉 / 返回键 / 取消时调（等于「取消 / 再看看 / 继续导入」）；busy()：为真时（正在写入）下拉、返回键都不关
        //   JiwenSheet.pick({ title, sub, options:[{ value, label }], value, chips, onPick })：单选，点一下就选中并关掉；底部只有「取消」
        //     chips 为真时用筛选里分类那种圆角块（一行几个、自动换行），否则一行一个
        window.JiwenSheet=(function(){
            let mask=null, sheet=null, grip=null, titleEl=null, subEl=null, bodyEl=null, footEl=null, drag=null, cur=null;
            function build(){
                if(mask) return;
                mask=document.createElement('div'); mask.className='mask sheet-mask'; mask.id='uiSheetMask';
                sheet=document.createElement('div'); sheet.className='sheet ui-sheet'; sheet.id='uiSheet';
                grip=document.createElement('div'); grip.className='sheet-grip'; grip.id='uiSheetGrip';
                const hd=document.createElement('div'); hd.className='sheet-handle'; hd.setAttribute('aria-hidden','true');
                const head=document.createElement('div'); head.className='sheet-head';
                titleEl=document.createElement('h3'); titleEl.id='uiSheetTitle'; head.appendChild(titleEl);
                grip.appendChild(hd); grip.appendChild(head);
                subEl=document.createElement('div'); subEl.className='ui-sheet-sub'; subEl.id='uiSheetSub';
                bodyEl=document.createElement('div'); bodyEl.className='sheet-body ui-sheet-body'; bodyEl.id='uiSheetBody';
                footEl=document.createElement('div'); footEl.className='ui-sheet-foot'; footEl.id='uiSheetFoot';
                sheet.appendChild(grip); sheet.appendChild(subEl); sheet.appendChild(bodyEl); sheet.appendChild(footEl);
                mask.appendChild(sheet); document.body.appendChild(mask);
                sheetGhostWatch(mask);   // 1019-N：关掉时的收起动画（马上接上，不等观察者）
                drag=bindSheetDrag(mask, sheet, grip, ()=>dismiss());
            }
            function isOpen(){ return !!mask && mask.classList.contains('open'); }
            function close(){
                if(!mask) return;
                const was=cur; cur=null;
                mask.classList.remove('open'); drag.reset();
                mask.style.display='none';
                bodyEl.textContent=''; footEl.textContent='';
                return was;
            }
            function dismiss(){
                if(!cur || (cur.busy && cur.busy())) return;
                const fn=cur.onDismiss; close(); if(fn) fn();
            }
            function open(o){
                build();
                if(cur) close();
                cur=o||{};
                sheet.classList.toggle('ui-sheet-tall', !!cur.tall);   // 1020-J：内容多的（选色面板）能到 88% 屏幕高，和记一笔这类表单一样
                titleEl.textContent=cur.title||'';
                subEl.textContent=cur.sub||''; subEl.style.display=cur.sub?'':'none';
                bodyEl.textContent=''; footEl.textContent='';
                if(cur.body) cur.body(bodyEl, close);
                if(cur.foot) cur.foot(footEl, close);
                mask.style.zIndex=String(zAbove());
                mask.style.display='flex';
                drag.reset();
                sheet.scrollTop=0;
                mask.classList.add('open');
            }
            // 1020-G：从别的面板里打开（记一笔的统计 / 分类抽屉、详情上的修改……）时要盖在它上面：
            //   比现在开着的面板里最高的那层再高一层（日期选择、文字小面板、提示框、数字键盘这几种「工具层」本来就更高，不算）
            function zAbove(){
                let z=1000;
                document.querySelectorAll('.mask').forEach(m=>{
                    if(m===mask || m.style.display==='none' || !m.isConnected) return;
                    const cs=getComputedStyle(m); if(cs.display==='none') return;
                    const v=parseInt(cs.zIndex, 10); if(v>=z && v<1035) z=v+1;
                });
                return z;
            }
            function pick(o){
                const opts=o.options||[];
                // 1020-I：选分类的（chips，选项就是分类名）一律用分类抽屉（导入页的选分类面板也是这个）
                if(o.chips && opts.length && opts.every(x=>x.value===x.label && x.value)) return cats({ title:o.title, subText:o.sub, cats:opts.map(x=>x.value), value:o.value, onPick:o.onPick, onCancel:o.onCancel, countLabel:'可选的分类' });   // 1021-T16：导入页「共 7 个」看不懂，写「可选的分类 N 个」
                open({ title:o.title, sub:o.sub, onDismiss:o.onCancel,
                    body(box, done){
                        const wrap=document.createElement('div');
                        wrap.className=o.chips ? 'filter-chips ui-pick-chips' : 'ui-pick-list';
                        wrap.id='uiPickList';
                        opts.forEach(x=>{
                            const el=document.createElement(o.chips?'div':'button');
                            if(!o.chips) el.type='button';
                            el.className=(o.chips?'cc':'ui-btn block ui-pick-opt')+(x.value===o.value?' sel':'');
                            el.dataset.value=x.value; el.textContent=x.label;
                            el.addEventListener('click', ()=>{ done(); if(o.onPick) o.onPick(x.value); });
                            wrap.appendChild(el);
                        });
                        box.appendChild(wrap);
                        // 当前那项滚进可视区（分类很多时）
                        const sel=wrap.querySelector('.sel');
                        if(sel) requestAnimationFrame(()=>{ const sh=sheet; const top=sel.offsetTop - sh.clientHeight/2; if(top>0) sh.scrollTop=top; });
                    },
                    foot(box){
                        const row=document.createElement('div'); row.className='dialog-btn';
                        const c=document.createElement('button'); c.type='button'; c.className='cancel'; c.id='uiSheetCancel'; c.textContent='取消';
                        c.addEventListener('click', ()=>dismiss());
                        row.appendChild(c); box.appendChild(row);
                    } });
            }
            // 1020-G：分类抽屉（选分类）：顶上「选分类」+ 小字「支出 · 共 N 个」，分类不少于 CAT_SEARCH_MIN（12）个时有搜索框（按名字筛），
            //   「最近常用」一行 4 个、「全部」按分类管理里的顺序一行 4 个，现在选中的高亮；点一个就选好、关掉，回到原来的面板。
            //   底部「取消 | 管理分类」（左退右进；没给 onManage 的只有「取消」）。
            //   o: { title, type（expense / income / 空）, value, recent（不给就按 recentCats 算）, cats（不给就是全部分类）, onPick(分类), onManage, onCancel }
            const CAT_SEARCH_MIN=12;
            function cats(o){
                const all=(o.cats||getCats()).slice();
                const rec=(o.recent||recentCats(o.type)).filter(c=>all.includes(c)).slice(0, 4);
                const tn=o.type==='expense' ? '支出 · ' : o.type==='income' ? '收入 · ' : '';
                open({ title:o.title||'选分类', sub:(o.subText ? o.subText+' · ' : '')+(o.countLabel ? `${o.countLabel} ${all.length} 个` : `${tn}共 ${all.length} 个`), onDismiss:o.onCancel,
                    body(box, done){
                        const mk=(c)=>{ const b=document.createElement('button'); b.type='button'; b.className='cc'+(c===o.value?' sel':''); const sp=document.createElement('span'); sp.className='cc-t'; sp.textContent=c; b.appendChild(sp); b.dataset.value=c;
                            b.addEventListener('click', ()=>{ done(); if(o.onPick) o.onPick(c); }); return b; };
                        const sec=(h, list, id)=>{ const d=document.createElement('div'); d.className='cat-drawer-sec'; d.id=id;
                            const t=document.createElement('div'); t.className='cat-drawer-h'; t.textContent=h; d.appendChild(t);
                            const g=document.createElement('div'); g.className='cat-chips cat-grid4'; if(id==='catDrawerAll') g.id='uiPickList'; list.forEach(c=>g.appendChild(mk(c))); d.appendChild(g); return d; };   // 「全部」那一格也叫 uiPickList（和原来的选一项面板同名，导入页、测试照旧找得到）
                        let q=null;
                        if(all.length>=CAT_SEARCH_MIN){
                            const lb=document.createElement('label'); lb.className='cat-drawer-search';
                            lb.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>';
                            q=document.createElement('input'); q.type='search'; q.id='catDrawerQ'; q.placeholder='搜分类'; q.setAttribute('aria-label','搜分类'); q.setAttribute('enterkeyhint','search');
                            lb.appendChild(q); box.appendChild(lb);
                        }
                        const recBox=sec('最近常用', rec, 'catDrawerRecent'), allBox=sec('全部', all, 'catDrawerAll');
                        const none=document.createElement('div'); none.className='cat-drawer-none'; none.style.display='none';
                        box.appendChild(recBox); box.appendChild(allBox); box.appendChild(none);
                        if(q) q.addEventListener('input', ()=>{
                            const k=q.value.trim().toLowerCase(); let n=0;
                            allBox.querySelectorAll('.cc').forEach(b=>{ const hit=!k || b.textContent.toLowerCase().includes(k); b.style.display=hit?'':'none'; if(hit) n++; });
                            recBox.style.display=k ? 'none' : '';
                            allBox.querySelector('.cat-drawer-h').textContent=k ? `找到 ${n} 个` : '全部';
                            none.textContent=`没有「${q.value.trim()}」`; none.style.display=(k && !n) ? '' : 'none';
                        });
                    },
                    foot(box){
                        const row=document.createElement('div'); row.className='ui-pair';
                        const c=document.createElement('button'); c.type='button'; c.className='ui-btn'; c.id='uiSheetCancel'; c.textContent='取消';
                        c.addEventListener('click', ()=>dismiss());
                        row.appendChild(c);
                        if(o.onManage){
                            const m=document.createElement('button'); m.type='button'; m.className='ui-btn'; m.id='catDrawerManage'; m.textContent='管理分类';
                            m.addEventListener('click', ()=>{ close(); o.onManage(); });
                            row.appendChild(m);
                        }
                        box.appendChild(row);
                    } });
            }
            // 1020-G：统计面板（点「统计」那一行）：三行（计入 / 不计 / 往来），每行名字 + 一句说明，选中的打勾；点一下就选好并关掉；最下面「取消」
            //   o: { value, names, hints, onPick(值), onCancel }
            function modes(o){
                open({ title:'统计', onDismiss:o.onCancel,
                    body(box, done){
                        const list=document.createElement('div'); list.className='mode-pick'; list.id='modePick'; list.setAttribute('role','radiogroup');
                        ['normal','skip','flow'].forEach(v=>{
                            const b=document.createElement('button'); b.type='button'; b.className='mode-pick-row'+(v===o.value?' sel':''); b.dataset.v=v;
                            b.setAttribute('role','radio'); b.setAttribute('aria-checked', String(v===o.value));
                            const tx=document.createElement('div'); tx.className='mode-pick-txt';
                            const nm=document.createElement('b'); nm.textContent=o.names[v];
                            const ht=document.createElement('span'); ht.textContent=o.hints[v];
                            tx.appendChild(nm); tx.appendChild(ht); b.appendChild(tx);
                            if(v===o.value) b.insertAdjacentHTML('beforeend', '<svg class="mode-pick-ok" viewBox="0 0 24 24" role="img" aria-label="已选"><path d="M5 12l5 5 9-10"/></svg>');
                            b.addEventListener('click', ()=>{ done(); if(o.onPick) o.onPick(v); });
                            list.appendChild(b);
                        });
                        box.appendChild(list);
                    },
                    foot(box){
                        const c=document.createElement('button'); c.type='button'; c.className='ui-btn block'; c.id='uiSheetCancel'; c.textContent='取消';
                        c.addEventListener('click', ()=>dismiss());
                        box.appendChild(c);
                    } });
            }
            // 1020-J：常用模板列表（记一笔里点「常用」那一行）：标题「常用」+ 小字「点一个，金额、分类、备注一起填好」；
            //   一行一个：左边小圆标（分类第一个字）、中间名字 + 一行小字（分类 · 收支 · 统计 · 备注）、右边固定金额（没有不写）；
            //   点一个就选好、关掉；没有模板时写一句怎么存。底部「取消 | 管理常用」（左退右进）。
            //   o: { list:[{ id, c, name, sub, money }], value, onPick(id), onManage, onCancel }
            function tpls(o){
                open({ title:'常用', sub:'点一个，金额、分类、备注一起填好', onDismiss:o.onCancel,
                    body(box, done){
                        const list=o.list||[];
                        if(!list.length){
                            const e=document.createElement('div'); e.className='tpl-pick-empty'; e.id='tplPickEmpty';
                            e.textContent='还没有常用模板。记一笔填好以后，点底部的「存为常用」，就会出现在这里。';
                            box.appendChild(e); return;
                        }
                        const wrap=document.createElement('div'); wrap.className='rec-list tpl-pick'; wrap.id='tplPick';
                        list.forEach(x=>{
                            const b=document.createElement('button'); b.type='button'; b.className='tpl-pick-row'+(x.id===o.value?' sel':''); b.dataset.id=x.id;
                            const ic=document.createElement('span'); ic.className='tpl-pick-ic'; ic.setAttribute('aria-hidden','true'); ic.textContent=x.c||'';
                            const tx=document.createElement('span'); tx.className='tpl-pick-txt';
                            const nm=document.createElement('span'); nm.className='tpl-pick-name'; nm.textContent=x.name;
                            const sb=document.createElement('span'); sb.className='tpl-pick-sub'; sb.textContent=x.sub||'';
                            tx.appendChild(nm); tx.appendChild(sb);
                            b.appendChild(ic); b.appendChild(tx);
                            if(x.money){ const m=document.createElement('span'); m.className='tpl-pick-amt'; m.textContent=x.money; b.appendChild(m); }
                            b.addEventListener('click', ()=>{ done(); if(o.onPick) o.onPick(x.id); });
                            wrap.appendChild(b);
                        });
                        box.appendChild(wrap);
                    },
                    foot(box){
                        const row=document.createElement('div'); row.className='ui-pair';
                        const c=document.createElement('button'); c.type='button'; c.className='ui-btn'; c.id='uiSheetCancel'; c.textContent='取消';
                        c.addEventListener('click', ()=>dismiss());
                        const m=document.createElement('button'); m.type='button'; m.className='ui-btn'; m.id='tplPickManage'; m.textContent='管理常用';
                        m.addEventListener('click', ()=>{ close(); if(o.onManage) o.onManage(); });
                        row.appendChild(c); row.appendChild(m); box.appendChild(row);
                    } });
            }
            return { open, pick, cats, modes, tpls, close, isOpen, back:dismiss, _sheet:()=>sheet };
        })();

        // ===== 弹窗打开时锁定背景滚动，防止滚动穿透到主页面 =====
        (function(){
            const masks=Array.from(document.querySelectorAll('.mask'));
            let savedScrollY=0, locked=false;

            function anyMaskOpen(){
                return masks.some(m=>{
                    const d=getComputedStyle(m).display;
                    return d && d!=='none';
                });
            }
            function lock(){
                if(locked) return;
                savedScrollY=window.scrollY || window.pageYOffset || 0;
                document.body.style.position='fixed';
                document.body.style.top=`-${savedScrollY}px`;
                document.body.style.left='0';
                document.body.style.right='0';
                document.body.style.width='100%';
                locked=true;
            }
            function unlock(){
                if(!locked) return;
                document.body.style.position='';
                document.body.style.top='';
                document.body.style.left='';
                document.body.style.right='';
                document.body.style.width='';
                window.scrollTo(0, savedScrollY);
                locked=false;
            }
            function update(){ anyMaskOpen()?lock():unlock(); }

            // 监听每个弹窗的显示状态变化
            masks.forEach(m=>{
                new MutationObserver(update).observe(m, {attributes:true, attributeFilter:['style']});
            });

            // 弹窗内列表（可滚动区域）到顶/到底时，阻止滚动冒泡到背景，进一步防穿透
            // 1020-C：.cat-list（分类管理、常用模板的列表）、.ask-msg 不再拦：拦了以后面板收不到手指在列表里的移动，
            //   列表在最顶上往下拉也关不掉面板（往下拉关面板见 bindSheetDrag）。背景本来就被滚动锁锁住了，不会穿透。
            document.querySelectorAll('.edit-dialog, .dt-dialog').forEach(el=>{
                el.addEventListener('touchmove', e=>{ e.stopPropagation(); }, {passive:true});
            });
        })();

        // ===== 点击按下反馈：用事件委托给可点元素加 .pressed（WebView 里 :active 不稳，故用 JS）=====
        (function(){
            const SEL = 'button, .mini-btn, .link-btn, .cs-display, .dt-day, .dt-now, '
                      + '.pager button, .user-chip, .login-btn, .add-btn, .save, .cancel, '
                      + '.operate-btn, .logout, .cat-item button, .archive-bar select, .bl-row';   // 1023-A：账单一条一行，整行能点
            let cur=null;
            function press(e){
                const t=e.target.closest(SEL);
                if(!t || t.disabled) return;
                cur=t; t.classList.add('pressed');
            }
            function release(){
                if(cur){ cur.classList.remove('pressed'); cur=null; }
            }
            // 有 PointerEvent 就只用 pointer 一套（覆盖鼠标/触摸/触控笔），
            // 否则回退 touch；避免同一次按压在触屏上被 pointer+touch 触发两次。
            if(window.PointerEvent){
                document.addEventListener('pointerdown', press, {passive:true});
                document.addEventListener('pointerup', release, {passive:true});
                document.addEventListener('pointercancel', release, {passive:true});
            } else {
                document.addEventListener('touchstart', press, {passive:true});
                document.addEventListener('touchend', release, {passive:true});
                document.addEventListener('touchcancel', release, {passive:true});
            }
            // 滚动时若手指离开按钮，确保还原
            document.addEventListener('scroll', release, {passive:true, capture:true});
        })();

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
        // ===== 1020-H：第二层不加深 =====
        //   只有最下面那层面板盖住页面时加遮罩（变灰）；上面再叠的（日期选择、分类抽屉、统计面板、文字小面板、提示框……）遮罩透明，
        //   只靠面板自己的阴影分开层次（.mask.stack-over）。原来每层都加一层 0.3 的灰，叠两层下面那层一下子变深、还闪一下。
        //   遮罩出来、消失都和面板同一个时长（--sheet-ms）慢慢变（出来：.mask 的 maskIn；消失：影子的 ghostBgOut）。
        //   哪层在下面按 z-index 比，一样高的按在页面里的先后；数字键盘那层本来就透明，不算。
        function maskShown(m){ return m.isConnected && m.id!=='kpMask' && (m.style.display==='flex' || m.style.display==='block' || m.classList.contains('open')) && getComputedStyle(m).display!=='none'; }
        let stackQueued=false;
        function stackPaint(){
            stackQueued=false;
            if(typeof document==='undefined' || !document || !document.querySelectorAll) return;   // 页面已经关了（测试收尾）
            const all=[...document.querySelectorAll('.mask')];
            const on=all.filter(maskShown).map(m=>({ m, z:parseInt(getComputedStyle(m).zIndex, 10)||0, i:all.indexOf(m) }));
            on.sort((a, b)=>(a.z-b.z) || (a.i-b.i));
            all.forEach(m=>{ const over = on.length>1 && on[0].m!==m && on.some(x=>x.m===m); if(m.classList.contains('stack-over')!==over) m.classList.toggle('stack-over', over); });
            stackAlign(on);
        }
        // ===== 1020-J：叠起来的两层面板，顶边不许「差一点」 =====
        //   上面那层的顶边要么和下面那层对齐（一样高、整个盖住），要么至少比它低 STACK_ALIGN_MIN（64px）；
        //   差不到 64px 的（外观设置上开选色面板：只矮 20px，下面那层的顶边和圆角在上面露一窄条，像重影），把上面那层拉高到和下面那层顶边对齐。
        //   面板都是贴着屏幕底的，所以「顶边」= 遮罩下沿 − 面板自己的高（不受滑入动画的位移影响）；每次先放回原来的高再量，同一拍里量完设好，不闪。
        //   面板里的内容变了（换一页、搜分类）也重新对一次（ResizeObserver）。
        const STACK_ALIGN_MIN=64;
        let stackRO=null;
        function stackAlign(on){
            if(!stackRO && window.ResizeObserver) stackRO=new ResizeObserver(stackKick);
            let below=null;
            on.forEach(({ m })=>{
                const sh=m.querySelector(':scope > .sheet'); if(!sh) return;
                if(sh.dataset.stackAlign){ sh.style.minHeight=''; delete sh.dataset.stackAlign; }
                if(stackRO && !sh.__stackRO){ sh.__stackRO=1; stackRO.observe(sh); }
                const mb=m.getBoundingClientRect().bottom, h=sh.offsetHeight;
                if(!(h>0) || !(mb>0)) return;
                let top=mb-h;
                if(below!==null){
                    const d=top-below;
                    if(d>0.5 && d<STACK_ALIGN_MIN){ sh.style.minHeight=Math.ceil(mb-below)+'px'; sh.dataset.stackAlign='1'; top=below; }
                }
                below=top;
            });
        }
        function stackKick(){ if(stackQueued) return; stackQueued=true; Promise.resolve().then(stackPaint); }
        function sheetGhostWatch(m){
            if(!m.__stackWatch){ m.__stackWatch=1; new MutationObserver(stackKick).observe(m, { attributes:true, attributeFilter:['style', 'class'] }); }
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
            // 1020-B：快照用上没有：用上的写「快照：停下来时存的，3 分钟前」，没用上的写原因
            const SNAP_MISS={ nouser:'没有记住的账号', none:'没有快照', bad:'快照读不出来', build:'版本不对（快照是别的版本存的）', day:'不是今天存的', pref:'默认进入页面不一样', width:'屏幕宽度不一样', page:'存的时候翻到了第 2 页以后' };
            function snapNote(e){
                if(e.snap!=null){ const how=e.snapSrc==='idle' ? '停下来时存的' : e.snapSrc==='hide' ? '切后台时存的' : '';
                    const age=e.snapAge!=null ? (e.snapAge<60 ? e.snapAge+' 秒前' : e.snapAge<3600 ? Math.round(e.snapAge/60)+' 分钟前' : Math.round(e.snapAge/3600)+' 小时前') : '';
                    return (how||age) ? `快照：${[how, age].filter(Boolean).join('，')}；` : ''; }
                return e.snapMiss ? `没用上快照：${SNAP_MISS[e.snapMiss]||e.snapMiss}；` : '';
            }
            function fmt(e){
                if(typeof e.ts==='number') e=Object.assign({}, e, { at:P.localAt(e.ts) });   // 1019-Z4：有时间戳的按当地时间重新写（老记录没有，照原样）
                if(e.kind==='启动' && e.nat){ const n=e.nat, v=x=>x!=null ? x : '-';
                    return `${e.at} 启动全程（${n.proc ? '从点图标' : '从 Activity 创建'}算）：Activity 创建 ${v(n.act)} · WebView 建好 ${v(n.web)} · 网页开始 ${v(n.page)} · 首屏画好 ${v(n.first)} · ${n.ask!=null ? '网页说画好了 '+v(n.ask)+' · 页面进了绘制 '+v(n.ready) : '收到画好了 '+v(n.ready)} · 启动画面收起 ${n.wait ? v(n.gone) : '（没等首屏，系统第一帧就收）'}｜网页里：${e.snap!=null?'快照先出来 '+e.snap+' · ':''}脚本开始 ${e.script} · 数据库 ${e.db!=null?e.db:'-'} · 读完账本 ${e.read!=null?e.read:'-'} · 画好 ${e.render!=null?e.render:'-'} · 首屏出来 ${e.paint}；${e.n!=null?e.n+' 条':''}${e.n!=null?'；':''}${snapNote(e)}`; }
                if(e.kind==='启动') return `${e.at} 启动 ${e.ms}ms（${e.snap!=null?'快照先出来 '+e.snap+' · ':''}脚本开始 ${e.script} · 数据库 ${e.db!=null?e.db:'-'} · 读完账本 ${e.read!=null?e.read:'-'} · 画好 ${e.render!=null?e.render:'-'} · 首屏出来 ${e.paint}；${e.n!=null?e.n+' 条':''}${e.n!=null?'；':''}${snapNote(e)}）`;
                if(e.kind==='点输入框') return `${e.at} 点输入框到能输入 ${e.ms}ms（${e.what}）`;
                if(e.kind==='键盘') return `${e.at} 键盘 面板位置变了 ${e.moves} 次${e.blank!=null ? `，露出空白 ${e.blank} 帧` : ''}，最慢一帧 ${e.maxFrame}ms、平均 ${e.avgFrame}ms，可视区 ${e.vv}（${e.what}）`;
                if(e.kind==='打开面板' || e.kind==='关闭面板') return `${e.at} ${e.kind} ${e.ms}ms（${e.what}）`;
                return e.at+' '+JSON.stringify(e);
            }
            // 1020-D：按钮里的字上下居中没有（这台手机的字体当场量）：照分类块、统计、收支、主按钮的样子各摆一个看不见的，
            //   量「字形」的上下中心（canvas 的 actualBoundingBox）和框（边框以内）的上下中心差多少，正数偏下、负数偏上；
            //   再写字体的上下留白（fontBoundingBox）和中文字形高低（em），手机上字看着偏上时把这一行复制给开发者
            function fontCenterLine(){
                try{
                    const box=document.createElement('div');
                    box.style.cssText='position:fixed;left:0;top:0;width:360px;visibility:hidden;pointer-events:none;z-index:-1';
                    // 1020-H：照现在记一笔里的样子摆：分类块（4 个最近常用那种，字包在 span 里）、收支两个按钮、列表卡的一行、主按钮、筛选里的分类块
                    box.innerHTML='<div class="edit-dialog"><div class="cat-chips rec-cats"><div class="cc"><span class="cc-t">吃饭</span></div></div>'
                        +'<div class="cat-chips io-chips io-pair"><div class="cc"><span class="cc-t">支出</span></div></div>'
                        +'<div class="rec-list"><button class="rec-row"><span class="rec-row-k">统计</span><span class="rec-row-v">往来</span></button></div>'
                        +'<button class="ui-btn primary block">保存</button><div class="cat-chips"><div class="cc">吃饭</div></div></div>';
                    document.body.appendChild(box);
                    const cv=document.createElement('canvas').getContext('2d');
                    let em='';
                    const one=el=>{
                        const tx=el.querySelector('.cc-t, .rec-row-k') || el;
                        const n=tx.firstChild, rg=document.createRange(); rg.selectNodeContents(n);
                        const rc=rg.getClientRects()[0], cs=getComputedStyle(tx);
                        cv.font=`${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
                        const m=cv.measureText(n.nodeValue), fs=parseFloat(cs.fontSize)||16;
                        const base=rc.top+(rc.height-(m.fontBoundingBoxAscent+m.fontBoundingBoxDescent))/2+m.fontBoundingBoxAscent;
                        const ink=base+(m.actualBoundingBoxDescent-m.actualBoundingBoxAscent)/2;
                        const b=el.getBoundingClientRect(), t=b.top+parseFloat(cs.borderTopWidth), bt=b.bottom-parseFloat(cs.borderBottomWidth);
                        if(!em) em=`字体上下留白 ${(m.fontBoundingBoxAscent/fs).toFixed(2)}/${(m.fontBoundingBoxDescent/fs).toFixed(2)}em、中文字形 ${(m.actualBoundingBoxAscent/fs).toFixed(2)}/${(m.actualBoundingBoxDescent/fs).toFixed(2)}em`;
                        const d=Math.round((ink-(t+bt)/2)*10)/10; return (d>0?'+':'')+d;
                    };
                    const q=sel=>box.querySelector(sel);
                    const tb=!!(window.CSS && CSS.supports && CSS.supports('text-box', 'trim-both cap alphabetic'));
                    const nudge=getComputedStyle(document.documentElement).getPropertyValue('--txt-nudge-dev').trim() || ('自动 ' + (tb ? '0px' : '1px'));
                    const out=`按钮里的字上下差多少（这台手机当场量，正数偏下、负数偏上，单位 px）：分类块 ${one(q('.rec-cats .cc'))} · 收支 ${one(q('.io-pair .cc'))} · 列表卡的行 ${one(q('.rec-row'))} · 主按钮 ${one(q('.ui-btn'))} · 筛选里的分类块 ${one(q('.cat-chips:not(.rec-cats):not(.io-chips) .cc'))}｜按字形裁（text-box）${tb ? '支持' : '不支持'} · 字往下挪 ${nudge}｜${em}｜${getComputedStyle(q('.cc')).fontFamily}`;
                    box.remove();
                    return out;
                }catch(_){ return ''; }
            }
            function openPerfPage(){
                const rows=P.list().slice().reverse();
                const fc=fontCenterLine();
                const text=['记问性能记录（'+navigator.userAgent.replace(/^.*?\(([^)]*)\).*$/, '$1')+'）'].concat(fc ? [fc] : []).concat(rows.map(fmt)).join('\n');
                window.JiwenSheet.open({ title:'性能记录（开发中）', sub:rows.length ? `最近 ${rows.length} 条，新的在上（最多留 50 条，只在这台手机）` : '还没有记录：关掉 App 再打开、点几个输入框、开关几个面板，这里就有了。',
                    body(box){ const pre=document.createElement('pre'); pre.id='perfList'; pre.className='perf-list'; pre.textContent=(fc ? [fc] : []).concat(rows.map(fmt)).join('\n'); box.appendChild(pre); },
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
        window.JiwenPanel = { bindSheetDrag, sheetGhostsFinish };   // sheet 模块对外只有这一个入口
})();
