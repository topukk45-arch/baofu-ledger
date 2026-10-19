(function(){
        const { $, isFlow, isSkip, pad, parseRecTime, recMode, round2, safeNum } = window.JiwenBase;   // 用到前面模块的
        const { budgetPhrase, budgetSpentIn, expSigned, getBudgets, getCats, getUserData, isRefund, mergeImportedDays, nameOf, statContrib } = window.JiwenStore;   // 用到前面模块的
        const { customAlert, customChoose, customConfirm } = window.JiwenAsk;   // 用到前面模块的
        const { openDtPickerDate } = window.JiwenDate;   // 用到前面模块的

        // ===== 导出账单给 AI 分析 =====
        // 流程：选维度（日/周/月）→ 选具体时段（仅列出有记录的）→ 生成带 prompt 的纯文本 → 复制/分享。
        // 口径与统计页一致：周一为一周起始；金额一律走 safeNum，分类空则「未分类」。

        // 把一条记录格式化成「MM-DD HH:mm 支出 餐饮 16.00 元（备注：打车）」这种明细行
        function aiFmtRecord(r){
            const d=parseRecTime(r.time);
            const md=`${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
            const rf=isRefund(r);
            const io=r.type==='expense'?'支出':(rf?'退款':'收入');
            const amt=safeNum(r.money).toFixed(2);
            const cat=(r.cat||'未分类');
            const remark=(r.remark||'').trim();
            return `${md} ${io} ${cat} ${amt} 元${remark?`（备注：${remark}）`:''}${rf?'【退款】':''}${isSkip(r)?'【不计入收支】':(isFlow(r)?'【只算结余】':'')}`;
        }

        // 给定一批记录 + 范围标签，拼出完整的「prompt + 结构化账单」纯文本
        // budgetLines（可选）：按月导出时传入的预算执行情况，多行文本；不传则不出现这一节
        function buildAiText(records, rangeLabel, dimLabel, budgetLines){
            const inc=records.reduce((s,r)=>s+statContrib(r).inc,0);
            const exp=records.reduce((s,r)=>s+statContrib(r).exp,0);
            const skipN=records.filter(isSkip).length;
            const flowN=records.filter(isFlow).length;
            const refundRecs=records.filter(r=>isRefund(r) && recMode(r)==='normal');
            const refundN=refundRecs.length;
            const refundSum=round2(refundRecs.reduce((s,r)=>s+safeNum(r.money),0));
            const exclParts=[];
            if(skipN) exclParts.push(`${skipN} 笔不计入收支`);
            if(flowN) exclParts.push(`${flowN} 笔只算结余`);
            const bal=inc-exp;

            // 分类占比（按支出）
            const byCat={};
            records.forEach(r=>{ if(recMode(r)==='normal'){ const e=expSigned(r); if(e){ const c=r.cat||'未分类'; byCat[c]=(byCat[c]||0)+e; } } });
            const catLines=Object.keys(byCat).filter(c=>round2(byCat[c])>0).sort((a,b)=>byCat[b]-byCat[a]).map(c=>{
                const pct=exp>0?Math.round(byCat[c]/exp*100):0;
                return `  · ${c}：${byCat[c].toFixed(2)} 元（${pct}%）`;
            }).join('\n') || '  （本期无支出）';

            // 明细（按时间正序）
            const detail=records.slice().sort((a,b)=>parseRecTime(a.time)-parseRecTime(b.time))
                .map(r=>'  '+aiFmtRecord(r)).join('\n') || '  （本期无记录）';

            const prompt =
`【记问 · 消费分析请求】
你是一位务实、直接的个人理财顾问。下面是我某段时间的真实记账数据，请帮我：
1. 概括这段时间的整体消费情况（钱主要花在哪、收支是否健康）；
2. 指出其中值得注意的地方（异常大额、占比过高的分类、可优化的开销）；
3. 给出 3~5 条具体、可执行的省钱或预算建议，别讲空泛的大道理。
如果数据太少不足以分析，直接说明即可。${refundN?'\n标注【退款】的记录是之前某笔支出退回的钱，已从对应分类的支出里扣掉（支出、分类占比都是扣完后的净额），不是收入。':''}${exclParts.length?'\n标注【不计入收支】（重复记录，如信用卡还款）或【只算结余】（资金往来，如期初存款、垫付报销、借出借入）的记录，已从总览和分类占比中排除，分析消费时不要再把它们算进去。':''}

────────────────
■ 统计维度：${dimLabel}
■ 时间范围：${rangeLabel}
■ 总览：收入 ${inc.toFixed(2)} 元，支出 ${exp.toFixed(2)} 元，结余 ${bal.toFixed(2)} 元，共 ${records.length} 笔${exclParts.length?`（其中 ${exclParts.join('、')}）`:''}${refundN?`；含退款 ${refundN} 笔共 ${refundSum.toFixed(2)} 元，已冲抵支出`:''}
${budgetLines?`■ 分类月预算：\n${budgetLines}\n`:''}■ 支出分类占比：
${catLines}
■ 收支明细（按时间正序）：
${detail}
────────────────
请开始你的分析。`;
            return prompt;
        }

        // 打开结果弹窗，填入文本，绑定复制/分享。
        // opts（可选）：{ title, tip } 用于复用到「存档导出兜底」场景；不传则用 AI 分析的默认文案。
        const AIEXP_DEFAULT_TITLE = '导出账单给 AI 分析';
        const AIEXP_DEFAULT_TIP   = '复制或分享后，粘贴给任意 AI（如 Claude、DeepSeek、豆包），让它帮你分析消费、给出建议。';
        // 当前弹窗用途：'ai'=给 AI 分析；'backup'=存档兜底。仅用于让「复制成功」的提示语对得上场景。
        let aiExpMode='ai';
        function openAiExport(text, sub, opts){
            opts = opts || {};
            aiExpMode = opts.mode || 'ai';
            $('aiExpTitle').textContent = opts.title || AIEXP_DEFAULT_TITLE;
            $('aiExpTip').textContent   = opts.tip   || AIEXP_DEFAULT_TIP;
            $('aiExpText').value = text;
            $('aiExpSub').textContent = sub || '';
            $('aiExpMask').style.display='flex';
        }
        // 在 AI 导出弹窗之上弹提示。
        // 【原先的 over-aiexp 已废除】askMask 默认就是 1040，本来就高于 aiExpMask(1010)，
        //   不需要再临时提层。留着一个只在单一场景生效的特例，反而掩盖了「askMask 该始终最顶」
        //   这个真正的规则。
        function aiExpAlert(msg, title){
            customAlert(msg, title);
        }
        $('aiExpClose').addEventListener('click', ()=>{ $('aiExpMask').style.display='none'; });
        $('aiExpCopy').addEventListener('click', async ()=>{
            const text=$('aiExpText').value;
            let ok=false;
            try{ await navigator.clipboard.writeText(text); ok=true; }
            catch(_){
                // 兜底：选中 textarea 走 execCommand
                try{ const ta=$('aiExpText'); ta.focus(); ta.select(); ok=document.execCommand('copy'); }catch(__){}
            }
            aiExpAlert(
                ok ? (aiExpMode==='backup'
                        ? '已复制到剪贴板，请尽快粘贴保存到记事本 / 云笔记，避免剪贴板被覆盖。'
                        : '已复制到剪贴板，去粘贴给 AI 吧。')
                   : '复制失败，请手动长按文本框全选复制。',
                ok ? '复制成功' : '复制未成功');
        });
        $('aiExpShare').addEventListener('click', async ()=>{
            const text=$('aiExpText').value;
            // 优先系统分享（手机端可发微信/AI App）；不支持则退回复制
            if(navigator.share){
                try{ await navigator.share({ text }); return; }
                catch(err){ if(err && err.name==='AbortError') return; /* 用户取消，不提示 */ }
            }
            try{ await navigator.clipboard.writeText(text);
                aiExpAlert('当前环境不支持直接分享，已复制到剪贴板，可手动粘贴分享。', '已复制'); }
            catch(_){ aiExpAlert('当前环境不支持分享，请手动长按文本框复制。', '无法分享'); }
        });

        // 第二步：根据维度列出「有记录的具体时段」，选中后生成文本。
        // 各步「取消」回到第一步（选维度），而非直接退回设置页。
        function aiPickPeriod(dim){
            const all=getUserData();
            if(!all.length){ customAlert('当前存档还没有任何记账记录。', '无数据可导出'); return; }

            if(dim==='day'){
                // 用现成的日历选择器选某一天（比长列表更直观，且不随数据增长变长）。
                // 统计每天笔数（当天 0点~23:59:59），在格子下方显示；取消回到选维度。
                const dayCounts={};
                all.forEach(r=>{ const d=parseRecTime(r.time); const key=`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; dayCounts[key]=(dayCounts[key]||0)+1; });
                const today=new Date();
                const initDay=`${today.getFullYear()}-${pad(today.getMonth()+1)}-${pad(today.getDate())}`;
                openDtPickerDate(initDay, (dayStr)=>{
                    const [y,m,d]=dayStr.split('-').map(Number);
                    // 边界：当天 00:00:00.000 ~ 23:59:59.999
                    const start=new Date(y, m-1, d, 0, 0, 0, 0);
                    const end=new Date(y, m-1, d, 23, 59, 59, 999);
                    const recs=all.filter(r=>{ const t=parseRecTime(r.time); return t>=start && t<=end; });
                    const label=`${y}年${m}月${d}日`;
                    if(!recs.length){ customAlert(`${label} 这天没有记账记录，换一天试试。`, '当天无记录'); return; }
                    openAiExport(buildAiText(recs, label, '按日'), label);
                }, { counts:dayCounts, onCancel:aiChooseDim });
            }
            else if(dim==='week'){
                // 以周一为起始，列出有记录的周（倒序），最多最近 26 周
                const weekMap={};
                all.forEach(r=>{
                    const d=parseRecTime(r.time); d.setHours(0,0,0,0);
                    const lead=(d.getDay()+6)%7;                 // 距本周一的天数
                    const mon=new Date(d); mon.setDate(d.getDate()-lead);
                    const key=`${mon.getFullYear()}-${pad(mon.getMonth()+1)}-${pad(mon.getDate())}`;
                    (weekMap[key]=weekMap[key]||{cnt:0}).cnt++;
                });
                const weeks=Object.keys(weekMap).sort().reverse().slice(0,26);
                const opts=weeks.map(k=>{
                    const [y,m,d]=k.split('-').map(Number);
                    const mon=new Date(y,m-1,d); const sun=new Date(mon); sun.setDate(mon.getDate()+6);
                    const lbl=`${m}月${d}日 ~ ${sun.getMonth()+1}月${sun.getDate()}日（${weekMap[k].cnt} 笔）`;
                    return { label:lbl, value:k };
                });
                customChoose('选择要分析的周（周一起算）：', opts, (k)=>{
                    const [y,m,d]=k.split('-').map(Number);
                    const mon=new Date(y,m-1,d); mon.setHours(0,0,0,0);
                    const end=new Date(mon); end.setDate(mon.getDate()+7);
                    const recs=all.filter(r=>{ const t=parseRecTime(r.time); return t>=mon && t<end; });
                    const sun=new Date(mon); sun.setDate(mon.getDate()+6);
                    const label=`${mon.getFullYear()}年${mon.getMonth()+1}月${mon.getDate()}日 ~ ${sun.getMonth()+1}月${sun.getDate()}日`;
                    openAiExport(buildAiText(recs, label, '按周'), label);
                }, '选择周', aiChooseDim);
            }
            else { // month
                const monSet={};
                all.forEach(r=>{ const d=parseRecTime(r.time); const key=`${d.getFullYear()}-${pad(d.getMonth()+1)}`; monSet[key]=(monSet[key]||0)+1; });
                const months=Object.keys(monSet).sort().reverse().slice(0,36);
                const opts=months.map(k=>({ label:`${k.replace('-','年')}月（${monSet[k]} 笔）`, value:k }));
                customChoose('选择要分析的月份：', opts, (k)=>{
                    const [y,m]=k.split('-').map(Number);
                    const recs=all.filter(r=>{ const t=parseRecTime(r.time); return t.getFullYear()===y && t.getMonth()===m-1; });
                    const label=`${y}年${m}月`;
                    const bud=getBudgets();
                    const bLines=getCats().filter(c=>bud[c]>0)
                        .map(c=>`  · ${c}：预算 ${safeNum(bud[c]).toFixed(2)} 元，${budgetPhrase(budgetSpentIn(recs, c, y, m-1), safeNum(bud[c]))}`)
                        .join('\n');
                    openAiExport(buildAiText(recs, label, '按月', bLines), label);
                }, '选择月份', aiChooseDim);
            }
        }

        // 第一步：选维度（抽出以便各步「取消」回到这里）
        function aiChooseDim(){
            customChoose('想按什么维度分析？', [
                { label:'按日', value:'day' },
                { label:'按周', value:'week' },
                { label:'按月', value:'month' }
            ], (dim)=>aiPickPeriod(dim), '导出账单给 AI 分析');
        }
        $('exportAiBtn').addEventListener('click', aiChooseDim);

        // 导入的文件来自别的账号、里面带着日子时，问一句要不要一起导入。
        // 日子是账号级的唯一一份，导进来就是和现有的合并，所以必须让人点头，不能默认做。
        // done(n)：n = 实际导入的条数（选「不用了」为 0），调用方据此拼最后的提示。
        function askImportOtherDays(pending, targetUser, done){
            if(!pending || !pending.list.length){ done(0); return; }
            const from = pending.fromUser ? `账号「${pending.fromUser}」` : '另一个账号';
            customConfirm(`文件里还有 ${pending.list.length} 个日子（倒数日），原本属于${from}。\n\n`
                + `日子是每个账号只有一份的，导入后会和「${nameOf(targetUser)}」现有的日子放在一起。要一起导入吗？`,
                ()=>done(mergeImportedDays(pending.list, targetUser)),
                '一起导入日子？', { okText:'一起导入', cancelText:'不用了', onCancel:()=>done(0) });
        }

        // 把清洗统计拼成一句人类可读的提示尾巴（没有任何修正则返回空串）
        function importFixSuffix(stats){
            if(!stats) return '';
            const parts=[];
            if(stats.timeFixed>0)  parts.push(`${stats.timeFixed} 条时间不合法（如 2 月 30 日），已修正为该月的有效日期`);
            if(stats.typeFilled>0) parts.push(`${stats.typeFilled} 条缺收支类型，已默认按收入`);
            if(stats.dropped>0)    parts.push(`${stats.dropped} 条金额无效，已跳过`);
            return parts.length ? `\n\n注意：其中 ${parts.join('；')}。` : '';
        }

        // 倒数日导入结果的提示尾巴。0 条时返回空串——没导进来就别提，避免噪音
        // （文件里没有 days、是别人的存档、或全是重复项，都会是 0，用户不需要区分）。
        function importDaysSuffix(n){ return n>0 ? `\n\n同时导入了 ${n} 个日子。` : ''; }

        $('importBtn').addEventListener('click', () => $('importFile').click());
        window.JiwenAiExport = { askImportOtherDays, buildAiText, importDaysSuffix, importFixSuffix, openAiExport };   // ai 模块对外只有这一个入口
})();
