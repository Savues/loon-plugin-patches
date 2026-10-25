#!/usr/bin/env python3
"""lcf_macho.py — Mach-O dylib 查看器 (v2: 命令遍历用绝对偏移)"""
import struct, sys

def cstr(d, off):
    end = d.find(b'\0', off)
    return d[off:end].decode(errors='replace')

def main(path):
    d = open(path, "rb").read()
    magic, cputype, cpusub, filetype, ncmds, sizeofcmds, flags, res = struct.unpack("<IiiIIIII", d[:32])
    print(f"magic=0x{magic:08x} filetype={filetype} ncmds={ncmds} flags=0x{flags:x}")
    print(f"cputype=0x{cputype:x} cpusub=0x{cpusub:x}  (ARM64|ABI64={'yes' if cputype==0x100000c else 'NO'})")
    off = 32
    symtab = None
    segs = []
    for _ in range(ncmds):
        cmd, size = struct.unpack("<II", d[off:off+8])
        if cmd == 0x19:  # LC_SEGMENT_64
            segname = cstr(d, off+8)
            vmaddr, vmsize, fileoff, filesize, maxprot, initprot, nsects, sflags = struct.unpack("<QQQQIIII", d[off+24:off+24+48])
            segs.append((segname, filesize, nsects))
            so = off + 80
            for i in range(nsects):
                sname = cstr(d, so)
                saddr, ssize = struct.unpack("<QQ", d[so+16:so+32])
                print(f"  sect {segname},{sname} size={ssize}")
                so += 80
        elif cmd == 0x2:  # LC_SYMTAB
            symtab = struct.unpack("<IIII", d[off+8:off+24])
        elif cmd == 0xC:
            print(f"  LC_LOAD_DYLIB  {cstr(d, off+24)}")
        elif cmd == 0xD:
            print(f"  LC_ID_DYLIB    {cstr(d, off+24)}")
        elif cmd == 0x1D:
            print(f"  LC_UUID        {d[off+8:off+24].hex()}")
        elif cmd == 0x32:
            plat, minos, sdk = struct.unpack("<III", d[off+8:off+20])
            print(f"  LC_BUILD_VERSION platform={plat} minos={minos>>16}.{(minos>>8)&255}.{minos&255} sdk={sdk>>16}.{(sdk>>8)&255}")
        elif cmd == 0x21 or cmd == 0x1D or cmd == 0x26 or cmd == 0x29 or cmd == 0x2A or cmd == 0x2E:
            pass
        else:
            print(f"  cmd=0x{cmd:x} size={size}")
        off += size
    print("段:", [(s, sz, n) for s, sz, n in segs])
    if symtab:
        symoff, nsyms, stroff, strsize = symtab
        undef = []
        defined = 0
        for i in range(nsyms):
            o = symoff + i*16
            n_strx, n_type, n_sect, n_desc, n_value = struct.unpack("<IBBHQ", d[o:o+16])
            name = cstr(d, stroff + n_strx) if n_strx < strsize else "?"
            if n_type & 0x0e == 0x0e and name.startswith('_') and (n_type & 0x01):
                undef.append(name[1:])  # N_EXT 未定义 = 真外部引用
            if n_sect > 0:
                defined += 1
        print(f"符号: 定义{defined} 未定义{len(undef)}")
        for u in sorted(set(undef)):
            print("   UND:", u)

if __name__ == "__main__":
    main(sys.argv[1])
