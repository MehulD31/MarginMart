# Original 120 BPM track, 15 s (7.5 bars), synthesized: no licence needed. Beats every 0.5 s, cuts every 2 s.
import numpy as np, wave, sys
# usage: music.py out.wav TOTAL_SECONDS BRAND_AT (drop on the brand card, end hit 2 s later)
OUT = sys.argv[1]; T = float(sys.argv[2]); DROP = float(sys.argv[3]); END = DROP + 2
SR = 44100; BPM = 120; B = 60 / BPM
n = int(SR * T); t = np.arange(n) / SR; out = np.zeros(n)
def add(sig, at, g=1.0):
    i = int(at * SR); j = min(n, i + len(sig)); out[i:j] += sig[:j - i] * g
def env(d, a=0.002, r=None):
    k = np.arange(int(SR * d)) / SR; e = np.minimum(1, k / a); return e * np.exp(-k / (r or d / 4))
def kick():
    d = 0.35; k = np.arange(int(SR * d)) / SR; f = 50 + 120 * np.exp(-k * 30)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(d, r=0.12)
def clap():
    d = 0.2; s = np.random.randn(int(SR * d)) * env(d, r=0.05)
    return np.convolve(s, np.ones(4) / 4, 'same')
def hat(o=False):
    d = 0.25 if o else 0.05; s = np.random.randn(int(SR * d)); s = s - np.convolve(s, np.ones(8) / 8, 'same')
    return s * env(d, r=0.08 if o else 0.012)
def bass(f, d):
    k = np.arange(int(SR * d)) / SR; s = np.tanh(2.5 * np.sin(2 * np.pi * f * k)) * 0.6 + 0.4 * np.sin(np.pi * f * k)
    return s * np.minimum(1, k / 0.005) * np.exp(-k / (d * 0.8))
def chord(fs, d):
    k = np.arange(int(SR * d)) / SR; s = sum(np.sign(np.sin(2 * np.pi * f * k)) * 0.5 + np.sin(2 * np.pi * f * 1.003 * k) for f in fs)
    s = np.convolve(s, np.ones(24) / 24, 'same'); return s * np.minimum(1, k / 0.01) * np.exp(-k / 0.18)
np.random.seed(7)
prog = [(55.0, [220, 277.2, 329.6]), (73.4, [293.7, 370, 440]), (61.7, [246.9, 311.1, 370]), (49.0, [196, 246.9, 293.7])]
beats = int(T / B)
for b in range(beats):
    at = b * B; bar = b // 4; root, ch = prog[bar % 4]
    if at < END:
        add(kick(), at, 0.9)
        if b % 2 == 1: add(clap(), at, 0.35)
        add(hat(), at + B / 2, 0.18); add(hat(), at, 0.1)
        add(bass(root, B * 0.9), at, 0.32); add(bass(root * 2, B * 0.4), at + B / 2, 0.16)
        if b % 4 in (0, 2): add(chord(ch, 0.45), at + (B / 2 if b % 4 == 2 else 0), 0.07)
# riser into the drop at 10 s (green card) and impact; end card 12 s: big hit + held chord, fade
k = np.arange(int(SR * 1.0)) / SR; r = np.random.randn(len(k)); r = r - np.convolve(r, np.ones(16) / 16, 'same')
add(r * (k / 1.0) ** 2 * 0.25, DROP - 1.0)
for at in np.arange(2.0, DROP, 2.0): add(r[:int(SR * .25)] * np.linspace(0, 1, int(SR * .25)) ** 2 * 0.12, at - 0.25)   # whoosh into each cut
add(kick(), DROP, 1.2); add(kick(), END, 1.3)
add(chord([220, 277.2, 329.6, 440], 3.0) * np.exp(-np.arange(int(SR * 3)) / SR / 1.2) * 3, END, 0.1)
add(bass(55, 2.8), END, 0.35)
fade = np.ones(n); fi = int(SR * (T - 0.8)); fade[fi:] = np.linspace(1, 0, n - fi); out *= fade
out = out / np.max(np.abs(out)) * 0.89
st = np.stack([out, np.roll(out, 40) * 0.97], 1)
with wave.open(OUT, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((st * 32767).astype('<i2').tobytes())
print('ok')

