// 1020-G：记一笔 / 修改照「方案 D」改版以后，测试里选分类、选统计的写法（老测试只改这一处调用，检查一字不动）
//   分类一行只有 4 个「最近常用」，别的在「更多」那一行拉出来的分类抽屉里；统计是列表卡里一行，点了弹统计面板。
// chip(d, boxId, name)：按字找 .cc；记一笔 / 修改的分类不在那 4 个里时，打开分类抽屉、返回抽屉「全部」里那一块（点了就选好、抽屉关掉）
function chip(d, boxId, name) {
  const $ = id => d.getElementById(id);
  const find = root => [...root.querySelectorAll('.cc')].find(e => (e.querySelector('.cc-label') || e).textContent === name);
  const box = $(boxId);
  const el = box && find(box);
  if (el) return el;
  const m = /^(bill|edit)CatChips$|^tplEditCats$/.exec(boxId);
  if (!m) return el;
  $((m[1] || 'tplEdit') + 'CatMore').click();
  const all = $('catDrawerAll');
  return all && find(all);
}
// pickMode(d, boxId, '计入' | '不计' | '往来')：点「统计」那一行，在统计面板里点那一种
function pickMode(d, boxId, name) {
  d.getElementById(boxId).click();
  const r = [...d.querySelectorAll('#modePick .mode-pick-row')].find(x => x.querySelector('b').textContent === name);
  if (!r) throw new Error('统计面板里没有「' + name + '」');
  r.click();
}
// 统计那一行现在写的
const modeText = (d, boxId) => { const v = d.getElementById(boxId).querySelector('.rec-row-v'); return v ? v.textContent : ''; };
// 1020-I：批量改分类改用分类抽屉：choose(d, '游戏')：提示框的选项里有就点它 + 确定；没有、分类抽屉开着，就在抽屉里点那个分类
function choose(d, label) {
  const ac = d.getElementById('askChoices');
  const el = ac && [...ac.querySelectorAll('.cc')].find(e => (e.querySelector('.cc-label') || e).textContent === label && d.getElementById('askMask').style.display === 'flex');
  if (el) { el.click(); d.getElementById('askOk').click(); return; }
  const all = d.getElementById('catDrawerAll');
  const c = all && [...all.querySelectorAll('.cc')].find(e => e.textContent === label);
  if (!c) throw new Error('找不到「' + label + '」');
  c.click();
}
module.exports = { chip, pickMode, modeText, choose };
