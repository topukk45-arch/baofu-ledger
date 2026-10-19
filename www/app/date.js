(function(){
        const { $, billTime, editTime, pad } = window.JiwenBase;   // 用到前面模块的
        const { closeAllCs } = window.JiwenSelect;   // 用到前面模块的
        const { customAlert } = window.JiwenAsk;   // 用到前面模块的

        // ===== 自定义时间选择器 =====
        const dtMask=$('dtMask'), dtDays=$('dtDays'), dtLabel=$('dtLabel');
        const dtHour=$('dtHour'), dtMin=$('dtMin'), dtPreview=$('dtPreview');
        let dtTargetInput=null;   // 当前正在编辑哪个输入框
        let dtView={ year:new Date().getFullYear(), month:new Date().getMonth() };  // month 0-11，当前显示的月份
        let dtSel={ y:null, m:null, d:null }; // 选中的日期

        // 填充时分下拉
        for(let h=0; h<24; h++){ const o=document.createElement('option'); o.value=h; o.textContent=String(h).padStart(2,'0'); dtHour.appendChild(o); }
        for(let m=0; m<60; m++){ const o=document.createElement('option'); o.value=m; o.textContent=String(m).padStart(2,'0'); dtMin.appendChild(o); }

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

        // 绑定两个时间输入框
        billTime.addEventListener('click', ()=>openDtPicker(billTime));
        editTime.addEventListener('click', ()=>openDtPicker(editTime));
        // 1019-Q：那一行小字点了照样弹日期时间选择（原来的框藏起来，值还在它身上）
        $('billTimeLine').addEventListener('click', ()=>openDtPicker(billTime));
        $('editTimeLine').addEventListener('click', ()=>openDtPicker(editTime));
        // 别处直接改了 dataset.value（没走 setDtInput）也跟着改那一行
        [billTime, editTime].forEach(el=>{ try{ new MutationObserver(()=>paintRecTime(el)).observe(el, { attributes:true, attributeFilter:['data-value'] }); }catch(e){} });
        window.JiwenDate = { DT_YEAR_MAX, DT_YEAR_MIN, attachSwipe, closeDtPicker, getDtInput, openDtPicker, openDtPickerDate, playSlide, setDtInput };   // date 模块对外只有这一个入口
})();
