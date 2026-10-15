#!/usr/bin/env python3
"""Cyclops Spark: write a PNG from flattened RGB bytes.

Spark's plugin runtime can write text, not bytes, so for /spark convert she writes the picture's RGB as base64 text and
asks this helper to turn it into a PNG. Standard library only. The base64 file is removed afterwards.

  spark_png.py <rgb.b64> <out.png> <width> <height> [parts]

With `parts`, the base64 comes in that many files, <rgb.b64>.0, .1, ... (Spark can write at most 4 MiB at a time),
read in order and each removed afterwards.
"""
import base64
import os
import struct
import sys
import zlib


def chunk(kind, data):
    body = kind + data
    return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)


def main():
    if len(sys.argv) not in (5, 6):
        sys.stderr.write("usage: spark_png.py <rgb.b64> <out.png> <width> <height> [parts]\n")
        return 2
    src, out, w, h = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
    parts = int(sys.argv[5]) if len(sys.argv) == 6 else 0
    sources = ["%s.%d" % (src, k) for k in range(parts)] if parts else [src]
    text = b""
    for name in sources:
        with open(name, "rb") as f:
            text += f.read()
    rgb = base64.b64decode(text)
    if len(rgb) != w * h * 3:
        sys.stderr.write("spark_png.py: %d bytes is not %dx%d RGB\n" % (len(rgb), w, h))
        return 1
    stride = w * 3
    raw = b"".join(b"\x00" + rgb[y * stride:(y + 1) * stride] for y in range(h))
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 6)) + chunk(b"IEND", b"")
    with open(out, "wb") as f:
        f.write(png)
    for name in sources:
        try:
            os.remove(name)
        except OSError:
            pass
    print("ok %s" % out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
