(function(){
        const { $, escapeHtml, pad, safeNum } = window.JiwenBase;   // 用到前面模块的
        const { charLen, genId, isValidDay, loadDays } = window.JiwenStore;   // 用到前面模块的
        const { customAlert, customConfirm } = window.JiwenAsk;   // 用到前面模块的
        const { openDtPickerDate } = window.JiwenDate;   // 用到前面模块的
        const { calcDay, dayNumHtml, fmtDayDate, saveDays, sortedDays } = window.JiwenStats;   // 用到前面模块的

        // ===== 入口卡显示条数（可配置）=====
        // 【为什么有上限 99】需求是「上不封顶」，但输入框只允许两位数，所以实际天花板就是 99。
        //   这没有削弱需求：入口卡是记账页顶部的一张小卡，真要展示 99 条也早就滚出屏幕了；
        //   而且超出的条目在日子页里一条不少，纯粹是「露多少」的问题，不涉及丢数据。
        const DAYS_CARD_MIN=3, DAYS_CARD_MAX=99, DAYS_CARD_DEFAULT=3;
        function daysCardKey(user){ return `days_card_n_${user!==undefined ? user : JiwenBase.currentUser}`; }
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
        $('daysAdd').addEventListener('click', ()=>openDayDialog(null));

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
            $('dmBatch').querySelector('.rec-row-k').textContent = has ? '批量删除日子' : '批量删除日子（暂无日子）';   // 1020-I：列表行，只改名字那一格
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
                const ln=$('daysLines'); if(ln) ln.innerHTML='';
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
                    +   `<div class="di-name">${d.pin?'<svg class="di-star" viewBox="0 0 24 24" role="img" aria-label="置顶"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>':''}<span class="di-nm">${escapeHtml(d.name)}</span></div>`
                    +   `<div class="di-date">${escapeHtml(fmtDayDate(d.date))}</div>`
                    + `</div>`
                    + `<div class="di-r">${dayNumHtml(c,'di')}</div>`
                    + `</div>`;
            }).join('');
            paintDaysLines();
        }
        // 1020-H：日子下面接着画几条更淡的虚线，一直画到底部操作栏上面（像草稿纸那样排）
        function paintDaysLines(){
            const box=$('daysLines'); if(!box) return;
            const list=$('daysList'), bar=$('daysBar');
            const top=list.getBoundingClientRect().bottom + window.scrollY;
            const barTop=bar && bar.getBoundingClientRect().height ? bar.getBoundingClientRect().top + window.scrollY : window.innerHeight;
            const n=Math.max(0, Math.min(30, Math.floor((barTop - top)/72)));
            if(box.childElementCount!==n) box.innerHTML='<div></div>'.repeat(n);
        }
        window.addEventListener('resize', ()=>{ if($('pageDays').style.display==='block') paintDaysLines(); });
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
            $('dayDateTxt').textContent = s ? fmtDayDate(s) : '选择目标日期';   // 1020-I：目标日期那一行
            updateDayPreview();
        }
        // 复用现有的纯日期选择器（openDtPickerDate），不另造一个
        dayDate.addEventListener('click', ()=>{
            openDtPickerDate(dayDate.dataset.day || todayStr(), (day)=>setDayDate(day));
        });
        dayPin.addEventListener('click', ()=>dayPin.classList.toggle('on'));
        // 1020-I：目标日期、置顶是列表行：点整行都行
        $('dayDateLine').addEventListener('click', ()=>dayDate.click());
        $('dayPinRow').addEventListener('click', e=>{ if(e.target!==dayPin) dayPin.classList.toggle('on'); });

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
        window.JiwenDays = { closeDayDialog, closeDayMgr, get daysSelecting(){ return daysSelecting; }, exitSelectMode, openDayDialog, renderDaysCard, renderDaysList };   // days 模块对外只有这一个入口（get / set 的是会变的变量，读写的时候才去取）
})();
