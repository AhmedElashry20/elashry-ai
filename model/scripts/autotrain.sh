#!/bin/bash
# بيتشغّل تلقائيًا كل ما تفتح اللابتوب (عن طريق LaunchAgent) — بيكمّل التدريب من آخر checkpoint.
#
# الإعدادات دي مقيسة مش متخمّنة (bench.py، 2026-08-30، i7-4870HQ):
#   • 4 خيوط أحسن من 5/6/8 — الخيوط الكتير بتسخّن المعالج فيتخنق (100% → 51%) فيبطّأ.
#     8 خيوط = 1211 توكن/ث، 6 = 791 لما يسخن، 4 = 1312 وثابت.
#   • batch 24 أحسن من 12/16/32/48/96 — الأكبر بيفيض الكاش (48 = 630 توكن/ث بس).
#   • eval كل 1000 بدل 500 — الـ eval بياكل ~2.7% من الوقت.
#
# --lr-restart-at 78317: في 2026-09-28 ضفنا 932 مليون توكن (88 لغة برمجة) على
# الكوربَس عند الخطوة دي. الـ LR كان نزل لـ 1e-4 ورايح لـ 2e-5، يعني الداتا
# الجديدة مكانش هيوصلها ميزانية تعلّم. الـ warm restart بيرجّع الـ LR لقمته
# (2e-4) وينزل cosine من الخطوة دي لـ 150k — بنفس الأوزان، مش من الصفر.
#
# caffeinate -i بيمنع النوم التلقائي من السكون بس (لو سايب الشاشة مفتوحة ومشيت).
# مابيمنعش النوم لما تقفل الشاشة — ده بيفضل شغال زي ما انت عايز.
cd /Users/ahmedelashry/Desktop/elashry-ai || exit 1
export PYTHONUNBUFFERED=1 TRAIN_THREADS=4 OMP_NUM_THREADS=4 MKL_NUM_THREADS=4
# استنى شوية بعد الدخول عشان الجهاز يستقر
sleep 20

# مخ الإكستنشن = OmniRoute على 127.0.0.1:20130 (بدل الموديل المحلي من 2026-10-07).
if ! pgrep -f "omniroute serve" >/dev/null; then
  OMNIROUTE_SERVER_HOST=127.0.0.1 nohup /usr/local/bin/omniroute serve \
    >> model/data/pipeline_logs/omniroute.log 2>&1 &
fi

# المحوّل المحلي (11435) للإمبدنجز — الـ KB متجهاتها من الموديل المحلي،
# فمن غيره search_knowledge والبحث الخلفي بيقعوا. خيطين بس.
if ! pgrep -f "ollama_adapter.py" >/dev/null; then
  OMP_NUM_THREADS=2 MKL_NUM_THREADS=2 TOKENIZERS_PARALLELISM=false \
    nohup .venv/bin/python model/scripts/ollama_adapter.py \
    >> model/data/pipeline_logs/adapter.log 2>&1 &
  disown 2>/dev/null || true
fi
exec /usr/bin/caffeinate -i /Users/ahmedelashry/Desktop/elashry-ai/.venv/bin/python \
  model/scripts/train.py --preset nano_cpu --resume \
  --grad-accum 1 --batch-size 24 --max-iters 150000 \
  --eval-interval 1000 --eval-iters 20 --save-interval 200 \
  --lr-restart-at 78317 \
  >> model/data/pipeline_logs/train.log 2>&1
