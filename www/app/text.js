(function(){
        const { $, afterOpenAnim } = window.JiwenBase;   // 用到前面模块的
        const { charLen } = window.JiwenStore;   // 用到前面模块的

        // ===== 1019-O：文字输入的小面板 =====
        //   这些输入框不再直接弹系统键盘（readonly + inputmode=none）：点了弹 #txtMask（标题、一个输入框、确定 / 取消），
        //   等小面板滑上来再聚焦；确定把字写回原来的框（发 input / change），取消什么都不改；回到原来的面板。
        //   返回键：键盘开着时系统先收键盘，再按关小面板，再按才关原来的面板。
        const TXT_FIELDS={
            billRemark:{ title:'备注', multi:true }, editRemark:{ title:'备注', multi:true }, refundRemark:{ title:'备注（选填）', multi:true },
            tplEditName:{ title:'模板名字（最多 10 字）' }, tplEditRemark:{ title:'备注', multi:true },
            dayName:{ title:'日子名称（最多 8 字）' }, newCatName:{ title:'新分类名称（最多 8 字）' }, searchKeyword:{ title:'备注关键词' },
        };
        // 写完以后让原来面板的保存按钮露出来（原来 1010-K5 是点备注时滚）
        const TXT_REVEAL={ billRemark:'addBill', editRemark:'saveEdit' };
        let txtTarget=null;
        const txtIn=()=>$(TXT_FIELDS[txtTarget.id].multi ? 'txtArea' : 'txtInput');
        function txtCount(){ const el=txtIn(), mx=txtTarget && txtTarget.maxLength>0 ? txtTarget.maxLength : 0; $('txtCount').textContent = mx && mx<200 ? `${charLen(el.value)} 字` : ''; }
        function openTextPanel(el){
            const cfg=TXT_FIELDS[el.id]; if(!cfg) return;
            txtTarget=el;
            $('txtTitle').textContent=cfg.title;
            const multi=!!cfg.multi;
            $('txtArea').style.display=multi ? '' : 'none'; $('txtInput').style.display=multi ? 'none' : '';
            const inp=txtIn();
            inp.value=el.value; inp.placeholder=el.placeholder||'';
            if(el.maxLength>0) inp.maxLength=el.maxLength; else inp.removeAttribute('maxlength');
            txtCount();
            $('txtMask').style.display='flex';
            afterOpenAnim($('txtMask'), ()=>{ if($('txtMask').style.display!=='flex' || txtTarget!==el) return; try{ inp.focus(); const n=inp.value.length; inp.setSelectionRange(n, n); }catch(_){} });
        }
        function closeText(){ $('txtMask').style.display='none'; try{ txtIn().blur(); }catch(_){} txtTarget=null; }
        function txtOk(){
            const el=txtTarget; if(!el) return;
            el.value=txtIn().value;
            closeText();
            el.dispatchEvent(new Event('input', { bubbles:true })); el.dispatchEvent(new Event('change', { bubbles:true }));
            const b=TXT_REVEAL[el.id];
            if(b && window.__revealSave){ setTimeout(()=>window.__revealSave(el, $(b)), 60); }
        }
        $('txtOk').addEventListener('click', txtOk);
        $('txtCancel').addEventListener('click', closeText);
        $('txtInput').addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); txtOk(); } });
        ['txtInput','txtArea'].forEach(id=>$(id).addEventListener('input', txtCount));
        Object.keys(TXT_FIELDS).forEach(id=>{
            const el=$(id); if(!el) return;
            el.readOnly=true; el.setAttribute('inputmode', 'none'); el.classList.add('txt-field');
            const go=e=>{ if($('txtMask').style.display==='flex') return; if(e && e.type==='focus') el.blur(); openTextPanel(el); };
            el.addEventListener('click', go);
            el.addEventListener('focus', go);
        });
        window.openTextPanel=openTextPanel;   // 给测试用
        window.JiwenText = { closeText };   // text 模块对外只有这一个入口
})();
