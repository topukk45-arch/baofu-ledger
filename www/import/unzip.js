// 记问 · 账单导入 · 解压账单压缩包（纯计算，第三期，1016-Z8）
// 微信、支付宝导出的账单是带密码的 .zip，里面是 .xlsx / .csv。这里认出压缩包、试密码、解出里面的账单文件，
// 不碰页面、存储，输入是字节和密码，输出是解出来的文件。和 core.js 同样的写法：浏览器里是全局变量 JiwenImportUnzip，Node 里直接 require。
//   inspect(字节)  → { kind: 'xlsx'（本身就是 xlsx，不用解）| 'zip'（账单压缩包）| 'none'（不是压缩包）| 'bad', encrypted, names:[里面的账单文件] }
//   extract(字节, 密码) → { ok:true, files:[{ name, data: Uint8Array }] } | { ok:false, why: 'password'|'nobill'|'bad'|'method'|'toolarge' }
// 支持两种加密：传统的 ZipCrypto，和 WinZip AES（128 / 192 / 256 位）。密码按 UTF-8 算。全是 JS 自己算，不用浏览器的加密接口。
// 只解 .csv / .xlsx（其他文件不管），解出来的每个不超过 8MB（和导入的上限一样）。
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else root.JiwenImportUnzip = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1016-Z8';
  var MAX_OUT = 8 * 1024 * 1024;

  function inflater() {
    if (typeof JiwenTinyInflate !== 'undefined') return JiwenTinyInflate;   // eslint-disable-line no-undef
    if (typeof require === 'function') return require('./vendor/tiny-inflate.js');
    throw new Error('解压库没有载入');
  }
  function u16(b, o) { return b[o] | (b[o + 1] << 8); }
  function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + b[o + 3] * 16777216; }
  function utf8(s) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s);
    var out = [], i, c;
    for (i = 0; i < s.length; i++) {
      c = s.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return new Uint8Array(out);
  }
  // 文件名：先按 UTF-8 读（很多压缩软件写 UTF-8 但不打标记），不是合法 UTF-8 再按 GB18030（Windows 上压的）
  function decodeName(bytes) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (_) {}
    try { return new TextDecoder('gb18030').decode(bytes); } catch (_) { return ''; }
  }

  // ---------- 目录 ----------
  function readDir(b) {
    var eocd = -1;
    for (var i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) {
      if (b[i] === 0x50 && b[i + 1] === 0x4b && b[i + 2] === 5 && b[i + 3] === 6) { eocd = i; break; }
    }
    if (eocd < 0) return null;
    var cnt = u16(b, eocd + 10), off = u32(b, eocd + 16), list = [];
    for (var k = 0; k < cnt; k++) {
      if (off + 46 > b.length || u32(b, off) !== 0x02014b50) return null;
      var flags = u16(b, off + 8), method = u16(b, off + 10), mtime = u16(b, off + 12), crc = u32(b, off + 16);
      var csize = u32(b, off + 20), usize = u32(b, off + 24);
      var nl = u16(b, off + 28), xl = u16(b, off + 30), cl = u16(b, off + 32), loff = u32(b, off + 42);
      var name = decodeName(b.subarray(off + 46, off + 46 + nl));
      var e = { name: name, flags: flags, method: method, mtime: mtime, crc: crc, csize: csize, usize: usize, off: loff, enc: !!(flags & 1), aes: null };
      // WinZip AES 的额外字段 0x9901：版本、厂商、强度（1/2/3 = 128/192/256 位）、真正的压缩方式
      var x = off + 46 + nl, xe = x + xl;
      while (x + 4 <= xe) {
        var id = u16(b, x), sz = u16(b, x + 2);
        if (id === 0x9901 && sz >= 7) e.aes = { strength: b[x + 8], method: u16(b, x + 9) };
        x += 4 + sz;
      }
      list.push(e);
      off += 46 + nl + xl + cl;
    }
    return list;
  }
  function isBillName(n) { return /\.(csv|xlsx)$/i.test(n) && !/(^|\/)__MACOSX\//.test(n) && !/(^|\/)\._/.test(n); }

  function inspect(u8) {
    if (!u8 || u8.length < 4 || u8[0] !== 0x50 || u8[1] !== 0x4b) return { kind: 'none' };
    var dir; try { dir = readDir(u8); } catch (_) { dir = null; }
    if (!dir) return { kind: 'bad' };
    if (dir.some(function (e) { return e.name === 'xl/workbook.xml'; })) return { kind: 'xlsx', encrypted: dir.some(function (e) { return e.enc; }) };
    var bills = dir.filter(function (e) { return isBillName(e.name); });
    return { kind: 'zip', encrypted: bills.some(function (e) { return e.enc; }), names: bills.map(function (e) { return e.name.split('/').pop(); }) };
  }

  // ---------- CRC32（ZipCrypto 用）----------
  var CRC = (function () { var t = new Int32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
  function crc32(u8) { var c = -1; for (var i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }

  // ---------- ZipCrypto ----------
  function zipCrypto(pw, data, e) {
    var k0 = 0x12345678, k1 = 0x23456789, k2 = 0x34567890;
    function upd(c) {
      k0 = CRC[(k0 ^ c) & 255] ^ (k0 >>> 8);
      k1 = (k1 + (k0 & 255)) >>> 0;
      k1 = (Math.imul(k1, 134775813) + 1) >>> 0;
      k2 = CRC[(k2 ^ (k1 >>> 24)) & 255] ^ (k2 >>> 8);
    }
    function dbyte() { var t = (k2 | 2) & 0xffff; return (Math.imul(t, t ^ 1) >>> 8) & 255; }
    for (var i = 0; i < pw.length; i++) upd(pw[i]);
    if (data.length < 12) return null;
    var h = 0;
    for (i = 0; i < 12; i++) { h = data[i] ^ dbyte(); upd(h); }
    var check = (e.flags & 8) ? (e.mtime >> 8) & 255 : (e.crc >>> 24) & 255;
    if (h !== check) return null;                       // 密码不对（有 1/256 的机会对上，后面还有 CRC 兜底）
    var out = new Uint8Array(data.length - 12);
    for (i = 12; i < data.length; i++) { var c = data[i] ^ dbyte(); upd(c); out[i - 12] = c; }
    return out;
  }

  // ---------- SHA-1、HMAC、PBKDF2（AES 用）----------
  function sha1(msg) {
    var ml = msg.length, nb = ((ml + 8) >> 6) + 1, w = new Int32Array(nb * 16), i;
    for (i = 0; i < ml; i++) w[i >> 2] |= msg[i] << (24 - (i & 3) * 8);
    w[ml >> 2] |= 0x80 << (24 - (ml & 3) * 8);
    w[nb * 16 - 1] = ml * 8;
    var h0 = 0x67452301, h1 = 0xefcdab89 | 0, h2 = 0x98badcfe | 0, h3 = 0x10325476, h4 = 0xc3d2e1f0 | 0, x = new Int32Array(80);
    for (var b = 0; b < nb * 16; b += 16) {
      for (i = 0; i < 16; i++) x[i] = w[b + i];
      for (i = 16; i < 80; i++) { var t0 = x[i - 3] ^ x[i - 8] ^ x[i - 14] ^ x[i - 16]; x[i] = (t0 << 1) | (t0 >>> 31); }
      var a = h0, bb = h1, c = h2, d = h3, e = h4;
      for (i = 0; i < 80; i++) {
        var f, k;
        if (i < 20) { f = (bb & c) | (~bb & d); k = 0x5a827999; }
        else if (i < 40) { f = bb ^ c ^ d; k = 0x6ed9eba1; }
        else if (i < 60) { f = (bb & c) | (bb & d) | (c & d); k = 0x8f1bbcdc | 0; }
        else { f = bb ^ c ^ d; k = 0xca62c1d6 | 0; }
        var t = (((a << 5) | (a >>> 27)) + f + e + k + x[i]) | 0;
        e = d; d = c; c = (bb << 30) | (bb >>> 2); bb = a; a = t;
      }
      h0 = (h0 + a) | 0; h1 = (h1 + bb) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0; h4 = (h4 + e) | 0;
    }
    var out = new Uint8Array(20);
    [h0, h1, h2, h3, h4].forEach(function (v, j) { out[j * 4] = v >>> 24; out[j * 4 + 1] = (v >>> 16) & 255; out[j * 4 + 2] = (v >>> 8) & 255; out[j * 4 + 3] = v & 255; });
    return out;
  }
  function concat(a, b) { var o = new Uint8Array(a.length + b.length); o.set(a); o.set(b, a.length); return o; }
  function hmacKeyed(key) {
    if (key.length > 64) key = sha1(key);
    var ip = new Uint8Array(64), op = new Uint8Array(64);
    for (var i = 0; i < 64; i++) { var k = i < key.length ? key[i] : 0; ip[i] = k ^ 0x36; op[i] = k ^ 0x5c; }
    return function (msg) { return sha1(concat(op, sha1(concat(ip, msg)))); };
  }
  function pbkdf2(pw, salt, iter, len) {
    var H = hmacKeyed(pw), out = new Uint8Array(len), blocks = Math.ceil(len / 20);
    for (var bi = 1; bi <= blocks; bi++) {
      var u = H(concat(salt, new Uint8Array([bi >>> 24, (bi >>> 16) & 255, (bi >>> 8) & 255, bi & 255]))), t = u.slice();
      for (var r = 1; r < iter; r++) { u = H(u); for (var j = 0; j < 20; j++) t[j] ^= u[j]; }
      out.set(t.subarray(0, Math.min(20, len - (bi - 1) * 20)), (bi - 1) * 20);
    }
    return out;
  }

  // ---------- AES（只要加密方向：CTR 模式）----------
  var SBOX = (function () {
    var s = new Uint8Array(256), p = 1, q = 1;
    do {
      p = p ^ (p << 1) ^ (p & 0x80 ? 0x1b : 0); p &= 255;
      q ^= q << 1; q ^= q << 2; q ^= q << 4; q &= 255; if (q & 0x80) q ^= 0x09;
      var x = q ^ ((q << 1) | (q >> 7)) ^ ((q << 2) | (q >> 6)) ^ ((q << 3) | (q >> 5)) ^ ((q << 4) | (q >> 4));
      s[p] = (x ^ 0x63) & 255;
    } while (p !== 1);
    s[0] = 0x63;
    return s;
  })();
  function xt(a) { return ((a << 1) ^ (a & 0x80 ? 0x1b : 0)) & 255; }
  function expandKey(key) {
    var nk = key.length / 4, nr = nk + 6, w = new Uint8Array(16 * (nr + 1)), rc = 1, i;
    w.set(key);
    for (i = nk; i < 4 * (nr + 1); i++) {
      var t = w.slice((i - 1) * 4, i * 4);
      if (i % nk === 0) { t = new Uint8Array([SBOX[t[1]] ^ rc, SBOX[t[2]], SBOX[t[3]], SBOX[t[0]]]); rc = xt(rc); }
      else if (nk > 6 && i % nk === 4) t = new Uint8Array([SBOX[t[0]], SBOX[t[1]], SBOX[t[2]], SBOX[t[3]]]);
      for (var j = 0; j < 4; j++) w[i * 4 + j] = w[(i - nk) * 4 + j] ^ t[j];
    }
    return { w: w, nr: nr };
  }
  function encBlock(K, inp, out) {
    var s = new Uint8Array(16), t = new Uint8Array(16), i, r, c;
    for (i = 0; i < 16; i++) s[i] = inp[i] ^ K.w[i];
    for (r = 1; r <= K.nr; r++) {
      for (i = 0; i < 16; i++) s[i] = SBOX[s[i]];
      // 行移位
      for (c = 0; c < 4; c++) for (i = 0; i < 4; i++) t[c * 4 + i] = s[((c + i) % 4) * 4 + i];
      if (r !== K.nr) {
        for (c = 0; c < 4; c++) {
          var a0 = t[c * 4], a1 = t[c * 4 + 1], a2 = t[c * 4 + 2], a3 = t[c * 4 + 3], all = a0 ^ a1 ^ a2 ^ a3;
          s[c * 4] = a0 ^ all ^ xt(a0 ^ a1); s[c * 4 + 1] = a1 ^ all ^ xt(a1 ^ a2);
          s[c * 4 + 2] = a2 ^ all ^ xt(a2 ^ a3); s[c * 4 + 3] = a3 ^ all ^ xt(a3 ^ a0);
        }
      } else s.set(t);
      for (i = 0; i < 16; i++) s[i] ^= K.w[r * 16 + i];
    }
    out.set(s);
  }
  // WinZip AES：PBKDF2-HMAC-SHA1（1000 次）出加密钥、校验钥、2 字节密码校验；AES-CTR，计数器小端、从 1 开始；最后 10 字节是 HMAC
  function winzipAes(pw, data, strength) {
    var kl = { 1: 16, 2: 24, 3: 32 }[strength]; if (!kl) return { why: 'method' };
    var sl = kl / 2;
    if (data.length < sl + 2 + 10) return { why: 'bad' };
    var salt = data.subarray(0, sl), ver = data.subarray(sl, sl + 2);
    var dk = pbkdf2(pw, salt, 1000, 2 * kl + 2);
    if (dk[2 * kl] !== ver[0] || dk[2 * kl + 1] !== ver[1]) return { why: 'password' };
    var ct = data.subarray(sl + 2, data.length - 10), mac = data.subarray(data.length - 10);
    var m = hmacKeyed(dk.subarray(kl, 2 * kl))(ct);
    for (var i = 0; i < 10; i++) if (m[i] !== mac[i]) return { why: 'bad' };
    var K = expandKey(dk.subarray(0, kl)), out = new Uint8Array(ct.length), ctr = new Uint8Array(16), ks = new Uint8Array(16), n = 0;
    for (var p = 0; p < ct.length; p += 16) {
      n++; var v = n; for (var j = 0; j < 16; j++) { ctr[j] = j < 8 ? v & 255 : 0; if (j < 8) v = Math.floor(v / 256); }
      encBlock(K, ctr, ks);
      for (j = 0; j < 16 && p + j < ct.length; j++) out[p + j] = ct[p + j] ^ ks[j];
    }
    return { data: out };
  }

  function rawOf(b, e) {
    if (u32(b, e.off) !== 0x04034b50) throw new Error('zip');
    var start = e.off + 30 + u16(b, e.off + 26) + u16(b, e.off + 28);
    return b.subarray(start, start + e.csize);
  }
  function unpack(method, src, usize) {
    if (usize > MAX_OUT) return { why: 'toolarge' };
    if (method === 0) return { data: src.slice(0, usize) };
    if (method !== 8) return { why: 'method' };
    var out = new Uint8Array(usize), got;
    try { got = inflater()(src, out); } catch (_) { return { why: 'bad' }; }
    if (!got || got.length !== usize) return { why: 'bad' };
    return { data: got };
  }

  function extract(u8, password) {
    var dir; try { dir = readDir(u8); } catch (_) { dir = null; }
    if (!dir) return { ok: false, why: 'bad' };
    var bills = dir.filter(function (e) { return isBillName(e.name); });
    if (!bills.length) return { ok: false, why: 'nobill' };
    var pw = utf8(password == null ? '' : String(password)), files = [];
    for (var k = 0; k < bills.length; k++) {
      var e = bills[k], raw;
      try { raw = rawOf(u8, e); } catch (_) { return { ok: false, why: 'bad' }; }
      var r;
      if (e.enc && e.method === 99 && e.aes) {
        var a = winzipAes(pw, raw, e.aes.strength);
        if (!a.data) return { ok: false, why: a.why };
        r = unpack(e.aes.method, a.data, e.usize);
      } else if (e.enc) {
        var d = zipCrypto(pw, raw, e);
        if (!d) return { ok: false, why: 'password' };
        r = unpack(e.method, d, e.usize);
        if (r.data && crc32(r.data) !== e.crc) return { ok: false, why: 'password' };
      } else {
        r = unpack(e.method, raw, e.usize);
        if (r.data && crc32(r.data) !== e.crc) return { ok: false, why: 'bad' };
      }
      if (!r.data) return { ok: false, why: r.why === 'bad' && e.enc ? 'password' : r.why };
      files.push({ name: e.name.split('/').pop(), data: r.data });
    }
    return { ok: true, files: files };
  }

  return { VERSION: VERSION, inspect: inspect, extract: extract, _sha1: sha1, _pbkdf2: pbkdf2, _crc32: crc32,
           _aesBlock: function (key, block) { var o = new Uint8Array(16); encBlock(expandKey(key), block, o); return o; } };
});
