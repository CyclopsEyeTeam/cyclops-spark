#!/usr/bin/env python3
"""Cyclops Spark: make the roll, a clip of the session's paintings, from frames Spark draws.

Spark's plugin runtime can write text, not bytes, and cannot pipe into a process, so for /spark convert roll she writes
each frame's RGB as base64 text (in parts of at most 3 MB: <frame>.b64.0, .1, ...) and this helper turns them into a
clip. Standard library only, and ffmpeg for the MP4. Every frame and segment file it is handed is removed once used.

  spark_roll.py segment <dir> <i> <frames> <w> <h> <parts> <fps> <hold>
      painting i's frames (<dir>/f<iii>-<kkk>.b64.<p>), laid down at <fps>, the last held <hold> seconds, smoothed to
      30 frames a second, into <dir>/seg<iii>.mp4
  spark_roll.py join <dir> <n> <out.mp4> <seconds> <fade>
      the n segments, each <seconds> long, crossfaded over <fade> seconds, and faded out at the end, into <out.mp4>
  spark_roll.py apng <dir> <n> <frames> <w> <h> <parts> <reveal_ms> <hold_ms> <fade_frames> <out.png>
      without ffmpeg: an animated PNG of the same, smaller (it plays in any browser)
"""
import base64
import os
import shutil
import struct
import subprocess
import sys
import zlib


def frame_path(d, i, k):
    return os.path.join(d, "f%03d-%03d.b64" % (i, k))


def read_frame(d, i, k, parts, size):
    base = frame_path(d, i, k)
    text = b""
    for p in range(parts):
        with open("%s.%d" % (base, p), "rb") as f:
            text += f.read()
    rgb = base64.b64decode(text)
    if len(rgb) != size:
        raise ValueError("frame %d of painting %d: %d bytes, not %d" % (k, i, len(rgb), size))
    return rgb


def drop_frame(d, i, k, parts):
    for p in range(parts):
        try:
            os.remove("%s.%d" % (frame_path(d, i, k), p))
        except OSError:
            pass


def encoders():
    # x264 where ffmpeg has it (almost everywhere), else ffmpeg's own mpeg4
    return [["-c:v", "libx264", "-preset", "medium", "-crf", "18"], ["-c:v", "mpeg4", "-q:v", "2"]]


def segment(d, i, frames, w, h, parts, fps, hold):
    size = w * h * 3
    out = os.path.join(d, "seg%03d.mp4" % i)
    err = ""
    for enc in encoders():
        cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24",
               "-s", "%dx%d" % (w, h), "-r", str(fps), "-i", "-",
               "-vf", "tpad=stop_mode=clone:stop_duration=%s,framerate=fps=30,format=yuv420p" % hold] + enc + [out]
        proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        try:
            for k in range(frames):
                proc.stdin.write(read_frame(d, i, k, parts, size))
            proc.stdin.close()
        except BrokenPipeError:
            pass
        err = proc.stderr.read().decode("utf-8", "replace")
        if proc.wait() == 0:
            for k in range(frames):
                drop_frame(d, i, k, parts)
            print("ok %s" % out)
            return 0
    sys.stderr.write("spark_roll.py: ffmpeg could not make segment %d: %s\n" % (i, err.strip()[-300:]))
    return 1


