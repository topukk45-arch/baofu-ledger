// 测试用：生成虚构的微信 / 支付宝账单文件（CSV 或 xlsx）。表头、开头说明的结构照真实账单，内容全是编的。
//   txn(…)：一笔交易；bill(app, txns, opts)：生成文件 → { bytes: Uint8Array, text?: CSV 原文, stats }
//   opts：format 'csv'|'xlsx'；encoding 'utf8'|'gbk'|'bom'；d1904（xlsx 用 1904 日期制）；timeAsText（xlsx 里时间写成文字）
//        range { from, to }（不给就按交易时间算）；statsOverride（改头部统计，测核对用）
//        header（换列、减列）；rename { 原列名: 新列名 }（只改表头上的名字，内容照原列取）
const zlib = require('zlib');
const GBK = require('./gbk');

const pad = n => String(n).padStart(2, '0');
const fmtTime = t => `${t.y}-${pad(t.mo)}-${pad(t.d)} ${pad(t.h)}:${pad(t.mi)}:${pad(t.s)}`;
const yuan = fen => (fen / 100).toFixed(2);

// 一笔交易（字段名用记问内部的叫法）
function txn(o) {
  return Object.assign({ time: { y: 2026, mo: 9, d: 1, h: 8, mi: 0, s: 0 }, kind: '餐饮美食', cp: '青禾便利', acct: 'qh***@example.com',
    desc: '早餐', io: 'expense', fen: 650, pm: '余额', status: '交易成功', no: '2026090122001400000000000001', mno: '', remark: '' }, o);
}
const IO_ALI = { income: '收入', expense: '支出', neutral: '不计收支' };
const IO_WX = { income: '收入', expense: '支出', neutral: '/' };

function statsOf(txns) {
  const s = { total: txns.length, income: [0, 0], expense: [0, 0], neutral: [0, 0] };
  txns.forEach(t => { s[t.io][0]++; s[t.io][1] += t.fen; });
  return s;
}
function rangeOf(txns) {
  const ts = txns.map(t => fmtTime(t.time)).sort();
  return ts.length ? { from: ts[0].slice(0, 10) + ' 00:00:00', to: ts[ts.length - 1].slice(0, 10) + ' 23:59:59' } : { from: '2026-09-01 00:00:00', to: '2026-09-30 23:59:59' };
}

