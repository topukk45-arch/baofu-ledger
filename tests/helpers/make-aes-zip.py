# 测试夹具：用 Python 的 cryptography 库另写一份 WinZip AES 加密，生成带密码的 .zip（和 www/import/unzip.js 互相印证）。
# 用法：python3 make-aes-zip.py 输出.zip 密码 强度(1/2/3) 文件...   只在生成夹具时手动跑，测试本身不用 Python。
import sys, os, struct, zlib, hashlib, hmac, time
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

def aes_ctr_le(key, data):
    enc = Cipher(algorithms.AES(key), modes.ECB()).encryptor()
    out = bytearray()
    for i in range(0, len(data), 16):
        ks = enc.update((i // 16 + 1).to_bytes(16, 'little'))
        out += bytes(a ^ b for a, b in zip(data[i:i+16], ks))
    return bytes(out)

def main():
    out, pw, strength, files = sys.argv[1], sys.argv[2].encode('utf-8'), int(sys.argv[3]), sys.argv[4:]
    kl = {1: 16, 2: 24, 3: 32}[strength]
    entries, body = [], bytearray()
    for i, path in enumerate(files):
        name = os.path.basename(path).encode('utf-8')
        raw = open(path, 'rb').read()
        comp = zlib.compressobj(9, zlib.DEFLATED, -15)
        cdata = comp.compress(raw) + comp.flush()
        salt = bytes((7 * i + j * 13 + 1) & 255 for j in range(kl // 2))     # 固定的盐，夹具每次生成一样
        dk = hashlib.pbkdf2_hmac('sha1', pw, salt, 1000, 2 * kl + 2)
        ct = aes_ctr_le(dk[:kl], cdata)
        mac = hmac.new(dk[kl:2 * kl], ct, hashlib.sha1).digest()[:10]
        payload = salt + dk[2 * kl:] + ct + mac
        extra = struct.pack('<HHHHBH', 0x9901, 7, 2, 0x4541, strength, 8)
        flags = 1 | 0x800
        crc = 0                         # AE-2：不写 CRC
        off = len(body)
        body += struct.pack('<IHHHHHIIIHH', 0x04034b50, 51, flags, 99, 0, 0x5521, crc, len(payload), len(raw), len(name), len(extra)) + name + extra + payload
        entries.append((name, extra, flags, crc, len(payload), len(raw), off))
    cd = bytearray()
    for name, extra, flags, crc, cs, us, off in entries:
        cd += struct.pack('<IHHHHHHIIIHHHHHII', 0x02014b50, 51, 51, flags, 99, 0, 0x5521, crc, cs, us, len(name), len(extra), 0, 0, 0, 0, off) + name + extra
    eocd = struct.pack('<IHHHHIIH', 0x06054b50, 0, 0, len(entries), len(entries), len(cd), len(body), 0)
    open(out, 'wb').write(bytes(body + cd + eocd))

main()
