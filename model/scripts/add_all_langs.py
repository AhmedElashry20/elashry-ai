"""
add_all_langs.py — بيضيف كل لغات البرمجة على الكوربَس الموجود من غير ما يعيد بناءه.

المصدر: bigcode/the-stack-smol-xl (87 لغة، مفتوح، parquet) + christopher/rosetta-code.
بيضيف على نهاية train.bin / val.bin بنفس التوكنيزر الحالي (16384) — فمفيش
إعادة تدريب توكنيزر ومفيش بداية من الصفر.

**قابل للاستكمال:** بيسجّل اللغات اللي خلصت في progress.json، فلو الجهاز نام أو
اتقفل، شغّله تاني وهيكمّل من اللغة اللي بعدها.

    python model/scripts/add_all_langs.py                    # كل الـ 87 لغة
    python model/scripts/add_all_langs.py --rows-per-lang 3000
    python model/scripts/add_all_langs.py --only rust zig    # لغات معيّنة
    python model/scripts/add_all_langs.py --status           # يقول وصل لفين
"""
import argparse
import json
import os
import sys
import time

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import data_common as dc

STACK = "bigcode/the-stack-smol-xl"
ROSETTA = "christopher/rosetta-code"


def load_progress(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {"done": {}, "train_added": 0, "val_added": 0}


def save_progress(path, prog):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(prog, f, indent=2, ensure_ascii=False)
    os.replace(tmp, path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", default=os.path.join(dc.ROOT, "data", "bin"))
    ap.add_argument("--tokenizer", default=os.path.join(dc.ROOT, "tokenizer", "tokenizer.json"))
    ap.add_argument("--rows-per-lang", type=int, default=6000,
                    help="أقصى عدد ملفات لكل لغة (عشان لغة واحدة ماتسيطرش)")
    ap.add_argument("--rosetta-rows", type=int, default=40000)
    ap.add_argument("--only", nargs="*", default=None)
    ap.add_argument("--val-frac", type=float, default=0.005)
    ap.add_argument("--max-chars", type=int, default=60000, help="تخطّي الملفات الضخمة")
    ap.add_argument("--min-chars", type=int, default=16)
    ap.add_argument("--encode-batch", type=int, default=500)
    ap.add_argument("--status", action="store_true")
    args = ap.parse_args()

    prog_path = os.path.join(args.data_dir, "add_langs_progress.json")
    prog = load_progress(prog_path)

    langs = args.only or (dc.STACK_LANGS + [ROSETTA])
    if args.status:
        done = prog["done"]
        print(f"خلص: {len(done)}/{len(langs)} لغة")
        print(f"اتضاف: {prog['train_added']:,} توكن train + {prog['val_added']:,} val")
        failed = prog.get("failed", {})
        if failed:
            print(f"فشل ({len(failed)}): {', '.join(list(failed)[:12])}")
        remaining = [l for l in langs if l not in done]
        if remaining:
            print(f"باقي ({len(remaining)}): {', '.join(remaining[:12])}{' ...' if len(remaining) > 12 else ''}")
        for l, n in list(done.items())[-5:]:
            print(f"  ✓ {l}: {n:,} توكن")
        return

    from tokenizers import Tokenizer
    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")  # يعمل segfault على الماك ده
    tok = Tokenizer.from_file(args.tokenizer)

    train_path = os.path.join(args.data_dir, "train.bin")
    val_path = os.path.join(args.data_dir, "val.bin")
    if not os.path.exists(train_path):
        raise SystemExit(f"مفيش {train_path} — الكوربَس الأصلي لازم يكون موجود.")

    rng = np.random.default_rng(1337)
    t_start = time.time()

    for li, lang in enumerate(langs, 1):
        if lang in prog["done"]:
            continue
        is_rosetta = lang == ROSETTA
        repo = ROSETTA if is_rosetta else STACK
        limit = args.rosetta_rows if is_rosetta else args.rows_per_lang
        data_dir = None if is_rosetta else f"data/{lang}"

        print(f"[{li}/{len(langs)}] {lang} ...", flush=True)
        buf, n_tok, n_rows, skipped = [], 0, 0, 0
        # نفتح بـ append — كل لغة بتتكتب أول ما تخلص، فالنوم مايضيّعش غير اللغة الحالية
        ftr = open(train_path, "ab")
        fva = open(val_path, "ab")

        def flush():
            nonlocal buf, n_tok
            if not buf:
                return
            for text in buf:
                ids = tok.encode(text).ids
                arr = np.asarray(ids, dtype=np.uint16)
                if rng.random() < args.val_frac:
                    arr.tofile(fva)
                    prog["val_added"] += arr.size
                else:
                    arr.tofile(ftr)
                    prog["train_added"] += arr.size
                n_tok += arr.size
            buf = []

        try:
            for ex in dc.iter_examples(repo, limit=limit, data_dir=data_dir):
                text = dc.format_example(repo, ex)
                if not text:
                    skipped += 1
                    continue
                text = dc.clean_text(text)
                if not (args.min_chars <= len(text) <= args.max_chars):
                    skipped += 1
                    continue
                buf.append(text)
                n_rows += 1
                if len(buf) >= args.encode_batch:
                    flush()
            flush()
        except Exception as e:
            flush()
            err = f"{type(e).__name__}: {str(e)[:110]}"
            print(f"    ⚠️  {lang}: {err}", flush=True)
            # عميل HTTP بتاع HF بيقفل بعد تحميلات كتير متتالية، ومابيرجعش يفتح في
            # نفس العملية. فبنخرج، والـ LaunchAgent بيشغّل عملية جديدة تكمّل.
            if "client has been closed" in str(e):
                ftr.close(); fva.close()
                prog.setdefault("failed", {})[lang] = err
                save_progress(prog_path, prog)
                print("    ↻ العميل اتقفل — بخرج عشان عملية جديدة تكمّل", flush=True)
                return
        finally:
            try:
                ftr.close(); fva.close()
            except Exception:
                pass

        # صفر توكن = فشل، مش نجاح. ماتقفلهاش عشان تتحاول تاني.
        if n_tok > 0:
            prog["done"][lang] = n_tok
            prog.get("failed", {}).pop(lang, None)
        else:
            prog.setdefault("failed", {})[lang] = "رجع صفر توكن"
            print(f"    ⚠️  {lang}: صفر توكن — هيتحاول تاني", flush=True)
        save_progress(prog_path, prog)
        el = time.time() - t_start
        print(f"    ✓ {n_rows:,} ملف → {n_tok:,} توكن (تخطّى {skipped}) | "
              f"الإجمالي {prog['train_added']:,} | {el/60:.0f}د", flush=True)

    # حدّث meta.json عشان train.py يقرا الأرقام الصح
    meta_path = os.path.join(args.data_dir, "meta.json")
    try:
        meta = dc.load_json(meta_path)
        meta["train_tokens"] = os.path.getsize(train_path) // 2
        meta["val_tokens"] = os.path.getsize(val_path) // 2
        meta.setdefault("per_dataset", {})[STACK] = {
            "tokens": sum(v for k, v in prog["done"].items() if k != ROSETTA),
            "languages": len([k for k in prog["done"] if k != ROSETTA]),
        }
        if ROSETTA in prog["done"]:
            meta["per_dataset"][ROSETTA] = {"tokens": prog["done"][ROSETTA]}
        for r in (STACK, ROSETTA):
            if r in prog["done"] or r == STACK:
                if r not in meta.setdefault("order", []):
                    meta["order"].append(r)
        with open(meta_path, "w", encoding="utf-8") as f:
            json.dump(meta, f, indent=2, ensure_ascii=False)
        print(f"\n✓ meta.json اتحدّث: train={meta['train_tokens']:,} val={meta['val_tokens']:,}")
    except Exception as e:
        print(f"⚠️  ماقدرتش أحدّث meta.json: {e}")

    print(f"\n✓ خلص. اتضاف {prog['train_added']:,} توكن train + {prog['val_added']:,} val "
          f"من {len(prog['done'])} لغة في {(time.time()-t_start)/60:.0f} دقيقة.")


if __name__ == "__main__":
    main()