def join(d, n, out, seconds, fade):
    segs = [os.path.join(d, "seg%03d.mp4" % i) for i in range(n)]
    total = n * seconds - (n - 1) * fade
    inputs = []
    for s in segs:
        inputs += ["-i", s]
    chains = ["[%d:v]settb=AVTB,fps=30,format=yuv420p[s%d]" % (i, i) for i in range(n)]
    last = "s0"
    for i in range(1, n):
        chains.append("[%s][s%d]xfade=transition=fade:duration=%s:offset=%s[x%d]" % (last, i, fade, round(i * (seconds - fade), 3), i))
        last = "x%d" % i
    chains.append("[%s]fade=t=out:st=%s:d=1[v]" % (last, round(max(0, total - 1), 3)))
    err = ""
    for enc in encoders():
        cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y"] + inputs + \
              ["-filter_complex", ";".join(chains), "-map", "[v]", "-movflags", "+faststart"] + enc + [out]
        run = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        err = run.stderr.decode("utf-8", "replace")
        if run.returncode == 0:
            for s in segs:
                try:
                    os.remove(s)
                except OSError:
                    pass
            try:
                os.rmdir(d)
            except OSError:
                pass
            print("ok %s %.1f" % (out, total))
            return 0
    sys.stderr.write("spark_roll.py: ffmpeg could not join the roll: %s\n" % err.strip()[-300:])
    return 1


def chunk(kind, data):
    body = kind + data
    return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)


def png_data(rgb, w, h):
    stride = w * 3
    return zlib.compress(b"".join(b"\x00" + rgb[y * stride:(y + 1) * stride] for y in range(h)), 6)


def blend(a, b, t):
    # a little faster than a loop over bytes: whole rows through a lookup of the two weights
    wa = [int(v * (1 - t) + 0.5) for v in range(256)]
    wb = [int(v * t + 0.5) for v in range(256)]
    return bytes(min(255, wa[x] + wb[y]) for x, y in zip(a, b))


def apng(d, n, frames, w, h, parts, reveal_ms, hold_ms, fade_frames, out):
    size = w * h * 3
    seq = [0]
    plan = []  # (rgb, delay_ms)
    for i in range(n):
        shots = [read_frame(d, i, k, parts, size) for k in range(frames)]
        for k, rgb in enumerate(shots):
            plan.append((rgb, hold_ms if k == frames - 1 else reveal_ms))
        if i + 1 < n:
            nxt = read_frame(d, i + 1, 0, parts, size)
            for f in range(1, fade_frames + 1):
                plan.append((blend(shots[-1], nxt, f / (fade_frames + 1)), 80))
        for k in range(frames):
            drop_frame(d, i, k, parts)

    def control(delay):
        s = seq[0]
        seq[0] += 1
        return chunk(b"fcTL", struct.pack(">IIIIIHHBB", s, w, h, 0, 0, int(delay), 1000, 0, 0))

    with open(out, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n")
        f.write(chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)))
        f.write(chunk(b"acTL", struct.pack(">II", len(plan), 0)))
        for j, (rgb, delay) in enumerate(plan):
            f.write(control(delay))
            data = png_data(rgb, w, h)
            if j == 0:
                f.write(chunk(b"IDAT", data))
            else:
                s = seq[0]
                seq[0] += 1
                f.write(chunk(b"fdAT", struct.pack(">I", s) + data))
        f.write(chunk(b"IEND", b""))
    try:
        os.rmdir(d)
    except OSError:
        pass
    print("ok %s %.1f" % (out, sum(dl for _, dl in plan) / 1000))
    return 0


def main(argv):
    if len(argv) < 2:
        sys.stderr.write(__doc__)
        return 2
    what, a = argv[1], argv[2:]
    try:
        if what == "segment" and len(a) == 8:
            if not shutil.which("ffmpeg"):
                sys.stderr.write("spark_roll.py: ffmpeg was not found\n")
                return 1
            return segment(a[0], int(a[1]), int(a[2]), int(a[3]), int(a[4]), int(a[5]), int(a[6]), float(a[7]))
        if what == "join" and len(a) == 5:
            return join(a[0], int(a[1]), a[2], float(a[3]), float(a[4]))
        if what == "apng" and len(a) == 10:
            return apng(a[0], int(a[1]), int(a[2]), int(a[3]), int(a[4]), int(a[5]), int(a[6]), int(a[7]), int(a[8]), a[9])
    except (OSError, ValueError) as e:
        sys.stderr.write("spark_roll.py: %s\n" % e)
        return 1
    sys.stderr.write(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
