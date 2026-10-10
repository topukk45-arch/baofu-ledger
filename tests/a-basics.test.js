// 1010-A 回归测试：node test.js <html>
const fs = require('fs');
const { JSDOM } = require('jsdom');
const file = process.argv[2] || require('path').join(__dirname,'..','www','index.html');
const html = fs.readFileSync(file, 'utf8');

let pass = 0, fail = 0;
function ok(cond, name){ if(cond){ pass++; } else { fail++; console.log('  ✗ ' + name); } }

function rec(id, time, money, type, cat, remark){ return { id, time, money, type, cat, remark: remark||'' }; }
function seedStore(){
    return { archives: {
        '默认存档': { cats: ['未分类','餐饮','其他','转账'], records: [
            rec('r1','2026-09-01T12:00',14,'expense','餐饮','午饭'),
            rec('r2','2026-09-10T19:43',3000.50,'income','其他','工资'),
            rec('r3','2026-09-11T12:00',77.49,'expense','其他','游戏充值'),
            rec('r4','2026-09-12T12:00','abc','expense','餐饮','脏金额'),
        ]},
        '旅行': { cats: ['未分类','出行'], records: [ rec('t1','2026-09-28T18:53',281,'expense','出行','火车票') ] }
    }, last: '默认存档' };
}

function boot(opts){
    opts = opts || {};
    const forgotten = [];
    const dom = new JSDOM(html, {
        runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://localhost/',
        beforeParse(w){
            const ls = w.localStorage;
            ls.setItem('app_logged_in_user', '小明');
            ls.setItem('store_小明', JSON.stringify(opts.store || seedStore()));
            ls.setItem('app_time_repaired_小明', '1');
            (opts.extra || []).forEach(([k,v])=>ls.setItem(k,v));
            w.scrollTo = ()=>{};
            w.HTMLElement.prototype.scrollIntoView = function(){};
            w.Capacitor = { isNativePlatform: ()=>true, Plugins: { OneDriveLink: {
                writeText: async ()=>{}, pickFile: async ()=>({}),
                forget: async (a)=>{ forgotten.push(a.uri); }
            }}};
        }
    });
    const errors = [];
    dom.window.addEventListener('error', e=>errors.push(e.message));
    return { dom, w: dom.window, d: dom.window.document, forgotten, errors };
}
const $ = (d,id)=>d.getElementById(id);
function prompt(d, value){ $(d,'askInput').value = value; $(d,'askOk').click(); }
const link = (uri)=>JSON.stringify({ uri, name:'b.json', lastSyncAt:1, lastError:null, blocked:false, lastCount:4 });

