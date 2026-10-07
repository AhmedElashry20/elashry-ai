"""
prepare_data.py — يحوّل داتاسِتس HuggingFace إلى ملفات تدريب جاهزة (.bin).

الخطوات لكل مثال:
  1) format_example  → لفّ في صيغة الإيجنت الموحّدة (<|task|>/<|context|>/<|response|>/<|end|>)
  2) clean_text      → تنظيف
  3) tokenizer.encode→ توكنة بالتوكنيزر اللي دربته إنت
  4) كتابة uint16 على train.bin أو val.bin (بالتدفّق، من غير ما يملا الرام)

المخرجات في model/data/bin/: train.bin, val.bin, meta.json

لازم تشغّل train_tokenizer.py الأول.

مثال (تجربة سريعة):
    python model/scripts/prepare_data.py --preset nano_cpu --limit 500
مثال (كامل، مع فلترة لغات وحدّ توكنز لكل داتاسِت):
    python model/scripts/prepare_data.py --preset micro_colab \
        --languages Python JavaScript TypeScript --max-tokens-per-dataset 50000000
"""
import argparse
import json
import os
import random

import numpy as np
from tokenizers import Tokenizer
from tqdm import tqdm

import data_common as dc


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--preset", default="nano_cpu")
    ap.add_argument("--tokenizer", default=os.path.join(dc.ROOT, "tokenizer", "tokenizer.json"))
    ap.add_argument("--out-dir", default=os.path.join(dc.ROOT, "data", "bin"))
    ap.add_argument("--languages", nargs="*", default=None, help="فلترة لغات (للداتاسِتس اللي فيها حقل lang)")
    ap.add_argument("--only", nargs="*", default=None, help="تشغيل داتاسِتس معيّنة بس (repo ids)")
    ap.add_argument("--max-tokens-per-dataset", type=int, default=None, help="سقف توكنز لكل داتاسِت")
    ap.add_argument("--limit", type=int, default=None, help="عدد أمثلة أقصى لكل داتاسِت (للتجربة)")
    ap.add_argument("--encode-batch", type=int, default=1000, help="حجم دفعة التوكنة (أكبر = أسرع)")
    ap.add_argument("--val-frac", type=float, default=0.005)
    ap.add_argument("--min-chars", type=int, default=8)
    ap.add_argument("--max-chars", type=int, default=100000, help="تخطّي المستندات الضخمة")
    ap.add_argument("--seed", type=int, default=1337)
    args = ap.parse_args()

    if not os.path.exists(args.tokenizer):
        raise SystemExit(f"مفيش توكنيزر في {args.tokenizer} — شغّل train_tokenizer.py الأول.")

    vocab_size = dc.vocab_size_for(args.preset)
    tok = Tokenizer.from_file(args.tokenizer)
    assert tok.get_vocab_size() <= 65536, "vocab أكبر من uint16"
    rng = random.Random(args.seed)

    os.makedirs(args.out_dir, exist_ok=True)
    train_path = os.path.join(args.out_dir, "train.bin")
    val_path = os.path.join(args.out_dir, "val.bin")
    f_train = open(train_path, "wb")
    f_val = open(val_path, "wb")

    per_dataset = {}
    n_train = n_val = 0

    def write(ids, to_val):
        arr = np.asarray(ids, dtype=np.uint16)
        (f_val if to_val else f_train).write(arr.tobytes())

    ds_tokens = 0  # per-dataset counter (nonlocal target for flush)
    bar = None

    def flush(buf):
        """توكنة دفعة (متوازية) وكتابتها. يرجّع True لو اتخطّى سقف التوكنز."""
        nonlocal n_train, n_val, ds_tokens
        if not buf:
            return False
        hit = False
        for enc in tok.encode_batch(buf):
            ids = enc.ids
            if not ids:
                continue
            to_val = rng.random() < args.val_frac
            write(ids, to_val)
            if to_val:
                n_val += len(ids)
            else:
                n_train += len(ids)
            ds_tokens += len(ids)
            bar.update(1)
            if args.max_tokens_per_dataset and ds_tokens >= args.max_tokens_per_dataset:
                hit = True
        return hit

    try:
        for rid in dc.training_repo_ids(only=args.only):
            ds_tokens = 0
            skipped = 0
            bar = tqdm(desc=rid, unit="doc")
            buf = []
            try:
                for ex in dc.iter_examples(rid, limit=args.limit, languages=args.languages):
                    txt = dc.format_example(rid, ex)
                    if not txt:
                        skipped += 1; continue
                    txt = dc.clean_text(txt)
                    if not (args.min_chars <= len(txt) <= args.max_chars):
                        skipped += 1; continue
                    buf.append(txt)
                    if len(buf) >= args.encode_batch:
                        stop = flush(buf); buf = []
                        if stop:
                            break
                else:
                    flush(buf); buf = []  # بقايا آخر دفعة (لو ماكسرش بسبب السقف)
            except Exception as e:
                print(f"  ! مشكلة في {rid}: {e}")
            finally:
                bar.close()
            per_dataset[rid] = {"tokens": ds_tokens, "skipped": skipped}
            print(f"  ✓ {rid}: {ds_tokens:,} توكن ({skipped} متخطّى)")
    finally:
        f_train.close()
        f_val.close()

    meta = {
        "preset": args.preset,
        "vocab_size": vocab_size,
        "tokenizer_vocab": tok.get_vocab_size(),
        "dtype": "uint16",
        "special_tokens": {t: tok.token_to_id(t) for t in dc.SPECIAL_TOKENS},
        "train_tokens": n_train,
        "val_tokens": n_val,
        "per_dataset": per_dataset,
        "order": dc.training_repo_ids(only=args.only),
    }
    with open(os.path.join(args.out_dir, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

    if n_train == 0:
        print("\n⚠️  طلع 0 توكن! غالبًا مشكلة شبكة أو rate-limit من HuggingFace.")
        print("    الحل: اعمل حساب HF مجاني و  huggingface-cli login  (بيرفع حد الطلبات)، أو جرّب --only داتاسِت واحدة.")
    print(f"\n✓ خلص. train={n_train:,} توكن | val={n_val:,} توكن")
    print(f"  {train_path}\n  {val_path}\n  {os.path.join(args.out_dir, 'meta.json')}")
    print("  للقراءة وقت التدريب:  np.memmap(path, dtype=np.uint16, mode='r')")


if __name__ == "__main__":
    main()
