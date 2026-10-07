"""
train_tokenizer.py — يدرّب BPE tokenizer من الصفر على كوربَس المستخدم.

byte-level BPE (زي GPT-2) + التوكنز الخاصة بتاعة الإيجنت محجوزة.
مفيش توكنيزر جاهز متحمّل — ده بيتدرّب على داتاك إنت.

مثال:
    python model/scripts/train_tokenizer.py --preset nano_cpu --sample-per-dataset 20000
    python model/scripts/train_tokenizer.py --preset micro_colab
"""
import argparse
import os

from tokenizers import Tokenizer, decoders, models, pre_tokenizers, trainers

import data_common as dc


def corpus_iter(sample_per_dataset, languages, only):
    """يطلّع نصوص من كل داتاسِتس التدريب (عيّنة محدودة من كل واحدة)."""
    for rid in dc.training_repo_ids(only=only):
        got = 0
        try:
            for ex in dc.iter_examples(rid, limit=sample_per_dataset, languages=languages):
                txt = dc.format_example(rid, ex)
                if not txt:
                    continue
                txt = dc.clean_text(txt)
                if not (8 <= len(txt) <= 20000):   # تخطّي المستندات الضخمة (توفير ميموري)
                    continue
                yield txt
                got += 1
        except Exception as e:
            print(f"  ! تخطّيت {rid}: {e}")
        print(f"  - {rid}: {got} مثال")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--preset", default="nano_cpu", help="اسم الـ preset في arch_presets.json (بياخد منه vocab_size)")
    ap.add_argument("--out", default=os.path.join(dc.ROOT, "tokenizer", "tokenizer.json"))
    ap.add_argument("--sample-per-dataset", type=int, default=20000)
    ap.add_argument("--languages", nargs="*", default=None, help="فلترة لغات (للداتاسِتس اللي فيها حقل lang)")
    ap.add_argument("--only", nargs="*", default=None, help="تشغيل داتاسِتس معيّنة بس (repo ids)")
    ap.add_argument("--min-frequency", type=int, default=2)
    args = ap.parse_args()

    vocab_size = dc.vocab_size_for(args.preset)
    print(f"preset={args.preset}  vocab_size={vocab_size}")

    tok = Tokenizer(models.BPE(unk_token=None))
    tok.pre_tokenizer = pre_tokenizers.ByteLevel(add_prefix_space=False)
    tok.decoder = decoders.ByteLevel()

    trainer = trainers.BpeTrainer(
        vocab_size=vocab_size,
        min_frequency=args.min_frequency,
        special_tokens=dc.SPECIAL_TOKENS,
        initial_alphabet=pre_tokenizers.ByteLevel.alphabet(),
        show_progress=True,
    )

    print("بدأ تدريب التوكنيزر...")
    tok.train_from_iterator(corpus_iter(args.sample_per_dataset, args.languages, args.only), trainer=trainer)

    if tok.get_vocab_size() <= len(dc.SPECIAL_TOKENS) + 256 + 5:
        print("\n⚠️  التوكنيزر ماشافش نص كفاية (rate-limit/شبكة؟).")
        print("    الحل: huggingface-cli login (حساب مجاني) أو جرّب --only داتاسِت واحدة.")

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    tok.save(args.out)
    print(f"\n✓ اتحفظ التوكنيزر: {args.out}")
    print(f"  الحجم النهائي للـ vocab: {tok.get_vocab_size()}")
    for t in dc.SPECIAL_TOKENS:
        print(f"    {t} -> id {tok.token_to_id(t)}")


if __name__ == "__main__":
    main()
