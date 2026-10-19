"""
build_corpus.py — يبني كوربَس متوازن بسقف **توكنز** وترجيح للغات الشائعة.

ليه ده موجود: `add_all_langs.py` كان بيحط سقف **ملفات** (6000 لكل لغة).
النتيجة إن اللغات اللي ملفاتها ضخمة (lean, isabelle, literate-haskell —
براهين رياضية) أخدت 30 مليون توكن للواحدة، وبايثون أخدت 10 مليون بس.
يعني 171 مليون توكن راحت للغات متخصصة مقابل 48 مليون لأكبر 5 لغات شائعة.

هنا السقف بالتوكنز وبنسب محددة، فبايثون بتاخد نصيبها الحقيقي.

بيكتب في مجلد **جديد** عشان مايلمسش الكوربَس الشغال عليه التدريب.
وقابل للاستكمال — الجهاز بينام.

    python model/scripts/build_corpus.py --status
    python model/scripts/build_corpus.py --target-tokens 1000
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

# نسب الكوربَس. المجموع 100.
# المنطق: اللي هتكتب بيه فعلًا ياخد النصيب الأكبر؛ الباقي للاتساع بس.
WEIGHTS = {
    "python":    20,   # الأساس
    "web":       12,   # javascript + typescript
    "instruct":  17,   # سؤال → كود (بيعلّمه يتبع الأوامر)
    "systems":   12,   # java, c, c++, go, rust, c-sharp
    "scripting":  7,   # shell, sql, html, css
    "prose":      6,   # إنجليزي عادي — للترابط
    "arabic":     8,   # المستخدم بيكتب بالعربي
    "cyber":      5,   # أمن سيبراني — مجال تقني مطلوب
    "breadth":   13,   # كل الـ70 لغة الباقية، بحصة **متساوية** للواحدة
}

GROUPS = {
    "python":    ["python"],
    "web":       ["javascript", "typescript"],
    "systems":   ["java", "c", "c++", "go", "rust", "c-sharp"],
    "scripting": ["shell", "sql", "html", "css"],
}

# مفيش لغة مستبعدة. اللي كان بيبوّظ التوزيع هو السقف بالملفات: lean و
# isabelle ملفاتهم براهين ضخمة فأخدوا 30 مليون للواحدة. هنا السقف
# **متساوي بالتوكنز** لكل لغة في breadth، فكلهم موجودين وبحصة عادلة.

ARABIC = ["wikimedia/wikipedia", "arbml/CIDAR", "FreedomIntelligence/alpaca-gpt4-arabic"]
CYBER = ["AlicanKiraz0/Cybersecurity-Dataset-Fenrir-v2.0",
         "Trendyol/Trendyol-Cybersecurity-Instruction-Tuning-Dataset",
         "CyberNative/Code_Vulnerability_Security_DPO",
         "AlicanKiraz0/Cybersecurity-Dataset-v1"]
INSTRUCT = [
    "ise-uiuc/Magicoder-Evol-Instruct-110K",
    "ise-uiuc/Magicoder-OSS-Instruct-75K",
    "nickrosh/Evol-Instruct-Code-80k-v1",
    "glaiveai/glaive-code-assistant",
    "theblackcat102/evol-codealpaca-v1",
    "m-a-p/CodeFeedback-Filtered-Instruction",
    "bigcode/self-oss-instruct-sc2-exec-filter-50k",
    "jtatman/python-code-dataset-500k",
]
PROSE = ["roneneldan/TinyStories"]


def load_state(p):
    try:
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {"done": {}, "tokens": {}, "train": 0, "val": 0}


def save_state(p, st):
    tmp = p + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(st, f, indent=2, ensure_ascii=False)
    os.replace(tmp, p)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out-dir", default=os.path.join(dc.ROOT, "data", "bin_v2"))
    ap.add_argument("--tokenizer", default=os.path.join(dc.ROOT, "tokenizer", "tokenizer.json"))
    ap.add_argument("--target-tokens", type=int, default=1000,
                    help="حجم الكوربَس بالمليون توكن")
    ap.add_argument("--val-frac", type=float, default=0.005)
    ap.add_argument("--min-chars", type=int, default=16)
    ap.add_argument("--max-chars", type=int, default=60000)
    ap.add_argument("--status", action="store_true")
    args = ap.parse_args()

    os.makedirs(args.out_dir, exist_ok=True)
    state_p = os.path.join(args.out_dir, "build_state.json")
    st = load_state(state_p)
    budgets = {k: int(args.target_tokens * 1e6 * v / 100) for k, v in WEIGHTS.items()}

    if args.status:
        print(f"الهدف: {args.target_tokens} مليون توكن\n")
        print(f"{'المجموعة':<12} {'الميزانية':>10} {'اتعمل':>10} {'%':>6}")
        print("-" * 42)
        for k, b in budgets.items():
            got = st["tokens"].get(k, 0)
            print(f"  {k:<10} {b/1e6:>8.0f}م {got/1e6:>8.1f}م {got/b*100:>5.0f}%")
        print(f"\nالإجمالي: {st['train']/1e6:.0f}م train + {st['val']/1e6:.1f}م val")
        print(f"خلص: {len(st['done'])} مصدر")
        return

    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
    from tokenizers import Tokenizer
    tok = Tokenizer.from_file(args.tokenizer)

    train_p = os.path.join(args.out_dir, "train.bin")
    val_p = os.path.join(args.out_dir, "val.bin")
    rng = np.random.default_rng(1337)
    t0 = time.time()

    def pull(group, sources, per_source_cap=None):
        """بيسحب لحد ما ميزانية المجموعة تخلص. السقف بالتوكنز مش بالملفات."""
        budget = budgets[group]
        got = st["tokens"].get(group, 0)
        if got >= budget:
            return
        cap = per_source_cap or max(1, budget // max(1, len(sources)))

        for src in sources:
            key = f"{group}:{src}"
            if key in st["done"] or got >= budget:
                continue
            repo, data_dir = (STACK, f"data/{src}") if "/" not in src else (src, None)
            n, buf = 0, []
            ftr, fva = open(train_p, "ab"), open(val_p, "ab")

            def flush():
                """بيكتب الدفعة. بيقف **جوّه** اللفة لما الميزانية تخلص —
                مستند واحد ممكن يكون ملايين التوكنز (مقالات ويكيبيديا)،
                فالفحص بعد الدفعة كلها كان بيتخطّى الحد بكتير."""
                nonlocal n, got
                for text in buf:
                    if n >= cap or got >= budget:
                        break
                    ids = np.asarray(tok.encode(text).ids, dtype=np.uint16)
                    if rng.random() < args.val_frac:
                        ids.tofile(fva); st["val"] += ids.size
                    else:
                        ids.tofile(ftr); st["train"] += ids.size
                    n += ids.size; got += ids.size
                buf.clear()

            try:
                for ex in dc.iter_examples(repo, data_dir=data_dir):
                    t = dc.format_example(repo, ex)
                    if not t:
                        continue
                    t = dc.clean_text(t)
                    if not (args.min_chars <= len(t) <= args.max_chars):
                        continue
                    buf.append(t)
                    if len(buf) >= 100:
                        flush()
                        if n >= cap or got >= budget:
                            break
                flush()
            except Exception as e:
                flush()
                print(f"    ⚠️  {src}: {type(e).__name__}: {str(e)[:70]}", flush=True)
                if "client has been closed" in str(e):
                    ftr.close(); fva.close()
                    st["tokens"][group] = got
                    save_state(state_p, st)
                    print("    ↻ العميل اتقفل — شغّله تاني يكمّل", flush=True)
                    return "restart"
            finally:
                ftr.close(); fva.close()

            if n > 0:
                st["done"][key] = n
            st["tokens"][group] = got
            save_state(state_p, st)
            print(f"  {group}/{src}: {n/1e6:.1f}م  |  {group} {got/1e6:.0f}/{budget/1e6:.0f}م "
                  f"| كلي {st['train']/1e6:.0f}م | {(time.time()-t0)/60:.0f}د", flush=True)

    # الترتيب بالأهمية — لو الوقت خلص يبقى الأهم اتعمل
    print(f"الهدف {args.target_tokens} مليون توكن. الترتيب بالأهمية.\n")
    for group, sources in [
        ("python", GROUPS["python"]),
        ("instruct", INSTRUCT),
        ("web", GROUPS["web"]),
        ("systems", GROUPS["systems"]),
        ("scripting", GROUPS["scripting"]),
        ("prose", PROSE),
        ("arabic", ARABIC),
        ("cyber", CYBER),
    ]:
        if pull(group, sources) == "restart":
            return

    # الاتساع: كل اللغات الباقية بحصة صغيرة متساوية، بره الثقيلة
    # كل لغة مش في مجموعة فوق — من غير أي استبعاد
    rest = [l for l in dc.STACK_LANGS if not any(l in g for g in GROUPS.values())]
    if pull("breadth", rest, per_source_cap=budgets["breadth"] // max(1, len(rest))) == "restart":
        return

    meta = {
        "preset": "nano_cpu", "vocab_size": 16384, "tokenizer_vocab": 16384,
        "dtype": "uint16",
        "train_tokens": os.path.getsize(train_p) // 2,
        "val_tokens": os.path.getsize(val_p) // 2,
        "weights": WEIGHTS, "per_group": st["tokens"],
        "_note": "سقف بالتوكنز مش بالملفات — شوف build_corpus.py",
    }
    with open(os.path.join(args.out_dir, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2, ensure_ascii=False)
    print(f"\n✓ خلص: {meta['train_tokens']/1e6:.0f}م train + {meta['val_tokens']/1e6:.1f}م val")
    print(f"  {args.out_dir}")


if __name__ == "__main__":
    main()