// 开头的说明行（每个元素是一行，按 CSV 一格写）
function preamble(app, txns, opts) {
  const st = Object.assign(statsOf(txns), opts.statsOverride || {});
  const r = opts.range || rangeOf(txns);
  if (app === 'alipay') {
    return ['------------------------------------------------------------------------------------', '导出信息：', '姓名：测试用户', '支付宝账户：test***@example.com',
      `起始时间：[${r.from}]    终止时间：[${r.to}]`, '导出交易类型：[全部]', '导出时间：[2026-10-01 10:00:00]',
      `共${st.total}笔记录`, `收入：${st.income[0]}笔 ${yuan(st.income[1])}元`, `支出：${st.expense[0]}笔 ${yuan(st.expense[1])}元`,
      `不计收支：${st.neutral[0]}笔 ${yuan(st.neutral[1])}元`, '', '特别提示：',
      '1.本回单内容可表明支付宝受理了相关支付申请（虚构说明）', '2.本回单不作为收款方发货依据（虚构说明）', '3.虚构说明三', '4.虚构说明四',
      '5.虚构说明五', '6.虚构说明六', '7.虚构说明七', '8.虚构说明八',
      '------------------------支付宝（中国）网络技术有限公司  电子客户回单------------------------'];
  }
  return ['微信支付账单明细', '微信昵称：[测试用户]', `起始时间：[${r.from}] 终止时间：[${r.to}]`, '导出类型：[全部]', '导出时间：[2026-10-01 10:00:00]', '',
    `共${st.total}笔记录`, `收入：${st.income[0]}笔 ${yuan(st.income[1])}元`, `支出：${st.expense[0]}笔 ${yuan(st.expense[1])}元`,
    `中性交易：${st.neutral[0]}笔 ${yuan(st.neutral[1])}元`, '注：', '1. 充值/提现/理财通购买/零钱通存取/信用卡还款等交易，将计入中性交易（虚构说明）',
    '2. 本明细仅展示当前账单中的交易，不包括已删除的记录（虚构说明）', '3. 本明细仅供个人对账使用（虚构说明）', '',
    '----------------------微信支付账单明细列表--------------------'];
}
const HDR = {
  alipay: ['交易时间', '交易分类', '交易对方', '对方账号', '商品说明', '收/支', '金额', '收/付款方式', '交易状态', '交易订单号', '商家订单号', '备注'],
  wechat: ['交易时间', '交易类型', '交易对方', '商品', '收/支', '金额(元)', '支付方式', '当前状态', '交易单号', '商户单号', '备注'],
};
// 一笔交易 → 一行的各列（按 HDR 的列名）
function cells(app, t, opts) {
  const v = {
    交易时间: opts.timeFmt ? opts.timeFmt(t.time) : fmtTime(t.time), 交易分类: t.kind, 交易类型: t.kind, 交易对方: t.cp, 对方账号: t.acct,
    商品说明: t.desc, 商品: t.desc || '/', '收/支': (app === 'alipay' ? IO_ALI : IO_WX)[t.io], 金额: yuan(t.fen), '金额(元)': (opts.yen === false ? '' : '¥') + yuan(t.fen),
    '收/付款方式': t.pm, 支付方式: t.pm || '/', 交易状态: t.status, 当前状态: t.status,
    交易订单号: t.no, 交易单号: t.no, 商家订单号: t.mno, 商户单号: t.mno, 备注: t.remark || (app === 'wechat' ? '/' : ''),   // 微信退款行的商户单号是空的（不是「/」）
  };
  return v;
}
function csvField(s, force) {
  s = String(s);
  return (force || /[",\r\n]/.test(s)) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

const shown = (h, opts) => (opts.rename && opts.rename[h]) || h;
function renderCsv(app, txns, opts) {
  const hdr = opts.header || HDR[app];
  const width = hdr.length;
  const lines = [];
  preamble(app, txns, opts).forEach(l => lines.push(app === 'wechat' ? csvField(l) + ','.repeat(width - 1) : csvField(l)));
  lines.push(hdr.map(h => shown(h, opts)).join(',') + (app === 'alipay' ? ',' : ''));
  txns.forEach(t => {
    const c = cells(app, t, opts);
    const row = hdr.map(h => {
      let s = c[h] === undefined ? '' : c[h];
      if (app === 'alipay') {
        // 支付宝：订单号、商家订单号在引号里末尾带一个制表符；每个字段末尾带空白
        if (h === '交易订单号' || h === '商家订单号' || (h === '备注' && !s)) return '"' + String(s).replace(/"/g, '""') + '\t"';
        return csvField(String(s) + (opts.noPad ? '' : ' '));
      }
      if (h === '交易单号' || h === '商户单号') return csvField(String(s) + '\t');
      return csvField(s);
    });
    lines.push(row.join(',') + (app === 'alipay' ? ',' : ''));
  });
  const nl = opts.nl || '\r\n';
  return lines.join(nl) + nl;
}

// ---- xlsx（最小的一份：一个工作表 + 共享字符串）----
const CRC = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
function crc32(b) { let c = -1; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function zip(files, opts) {
  const parts = [], central = [];
  let off = 0;
  files.forEach(([name, data]) => {
    const raw = Buffer.from(data), nm = Buffer.from(name);
    const store = opts && opts.store;
    const comp = store ? raw : zlib.deflateRawSync(raw);
    const crc = crc32(raw);
    const flag = opts && opts.encrypted ? 1 : 0;
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(flag, 6); lh.writeUInt16LE(store ? 0 : 8, 8);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(nm.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(flag, 8); ch.writeUInt16LE(store ? 0 : 8, 10);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(nm.length, 28); ch.writeUInt32LE(off, 42);
    parts.push(lh, nm, comp); central.push(ch, nm);
    off += 30 + nm.length + comp.length;
  });
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return new Uint8Array(Buffer.concat(parts.concat([cd, end])));
}
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r/g, '_x000D_');
const colName = i => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
// 年月日时分秒 → Excel 日期序列号（1900 制从 1899-12-30 起算；1904 制少 1462 天）
function serial(t, d1904) {
  const days = Date.UTC(t.y, t.mo - 1, t.d) / 86400000 + 25569 - (d1904 ? 1462 : 0);
  return days + (t.h * 3600 + t.mi * 60 + t.s) / 86400;
}
function renderXlsx(app, txns, opts) {
  const hdr = opts.header || HDR[app];
  const ss = [], ssi = new Map();
  const S = s => { s = String(s); if (!ssi.has(s)) { ssi.set(s, ss.length); ss.push(s); } return ssi.get(s); };
  const rows = [];
  preamble(app, txns, opts).forEach(l => rows.push([{ s: l }]));
  rows.push(hdr.map(h => ({ s: shown(h, opts) })));
  txns.forEach(t => {
    const c = cells(app, t, Object.assign({}, opts, { yen: false }));
    rows.push(hdr.map(h => {
      if (h === '交易时间' && !opts.timeAsText) return { n: serial(t.time, opts.d1904) };
      if (h === '金额' || h === '金额(元)') return { n: t.fen / 100 };
      return { s: c[h] === undefined ? '' : c[h] };
    }));
  });
  let sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>';
  rows.forEach((r, i) => {
    sheet += `<row r="${i + 1}">`;
    r.forEach((c, j) => {
      if (c.s === '' ) return;                                  // 空格子不写（和 Excel 一样稀疏）
      const ref = colName(j) + (i + 1);
      sheet += c.n !== undefined ? `<c r="${ref}"><v>${c.n}</v></c>` : `<c r="${ref}" t="s"><v>${S(c.s)}</v></c>`;
    });
    sheet += '</row>';
  });
  sheet += '</sheetData></worksheet>';
  const sst = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="' + ss.length + '" uniqueCount="' + ss.length + '">'
    + ss.map(s => `<si><t xml:space="preserve">${esc(s)}</t></si>`).join('') + '</sst>';
  const wb = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + (opts.d1904 ? '<workbookPr date1904="1"/>' : '<workbookPr/>') + '<sheets><sheet name="账单" sheetId="1" r:id="rId1"/></sheets></workbook>';
  const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
    + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>';
  const ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>';
  return zip([['[Content_Types].xml', ct], ['xl/workbook.xml', wb], ['xl/_rels/workbook.xml.rels', rels], ['xl/worksheets/sheet1.xml', sheet], ['xl/sharedStrings.xml', sst]], opts);
}

function encodeText(text, enc) {
  if (enc === 'gbk') return GBK.encode(text);
  const b = new Uint8Array(Buffer.from(text, 'utf8'));
  if (enc === 'bom') { const o = new Uint8Array(b.length + 3); o.set([0xef, 0xbb, 0xbf]); o.set(b, 3); return o; }
  return b;
}
function bill(app, txns, opts) {
  opts = opts || {};
  if (opts.format === 'xlsx') return { bytes: renderXlsx(app, txns, opts), stats: statsOf(txns) };
  let text = renderCsv(app, txns, opts);
  if (opts.edit) text = opts.edit(text);
  return { bytes: encodeText(text, opts.encoding), text, stats: statsOf(txns) };
}
// 字节 → 交给解析的 ArrayBuffer（拷一份，免得共用底层缓冲）
const ab = u8 => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);

module.exports = { txn, bill, zip, serial, fmtTime, ab, HDR, renderCsv };
