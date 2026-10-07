#!/bin/bash
# بيشغّل محوّل الموديل (Ollama-compatible على localhost:11435) اللي الإكستنشن بيكلمه.
# الإكستنشن من غيره بيطلّع "[bus] err: fetch failed" على طول — وده اللي كان حاصل
# لأن مفيش حاجة كانت بتشغّله بعد كل restart.
cd /Users/ahmedelashry/Desktop/elashry-ai || exit 1

# شغال بالفعل؟ ماتشغّلش تاني
if pgrep -f "ollama_adapter.py" >/dev/null; then exit 0; fi

# خيوط قليلة عن قصد — التدريب هو الأولوية، والمحوّل بيولّد على فترات بس
export PYTHONUNBUFFERED=1 OMP_NUM_THREADS=2 MKL_NUM_THREADS=2 TOKENIZERS_PARALLELISM=false
echo "$(date '+%F %T') بشغّل المحوّل" >> model/data/pipeline_logs/adapter.log
exec .venv/bin/python model/scripts/ollama_adapter.py >> model/data/pipeline_logs/adapter.log 2>&1
