# Listen to a finished Reel: transcribe it with word times (faster-whisper, free, local/Actions) and compare with the
# planned voice lines, so every Reel is checked by ear before the preview: complete lines, no overlap, calm pace.
# usage: python listen.py reel.mp4 plan.json [--json]     (WHISPER_MODEL=base|small, default base)
import json, os, sys
from faster_whisper import WhisperModel
m = WhisperModel(os.environ.get('WHISPER_MODEL', 'base'), device='cpu', compute_type='int8')
segs, _ = m.transcribe(sys.argv[1], language='hi', word_timestamps=True, vad_filter=False)
words = [w for s in segs for w in s.words]
p = json.load(open(sys.argv[2], encoding='utf8'))
lines = [s['vo'] for s in p['shots']]
# a line counts as heard if speech covers most of its planned time
report = []
for l in lines:
    a, b = l['at'], l['at'] + l['len']
    n = sum(1 for w in words if w.end > a - 0.1 and w.start < b + 0.1)
    report.append({'text': l['text'], 'planned_words': len(l['text'].split()), 'heard_words': n})
span = (words[-1].end - words[0].start) if words else 0
out = {'heard': len(words), 'planned': sum(r['planned_words'] for r in report), 'wpm': round(len(words) / max(span, 1) * 60),
       'missing': [r['text'] for r in report if r['heard_words'] < max(1, r['planned_words'] * 0.6)], 'last_word_end': round(words[-1].end, 2) if words else 0}
if '--json' in sys.argv: print(json.dumps(out, ensure_ascii=False))
else:
    for w in words: print(f'  {w.start:6.2f}-{w.end:6.2f} {w.word.strip()}')
    for r in report: print(r)
    print(out)
