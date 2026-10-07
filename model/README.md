# elashry-ai / model — النموذج المبني من الصفر

نموذج decoder-only transformer بيتدرّب من الصفر على داتاك — **مفيش أوزان جاهزة، مفيش أي API خارجي**.
كل خطوة اتجرّبت فعليًا end-to-end على داتا حقيقية (loss بينزل ✓).

```
داتا HuggingFace ──▶ tokenizer ──▶ .bin ──▶ تدريب ──▶ checkpoint ──▶ توليد
   (prepare_data)   (train_tok)          (train.py)              (generate.py)
```

## المكوّنات
| ملف | الدور |
|---|---|
| `configs/arch_presets.json` | 3 أحجام: `nano_cpu` ~7M / `micro_colab` ~34M / `small_colab` ~50M |
| `data/hf_datasets.json` | مانيفست الداتا متفصّل على مهام الإيجنت + الصيغة الموحّدة |
| `scripts/data_common.py` | التنسيق الموحّد + تحميل الداتا |
| `scripts/train_tokenizer.py` | BPE من الصفر + التوكنز الخاصة |
| `scripts/prepare_data.py` | format→clean→tokenize→`train.bin`/`val.bin` |
| `scripts/model.py` | معمارية الـ GPT (nanoGPT-style) |
| `scripts/train.py` | لوب التدريب (cosine LR + grad-accum + checkpoint + resume) |
| `scripts/generate.py` | التوليد (مع `--agent` بيلفّ الأمر في بروتوكول الإيجنت) |

## التشغيل الكامل
```bash
pip install -r model/requirements.txt      # + torch حسب جهازك (شوف requirements)

# 1) توكنيزر من الصفر
python model/scripts/train_tokenizer.py --preset nano_cpu

# 2) داتا -> bins  (تجربة سريعة على داتاسِت واحدة)
python model/scripts/prepare_data.py --preset nano_cpu --only sahil2801/CodeAlpaca-20k --limit 2000
#    أو التشغيل الكامل مع سقف توكنز للكبار
python model/scripts/prepare_data.py --preset nano_cpu --max-tokens-per-dataset 20000000

# 3) تدريب
python model/scripts/train.py --preset nano_cpu
#    كمّل من آخر checkpoint:  --resume

# 4) توليد
python model/scripts/generate.py --preset nano_cpu --agent --prompt "اكتب دالة بايثون تعكس نص"
```

### أوفررايدز مفيدة للّابتوب (تجربة سريعة)
`--max-iters 100 --grad-accum 1 --batch-size 8 --eval-iters 5 --eval-interval 20 --device cpu`

## ملاحظات البيئة (مهمة)
- **بايثون:** torch لسه معندهوش wheel لـ 3.14 — استخدم **3.11/3.12/3.13** للتدريب محليًا. (تجهيز الداتا نفسه بيشتغل على 3.14 عادي.)
- **الجهاز:**
  - Colab → GPU + `bfloat16`، استخدم `micro_colab` / `small_colab`.
  - ماك Apple Silicon (torch arm64) → تقدر تحط `--device mps` وتسرّع.
  - ماك Intel/x86 → **CPU بس**؛ الـ MPS في torch 2.2.2 بيعمل segfault.
- **numpy<2** محليًا (torch 2.2.2 بيكراش مع numpy 2).

## المستوى المتوقّع (بصراحة)
النموذج ده حجمه صغير (7M–50M) — **بيقلّد شكل الكود** اللي شافه، وبيتحسّن مع داتا وحوسبة أكتر،
لكنه مش هيوصل لمستوى الاستدلال/الصح-دايمًا بتاع نماذج المليارات. ده مشروع تعلّم وإتقان للأساسيات.
الطريق للتحسين: داتا أنضف وأكتر، خطوات تدريب أكتر، preset أكبر على Colab.
