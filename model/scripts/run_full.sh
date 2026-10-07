#!/bin/bash
# تشغيل كامل: توكنيزر -> داتا -> تدريب. بيتسجّل في model/data/pipeline_logs/full_run.log
set -o pipefail
cd /Users/ahmedelashry/Desktop/elashry-ai || exit 1
export HF_HUB_DISABLE_PROGRESS_BARS=1 PYTHONUNBUFFERED=1 TOKENIZERS_PARALLELISM=false
PY=.venv/bin/python
LOG=model/data/pipeline_logs/full_run.log
# داتاسِتس كود + coherence، كلها parquet سريعة نسبيًا
ONLY="roneneldan/TinyStories iamtarun/python_code_instructions_18k_alpaca sahil2801/CodeAlpaca-20k bigcode/self-oss-instruct-sc2-exec-filter-50k jtatman/python-code-dataset-500k"

{
  echo "===== [$(date)] STEP 1/3: تدريب التوكنيزر ====="
  $PY model/scripts/train_tokenizer.py --preset nano_cpu --only $ONLY --sample-per-dataset 6000 || echo "!! tokenizer failed"

  echo "===== [$(date)] STEP 2/3: تجهيز الداتا ====="
  $PY model/scripts/prepare_data.py --preset nano_cpu --only $ONLY --max-tokens-per-dataset 1500000 || echo "!! prepare failed"

  echo "===== [$(date)] STEP 3/3: التدريب (2000 خطوة) ====="
  $PY model/scripts/train.py --preset nano_cpu --max-iters 2000 \
      --eval-interval 250 --eval-iters 20 --grad-accum 1 --batch-size 12 || echo "!! train failed"

  echo "===== [$(date)] عيّنة توليد بعد التدريب ====="
  $PY model/scripts/generate.py --preset nano_cpu --agent \
      --prompt "Write a Python function that reverses a string" --max-new-tokens 60 --top-k 40 || echo "!! generate failed"

  echo "===== [$(date)] DONE ====="
} 2>&1 | tee "$LOG"
