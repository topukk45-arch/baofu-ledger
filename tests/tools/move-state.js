// 一次性：把全 App 共用的四个状态（currentUser / currentArchive / currentTab / curPage）收进基础（modules 分支 1019-Z4-M20）。
//   1. 第一个旧文件里那四行 let 原样剪到 app/base.js 的入口那一行前面；
//   2. JiwenBase 入口上给这四个读写口：get currentUser(){ return currentUser; }, set currentUser(v){ currentUser=v; }……；
//   3. 别的文件（已经搬好的模块和还没搬的旧文件）里用到它们的地方，按语法树找到，换成 JiwenBase.currentUser（简写的 { curPage } 换成 { curPage: JiwenBase.curPage }）。
//   打印每一处改动。用法：node tests/tools/move-state.js [--dry]
'use strict';
const fs = require('fs'), path = require('path');
const D = require('./deps'), S = require('./scan');
const NAMES = ['currentUser', 'currentArchive', 'currentTab', 'curPage'];
const WWW = path.join(__dirname, '..', '..', 'www');
const dry = process.argv.includes('--dry');
const html = fs.readFileSync(path.join(WWW, 'index.html')).toString('utf8');
const files = [...html.matchAll(/<script src="(app\/[^"?]+\.js)\?v=[^"]*"><\/script>/g)].map(m => m[1]);
const legacy = files.filter(f => /^app\/app-\d+-/.test(f));
const text = Object.fromEntries(files.map(f => [f, fs.readFileSync(path.join(WWW, f), 'utf8')]));
// 1. 剪那四行
const first = legacy[0];
const LINES = ["        let currentUser = '';\n", "        let currentArchive = '';\n", "        let currentTab = 'ledger';\n", "        let curPage = 1;\n"];
const block = LINES.join('');
if (!text[first].includes(block)) throw new Error('第一个旧文件里找不到那四行');
text[first] = text[first].replace(block, '');
const ENTRY = '        window.JiwenBase = { ';
if (!text['app/base.js'].includes(ENTRY)) throw new Error('base.js 里找不到入口那一行');
text['app/base.js'] = text['app/base.js'].replace(ENTRY, block + ENTRY.replace('{ ', '{ ' + NAMES.map(n => `get ${n}(){ return ${n}; }, set ${n}(v){ ${n}=v; }, `).join('')));
// 3. 别的文件改写法
const log = [];
files.filter(f => f !== 'app/base.js').forEach(f => {
  const sites = [];
  D.freeRefs(S.parse(D.unwrap(text[f])), sites);
  const mine = sites.filter(x => NAMES.includes(x.name)).sort((a, b) => b.start - a.start);
  if (!mine.length) return;
  const before = text[f].split('\n');
  let t = text[f]; const lines = new Set();
  mine.forEach(x => { lines.add(t.slice(0, x.start).split('\n').length); t = t.slice(0, x.start) + (x.shorthand ? `${x.name}: JiwenBase.${x.name}` : `JiwenBase.${x.name}`) + t.slice(x.end); });
  const after = t.split('\n');
  [...lines].sort((a, b) => a - b).forEach(ln => log.push(`${f}:${ln}\n  - ${before[ln - 1].trim()}\n  + ${after[ln - 1].trim()}`));
  text[f] = t;
  log.push(`${f}：${mine.length} 处`);
});
console.log(log.join('\n'));
if (!dry) files.forEach(f => fs.writeFileSync(path.join(WWW, f), text[f]));