(async ()=>{
    // ---------- 版本号 ----------
    { const t = boot(); ok(/build \d{4}-[A-Z]\d*/.test(t.d.body.innerHTML), '页面带版本号'); }

    // ---------- 1. 重命名存档：连接跟着走 ----------
    {
        const t = boot({ extra: [['onedrive_link_小明__默认存档', link('content://a')]] });
        $(t.d,'renameArchive').click(); prompt(t.d, '日常');
        const ls = t.w.localStorage;
        ok(ls.getItem('onedrive_link_小明__日常') !== null, '改名后新存档名下有连接');
        ok(ls.getItem('onedrive_link_小明__默认存档') === null, '改名后旧连接已删');
        ok(JSON.parse(ls.getItem('onedrive_link_小明__日常')).uri === 'content://a', '连接内容原样保留');
        ok($(t.d,'odStatus').textContent.includes('已连接'), '设置页显示「已连接」');
        ok(t.errors.length === 0, '改名无脚本错误 ' + t.errors.join(';'));
    }
    // ---------- 1b. 写新连接失败：旧连接必须保留 ----------
    {
        const t = boot({ extra: [['onedrive_link_小明__默认存档', link('content://a')]] });
        const S = t.w.Storage.prototype, orig = S.setItem;
        S.setItem = function(k, v){ if(String(k).startsWith('onedrive_link_小明__日常')) throw new Error('quota'); return orig.call(this, k, v); };
        $(t.d,'renameArchive').click(); prompt(t.d, '日常');
        S.setItem = orig;
        ok(t.w.localStorage.getItem('onedrive_link_小明__默认存档') !== null, '写新失败时旧连接未被删');
    }
    // ---------- 1c. 没有连接时改名不出错、不凭空造连接 ----------
    {
        const t = boot();
        $(t.d,'renameArchive').click(); prompt(t.d, '日常');
        ok(t.w.localStorage.getItem('onedrive_link_小明__日常') === null, '无连接改名不产生连接');
        ok(JSON.parse(t.w.localStorage.getItem('store_小明')).archives['日常'].records.length === 4, '改名后记录完整');
    }

    // ---------- 2. 删除存档：清理连接 + 释放授权 ----------
    {
        const t = boot({ extra: [['onedrive_link_小明__默认存档', link('content://a')],
                                  ['onedrive_link_小明__旅行', link('content://b')]] });
        $(t.d,'delArchive').click(); $(t.d,'askOk').click();
        const ls = t.w.localStorage;
        ok(ls.getItem('onedrive_link_小明__默认存档') === null, '删存档后其连接被清');
        ok(ls.getItem('onedrive_link_小明__旅行') !== null, '其他存档的连接不受影响');
        await new Promise(r=>setTimeout(r, 10));
        ok(t.forgotten.includes('content://a') && !t.forgotten.includes('content://b'), '只释放被删存档的授权');
    }

    // ---------- 3. 修改用户名 ----------
    {
        const t = boot({ extra: [
            ['onedrive_link_小明__默认存档', link('content://a')],
            ['onedrive_link_小明__旅行', link('content://b')],
            ['days_card_n_小明', '7'],
            // 干扰项：另一个用户名恰好是「小明__x」开头
            ['onedrive_link_小明__x__某存档', link('content://other')],
        ]});
        $(t.d,'editNameBtn').click(); prompt(t.d, '新名字');
        const ls = t.w.localStorage;
        ok(ls.getItem('days_card_n_新名字') === '7' && ls.getItem('days_card_n_小明') === null, '入口卡条数已迁移');
        ok(ls.getItem('onedrive_link_新名字__默认存档') !== null && ls.getItem('onedrive_link_新名字__旅行') !== null, '两个存档的连接都已迁移');
        ok(ls.getItem('onedrive_link_小明__默认存档') === null && ls.getItem('onedrive_link_小明__旅行') === null, '旧连接已删');
        ok(ls.getItem('onedrive_link_小明__x__某存档') !== null && ls.getItem('onedrive_link_新名字__x__某存档') === null, '不误搬其他用户的连接');
        ok($(t.d,'odStatus').textContent.includes('已连接'), '改名后当前存档仍显示已连接');
        ok(t.errors.length === 0, '改名用户无脚本错误 ' + t.errors.join(';'));
    }

    // ---------- 4. 筛选无结果：总览保留 ----------
    {
        const t = boot();
        $(t.d,'filterFab').click();
        $(t.d,'searchKeyword').value = '不存在的关键词';
        $(t.d,'sheetApply').click();
        const so = $(t.d,'summaryOverall'), sf = $(t.d,'summaryFilter');
        ok(so.style.display !== 'none' && so.textContent.includes('共 4 条'), '筛选无结果时总览仍显示');
        ok(sf.style.display === 'flex' && sf.textContent.includes('命中 0 条'), '小计显示命中 0 条');
        ok($(t.d,'catStats').style.display !== 'none' && $(t.d,'catStats').textContent.length > 0, '分类汇总仍显示');
        ok($(t.d,'billList').textContent.includes('没有符合条件的记录'), '列表显示无结果提示');
        ok($(t.d,'pager').innerHTML === '', '无结果时不显示翻页');
    }
    // ---------- 4b. 存档完全为空：汇总区隐藏 ----------
    {
        const t = boot({ store: { archives: { '默认存档': { cats:['未分类'], records: [] } }, last: '默认存档' } });
        ok($(t.d,'summaryOverall').style.display === 'none', '空存档隐藏总览');
        ok($(t.d,'billList').textContent.includes('暂无记账记录'), '空存档提示暂无记录');
    }

    // ---------- 5. 详情金额 ----------
    {
        const t = boot();
        t.w.openDetail('r4');
        const txt = $(t.d,'detailMoney').textContent;
        ok(!txt.includes('NaN') && txt.includes('0.00'), '脏金额详情显示 0.00 而非 NaN：' + txt);
    }

    console.log(`\n${file}: ${pass} 通过，${fail} 失败`);
    process.exit(fail ? 1 : 0);
})();
