// 1010-A 回归测试：node test.js <html>
const fs = require('fs');
const { JSDOM } = require('jsdom'); const IDB=require('./helpers/idb');
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

let __lastW=null, __phone=null, __lastPhone=null;
async function boot(...a){ const t=bootSync(...a); const __w=__lastW, __p=__lastPhone; t.idle=()=>IDB.idle(__w); t.phone=__p; t.db=async()=>{ await IDB.idle(__w); return IDB.dumpDb(__p); }; await IDB.idle(__w); return t; }
function bootSync(opts){
    opts = opts || {};
    const forgotten = [];
    const dom = new JSDOM(html, {
        runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://localhost/',
        beforeParse(w){ __lastW=w; __lastPhone=IDB.install(w, __phone);
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
// 1010-K7：数据按账号编号存，老的「按名字存」在启动时被迁移过去
const uid = t => t.w.localStorage.getItem('app_logged_in_user');
const odk = (t, arc) => `onedrive_link_${uid(t)}__${arc}`;
const link = (uri)=>JSON.stringify({ uri, name:'b.json', lastSyncAt:1, lastError:null, blocked:false, lastCount:4 });

(async ()=>{
    // ---------- 版本号 ----------
    { const t = await boot(); ok(/build \d{4}-[A-Z]\d*/.test(t.d.body.innerHTML), '页面带版本号'); }

    // ---------- 1. 重命名存档：连接跟着走 ----------
    {
        const t = await boot({ extra: [['onedrive_link_小明__默认存档', link('content://a')]] });
        $(t.d,'renameArchive').click(); prompt(t.d, '日常');
        const ls = t.w.localStorage;
        ok(ls.getItem(odk(t,'日常')) !== null, '改名后新存档名下有连接');
        ok(ls.getItem(odk(t,'默认存档')) === null, '改名后旧连接已删');
        ok(JSON.parse(ls.getItem(odk(t,'日常'))).uri === 'content://a', '连接内容原样保留');
        ok($(t.d,'odStatus').textContent.includes('已连接'), '设置页显示「已连接」');
        ok(t.errors.length === 0, '改名无脚本错误 ' + t.errors.join(';'));
    }
    // ---------- 1b. 写新连接失败：旧连接必须保留 ----------
    {
        const t = await boot({ extra: [['onedrive_link_小明__默认存档', link('content://a')]] });
        const S = t.w.Storage.prototype, orig = S.setItem, bad = odk(t,'日常');
        S.setItem = function(k, v){ if(String(k).startsWith(bad)) throw new Error('quota'); return orig.call(this, k, v); };
        $(t.d,'renameArchive').click(); prompt(t.d, '日常');
        S.setItem = orig;
        ok(t.w.localStorage.getItem(odk(t,'默认存档')) !== null, '写新失败时旧连接未被删');
    }
    // ---------- 1c. 没有连接时改名不出错、不凭空造连接 ----------
    {
        const t = await boot();
        $(t.d,'renameArchive').click(); prompt(t.d, '日常');
        ok(t.w.localStorage.getItem(odk(t,'日常')) === null, '无连接改名不产生连接');
        ok(JSON.parse(t.w.JiwenStore.ledgerGet(t.w.JiwenStore.storeKey())).archives['日常'].records.length === 4, '改名后记录完整');
    }

    // ---------- 2. 删除存档：清理连接 + 释放授权 ----------
    {
        const t = await boot({ extra: [['onedrive_link_小明__默认存档', link('content://a')],
                                  ['onedrive_link_小明__旅行', link('content://b')]] });
        $(t.d,'delArchive').click(); $(t.d,'askOk').click();
        const ls = t.w.localStorage;
        ok(ls.getItem(odk(t,'默认存档')) === null, '删存档后其连接被清');
        ok(ls.getItem(odk(t,'旅行')) !== null, '其他存档的连接不受影响');
        await new Promise(r=>setTimeout(r, 10));
        ok(t.forgotten.includes('content://a') && !t.forgotten.includes('content://b'), '只释放被删存档的授权');
    }

    // ---------- 3. 修改用户名：只改名字，数据原地不动 ----------
    {
        const t = await boot({ extra: [
            ['onedrive_link_小明__默认存档', link('content://a')],
            ['onedrive_link_小明__旅行', link('content://b')],
            ['days_card_n_小明', '7'],
            // 干扰项：另一个（不存在的）老用户名恰好是「小明__x」开头，迁移时不能被当成小明的
            ['onedrive_link_小明__x__某存档', link('content://other')],
        ]});
        const id = uid(t), ls = t.w.localStorage;
        ok(/^u\d{19}$/.test(id), '启动时已迁移到账号编号');
        ok(ls.getItem(`days_card_n_${id}`) === '7' && ls.getItem('days_card_n_小明') === null, '入口卡条数已迁移');
        ok(ls.getItem(odk(t,'默认存档')) !== null && ls.getItem(odk(t,'旅行')) !== null, '两个存档的连接都已迁移');
        ok(ls.getItem('onedrive_link_小明__x__某存档') !== null && ls.getItem(odk(t,'x__某存档')) === null, '不误搬其他用户的连接');
        const before = [];
        for(let i=0;i<ls.length;i++) before.push(ls.key(i));
        $(t.d,'editNameBtn').click(); prompt(t.d, '新名字');
        ok(uid(t) === id && t.w.JiwenStore.storeKey() === `store_${id}`, '改名后编号不变');
        ok(JSON.parse(ls.getItem('accounts')).find(a=>a.id===id).name === '新名字', '账号列表里的名字已改');
        ok(JSON.parse((await t.db())[`store_${id}`]).accountName === '新名字', '名字也抄进了账本（IndexedDB 里的）');
        const after = [];
        for(let i=0;i<ls.length;i++) after.push(ls.key(i));
        ok(before.sort().join('|') === after.sort().join('|'), '改名没有新增或删除任何数据键');
        ok($(t.d,'askTitle').textContent && $(t.d,'askMsg').textContent.includes('新名字'), '提示已改名');
        ok($(t.d,'odStatus').textContent.includes('已连接'), '改名后当前存档仍显示已连接');
        ok(t.errors.length === 0, '改名用户无脚本错误 ' + t.errors.join(';'));
    }

    // ---------- 4. 筛选无结果：总览保留 ----------
    {
        const t = await boot();
        $(t.d,'filterFab').click();
        $(t.d,'searchKeyword').value = '不存在的关键词';
        $(t.d,'sheetApply').click();
        // 1023-G：搜一笔是单独一页（结果页），账单页不动
        const sf = $(t.d,'summaryFilter');
        ok(t.w.JiwenSearch.isOpen() && $(t.d,'billHead').style.display !== 'none' && !$(t.d,'summaryOverall') && $(t.d,'billList').querySelector('.lg-gap-today, .bl-row, .lg-wk'), '搜一笔在结果页里，账单页照旧按月（1023-G）；总览没有了（1023-C：总结余搬去统计页）');
        ok(sf.hidden && $(t.d,'searchCount').textContent === '0 笔', '没结果：不写合计，顶上写 0 笔');
        ok(!$(t.d,'searchEmpty').hidden && $(t.d,'searchEmpty').textContent.includes('没有找到相关的账') && $(t.d,'searchEmpty').querySelector('button[data-empty="sheet"]') && $(t.d,'searchEmpty').textContent.includes('放宽条件'), '没结果：缺省页一句话 + 「放宽条件」按钮（1027-UI4 起空状态统一写法，原来是第二句「把它去掉」）');
        ok(!$(t.d,'pagerBottom') && !$(t.d,'pagerPad'), '没有翻页了（1023-C 起按月一直往下排）');
    }
    // ---------- 4b. 存档完全为空：汇总区隐藏 ----------
    {
        const t = await boot({ store: { archives: { '默认存档': { cats:['未分类'], records: [] } }, last: '默认存档' } });
        ok($(t.d,'billHead').textContent.includes('支出 0.00') && $(t.d,'billHead').textContent.includes('统计'), '空存档：顶上细条写这个月支出 0.00（1023-C）');
        ok($(t.d,'billList').querySelector('.lg-gap-today') && $(t.d,'billList').textContent.includes('还没记账') && $(t.d,'billList').querySelectorAll('.lg-gap').length === 1, '空存档：只有一条「今天还没记账 · 记一笔」（1023-C：不显示账本第一笔之前的空白日子）');
    }

    // ---------- 5. 详情金额 ----------
    {
        const t = await boot();
        t.w.JiwenDetail.openDetail('r4');
        const txt = $(t.d,'detailMoney').textContent;
        ok(!txt.includes('NaN') && txt.includes('0.00'), '脏金额详情显示 0.00 而非 NaN：' + txt);
    }

    console.log(`\n${file}: ${pass} 通过，${fail} 失败`);
    process.exit(fail ? 1 : 0);
})();
