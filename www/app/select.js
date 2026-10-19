(function(){
        const { $ } = window.JiwenBase;   // 用到前面模块的

        // ===== 自定义金色下拉：包裹原生 select，保留全部 value/事件逻辑 =====
        // 面板采用「传送(portal)」策略：展开时把 .cs-panel 移到 <body> 下并改为 fixed 定位。
        // 为什么必须这么做：面板原本是 .cs-wrap 的 absolute 子元素，而时间选择器容器 .dt-dialog
        //   带 overflow-y:auto —— 只要祖先链上有 overflow，absolute 后代就一定被裁剪（规范行为）。
        //   于是旧实现里面板只能塞在弹窗内部，把弹窗从内部撑高（截图里弹窗底部那截空白就是证据）；
        //   撑到 max-height 上限后又改为内部滚动 —— 同一个操作两种表现，这才是「有时顶起来、有时顶不起来」的根源。
        //   移到 body 后，面板既不被裁剪、也不参与撑高，弹窗尺寸纹丝不动，面板可以自由画到弹窗外面。
        // 展开方向：永远向下（不做上下翻转，翻转会让同一个控件出现两种视觉行为，反而更乱）。
        //   若下方空间不足以完整显示，面板自身内部滚动（它本来就有 overflow-y:auto），
        //   并把选中项 scrollIntoView 到可视区，所以「53 分」这种靠后的值一打开就能看见。

        // 所有已增强下拉的关闭函数登记表。全局「点空白关下拉」的监听要调真正的 close()，
        // 而不能只 remove('open') —— 那样面板会永远留在 body 上、fixed 定位不动，变成甩不掉的幽灵浮层。
        const csClosers = [];
        // 「正在展开」标志：open() 期间置真，短暂屏蔽滚动/视口监听。
        // 因为 open() 内部的 scrollIntoView()、以及 WebView 在点击时附带的滚动/视口抖动，
        // 都会冒出事件被那两个监听逮到，把刚打开的面板立刻关掉（表现为「点了没反应」）。
        let csOpening = false;

        function enhanceSelect(sel){
            if(!sel || sel.dataset.csReady) return;
            sel.dataset.csReady='1';

            const wrap=document.createElement('div');
            wrap.className='cs-wrap';
            if(getComputedStyle(sel).display==='block' || sel.style.width==='100%') wrap.classList.add('cs-block');
            sel.parentNode.insertBefore(wrap, sel);
            wrap.appendChild(sel);
            sel.classList.add('cs-native');

            const display=document.createElement('div');
            display.className='cs-display';
            display.innerHTML='<span class="cs-text"></span><span class="cs-arrow">▼</span>';
            const panel=document.createElement('div');
            panel.className='cs-panel';
            wrap.appendChild(display);
            wrap.appendChild(panel);

            const textEl=display.querySelector('.cs-text');

            function buildPanel(){
                panel.innerHTML='';
                Array.from(sel.options).forEach(opt=>{
                    const o=document.createElement('div');
                    o.className='cs-opt'+(opt.value===sel.value?' sel':'');
                    o.textContent=opt.textContent;
                    o.onclick=(e)=>{
                        e.stopPropagation();
                        const changed = sel.value!==opt.value;
                        if(changed) sel.value=opt.value;
                        syncDisplay();
                        close();
                        if(changed){
                            // 先收起面板，再派发 change，避免 change 触发的重建把面板卡在展开态
                            setTimeout(()=>{ sel.dispatchEvent(new Event('change', {bubbles:true})); }, 0);
                        }
                    };
                    panel.appendChild(o);
                });
            }
            function syncDisplay(){
                const cur=sel.options[sel.selectedIndex];
                textEl.textContent=cur?cur.textContent:'';
                panel.querySelectorAll('.cs-opt').forEach((el,i)=>{
                    el.classList.toggle('sel', sel.options[i] && sel.options[i].value===sel.value);
                });
            }

            // 按触发器(display)的实时屏幕坐标摆放面板：永远在其正下方、同宽。
            // 高度取「240px」与「到可视区底部的剩余空间」的较小值，超出部分面板内部滚动。
            // 用 visualViewport.height 而非 innerHeight：键盘弹起时前者会收缩，面板才不会被键盘盖住。
            function positionPanel(){
                const r=display.getBoundingClientRect();
                const vh=(window.visualViewport && window.visualViewport.height) || window.innerHeight;
                const GAP=4, EDGE=12;              // 与触发器的间距 / 与屏幕底部的安全距离
                const room=vh - r.bottom - GAP - EDGE;
                panel.style.left  = r.left + 'px';
                panel.style.width = r.width + 'px';
                panel.style.top   = (r.bottom + GAP) + 'px';
                // 下方空间再小也保底 120px，宁可略微出屏也不要挤成一条缝（实际用不到，此处纯兜底）
                panel.style.maxHeight = Math.max(120, Math.min(240, room)) + 'px';
            }

            function open(){
                csOpening = true;                  // 屏蔽滚动/视口监听，避免刚开就被自己关掉
                closeAllCs(panel);                 // 先关掉其它已展开的下拉（含它们的 portal 收回）
                buildPanel();
                wrap.classList.add('open');
                // 传送到 body：脱离 .dt-dialog 的 overflow 裁剪与高度计算
                document.body.appendChild(panel);
                panel.classList.add('cs-portal','cs-open');
                positionPanel();
                // 把选中项滚进可视区（分钟有 60 项，53 这种靠后的值不滚就看不见）。
                // 这里**不能用 scrollIntoView**：
                //   ① 面板是 fixed 定位，scrollIntoView 可能连带滚动整个页面去「够」它；
                //   ② 它产生的 scroll 事件会被全局监听逮到，把面板自己关掉。
                // 直接算 scrollTop 更准，也完全不产生页面滚动。
                const selEl=panel.querySelector('.cs-opt.sel');
                if(selEl){
                    panel.scrollTop = Math.max(0,
                        selEl.offsetTop - (panel.clientHeight - selEl.offsetHeight)/2);
                }
                // 本次点击引发的滚动/视口抖动都发生在同一批任务里，下一帧再解除屏蔽
                requestAnimationFrame(()=>{ csOpening = false; });
            }
            function close(){
                wrap.classList.remove('open');
                panel.classList.remove('cs-portal','cs-open');
                // 清掉 JS 写的内联定位，收回 wrap，保证 DOM 与样式都回到初始状态（可反复开关）
                panel.style.left=''; panel.style.top='';
                panel.style.width=''; panel.style.maxHeight='';
                if(panel.parentNode!==wrap) wrap.appendChild(panel);
            }
            function isOpen(){ return wrap.classList.contains('open'); }

            csClosers.push({ close, isOpen, panel, reposition:positionPanel });

            display.onclick=(e)=>{ e.stopPropagation(); isOpen()?close():open(); };
            // 面板内部点击不冒泡到 document，避免刚展开就被全局「点空白关闭」收掉
            panel.addEventListener('click', e=>e.stopPropagation());

            // 选项变化（如分类/存档动态重建）时重建并同步；若正展开着，重建后尺寸可能变，需重新摆位
            const mo=new MutationObserver(()=>{
                buildPanel(); syncDisplay();
                if(isOpen()) positionPanel();
            });
            mo.observe(sel, {childList:true});

            // 当代码用 sel.value=... 赋值时，同步显示
            const proto=Object.getPrototypeOf(sel);
            const desc=Object.getOwnPropertyDescriptor(proto,'value');
            if(desc && desc.set){
                Object.defineProperty(sel,'value',{
                    get(){ return desc.get.call(this); },
                    set(v){ desc.set.call(this, v); syncDisplay(); },
                    configurable:true
                });
            }
            sel.addEventListener('change', syncDisplay);

            buildPanel(); syncDisplay();
        }

        // 关闭全部已展开的下拉（except 传入的面板则跳过，供 open() 内部复用）
        function closeAllCs(except){
            csClosers.forEach(c=>{ if(c.panel!==except && c.isOpen()) c.close(); });
        }

        // 点击空白处关闭所有自定义下拉。
        // 注意：这里必须调真正的 close()（会把 portal 面板收回并清掉 fixed 样式），
        // 只 remove('open') 会留下永远浮在 body 上的幽灵面板。
        // 这只关「下拉面板」，不关任何 .mask 弹窗 —— 弹窗一律只能按按钮关闭（既有设计，未改动）。
        document.addEventListener('click', ()=>closeAllCs());

        // 页面/弹窗内滚动或视口变化时：fixed 面板不会跟着内容走，会「飘」在错误位置，故收起。
        //
        // 【这里踩过一个自杀式的坑，务必留意】
        //   最初写成 window.addEventListener('scroll', closeAllCs, {capture:true})，结果是
        //   「点时/分完全没反应」—— 因为 open() 里会调 selEl.scrollIntoView() 把选中项滚进可视区，
        //   那是**面板自己内部的滚动**，同样会冒出 scroll 事件，被 capture 的监听逮到，
        //   于是面板刚打开就被自己关掉了。分钟有 60 项、面板必定可滚，所以每次必中。
        //   两道防线：
        //     ① 事件源在任何 .cs-panel 内部 → 直接忽略（那是面板自己的内部滚动，不该关它）
        //     ② open() 期间置 csOpening 标志，短暂屏蔽（兜住 WebView 在点击时附带触发的滚动）
        function onAnyScroll(e){
            if(csOpening) return;                                   // ② 开启序列中，忽略
            const t=e.target;
            // ① 滚动源自面板内部（含面板本身）→ 是它自己的内容在滚，不关
            if(t && t.nodeType===1 && t.closest && t.closest('.cs-panel')) return;
            closeAllCs();
        }
        window.addEventListener('scroll', onAnyScroll, {passive:true, capture:true});
        window.addEventListener('resize', ()=>closeAllCs(), {passive:true});
        if(window.visualViewport){
            // 键盘弹起/收起会改变可视区高度，此时面板的 top/maxHeight 都失效了。
            // 同样要避开开启序列：安卓上点击输入区常伴随一次 viewport 抖动。
            window.visualViewport.addEventListener('resize', ()=>{ if(!csOpening) closeAllCs(); });
        }

        // 初始化页面里所有原生下拉
        // 注意：billCat 不再增强为可见下拉——它已被分类标签(chips)取代，仅作隐藏取值用
        // 注意：billCat/billType/editCat/editType 均不增强为可见下拉——已被记账/修改弹窗的标签(chips)取代，仅作隐藏取值用
        // 注意：filterCat 也已被筛选标签(filterChips)取代，仅作隐藏取值用，不增强
        ['archiveSelect']   // 1019-T：dtHour / dtMin 换成滚轮了，不再做成下拉
            .forEach(id=>{ const el=$(id); if(el) enhanceSelect(el); });
        window.JiwenSelect = { closeAllCs };   // select 模块对外只有这一个入口
})();
