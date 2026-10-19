        // ============================================================
        // ===== 统计模块（纯手写 SVG，跟随外观主题变量） =====
        // ============================================================
        let statYear, statMonth;     // 当前查看的年/月（month: 0-11）
        let statSelDay=null;         // 当前选中的日（1-31）

        // 读取 CSS 变量当前值，让 SVG 颜色跟着外观走
        function cssVar(name){ return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

        // —— 统计页自带的颜色工具（独立于外观系统的私有函数，避免作用域报错） ——
        function statHexToRgb(h){ h=(h||'').replace('#',''); if(h.length===3)h=h.split('').map(c=>c+c).join('');
            if(h.length<6) h='d4af37';
            return { r:parseInt(h.slice(0,2),16), g:parseInt(h.slice(2,4),16), b:parseInt(h.slice(4,6),16) }; }
        function statRgbToHsl(r,g,b){ r/=255;g/=255;b/=255; const mx=Math.max(r,g,b),mn=Math.min(r,g,b); let h,s,l=(mx+mn)/2;
            if(mx===mn){h=s=0;}else{const d=mx-mn; s=l>0.5?d/(2-mx-mn):d/(mx+mn);
                switch(mx){case r:h=(g-b)/d+(g<b?6:0);break;case g:h=(b-r)/d+2;break;default:h=(r-g)/d+4;}h/=6;}
            return { h:h*360, s:s*100, l:l*100 }; }
        function statHslToHex(h,s,l){ h=(h%360+360)%360; s=Math.max(0,Math.min(100,s))/100; l=Math.max(0,Math.min(100,l))/100;
            const c=(1-Math.abs(2*l-1))*s, x=c*(1-Math.abs((h/60)%2-1)), m=l-c/2; let r,g,b;
            if(h<60)[r,g,b]=[c,x,0];else if(h<120)[r,g,b]=[x,c,0];else if(h<180)[r,g,b]=[0,c,x];
            else if(h<240)[r,g,b]=[0,x,c];else if(h<300)[r,g,b]=[x,0,c];else[r,g,b]=[c,0,x];
            const f=v=>Math.round(Math.max(0,Math.min(255,(v+m)*255))).toString(16).padStart(2,'0');
            return '#'+f(r)+f(g)+f(b); }

        // 为当月每个分类分配稳定颜色：基于主题色在色相环上均匀散开，保证跟随主题
        function catColor(idx, total){
            const base=cssVar('--c-primary')||'#d4af37';
            const {r,g,b}=statHexToRgb(base);
            const {h,s}=statRgbToHsl(r,g,b);
            const hue=(h + idx*(360/Math.max(total,1))) % 360;
            return statHslToHex(hue, Math.max(s,45), 50);
        }

        function statRecords(){
            // 统计基于当前存档的全部记录
            return getUserData().slice();
        }

        // 给每条记录预解析出年/月/日/时间戳，供统计页各处共用。
        // 每条只调一次 parseRecTime（正则 + new Date），把 O(遍历次数 × n) 压成 O(n)。
        // 返回的是包装对象，原记录挂在 .r 上——不改动原对象，避免脏字段流回存储。
        function decorateRecs(recs){
            return recs.map(r=>{
                const t=parseRecTime(r.time);
                return { r, y:t.getFullYear(), mo:t.getMonth(), d:t.getDate(),
                         hh:t.getHours(), mi:t.getMinutes(), ts:t.getTime() };
            });
        }

        function renderStats(){
            if(statYear===undefined){
                const now=new Date();
                statYear=now.getFullYear(); statMonth=now.getMonth();
            }
            renderStatCalendar();
        }
        // 1016-P：统计页顶上的待处理横幅「本月还有 N 笔导入账单待确认，共 x 元 [去处理]」。
        //   只在开发开关开着时读待处理池（开关关着时什么都不读、不显示）；这个月没有待处理就不显示。首页不加红点
        var __pendBannerSeq=0;   // var：统计页可能在这行执行前就渲染
        function renderPendBanner(){
            const my=++__pendBannerSeq, old=$('statPendBanner');
            let on=false; try{ on=localStorage.getItem('app_dev_import')==='1'; }catch(_){}
            let t=null;
            if(on){ try{ t=impTarget(); }catch(_){ t=null; } }
            if(!t){ if(old) old.remove(); return; }
            const month=`${statYear}-${pad(statMonth+1)}`;
            impGetJson(t.e, impPendKey(t.e.id, t.aid)).then(o=>{
                if(my!==__pendBannerSeq) return;
                let n=0, fen=0;
                ((o && Array.isArray(o.items)) ? o.items : []).forEach(x=>{ if(x && String(x.t||'').slice(0, 7)===month){ n++; fen+=Number(x.amt)||0; } });
                // 1017-L：这个月带 AI 标记的记录
                const flagged=getUserData().filter(r=>r.aiFlag && typeof r.time==='string' && r.time.slice(0, 7)===month);
                let b=$('statPendBanner');
                if(!n && !flagged.length){ if(b) b.remove(); return; }
                if(!b){
                    b=document.createElement('div'); b.id='statPendBanner'; b.className='stat-pend-banner';
                    const pane=$('statPaneFlow'); pane.insertBefore(b, pane.firstChild);
                }
                b.textContent='';
                if(n){
                    const tx=document.createElement('span'); tx.textContent=`本月还有 ${n} 笔导入账单待确认，共 ${(fen/100).toFixed(2)} 元`;
                    const go=document.createElement('button'); go.type='button'; go.id='statPendGo'; go.textContent='去处理';
                    go.addEventListener('click', ()=>{ loadImportUI().then(ui=>ui.openPending()).catch(e=>customAlert('导入模块没加载上：' + (e && e.message || e), '待处理')); });
                    b.appendChild(tx); b.appendChild(go);
                }
                if(flagged.length){
                    const tx2=document.createElement('span'); tx2.id='statAiFlags'; tx2.textContent=`有 ${flagged.length} 条 AI 标记待看`;
                    const go2=document.createElement('button'); go2.type='button'; go2.id='statAiFlagsGo'; go2.textContent='去看';
                    go2.addEventListener('click', ()=>openAiFlagList(month));
                    b.appendChild(tx2); b.appendChild(go2);
                }
            }).catch(()=>{ if(my===__pendBannerSeq){ const b=$('statPendBanner'); if(b) b.remove(); } });
        }

        // 1017-L：这个月带 AI 标记的记录列成一张底部面板（只看），点一条打开账单详情（在那里能「知道了，去掉标记」）
        function openAiFlagList(month){
            const all=getUserData(), list=all.filter(r=>r.aiFlag && typeof r.time==='string' && r.time.slice(0, 7)===month).sort((a, b)=>a.time<b.time ? -1 : 1);
            if(!window.JiwenSheet || !list.length) return;
            window.JiwenSheet.open({ title:'AI 标记待看（' + list.length + ' 条）',
                body(box, done){
                    list.forEach(r=>{
                        const row=document.createElement('div'); row.className='sf-item ai-flag-row'; row.dataset.id=r.id; row.style.minHeight='48px'; row.style.cursor='pointer';
                        const top=document.createElement('div'); top.className='sf-top';
                        top.textContent=`${r.time.slice(5, 16).replace('T', ' ')} · ${r.cat||'未分类'} · ${safeNum(r.money).toFixed(2)}`;
                        const why=document.createElement('div'); why.style.fontSize='12.5px'; why.style.color='var(--c-text-soft)'; why.textContent=aiFlagText(r, all);
                        row.appendChild(top); row.appendChild(why);
                        row.addEventListener('click', ()=>{ done(); openDetail(r.id, { onClose:()=>openAiFlagList(month) }); });   // 1019-S：详情关掉回这张列表（标记都去掉了就不回）
                        box.appendChild(row);
                    });
                },
                foot(box, done){ const c=document.createElement('button'); c.type='button'; c.className='ui-btn block'; c.id='aiFlagListClose'; c.textContent='关闭'; c.addEventListener('click', ()=>done()); box.appendChild(c); } });
        }
        function renderStatCalendar(){
            $('statMonthLabel').textContent = `${statYear}年${pad(statMonth+1)}月`;
            renderPendBanner();
            // 【P4】统计页此前的形状与当初 renderBill 的性能坑同源：
            //   statRecords() 每次都把整个 store（含所有存档）重新 JSON.parse，
            //   而日净额、当月汇总、分类占比、当日明细四处各自把全表 parseRecTime 遍历一遍。
            //   点一次日历格子就要付 3 次 JSON.parse + 3 趟正则解析。
            //   改法同 renderBill：取一次数、给每条只解析一次时间，四个消费点共用同一份。
            const dec=decorateRecs(statRecords());

            // 日净额 / 有无数据 / 当月收支汇总——原先三趟遍历，合并为一趟
            const dayNet={}, dayHas={}, dayFlow={}, daySkip={}, dayRefund={};
            let mIn=0, mOut=0;
            dec.forEach(x=>{
                if(x.y!==statYear || x.mo!==statMonth) return;
                dayHas[x.d]=true;               // 不计入的记录也算「这天有账」：格子照样能点开看明细
                // ……但不计金额（不计入 / 只算结余都不进收支统计），只记下「这天有这类记录」用来打标签
                const m=recMode(x.r);
                if(m==='flow'){ dayFlow[x.d]=true; return; }
                if(m==='skip'){ daySkip[x.d]=true; return; }
                if(isRefund(x.r)) dayRefund[x.d]=true;    // 1010-J2：这天的净额里含退款，标出来
                const c=statContrib(x.r);
                dayNet[x.d]=(dayNet[x.d]||0)+(c.inc-c.exp);
                mIn+=c.inc; mOut+=c.exp;
            });
            $('statMonthIn').textContent='+'+round2(mIn).toFixed(2);
            $('statMonthOut').textContent='−'+round2(mOut).toFixed(2);

            // 本月预算（共用同一份预解析结果）
            renderStatBudget(dec);

            // 当月支出分类占比（复用当日分析的甜甜圈 + 分类列表画法）
            renderStatMonthCats(dec);

            // 画日历格子
            // 周一为一周起始：与记账/筛选/AI导出的日期选择器（renderDtDays）以及
            // AI「按周」分组（(getDay()+6)%7）保持一致，避免同一 App 里两套周起始。
            const firstDow=(new Date(statYear, statMonth, 1).getDay()+6)%7;   // 0=周一
            const daysInMonth=new Date(statYear, statMonth+1, 0).getDate();
            const today=new Date();
            const isThisMonth = today.getFullYear()===statYear && today.getMonth()===statMonth;

            const grid=$('statCal'); grid.innerHTML='';
            for(let i=0;i<firstDow;i++){ grid.appendChild(document.createElement('div')); }
            for(let day=1; day<=daysInMonth; day++){
                const cell=document.createElement('div');
                cell.className='day';
                const has=!!dayHas[day];
                if(has) cell.classList.add('has');
                // 当天有账、但全是不计入 / 只算结余：换一种底色，一眼和「花了钱的日子」分开
                const excl = has && dayNet[day]===undefined;
                if(excl) cell.classList.add('excl');
                if(isThisMonth && today.getDate()===day) cell.classList.add('today');
                if(statSelDay===day && has) cell.classList.add('sel');

                let inner=`<div class="dn">${day}</div>`;
                // 当天只有不计入的记录时 dayNet 没有这一天：只显示日期、不显示金额（否则会是 NaN）
                if(has && dayNet[day]!==undefined){
                    const n=round2(dayNet[day]);   // 收支浮点相消可能剩 -5e-17，不归整会渲染成「-0」
                    const col = n>=0 ? 'var(--c-pos,#2f7d57)' : 'var(--c-neg,#d05a52)';
                    inner+=`<div class="da" style="color:${col}">${n>=0?'+':''}${n.toFixed(0)}</div>`;
                }
                // 口径标签：当天有「只算结余」就标「结余」，有「不计入」就标「不计」，两者都有就都标。
                // 普通日子里夹着这类记录也照样标，免得以为那天的净额就是全部。
                if(dayFlow[day] || daySkip[day] || dayRefund[day]){
                    inner+=`<div class="day-tags">${dayRefund[day]?'<span class="dtag refund">退款</span>':''}${dayFlow[day]?'<span class="dtag flow">结余</span>':''}${daySkip[day]?'<span class="dtag skip">不计</span>':''}</div>`;
                }
                cell.innerHTML=inner;
                if(has){
                    // 只设选中天 + 重绘日历即可：renderStatCalendar 末尾会依据 statSelDay
                    // 自行调用 renderStatDay。此处若再调一次就是整份数据白算一遍。
                    cell.addEventListener('click', ()=>{ statSelDay=day; renderStatCalendar(); });
                }
                grid.appendChild(cell);
            }

            if(statTab==='budget') renderBudgetPane(dec);
            syncStatTodayFab();

            // 若已选中某天且该天仍在本月有数据，刷新当日分析；否则隐藏
            if(statSelDay && dayHas[statSelDay]){
                renderStatDay(statSelDay, dec);   // 共用同一份预解析结果
            } else {
                statSelDay=null;
                $('statDayWrap').style.display='none';
                $('statDayEmpty').style.display='block';
            }
        }

        // dec 由调用方（renderStatCalendar）传入，避免又一次 loadStore + 全表解析。
        // 不传则自行取数，保留独立可调用性——但正常路径下不会走到那个分支。
        function renderStatDay(day, dec){
            const src = dec || decorateRecs(statRecords());
            const flow = src
                .filter(x=> x.y===statYear && x.mo===statMonth && x.d===day)
                // 排序比较器里不再调 parseRecTime：ts 已预算好，比的是纯数字。
                // 同分钟多笔的相对次序由 sort 的稳定性保证，与原实现一致。
                .sort((a,b)=> a.ts-b.ts);

            $('statDayEmpty').style.display='none';
            $('statDayWrap').style.display='block';
            $('statDayTitle').textContent=`${statYear}-${pad(statMonth+1)}-${pad(day)} · 当日收支分析`;

            // —— 当日收支明细：一条一行，按时间正序（含收入与支出）——
            if(flow.length){
                $('statFlowList').innerHTML = flow.map(x=>{
                    const r=x.r;
                    const hm=`${pad(x.hh)}:${pad(x.mi)}`;
                    const isOut=r.type==='expense';
                    const rf=isRefund(r);
                    const io=isOut?'支出':(rf?'退款':'收入');
                    const cat=r.cat||'未分类';
                    const remark=(r.remark||'').trim();
                    const amt=safeNum(r.money).toFixed(2);
                    return `<div class="sf-item" data-act="sfItem" data-id="${escapeHtml(r.id)}">
                        <div class="sf-top">
                            <span class="sf-time">${hm}</span>
                            <span class="sf-io ${isOut?'out':(rf?'refund':'in')}">${io}</span>${isSkip(r)?'<span class="sf-io skip">不计入</span>':(isFlow(r)?'<span class="sf-io flow">只算结余</span>':'')}
                            <span class="sf-cat">${escapeHtml(cat)}</span>
                            ${remark?`<span class="sf-remark">${escapeHtml(remark)}</span>`:''}
                        </div>
                        <span class="sf-amt ${isOut?'neg':'pos'}${modeAmtCls(r)}">${isOut?'−':'+'}${amt}</span>
                    </div>`;
                }).join('');
            } else {
                $('statFlowList').innerHTML = '<div class="stat-day-empty">当日无收支记录</div>';
            }
        }

        // 当日收支明细：点整行进「账单详情」（openDetail 弹窗）。
        // statFlowList 是静态容器，事件委托只绑一次，反复重写 innerHTML 不重复挂监听。
        (function(){
            const box=$('statFlowList');
            if(!box) return;
            box.addEventListener('click', e=>{
                const row=e.target.closest('[data-act="sfItem"]');
                if(!row || !box.contains(row)) return;
                const id=row.getAttribute('data-id');
                if(id) openDetail(id);
            });
        })();

        // 当月分类占比：可按「支出」或「收入」两种口径渲染（由 statMonthCatMode 决定）。
        // 入参 recs 已是整档全量，此处按 statYear/statMonth + 收支类型过滤后按分类聚合。
        // 分类多于 6 个时，金额前 6 保留、其余并入「其他」，避免列表过长。
        // 颜色一律走 catColor()，与当日分析同源，换主题色时一起变。
        let statMonthCatMode='expense';   // 'expense' | 'income'
        let statMonthCatRecs=null;        // 缓存最近一次的 dec（已预解析日期），供胶囊切换时就地重渲染
        function renderStatMonthCats(dec){
            if(dec) statMonthCatRecs=dec;        // 首次/刷新时更新缓存；切换口径时传 null 复用缓存
            dec=statMonthCatRecs||[];
            const card=$('statMonthCatCard');
            const pie=$('statMonthPie'), list=$('statMonthCatList');
            const title=$('statMonthCatTitle');
            if(!card || !pie || !list) return;

            const isExp=statMonthCatMode==='expense';
            const wantType=isExp?'expense':'income';
            if(title) title.textContent = isExp ? '当月支出分类占比' : '当月收入分类占比';

            const byCat={};
            dec.forEach(x=>{
                // 关键：只统计当前查看月份、且符合当前口径（支出/收入）的记录
                if(x.y===statYear && x.mo===statMonth && recMode(x.r)==='normal'){
                    const amt=catSigned(x.r, wantType);    // 支出口径：退款为负（1010-J）
                    if(!amt) return;
                    const c=x.r.cat||'未分类';
                    byCat[c]=(byCat[c]||0)+amt;
                }
            });

            // 上个月同口径的分类金额，用来算「较上月」
            const pY = statMonth===0 ? statYear-1 : statYear, pM = statMonth===0 ? 11 : statMonth-1;
            const prevByCat={};
            dec.forEach(x=>{
                if(x.y===pY && x.mo===pM && recMode(x.r)==='normal'){
                    const amt=catSigned(x.r, wantType); if(!amt) return;
                    const c=x.r.cat||'未分类';
                    prevByCat[c]=(prevByCat[c]||0)+amt;
                }
            });

            // 退完了（净额 ≤ 0）的分类画不进饼图，不列
            let cats=Object.keys(byCat).filter(c=>round2(byCat[c])>0).sort((a,b)=>byCat[b]-byCat[a]);

            // 当月该口径无记录：卡片保持可见（胶囊常在），只把内容区替换成一句提示。
            if(!cats.length){
                card.style.display='';
                pie.style.display='none'; pie.innerHTML='';
                list.innerHTML=`<div class="stat-day-empty">当月无${isExp?'支出':'收入'}记录</div>`;
                return;
            }

            // 前 6 + 其余并为「其他」
            const TOP=6;
            let items;
            if(cats.length>TOP){
                const top=cats.slice(0,TOP).map(c=>({ name:c, val:byCat[c], prev:prevByCat[c]||0 }));
                const rest=cats.slice(TOP);
                const restSum=rest.reduce((s,c)=>s+byCat[c],0);
                const restPrev=rest.reduce((s,c)=>s+(prevByCat[c]||0),0);
                // 合并项不叫「其他」：用户自己就有一个叫「其他」的分类，同名会混成两行「其他」
                items=top.concat([{ name:`其余 ${rest.length} 类`, val:restSum, prev:restPrev }]);
            } else {
                items=cats.map(c=>({ name:c, val:byCat[c], prev:prevByCat[c]||0 }));
            }

            const total=items.reduce((s,it)=>s+it.val,0);
            const vals=items.map(it=>it.val);
            const colors=items.map((_,i)=>catColor(i, items.length));

            card.style.display='';
            pie.style.display='';
            pie.innerHTML=buildDonutSVG(vals, colors);
            list.innerHTML=items.map((it,i)=>{
                const pct=total>0 ? (it.val/total*100).toFixed(2) : '0.00';
                const sign=isExp?'−':'+';
                const cls=isExp?'neg':'pos';
                return `<div class="sc-item">
                    <div class="sc-top">
                        <span class="sc-name"><span class="sc-dot" style="background:${colors[i]}"></span><span class="sc-cat-name">${escapeHtml(it.name)}</span></span>
                        <span class="sc-pct">${pct}%</span>
                    </div>
                    <div class="sc-bot">${monthDeltaHtml(it.val, it.prev, isExp)}<span class="sc-amt ${cls}">${sign}${it.val.toFixed(2)}</span></div>
                </div>`;
            }).join('');
        }
        // 「较上月 ↑12%」。支出涨了标红、降了标绿；收入相反。上月为 0 时写「上月无」。
        function monthDeltaHtml(cur, prev, isExp){
            cur=round2(cur); prev=round2(prev);
            if(prev<=0) return cur>0 ? '<span class="sc-delta">上月无</span>' : '';
            const pct=Math.round((cur-prev)/prev*100);
            if(pct===0) return '<span class="sc-delta">与上月持平</span>';
            const up=pct>0, bad = isExp ? up : !up;
            return `<span class="sc-delta ${bad?'bad':'good'}">较上月 ${up?'↑':'↓'}${Math.abs(pct)}%</span>`;
        }

        // 支出/收入胶囊切换：只改口径 + 就地重渲染（复用缓存的 recs，不重跑整页统计）
        (function(){
            const seg=$('statMonthCatSeg');
            if(!seg) return;
            seg.addEventListener('click', e=>{
                const btn=e.target.closest('button[data-v]');
                if(!btn) return;
                const mode=btn.getAttribute('data-v');
                if(mode===statMonthCatMode) return;
                statMonthCatMode=mode;
                seg.querySelectorAll('button').forEach(b=>b.classList.toggle('on', b===btn));
                renderStatMonthCats(null);   // 传 null 复用缓存
            });
        })();

        // 手写甜甜圈饼图
        function buildDonutSVG(vals, colors){
            const total=vals.reduce((a,b)=>a+b,0);
            if(total<=0) return '';
            const cx=70, cy=70, r=58, rin=33;
            let ang=-Math.PI/2;   // 从顶端开始
            let paths='';
            vals.forEach((v,i)=>{
                const frac=v/total;
                const a2=ang + frac*Math.PI*2;
                // 单一扇形若占满整圈，用两段避免 arc 退化
                if(frac>=0.9999){
                    paths+=`<circle cx="${cx}" cy="${cy}" r="${(r+rin)/2}" fill="none" stroke="${colors[i]}" stroke-width="${r-rin}"/>`;
                } else {
                    const x1=cx+r*Math.cos(ang),   y1=cy+r*Math.sin(ang);
                    const x2=cx+r*Math.cos(a2),    y2=cy+r*Math.sin(a2);
                    const xi2=cx+rin*Math.cos(a2), yi2=cy+rin*Math.sin(a2);
                    const xi1=cx+rin*Math.cos(ang),yi1=cy+rin*Math.sin(ang);
                    const large=frac>0.5?1:0;
                    paths+=`<path d="M${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)} L${xi2.toFixed(2)},${yi2.toFixed(2)} A${rin},${rin} 0 ${large} 0 ${xi1.toFixed(2)},${yi1.toFixed(2)} Z" fill="${colors[i]}"/>`;
                }
                ang=a2;
            });
            return `<svg viewBox="0 0 140 140" width="140" height="140" role="img" aria-label="当日支出分类占比">${paths}</svg>`;
        }

        // 【1010-H】此处原有「按小时柱状图 → 时段明细 → 详情」一整条链，对应的页面元素早在
        //   统计页改版时就删掉了，代码却一直留着（有判空保护，不报错但也执行不到）。已整体移除。
        //   详情弹窗现在只从两处进入：统计页当日明细 / 预算明细（可修改），批量确认清单（只读）。

        // 打开账单详情弹窗。opts.readonly 时隐藏「修改」（批量确认清单里进来的）。
        function openDetail(id, opts){
            const rec=getUserData().find(r=>r.id===id);
            $('detailEdit').style.display = (opts && opts.readonly) ? 'none' : '';
            if(!rec){ customAlert('这条记录不存在了'); return; }
            $('detailTime').textContent = rec.time.replace('T',' ');
            const isExp = rec.type==='expense';
            const amt=safeNum(rec.money);
            $('detailMoney').innerHTML = `<span class="${isExp?'neg':'pos'}${modeAmtCls(rec)}">${isExp?'−':'+'}${amt.toFixed(2)} 元</span>`;
            $('detailCat').innerHTML = `<span class="cat-tag">${escapeHtml(rec.cat||'未分类')}</span>`;
            const all=getUserData();
            $('detailType').innerHTML = (isExp
                ? '<span class="io-tag io-out">支出</span>'
                : (isRefund(rec) ? '<span class="io-tag io-refund">退款</span>' : '<span class="io-tag io-in">收入</span>'))
                + modeTag(rec, true) + refundedTag(rec, refundedMap(all));
            paintDetailRefund(rec, all);
            paintDetailSource(rec);
            paintDetailAiFlag(rec, all);
            const rk=(rec.remark||'').trim();
            $('detailRemark').textContent = rk || '（无备注）';
            // 1019-S：从别的列表点进来的，关掉回那个列表；详情里刷新同一条（去掉 AI 标记、拆开）时照旧留着
            detailOnClose=(opts && opts.onClose) || (detailCurId===id && $('detailMask').style.display==='flex' ? detailOnClose : null);
            detailCurId=id;
            $('detailMask').style.display='flex';
        }

        // 第二期（1016-Z6）：详情里一行浅色「来自微信账单」/「已和微信账单合并」；合并过的、开着开发开关时有「拆开」。手记、没来源的不显示
        function paintDetailSource(rec){
            let f=$('detailSrcField');
            const app=rec.src && IMP_APPS.includes(rec.src.app) ? (rec.src.app==='alipay' ? '支付宝' : '微信') : '';
            if(!app){ if(f) f.remove(); return; }
            if(!f){
                f=document.createElement('div'); f.className='field'; f.id='detailSrcField';
                const remarkField=$('detailRemark').parentNode; remarkField.parentNode.insertBefore(f, remarkField.nextSibling);
            }
            f.textContent='';
            const v=document.createElement('div'); v.className='detail-val'; v.id='detailSrc'; v.style.color='var(--c-text-soft)'; v.style.fontSize='12.5px';
            v.textContent = rec.src.merged ? `已和${app}账单合并（你记的这条，补上了来源）` : rec.src.sum ? `来自${app}账单（几笔合成的一条）` : `来自${app}账单`;
            f.appendChild(v);
            if(rec.src.merged && devImportOn()){
                const b=document.createElement('button'); b.type='button'; b.className='mini-btn'; b.id='detailSplit'; b.textContent='拆开'; b.style.marginTop='6px';
                b.addEventListener('click', ()=>{
                    customConfirm(`把这条和${app}账单拆开：\n\n· 你记的这条改回合并前的样子（你后来改过的不动）\n· 账单另记一条（分类和你记的这条一样）\n\n拆开算进原来那次导入，撤销那次导入时一起撤。`, async ()=>{
                        try{
                            const r=await window.JiwenImportStore.splitMerge(rec.id);
                            $('detailMask').style.display='none';
                            customAlert(r.added ? `拆开了：你记的那条还原了，账单另记了 ${r.added} 条（分类和你记的那条一样，不对可以去改）。` : '拆开了：你记的那条还原了。这次导入是旧版本做的，没存账单本身，下次再导同一份账单时它会作为新增出现。', '拆开');
                        }catch(err){
                            const c=err && (err.code || err.message);
                            customAlert(c==='nolog' ? '找不到合并它的那次导入记录了（只保留最近 10 次），拆不开。' : '没拆成，账本没动：' + c, '拆开');
                        }
                    }, '拆开', { okText:'拆开这条', danger:true });
                });
                f.appendChild(b);
            }
        }
        // 1017-L：AI 标记（「AI 检查导入结果」打的）：详情里一行「AI 觉得可能和 X 月 X 日那笔重复」+ 理由，「知道了，去掉标记」。
        //   标记只有用过开发开关里的 AI 检查才会有，有就显示（不看开关）；去掉标记就是改这一条记录（不算 AI 修改，撤销那次 AI 修改时这一项按「你后来改过」不动）
        function aiFlagText(rec, all){
            const f=rec.aiFlag; if(!f) return '';
            const o=f.ref ? (all||getUserData()).find(r=>r.id===f.ref) : null;
            const when=o ? `${+o.time.slice(5,7)} 月 ${+o.time.slice(8,10)} 日那笔（${safeNum(o.money).toFixed(2)}）` : '';
            return f.k==='dup' ? (when ? `AI 觉得可能和 ${when}重复` : 'AI 觉得这笔可能记重复了')
                               : (when ? `AI 觉得可能漏配：和 ${when}有关` : 'AI 觉得这笔可能漏配了（和你记的某条手记是同一笔）');
        }
        function paintDetailAiFlag(rec, all){
            let f=$('detailAiField');
            if(!rec.aiFlag){ if(f) f.remove(); return; }
            if(!f){
                f=document.createElement('div'); f.className='field'; f.id='detailAiField';
                const remarkField=$('detailRemark').parentNode; remarkField.parentNode.insertBefore(f, remarkField.nextSibling);
            }
            f.textContent='';
            const lab=document.createElement('label'); lab.className='field-label'; lab.textContent='AI 标记'; f.appendChild(lab);
            const box=document.createElement('div'); box.className='detail-val'; box.style.display='block';
            const v=document.createElement('div'); v.id='detailAiFlag'; v.style.color='var(--c-neg)'; v.textContent=aiFlagText(rec, all); box.appendChild(v);
            if(rec.aiFlag.why){ const w=document.createElement('div'); w.id='detailAiWhy'; w.style.color='var(--c-text-soft)'; w.style.fontSize='12.5px'; w.style.marginTop='4px'; w.textContent='理由：'+rec.aiFlag.why; box.appendChild(w); }
            f.appendChild(box);
            const b=document.createElement('button'); b.type='button'; b.className='mini-btn'; b.id='detailAiClear'; b.textContent='知道了，去掉标记'; b.style.marginTop='6px';
            b.addEventListener('click', ()=>{
                const data=getUserData(), i=data.findIndex(r=>r.id===rec.id);
                if(i<0){ customAlert('这条记录不存在了'); return; }
                const next=Object.assign({}, data[i]); delete next.aiFlag;
                data[i]=next;
                if(!saveUserData(data)) return;
                try{ refreshAllViews(); }catch(_){}
                openDetail(rec.id);
            });
            f.appendChild(b);
        }
        // 一笔关联记录的一行：时间 / 备注 / 金额（详情与修改弹窗共用）
        function refundLineHtml(r, sign){
            return `<div class="dr-line"><span class="dr-when">${String(r.time).slice(5,16).replace('T',' ')}</span>`
                + `<span class="dr-what">${escapeHtml((r.remark||'').trim()||r.cat||'未分类')}</span>`
                + `<span class="dr-amt ${sign>0?'pos':'neg'}">${sign>0?'+':'−'}${safeNum(r.money).toFixed(2)}</span></div>`;
        }
        function paintDetailRefund(rec, data){
            const f=$('detailRefundField'), lab=$('detailRefundLabel'), val=$('detailRefundVal');
            const line=refundLineHtml;
            if(isRefund(rec)){
                const o=data.find(r=>r.id===rec.refundOf);
                lab.textContent='原账单';
                val.innerHTML = o ? line(o, -1) : '<div class="dr-line">原账单已不存在</div>';
                f.style.display='';
                return;
            }
            const rs = rec.type==='expense' ? refundsOf(data, rec.id).sort((a,b)=>a.time<b.time?-1:1) : [];
            if(!rs.length){ f.style.display='none'; val.innerHTML=''; return; }
            const done=refundedTotal(data, rec.id), rem=round2(safeNum(rec.money)-done);
            lab.textContent = rem<=0 ? `退款记录 · 已全额退款` : `退款记录 · 还能退 ${rem.toFixed(2)}`;
            val.innerHTML=rs.map(r=>line(r, 1)).join('');
            f.style.display='';
        }
        let detailCurId=null, detailOnClose=null;
        // 详情「关闭」。抽成具名函数：返回键也要走这个正规出口，不能只 display='none'
        // —— 那样 detailCurId 不会复位。
        function closeDetail(){
            $('detailMask').style.display='none';
            detailCurId=null;
            const f=detailOnClose; detailOnClose=null; if(f) f();
        }
        $('detailClose').addEventListener('click', closeDetail);
        // 详情「修改」→ 关详情、打开修改弹窗。保存/删除后由 closeEditModal 统一刷新视图。
        $('detailEdit').addEventListener('click', ()=>{
            const id=detailCurId;
            $('detailMask').style.display='none';
            detailCurId=null; detailOnClose=null;   // 去修改了，不再回原来的列表
            if(id) window.openEdit(id, { fromDetail:true });
        });

        // 「回到本月」浮钮：在统计页、且看的不是本月时显示
        // 【1010-K2】常驻会挡住下面的金额：改成「有动作才出现，停下 1.5 秒淡出」。
        //   出现：翻月 / 统计页任何重绘（点日期、切页签）/ 滑动页面；隐藏后 pointer-events:none，不挡点击。
        //   0.5 秒太短，手指挪到右下角时按钮已经没了，所以取 1.5 秒；要调就改 FAB_IDLE。
        //   【1017-N】这条规矩挪到了 fabWake()，账单页的 ✕ 和两页的 ↑ 都照它走。
        function statAway(){
            const now=new Date();
            return statYear!==undefined && (statYear!==now.getFullYear() || statMonth!==now.getMonth());
        }
        function syncStatTodayFab(){
            const f=$('statTodayFab'); if(!f) return;
            fabWake(f, currentTab==='stats' && statAway());
        }
        window.addEventListener('scroll', ()=>{ if(currentTab==='stats' && statAway()) syncStatTodayFab(); }, { passive:true });
        $('statTodayFab').addEventListener('click', ()=>{
            const now=new Date();
            statYear=now.getFullYear(); statMonth=now.getMonth(); statSelDay=null; bgExpanded.clear();
            renderStatCalendar();
            window.scrollTo(0,0);
        });

        // 统计页月份切换
        $('statPrevM').addEventListener('click', ()=>{
            statMonth--; if(statMonth<0){ statMonth=11; statYear--; }
            statSelDay=null; renderStatCalendar();
        });
        $('statNextM').addEventListener('click', ()=>{
            statMonth++; if(statMonth>11){ statMonth=0; statYear++; }
            statSelDay=null; renderStatCalendar();
        });

        // ===== 年月选择器（统计页）=====
        // 与日期选择器同构，只是没有「日」这一级：月网格 → 点标题 → 年网格。
        // 复用同一套 .dt-cell 样式与 attachSwipe，保证两个选择器的外观和手势完全一致。
        (function(){
            const mask=$('ymMask'), grid=$('ymGrid'), yearGrid=$('ymYearGrid'), yearLabel=$('ymYearLabel');
            let pickYear;              // 选择器里临时浏览的年份
            let ymLevel='month';       // 'month' | 'year'
            let ymYearPageStart=0;

            // 找出某年里有记账记录的月份集合（用于打点标记）
            function monthsWithData(year){
                const set=new Set();
                statRecords().forEach(r=>{
                    const d=parseRecTime(r.time);
                    if(d.getFullYear()===year) set.add(d.getMonth());
                });
                return set;
            }
            // 有记账记录的年份集合
            function yearsWithData(){
                const set=new Set();
                statRecords().forEach(r=>set.add(parseRecTime(r.time).getFullYear()));
                return set;
            }

            // dir 同 renderDtDays：仅翻页时传，下钻/打开不传
            function paint(dir){
                grid.style.display     = ymLevel==='month' ? 'grid' : 'none';
                yearGrid.style.display = ymLevel==='year'  ? 'grid' : 'none';
                yearLabel.classList.toggle('top', ymLevel==='year');
                if(ymLevel==='month') paintMonths();
                else                  paintYears();
                if(dir) playSlide(ymLevel==='month' ? grid : yearGrid, dir);
            }

            function paintMonths(){
                yearLabel.textContent=pickYear;
                const has=monthsWithData(pickYear);
                const now=new Date();
                grid.innerHTML='';
                for(let m=0;m<12;m++){
                    const b=document.createElement('div');
                    b.className='dt-cell';
                    b.textContent=(m+1)+'月';
                    if(pickYear===statYear && m===statMonth) b.classList.add('selected');
                    if(now.getFullYear()===pickYear && now.getMonth()===m) b.classList.add('today');
                    if(has.has(m)) b.classList.add('has');   // 有数据的月份打点
                    b.onclick=()=>{
                        statYear=pickYear; statMonth=m; statSelDay=null;
                        mask.style.display='none'; renderStatCalendar();
                    };
                    grid.appendChild(b);
                }
            }

            function paintYears(){
                const end=ymYearPageStart+11;
                yearLabel.textContent=`${ymYearPageStart} - ${end}`;
                const has=yearsWithData();
                const nowY=new Date().getFullYear();
                yearGrid.innerHTML='';
                for(let i=0;i<12;i++){
                    const y=ymYearPageStart+i;
                    const b=document.createElement('div');
                    b.className='dt-cell';
                    b.textContent=y;
                    if(y===statYear) b.classList.add('selected');
                    if(y===nowY)     b.classList.add('today');
                    if(has.has(y))   b.classList.add('has');
                    b.onclick=()=>{
                        pickYear=y;
                        ymLevel='month';    // 选完年 → 收回月网格
                        paint();
                    };
                    yearGrid.appendChild(b);
                }
            }

            // 翻页：按当前层级
            // 顺带补上年份钳位 —— 之前这里没有边界，一直左滑能翻到负数年/9999 年。
            // 复用日期选择器的 DT_YEAR_MIN/MAX，两个选择器的可选范围保持一致。
            function ymNav(dir){
                if(ymLevel==='month'){
                    const y=pickYear+dir;
                    if(y<DT_YEAR_MIN || y>DT_YEAR_MAX) return;
                    pickYear=y;
                } else {
                    const s=ymYearPageStart + dir*12;
                    if(s+11 < DT_YEAR_MIN || s > DT_YEAR_MAX) return;   // 整页都出界就不翻
                    ymYearPageStart=s;
                }
                paint(dir);
            }

            function open(){
                pickYear=statYear;
                ymLevel='month';        // 每次打开都从月网格开始
                paint();
                mask.style.display='flex';
            }

            $('statMonthLabel').addEventListener('click', open);
            // 点标题：月 → 年。年是顶层，再点无效。
            yearLabel.addEventListener('click', ()=>{
                if(ymLevel!=='month') return;
                ymLevel='year';
                ymYearPageStart = pickYear - ((pickYear % 12) + 12) % 12;   // 开在包含当前年的那一页
                paint();
            });
            $('ymPrevY').addEventListener('click', ()=>ymNav(-1));
            $('ymNextY').addEventListener('click', ()=>ymNav(1));
            attachSwipe($('ymBox'), dir=>ymNav(dir));   // 网格内左右滑动翻页，与日期选择器一致
            $('ymCancel').addEventListener('click', ()=>{ mask.style.display='none'; });
            $('ymToCurrent').addEventListener('click', ()=>{
                const now=new Date();
                statYear=now.getFullYear(); statMonth=now.getMonth(); statSelDay=null;
                mask.style.display='none'; renderStatCalendar();
            });
        })();

        // ============================================================
        // ===== 历史脏数据自检与修复：time 字面量 vs Date 解析不一致 =====
        // ============================================================
        // 背景：旧版导入清洗用 isFinite(new Date(s)) 判定时间是否合法，但 JS 对越界日期
        //   是「静默滚动」而非报错——'2026-02-30T10:30' 会被解析成 3月2日，isFinite 仍为真，
        //   于是这个字符串被原样入库。而本 App 对 r.time 有两套读法：
        //     · 字符串口径（账单列表显示、日期范围筛选 slice(0,10)）→ 认 2月30日
        //     · Date 口径（统计日历、当月汇总、AI 导出）        → 认 3月2日
        //   同一条记录在两个页面落到不同月份，且日期筛选永远匹配不到它实际所在的月。
        //   新版导入已用严格校验堵住入口，但**存量脏数据仍在库里**，故需要这一次性修复。
        //
        // 修复口径：钳制到当月最后一天（2月30 → 2月28/29），而不是跟随 Date 的滚动（→3月2）。
        //   理由：用户记账时想表达的是「二月的这笔支出」，月份归属比具体某天更重要；
        //   滚动会把它推进下个月，直接改变统计页和 AI 导出的月度口径。
        //   月份本身就越界的（如 13 月）无法推断意图，回退为「该年 1 月 1 日 00:00」并单独计数。

        // 判定一条 time 是否「脏」（非规范格式，或解析回来与字面量不一致）
        // ===== 记录时间的唯一解析口 =====
        // r.time 的规范格式是「YYYY-MM-DDTHH:mm」（由 isDirtyTime / repairTime 保证）。
        //
        // 【为什么不直接 new Date(r.time)】按 ES2015+ 规范，这种「日期+时间、不带时区」的串
        //   应当按本地时间解析；现代 WebView 也确实如此。但同一份代码里，calcDay / isDirtyTime
        //   都是手写正则拆字段再 new Date(y, m-1, d)，唯独统计那边直接把字符串丢给 Date——
        //   两套口径并存，等于把「这里依赖引擎按本地时区解析」这个前提藏在了 15 个调用点里。
        //   一旦哪天喂进来的是「YYYY-MM-DD」（纯日期，规范里按 UTC 解析）或带了尾巴，
        //   跨月/跨日的记录就会静默错位一格，还极难复现。
        //   统一走这里：显式按本地时区构造，与 calcDay 同口径，前提写死在一处。
        function parseRecTime(t){
            const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(t||''));
            if(!m) return new Date(t);                       // 兜底：非规范串交回引擎，行为不变
            return new Date(+m[1], +m[2]-1, +m[3], +m[4], +m[5], 0, 0);
        }

        function isDirtyTime(t){
            if(typeof t!=='string') return true;
            const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(t);
            if(!m) return true;
            const y=+m[1], mo=+m[2], d=+m[3], h=+m[4], mi=+m[5];
            const dt=new Date(y, mo-1, d, h, mi, 0, 0);
            return !(dt.getFullYear()===y && dt.getMonth()===mo-1 && dt.getDate()===d
                  && dt.getHours()===h && dt.getMinutes()===mi);
        }

        // 把一条脏 time 修成合法的规范串。修不出来则返回 null（调用方回退为当前时刻）。
        function repairTime(t){
            if(typeof t!=='string') return null;
            const s=t.trim().replace(' ', 'T');          // 兼容「YYYY-MM-DD HH:mm」显示格式
            const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s);   // 宽松：允许尾部有秒/毫秒/时区
            if(!m) return null;
            const y=+m[1];
            let mo=+m[2], d=+m[3], h=+m[4], mi=+m[5];
            if(!isFinite(y) || y<1970 || y>9999) return null;
            if(mo<1 || mo>12) return `${y}-01-01T00:00`;  // 月份越界：意图无从推断，落到该年年初
            const lastDay=new Date(y, mo, 0).getDate();   // 该年该月的最后一天（自动处理闰年）
            d = Math.min(Math.max(d, 1), lastDay);        // 钳制：2月30 → 2月28/29
            h = Math.min(Math.max(h, 0), 23);
            mi= Math.min(Math.max(mi, 0), 59);
            return `${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}`;
        }

        // 扫描并修复某用户 store 里所有存档的脏时间。
        // 返回 { scanned, fixed, samples[] }；不写盘（由调用方决定，便于「先看结果再确认」）。
        function scanAndRepairStore(store){
            let scanned=0, fixed=0;
            const samples=[];
            Object.keys(store.archives).forEach(name=>{
                const a=store.archives[name];
                if(!a || !Array.isArray(a.records)) return;
                a.records.forEach((r,i)=>{
                    scanned++;
                    if(!isDirtyTime(r.time)) return;
                    const before=r.time;
                    const after=repairTime(before) || nowDtValue();
                    a.records[i]=Object.assign({}, r, { time:after });   // 换成新对象（1013-G：账本里的记录是冻结的）
                    fixed++;
                    if(samples.length<5){
                        samples.push({ archive:name, before:String(before), after });
                    }
                });
            });
            return { scanned, fixed, samples };
        }

        // 登录后自检：只在该用户尚未修过时跑一次（用 localStorage 打标记，避免每次登录都全表扫描）。
        // 修复结果如实告知用户——静默改动用户的账目数据是不可接受的。
        //   【1013-D】修好的数据要确认写进 IndexedDB 才打「已修过」标记，所以是 async
        async function runTimeRepairOnce(user){
            const flagKey=`app_time_repaired_${user}`;
            if(localStorage.getItem(flagKey)==='1') return;   // 已修过，跳过
            let store;
            try{ store=loadStore(user); }catch(_){ return; }
            if(!store || !store.archives) return;

            const { fixed, samples }=scanAndRepairStore(store);
            if(fixed===0){
                // 没有脏数据：直接打标记，以后不再扫
                try{ localStorage.setItem(flagKey,'1'); }catch(_){}
                return;
            }
            // 有修改：先写盘。写失败就不打标记，下次启动再试（不能只改内存不落盘）
            try{
                await saveStoreDurable(store, user);
            }catch(_){
                return;   // 配额满等，本次放弃，保持原样，下次再修
            }
            try{ localStorage.setItem(flagKey,'1'); }catch(_){}
            if(user!==currentUser) return;   // 写库的工夫里切了账号：标记照打，界面不用刷、也不弹提示

            // 修完必须刷新视图，否则界面还停在修复前的旧数据上
            refreshArchiveSelect(); refreshCatSelectors(); refreshAllViews();

            const lines=samples.map(s=>
                `　·【${escapeHtml(s.archive)}】${escapeHtml(s.before)} → ${escapeHtml(s.after)}`
            ).join('<br>');
            const more = fixed>samples.length ? `<br>　…等共 ${fixed} 条` : '';
            customAlertHtml(
                `检测到 <b>${fixed}</b> 条记录的时间是不存在的日期（如 2 月 30 日），`+
                `它们会导致「账单列表」和「统计页」把同一笔账算到不同月份。<br><br>`+
                `已把这些时间修正到当月的最后一天（保持原本的月份归属）：<br>${lines}${more}<br><br>`+
                `金额、分类、备注均未改动。`,
                '已修复历史数据', 'left'
            );
        }

