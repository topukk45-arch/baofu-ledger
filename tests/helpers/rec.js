// 1020-G：记一笔 / 修改照「方案 D」改版以后，测试里选分类、选统计的写法（老测试只改这一处调用，检查一字不动）
//   分类一行只有 4 个「最近常用」，别的在「更多」那一行拉出来的分类抽屉里；统计是列表卡里一行，点了弹统计面板。
// chip(d, boxId, name)：按字找 .cc；记一笔 / 修改的分类不在那 4 个里时，打开分类抽屉、返回抽屉「全部」里那一块（点了就选好、抽屉关掉）
function chip(d, boxId, name) {
  const $ = id => d.getElementById(id);
  const find = root => [...root.querySelectorAll('.cc')].find(e => (e.querySelector('.cc-label') || e).textContent === name);
  const box = $(boxId);
  const el = box && find(box);
  if (el) return el;
  const m = /^(bill|edit)CatChips$/.exec(boxId);
  if (!m) return el;
  $(m[1] + 'CatMore').click();
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
module.exports = { chip, pickMode, modeText };
