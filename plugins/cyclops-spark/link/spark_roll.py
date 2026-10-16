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
  spark_roll.py music <score.json> <out.wav>
      the roll's music: plays the score Spark read from the paintings (hooks/music.js) with a few small instruments of
      its own (a pad, a bass, bells, plucked strings, sparkles, swells), into a WAV; numpy makes it quick where it is
      installed, and it works without
  join takes the WAV as a sixth argument, and lays it under the clip with a little echo and a fade at each end.
"""
import base64
import json
import math
import os
import shutil
import struct
import subprocess
import sys
import wave
import zlib

try:
    import numpy as np
except ImportError:  # it works without, more slowly and a little plainer
    np = None


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


def join(d, n, out, seconds, fade, music=None):
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
    audio = []
    if music and os.path.exists(music):  # the music under it: a little echo, in at the start and out with the picture
        inputs += ["-i", music]
        chains.append("[%d:a]aecho=0.8:0.6:190|330:0.32|0.22,volume=1.6,alimiter=limit=0.9:level=disabled,afade=t=in:d=1.5,afade=t=out:st=%s:d=2,apad,atrim=0:%s[a]" % (n, round(max(0, total - 2), 3), round(total, 3)))
        audio = ["-map", "[a]", "-c:a", "aac", "-b:a", "192k"]
    err = ""
    for enc in encoders():
        cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y"] + inputs + \
              ["-filter_complex", ";".join(chains), "-map", "[v]"] + audio + ["-movflags", "+faststart"] + enc + [out]
        run = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        err = run.stderr.decode("utf-8", "replace")
        if run.returncode == 0:
            for s in segs + ([music] if music else []):
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


# ---------------------------------------------------------------- the music
def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12.0)


class Mix:
    """Two channels of floats; each instrument renders a note and lays it in at its time and place."""

    def __init__(self, seconds, sr):
        self.sr = sr
        self.n = int(seconds * sr) + 1
        if np is not None:
            self.l = np.zeros(self.n)
            self.r = np.zeros(self.n)
        else:
            self.l = [0.0] * self.n
            self.r = [0.0] * self.n

    def add(self, t, samples, pan):
        a = int(t * self.sr)
        if a >= self.n:
            return
        k = min(len(samples), self.n - a)
        gl, gr = math.cos((pan + 1) * math.pi / 4), math.sin((pan + 1) * math.pi / 4)  # equal power
        if np is not None:
            self.l[a:a + k] += samples[:k] * gl
            self.r[a:a + k] += samples[:k] * gr
        else:
            L, R = self.l, self.r
            for i in range(k):
                v = samples[i]
                L[a + i] += v * gl
                R[a + i] += v * gr


SINE = [math.sin(2 * math.pi * i / 4096) for i in range(4096)]


def tone(freqs_amps, n, sr, env):
    """Partials (frequency, amplitude, decay seconds or 0 for none) shaped by an envelope function of time."""
    if np is not None:
        t = np.arange(n) / sr
        out = np.zeros(n)
        for f, a, decay in freqs_amps:
            if f >= sr / 2:
                continue
            part = a * np.sin(2 * math.pi * f * t)
            if decay:
                part *= np.exp(-t / decay)
            out += part
        return out * env(t)
    out = [0.0] * n
    for f, a, decay in freqs_amps:
        if f >= sr / 2:
            continue
        step = f * 4096 / sr
        k = math.exp(-1 / (decay * sr)) if decay else 1.0
        g = a
        ph = 0.0
        for i in range(n):
            out[i] += SINE[int(ph) & 4095] * g
            ph += step
            g *= k
    e = [env(i / sr) for i in range(n)]
    return [x * y for x, y in zip(out, e)]


def smooth_env(attack, release, length):
    """Up over `attack`, held, down over `release` at the end: soft (a half sine each way)."""
    def env(t):
        if np is not None and not isinstance(t, float):
            up = np.clip(t / max(attack, 1e-3), 0, 1)
            down = np.clip((length - t) / max(release, 1e-3), 0, 1)
            return np.sin(up * math.pi / 2) ** 2 * np.sin(down * math.pi / 2) ** 2
        up = min(1.0, t / max(attack, 1e-3))
        down = max(0.0, min(1.0, (length - t) / max(release, 1e-3)))
        return math.sin(up * math.pi / 2) ** 2 * math.sin(down * math.pi / 2) ** 2
    return env


def instrument(v, midi, length, vel, sr):
    f = hz(midi)
    n = int(length * sr)
    if v == "pad":  # warm: two voices a hair apart, soft upper partials
        parts = []
        for det in (0.9985, 1.0015):
            parts += [(f * det * h, 0.5 / h ** 1.6, 0) for h in range(1, 6)]
        return tone(parts, n, sr, smooth_env(1.4, 1.6, length)), 0.055 * vel
    if v == "bass":
        return tone([(f, 1.0, 0), (2 * f, 0.25, 0), (3 * f, 0.06, 0)], n, sr, smooth_env(0.35, 1.2, length)), 0.2 * vel
    if v == "bell":  # partials a little off the harmonics, the high ones dying first
        return tone([(f, 1.0, 1.7), (2.0 * f, 0.22, 1.0), (2.76 * f, 0.34, 0.8), (5.4 * f, 0.12, 0.35), (8.9 * f, 0.05, 0.18)], n, sr, smooth_env(0.004, 0.25, length)), 0.11 * vel
    if v == "pluck":  # a string: bright at the start, rounding off
        return tone([(f * h, 1.0 / h, 0.9 / (1 + 0.7 * h)) for h in range(1, 8)], n, sr, smooth_env(0.003, 0.2, length)), 0.13 * vel
    if v == "sparkle":
        return tone([(f, 1.0, 0.22), (2 * f, 0.15, 0.1)], n, sr, smooth_env(0.002, 0.1, length)), 0.06 * vel
    if v == "swell":
        return tone([(f, 1.0, 0), (2 * f, 0.18, 0), (3 * f, 0.08, 0)], n, sr, smooth_env(0.9, 1.3, length)), 0.07 * vel
    return None, 0


def music(score_path, out):
    with open(score_path) as f:
        score = json.load(f)
    sr = 32000 if np is not None else 16000
    mix = Mix(score["total"] + 3, sr)
    for e in score["events"]:
        for m in e["midi"]:
            samples, gain = instrument(e["v"], m, e["len"], e["vel"], sr)
            if samples is None:
                continue
            if np is not None:
                samples = samples * gain
            else:
                samples = [x * gain for x in samples]
            mix.add(e["t"], samples, e.get("pan", 0))
    # loud enough, never clipping: the peak to 0.85
    if np is not None:
        peak = max(float(np.abs(mix.l).max()), float(np.abs(mix.r).max()), 1e-6)
        k = 0.85 / peak
        inter = np.empty(2 * mix.n, dtype=np.int16)
        inter[0::2] = np.clip(mix.l * k * 32767, -32767, 32767).astype(np.int16)
        inter[1::2] = np.clip(mix.r * k * 32767, -32767, 32767).astype(np.int16)
        data = inter.tobytes()
    else:
        peak = max(max(abs(x) for x in mix.l), max(abs(x) for x in mix.r), 1e-6)
        k = 0.85 / peak * 32767
        data = b"".join(struct.pack("<hh", int(a * k), int(b * k)) for a, b in zip(mix.l, mix.r))
    with wave.open(out, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(data)
    try:
        os.remove(score_path)
    except OSError:
        pass
    print("ok %s %.1f %s" % (out, score["total"], score.get("key", "")))
    return 0


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
        if what == "join" and len(a) in (5, 6):
            return join(a[0], int(a[1]), a[2], float(a[3]), float(a[4]), a[5] if len(a) == 6 else None)
        if what == "music" and len(a) == 2:
            return music(a[0], a[1])
        if what == "apng" and len(a) == 10:
            return apng(a[0], int(a[1]), int(a[2]), int(a[3]), int(a[4]), int(a[5]), int(a[6]), int(a[7]), int(a[8]), a[9])
    except (OSError, ValueError) as e:
        sys.stderr.write("spark_roll.py: %s\n" % e)
        return 1
    sys.stderr.write(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
