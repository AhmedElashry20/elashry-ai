# ميزات من ورشة Codex — مطبّقة على elashry-ai

مصدرها فيديو ورشة OpenAI (51 دقيقة) عن Codex للفرونت-إند. التفريغ الكامل في
`video-transcript.txt`.

الموديولات دي **مركّبة فعلًا** في الإكستنشن المثبّت
(`~/.vscode/extensions/ahmedelashry.elashry-ai-0.5.2/out/`). النسخة اللي هنا هي
مصدر الحقيقة — لو الإكستنشن اتعاد تثبيته، ارجع منها.

نسخة احتياطية من الإكستنشن قبل التعديل: `../backup-0.5.2-20260920/`

---

## اللي اتاخد من الفيديو

| في الفيديو | عندنا | الملف |
|---|---|---|
| Skills (`$name`) | ✅ | `skills/store.js` |
| Skill creator | ✅ مهارة جاهزة | `.elashry/skills/skill-creator/` |
| Goals + معايير قبول | ✅ الحلقة موصّلة بالإيجنت | `agent/goal.js` + `wiring/` |
| Approve-for-me | ✅ بقواعد حتمية | `agent/permissions.js` |
| Automations (جدولة) | ✅ | `automations/store.js` |
| Sites / Plugins / MCP / Pets | ❌ | خاصة بمنتج OpenAI |

---

## 1. المهارات

مجلد فيه `SKILL.md`:

```
---
name: explain-code
description: يشرح كود بالعربي
---
# إرشادات
...
```

**الأماكن:** `<المشروع>/.elashry/skills/` و `~/.elashry/skills/`
(مهارة المشروع بتغلب الشخصية لو نفس الاسم).

**الاستعمال:** اكتب `$explain-code` في الشات. الإرشادات بتتحقن في الـ system
prompt والـ `$name` بيتشال من نص السؤال.

**الأوامر:** `Elashry AI: Skills` / `Elashry AI: Create Skill`

## 2. الأهداف

الفكرة من الفيديو: بدل ما تدّي أمر ويقف عند أول محاولة، تدّيه **معايير قبول**
ويفضل يلف لحد ما تتحقق.

**فرق مهم عن Codex:** هناك الموديل هو اللي بيحكم "خلصت ولا لأ". هنا الحكم
**حتمي** — أوامر لازم ترجع 0، ملفات لازم تكون موجودة. السبب إن الموديل المحلي
(9M) مش قادر يحكم على شغله، فلو سبناه يحكم هيقول "خلصت" وهو ما خلّصش.

`.elashry/goals/<اسم>.json`:

```json
{
  "prompt": "صلّح أخطاء TypeScript",
  "maxRounds": 5,
  "criteria": [
    { "type": "command",       "run": "npx tsc --noEmit", "expectExit": 0 },
    { "type": "file_exists",   "path": "src/index.ts" },
    { "type": "file_contains", "path": "README.md", "text": "## Usage" }
  ]
}
```

المعيار اللي بيقع بيرجع للإيجنت كبرومبت الجولة الجاية.

**الأوامر:** `Elashry AI: Run Goal` / `Elashry AI: Check Goal Criteria`

`Run Goal` بيفحص المعايير الأول — لو الهدف متحقق أصلًا مايشغّلش حاجة. لو لأ،
بيفتح الشات وبيشغّل الحلقة الفعلية (`ChatViewProvider.runGoal`) وبتشوف كل جولة
والمعايير بتعدّي أو تقع أمام عينك.

أهداف جاهزة في `.elashry/goals/`:
- `fix-typescript.json` — يصلّح أخطاء TS لحد ما `tsc --noEmit` يعدّي
- `train-is-healthy.json` — يتأكد إن التدريب شغال والنبضة طازة، ويشغّله لو واقف

## 3. الأذونات

`elashryAi.agent.permissionMode`:

| الوضع | السلوك |
|---|---|
| `strict` | يسأل على كل حاجة |
| `approve` | **الافتراضي** — ينفّذ الآمن، يسأل على الباقي، يرفض الخطر |
| `full` | ينفّذ كل حاجة — غير مستحسن |

الأوامر المرفوضة دايمًا: `rm -rf`، `sudo`، `curl \| sh`، `git push`،
`npm publish`، `shutdown`، `launchctl bootout`، `pmset`.
الأمر المركّب (`&&`، `|`) لازم **كل** أجزاءه تكون آمنة.

## 4. الأتمتة

برومبت بيتنفّذ على ميعاد: `daily` / `weekdays` (بيتخطى الجمعة والسبت) / `weekly`.
الجدولة بتتفقّد كل 5 دقايق، والأتمتة مابتتكررش في نفس اليوم.

**الأوامر:** `Elashry AI: Add Automation` / `Elashry AI: Automations`

---

## ملاحظة على السقف

الكود ده **هيكل (harness)** — شغّال ومختبَر لوحده. بس جودة تشغيله بتعتمد على
الموديل اللي بيسوقه. الموديل الحالي (8.92M، `best_val` 2.91) مش قادر يمسك حلقة
إيجنت. عشان كده الأهداف والأذونات اتعملت **حتمية** (أوامر وقواعد، مش حكم موديل) —
الجزء ده بيشتغل النهاردة بغض النظر عن الموديل.
