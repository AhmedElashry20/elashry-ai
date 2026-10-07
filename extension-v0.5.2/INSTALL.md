# تشغيل الإكستنشن (النسخة 0.5.2 الكاملة)

المجلد ده فيه الإكستنشن **مجمَّع وجاهز** — 24 أمر، إيجنت بأدوات، مهارات،
أهداف، أذونات، أتمتة، ومحادثات محفوظة.

> **ليه مجمَّع مش سورس؟** السورس الأصلي بـ TypeScript اتفقد. اللي موجود هو
> ناتج `tsc` (مش مضغوط ومقروء). مجلد `../extension/` فيه سورس نسخة 0.0.1
> الأساسية بس — مش دي النسخة دي.

## التثبيت

```bash
# انسخه لمجلد إكستنشنز VS Code
cp -R extension-v0.5.2 ~/.vscode/extensions/ahmedelashry.elashry-ai-0.5.2

# ثبّت التبعيات اللي الإكستنشن محتاجها وقت التشغيل
cd ~/.vscode/extensions/ahmedelashry.elashry-ai-0.5.2 && npm install --omit=dev
```

بعدها اعمل **Reload Window** في VS Code (`Cmd+Shift+P` → `Reload Window`).

## الإعدادات

```json
{
  "elashryAi.model.host": "http://127.0.0.1:20130",
  "elashryAi.model.chatModel": "auto",
  "elashryAi.agent.permissionMode": "approve",

  // للإمبدنجز والـ KB — لازم يفضل على الموديل المحلي
  "elashryAi.model.embedHost": "http://127.0.0.1:11435",
  "elashryAi.model.embedModel": "elashry-nano",

  // للسيرفرات البعيدة اللي بتطلب مصادقة. فاضي للمحلي.
  "elashryAi.model.apiKey": ""
}
```

**تحذيران:**

- `embedModel` لازم يفضل `elashry-nano`. لو حطيته `auto` الـ KB هتبوظ
  **من غير أي رسالة خطأ** — متجهاتها 256 بُعد من الموديل المحلي، وأي موديل
  تاني أبعاده مختلفة فالمقارنة ترجّع نتايج عشوائية.
- `elashryAi.bus.host` سيبه فاضي. الميزة دي محتاجة سيرفر طابور أوامر
  (`/commands/next`) مش موجود — ولو فعّلتها من غيره هتملا اللوج أخطاء.

## الأوامر

`Cmd+Shift+P` واكتب `Elashry AI`:

| الأمر | بيعمل إيه |
|---|---|
| Open Chat | الشات الرئيسي |
| Skills / Create Skill | المهارات |
| Run Goal / Check Goal Criteria | الأهداف |
| Automations / Add Automation | المهام المجدولة |
| Explain / Fix / Refactor Selection | على النص المحدّد |
| Research · KB · Drive | البحث الخلفي وقاعدة المعرفة |
