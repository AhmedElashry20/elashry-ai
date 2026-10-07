#!/bin/bash
# إعادة بناء كاملة: توكنيزر جديد (vocab 16384 يفهم كود+أمن+عربي) -> كوربوس كامل.
# كل الداتاسِتس في المانيفست (20). parallelism مطفي (تجنّب segfault على الماك).
set -o pipefail
cd /Users/ahmedelashry/Desktop/elashry-ai || exit 1
export HF_HUB_DISABLE_PROGRESS_BARS=1 PYTHONUNBUFFERED=1 TOKENIZERS_PARALLELISM=false
PY=.venv/bin/python
LOG=model/data/pipeline_logs/rebuild.log

{
  echo "===== [$(date)] STEP 1/2: توكنيزر جديد (vocab 16384، كود+أمن+عربي) ====="
  $PY model/scripts/train_tokenizer.py --preset nano_cpu --sample-per-dataset 8000 || echo "!! tokenizer failed"

  echo "===== [$(date)] STEP 2/2: تجهيز الكوربوس الكامل (cap 200M/داتاسِت) ====="
  $PY model/scripts/prepare_data.py --preset nano_cpu \
      --max-tokens-per-dataset 200000000 --encode-batch 1000 || echo "!! prepare failed"

  echo "===== [$(date)] DONE_REBUILD ====="
} 2>&1 | tee "$LOG"
