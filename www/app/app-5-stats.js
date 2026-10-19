
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
            if(user!==JiwenBase.currentUser) return;   // 写库的工夫里切了账号：标记照打，界面不用刷、也不弹提示

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

