#!/bin/bash
# حارس التدريب — بيتشغّل كل 5 دقايق.
# الغرض: الجهاز بينام/بيتقفل (ده مطلوب)، وأحيانًا التدريب بيتعلّق بعد ما يصحى.
# لو النبضة وقفت → بيقتل العملية المتعلّقة ويشغّل التدريب من تاني (بيكمّل من _last.pt).
ROOT=/Users/ahmedelashry/Desktop/elashry-ai
HB=$ROOT/model/checkpoints/.heartbeat
STATE=$ROOT/model/data/pipeline_logs/.watch_last
LOG=$ROOT/model/data/pipeline_logs/watchdog.log
STALE=1800     # النبضة تعتبر ميتة بعد 30 دقيقة.
               # كانت 600 وده قتل تدريب سليم 7 مرات في يوم (2026-10-03):
               # بعد التكبير لـ 12 طبقة + الجهاز محمّل، الخطوة بقت أبطأ بكتير.
GAP=900        # فرق أكبر من 15 دقيقة بين جولتين = الجهاز كان نايم/مقفول
MINAGE=600     # ماتحكمش على عملية عمرها أقل من 10 دقايق — التحميل بياخد وقت

log() { echo "$(date '+%F %T') $*" >> "$LOG"; }

# بيحوّل ناتج ps -o etime= (زي 05:23 أو 1:05:23 أو 2-01:05:23) لثواني
etime_to_secs() {
  awk -F'[-:]' '{
    if (NF==4)      print $1*86400 + $2*3600 + $3*60 + $4
    else if (NF==3) print $1*3600 + $2*60 + $3
    else if (NF==2) print $1*60 + $2
    else            print $1
  }' <<< "$1"
}

# مفتاح صيانة: طول ما الملف ده موجود الحارس مايلمسش حاجة (بنستخدمه وقت القياس/التظبيط)
if [ -f "$ROOT/model/data/pipeline_logs/.pause" ]; then
  exit 0
fi

now=$(date +%s)
prev=$(cat "$STATE" 2>/dev/null || echo 0)
echo "$now" > "$STATE"

# أول جولة بعد ما الجهاز يصحى: ادّي التدريب فرصة قبل ما تحكم عليه
if [ "$prev" -gt 0 ] && [ $((now - prev)) -gt "$GAP" ]; then
  log "صحي من نوم (فرق $((now-prev))ث) — بتخطّى الفحص المرة دي"
  exit 0
fi

# مخ الإكستنشن: من 2026-10-07 بقى OmniRoute (بوابة 359 مزوّد) على 127.0.0.1:20130
# بدل الموديل المحلي 18M. البورت جاي من PORT في ~/.omniroute/.env.
# بنربطه على loopback بس — السيرفر افتراضيًا بيسمع على 0.0.0.0 من غير مفتاح.
if ! pgrep -f "omniroute serve" >/dev/null; then
  log "OmniRoute مش شغال — بشغّله"
  OMNIROUTE_SERVER_HOST=127.0.0.1 \
    /usr/bin/python3 model/scripts/spawn_detached.py \
    model/data/pipeline_logs/omniroute.log \
    /usr/local/bin/omniroute serve
fi

# المحوّل المحلي (11435): الشات بقى على OmniRoute، بس الإمبدنجز لسه محتاجاه.
# الـ KB (47 ميجا) متجهاتها كلها من الموديل المحلي، و OmniRoute مش بديل —
# أبعاد مختلفة فالمقارنة بتبوظ. من غيره search_knowledge والبحث بيقعوا.
# المستخدم اختار يرجّعه (2026-10-07). خيطين بس عشان التدريب يفضل الأولوية.
if ! pgrep -f "ollama_adapter.py" >/dev/null; then
  log "المحوّل المحلي مش شغال — بشغّله (للإمبدنجز)"
  # spawn_detached بيعمل setsid حقيقي. nohup+& و disown مكانوش بيكفوا:
  # launchd بيقتل كل مجموعة عمليات الـ job لما السكربت يخلص، فالمحوّل كان
  # بيشتغل ويموت كل 6 دقايق (2026-10-09).
  OMP_NUM_THREADS=2 MKL_NUM_THREADS=2 TOKENIZERS_PARALLELISM=false \
    /usr/bin/python3 model/scripts/spawn_detached.py \
    model/data/pipeline_logs/adapter.log \
    .venv/bin/python model/scripts/ollama_adapter.py
fi

# أولوية المعالج: التدريب بياخد نواة واحدة من 4 لأن Chrome/VS Code/Flutter
# بيزاحموه (الحمل كان 147 على جهاز 8 أنوية). بنخفّض أولويتهم مش بنقفلهم —
# فلو المستخدم محتاجهم يفضلوا شغالين، بس التدريب يسبقهم في الطابور.
# بيتكرر كل 5 دقايق عشان العمليات الجديدة (تابات جديدة مثلًا) تتظبط كمان.
for bp in $(pgrep -f "Chrome Helper"; pgrep -f "Code Helper"; pgrep -x dart; pgrep -f xcdevice); do
  renice +10 -p "$bp" >/dev/null 2>&1
done

pid=$(pgrep -f "train.py --preset nano_cpu" | head -1)

# عملية لسه بادئة = لسه بتحمّل الداتا (1.6 جيجا) والـ checkpoint. ملف النبضة
# ساعتها لسه قديم من التشغيلة اللي فاتت — لو قتلناها هنا بندخل لوپ قتل/تشغيل.
if [ -n "$pid" ]; then
  page=$(etime_to_secs "$(ps -o etime= -p "$pid" | tr -d ' ')")
  if [ "${page:-0}" -lt "$MINAGE" ]; then
    exit 0
  fi
fi

hb=$(stat -f %m "$HB" 2>/dev/null || echo 0)
age=$((now - hb))
[ "$hb" -eq 0 ] && age=99999

if [ "$age" -le "$STALE" ]; then
  exit 0   # شغال تمام
fi

if [ -n "$pid" ]; then
  log "النبضة عمرها ${age}ث والعملية (عمرها ${page}ث) شغالة → متعلّقة، بقتلها"
  kill -9 "$pid" 2>/dev/null
  sleep 3
else
  log "النبضة عمرها ${age}ث ومفيش عملية → بشغّل"
fi

launchctl kickstart -k "gui/$(id -u)/com.elashry.train" >> "$LOG" 2>&1
log "اترفع التدريب تاني"
