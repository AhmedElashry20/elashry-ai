#!/bin/bash
# بيكمّل سحب اللغات لو الجهاز نام، أو لو عميل HTTP بتاع HuggingFace اتقفل في النص.
#
# ٣ مشاكل حقيقية حصلت وده بيعالجها:
#  1) عميل HF بيقفل بعد تحميلات كتير ومابيرجعش يفتح → العملية بتخرج، ودي بتشغّل جديدة.
#  2) لغة بترجع صفر توكن وكانت بتتسجّل "خلصت" → بننضّفها عشان تتحاول تاني.
#  3) الشبكة مش جاهزة لما الجهاز يصحى (Errno 8 DNS) → العملية بتتعلّق ساعات في
#     إعادة المحاولة وبتمنع أي استكمال. بنتأكد من الشبكة الأول، وبنقتل المعلّق.
cd /Users/ahmedelashry/Desktop/elashry-ai || exit 1
LOG=model/data/pipeline_logs/add_all_langs.log
PROG=model/data/bin/add_langs_progress.json
STALL_MIN=20   # عملية ماكتبتش في اللوج من 20 دقيقة = معلّقة

log() { echo "$(date '+%F %T') $*" >> "$LOG"; }

PID=$(pgrep -f "add_all_langs.py --rows-per-lang" | head -1)
if [ -n "$PID" ]; then
  # شغالة — بس هل بتتقدّم فعلًا؟ لو اللوج واقف من 20 دقيقة يبقى معلّقة على الشبكة.
  AGE=$(( $(date +%s) - $(stat -f %m "$LOG" 2>/dev/null || date +%s) ))
  if [ "$AGE" -gt $((STALL_MIN * 60)) ]; then
    log "العملية $PID معلّقة (اللوج واقف ${AGE}ث) — بقتلها"
    kill -9 "$PID" 2>/dev/null
    sleep 2
  else
    exit 0   # شغالة وبتتقدّم — سيبها
  fi
fi

# الشبكة جاهزة؟ لو لأ ماتشغّلش — الـ tick الجاي هيحاول.
if ! /usr/bin/nslookup huggingface.co >/dev/null 2>&1; then
  log "الشبكة مش جاهزة (DNS) — هستنى الجولة الجاية"
  exit 0
fi

# شيل أي لغة مسجّلة بصفر توكن من "done" عشان تتحاول تاني
CLEANED=$(/usr/bin/python3 - "$PROG" <<'PY'
import json, sys, os
p = sys.argv[1]
try:
    d = json.load(open(p, encoding="utf-8"))
except Exception:
    print(0); sys.exit()
zeros = [k for k, v in d.get("done", {}).items() if not v]
for k in zeros:
    d["done"].pop(k, None)
if zeros:
    tmp = p + ".tmp"
    json.dump(d, open(tmp, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    os.replace(tmp, p)
print(len(zeros))
PY
)
if [ "${CLEANED:-0}" -gt 0 ]; then
  log "نضّفت $CLEANED لغة رجعت صفر — هتتحاول تاني"
fi

# خلصت كلها فعلًا؟
REMAINING=$(/usr/bin/python3 - "$PROG" <<'PY'
import json, sys
try:
    d = json.load(open(sys.argv[1], encoding="utf-8"))
except Exception:
    print(99); sys.exit()
print(88 - len([1 for v in d.get("done", {}).values() if v]))
PY
)
if [ "${REMAINING:-99}" -le 0 ]; then
  exit 0
fi

log "بكمّل سحب اللغات (باقي $REMAINING)"
exec env HF_HUB_DISABLE_PROGRESS_BARS=1 TOKENIZERS_PARALLELISM=false \
  .venv/bin/python model/scripts/add_all_langs.py --rows-per-lang 6000 >> "$LOG" 2>&1
