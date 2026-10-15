// 测试用：把文字编码成 GBK 字节。Node 只会把 GBK 解码成文字、不会反过来编码，
// 这里用 GB18030 解码器把所有双字节码解一遍，反向建一张「字 → 两个字节」的表。只在测试里用。
let table = null;
function build() {
  table = new Map();
  const dec = new TextDecoder('gb18030');
  for (let a = 0x81; a <= 0xfe; a++) {
    for (let b = 0x40; b <= 0xfe; b++) {
      if (b === 0x7f) continue;
      const ch = dec.decode(new Uint8Array([a, b]));
      if (ch.length === 1 && ch !== '�' && !table.has(ch)) table.set(ch, [a, b]);
    }
  }
}
function encode(text) {
  if (!table) build();
  const out = [];
  for (const ch of text) {
    const c = ch.codePointAt(0);
    if (c < 0x80) { out.push(c); continue; }
    const t = table.get(ch);
    if (!t) throw new Error('GBK 里没有这个字：' + ch);
    out.push(t[0], t[1]);
  }
  return Uint8Array.from(out);
}
module.exports = { encode };
