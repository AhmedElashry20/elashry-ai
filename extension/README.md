# elashry-ai — إكستنشن VS Code (العميل)

مساعد برمجة شخصي بيتكلّم مع **نموذجك المحلي المبني من الصفر** بس — صفر API خارجي.

## المكوّنات
- `src/extension.ts` — التفعيل + الأوامر + لوحة الشات (webview في السايد بار).
- `src/modelClient.ts` — بيشغّل `model/scripts/serve.py` كـ subprocess ويتكلّم معاه ببروتوكول سطر-JSON.
- `../model/scripts/serve.py` — الجسر: بيحمّل الـ checkpoint + التوكنيزر ويولّد.

## المميزات (MVP)
- 💬 **شات** بالسايد بار (أيقونة elashry-ai في الأكتيفتي بار).
- 🧠 **أوامر كود** على التحديد: اشرح / صلّح / أعد هيكلة (كمان في قائمة الكليك يمين).

> الـ **agent mode** (تعديل ملفات + تنفيذ أوامر أوتوماتيك) متأجّل لحد ما النموذج يطلّع كلام مفهوم — دلوقتي لسه بدري في التدريب.

## التشغيل
```bash
cd extension
npm install
npm run compile
```
بعدين افتح فولدر المشروع في VS Code واضغط **F5** (Extension Development Host).

## الإعدادات (Settings → elashry-ai)
- `elashryAi.pythonPath` — مسار بايثون الـ venv (فيه torch). الافتراضي مظبوط على venv المشروع.
- `elashryAi.preset` — الافتراضي `nano_cpu`.
- `elashryAi.maxNewTokens` — الافتراضي 200.

> لازم يكون فيه checkpoint مدرَّب في `model/checkpoints/<preset>.pt` (بيتعمل تلقائيًا من `train.py`).
> كل ما التدريب يتحسّن، الردود تتحسّن — الإكستنشن بيقرأ آخر checkpoint في كل مرة.
