"""
transcribe.py — بيفرّغ ملف صوت لنص باستخدام faster-whisper (محلي بالكامل، مفيش API).

    python model/scripts/transcribe.py /private/tmp/lesson.wav -o /private/tmp/lesson.txt
"""
import argparse
import sys
import time

from faster_whisper import WhisperModel


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("audio")
    ap.add_argument("-o", "--out", required=True)
    ap.add_argument("--model", default="base.en")
    ap.add_argument("--threads", type=int, default=4)
    ap.add_argument("--lang", default="en")
    args = ap.parse_args()

    print(f"بحمّل موديل {args.model} ...", flush=True)
    model = WhisperModel(args.model, device="cpu", compute_type="int8",
                         cpu_threads=args.threads)

    t0 = time.time()
    segments, info = model.transcribe(args.audio, language=args.lang,
                                      beam_size=1, vad_filter=True)
    print(f"مدة الصوت: {info.duration/60:.1f} دقيقة — ببدأ التفريغ", flush=True)

    with open(args.out, "w", encoding="utf-8") as f:
        for seg in segments:
            line = f"[{int(seg.start)//60:02d}:{int(seg.start)%60:02d}] {seg.text.strip()}"
            f.write(line + "\n")
            f.flush()
            # تقدّم كل دقيقة صوت عشان نعرف إنه ماشي
            if int(seg.start) % 60 < 3:
                el = time.time() - t0
                print(f"  {seg.start/60:5.1f}/{info.duration/60:.0f} دقيقة "
                      f"({seg.start/max(el,1):.1f}x الزمن الحقيقي)", flush=True)

    print(f"\n✓ خلص في {(time.time()-t0)/60:.1f} دقيقة → {args.out}", flush=True)


if __name__ == "__main__":
    sys.exit(main())
