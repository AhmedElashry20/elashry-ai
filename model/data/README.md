# تغذية موديل elashry-ai من HuggingFace

الملفات دي **بيانات + أرقام مرجعية بس** — مفيش أوزان جاهزة، مفيش أي API خارجي، مفيش أي إيجنت تاني.
كل اللي هنا بينزل عندك offline، وموديلك المبني من الصفر هو اللي بيتدرّب عليه لوحده.
كل الداتاسِتس **متأكّد إنها شغّالة على `datasets==5.0.0` من غير أي تسجيل دخول**.

## الملفات
- [`../configs/arch_presets.json`](../configs/arch_presets.json) — 3 أحجام (nano ~7M لابتوب / micro ~34M / small ~50M على Colab)، مسحوبة كمرجع من نماذج صغيرة حقيقية (Pythia-70m، TinyStories-33M، tiny_starcoder). أسماء الحقول زي nanoGPT.
- [`hf_datasets.json`](hf_datasets.json) — الداتاسِتس متفصّلة على **مهام الإيجنت** + صيغة إدخال/إخراج موحّدة + ترتيب تدريب (curriculum).
- [`../scripts/`](../scripts/) — `train_tokenizer.py`, `prepare_data.py`, `data_common.py`.

## الفكرة متناسقة مع فكر الإيجنت
| مهمة الإيجنت | الداتا |
|---|---|
| توليد كود + chat (Python backbone) | `jtatman/python-code-dataset-500k`، `iamtarun/...18k` |
| Agent mode: أمر ← كود (متعدد اللغات) | `CodeAlpaca-20k`، `CodeFeedback`، `self-oss-instruct` |
| Fix / Refactor (تعديل) | `Maxscha/commitbench` (رسالة الكوميت ← diff) |
| Explain (شرح كود) | `code_search_net` (كود ← توثيق) |
| قياس الجودة | `openai_humaneval`، `mbpp` — **ممنوع التدريب عليها** |

وقبل الكود خالص فيه **stage 0**: `TinyStories` عشان الموديل الصغير يتعلّم يطلّع كلام مترابط الأول.

## مهم: تغيّرات `datasets` نسخة 5
النسخة الجديدة **شالت الداتاسِتس اللي بسكربت** وشالت `trust_remote_code`. عشان كده الكلاسيكيات
(the-stack، github-code-clean، commitpackft، tiny-codes) بقت إما **gated** (محتاجة تسجيل دخول مجاني) أو **ميتة**.
المجموعة اللي فوق كلها parquet + مفتوحة، فبتشتغل بصفر إعدادات. البدائل الـ gated مكتوبة في
`gated_optional` جوه المانيفست — لو حبيت، اعمل حساب HuggingFace مجاني، اقبل الشروط، و`huggingface-cli login`.

## الصيغة الموحّدة (عشان يتكلّم بروتوكول الإيجنت)
```
<|task|> {التعليمة}
<|context|> {مقطع من الملف/الـworkspace — اختياري}
<|response|> {الكود أو الشرح}<|end|>
```
وللتعديل عند الكيرسر (FIM): `<fim_prefix>…<fim_suffix>…<fim_middle>…`

## التشغيل
```bash
pip install -r model/requirements.txt

# 1) درّب التوكنيزر من الصفر (BPE + التوكنز الخاصة)
python model/scripts/train_tokenizer.py --preset nano_cpu

# 2) جهّز الداتا -> train.bin / val.bin / meta.json
#    تجربة سريعة على داتاسِت واحدة:
python model/scripts/prepare_data.py --preset nano_cpu --only sahil2801/CodeAlpaca-20k --limit 500
#    التشغيل الكامل (مع سقف توكنز لكل داتاسِت عشان الكبار):
python model/scripts/prepare_data.py --preset nano_cpu --max-tokens-per-dataset 20000000
```

المخرجات في `model/data/bin/`. للقراءة وقت التدريب:
`np.memmap('model/data/bin/train.bin', dtype=np.uint16, mode='r')`

> الخطوة الجاية بعد كده: `train.py` (نموذج decoder-only بيقرأ الـ preset + الـ bins).
