#!/bin/bash
# سحب أكبر قدر توكن من HuggingFace — من الداتاسِتس السريعة، بالتوكنيزر الحالي.
# TOKENIZERS_PARALLELISM=false ضروري: الـ parallelism بيعمل segfault على الماك ده.
# commitbench + code_search_net مستبعدين هنا (streaming بطيء جدًا للـ shards الكبيرة).
set -o pipefail
cd /Users/ahmedelashry/Desktop/elashry-ai || exit 1
export HF_HUB_DISABLE_PROGRESS_BARS=1 PYTHONUNBUFFERED=1 TOKENIZERS_PARALLELISM=false
PY=.venv/bin/python
LOG=model/data/pipeline_logs/pull_max.log

# كل الـ8 المفتوحة. السريعة الأول (بتملا بسرعة)، البطيئة (commitbench, code_search_net) في الآخر.
FAST="roneneldan/TinyStories \
jtatman/python-code-dataset-500k \
iamtarun/python_code_instructions_18k_alpaca \
sahil2801/CodeAlpaca-20k \
m-a-p/CodeFeedback-Filtered-Instruction \
bigcode/self-oss-instruct-sc2-exec-filter-50k \
Maxscha/commitbench \
code-search-net/code_search_net"

CAP=200000000   # 200M/داتاسِت = عمليًا كل المتاح المفتوح (~800M توكن إجمالي)

{
  echo "===== [$(date)] سحب أكبر قدر توكن (cap=${CAP}/داتاسِت) ====="
  [ -f model/tokenizer/tokenizer.json ] || { echo "!! مفيش توكنيزر — درّبه الأول"; exit 1; }
  $PY model/scripts/prepare_data.py --preset nano_cpu --only $FAST \
      --max-tokens-per-dataset $CAP --encode-batch 1000 || echo "!! prepare failed"
  echo "===== [$(date)] DONE ====="
} 2>&1 | tee "$LOG"
