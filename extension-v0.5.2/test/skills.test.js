/**
 * اختبارات استيراد المهارات — الصيغة الخارجية (Agent Shelf، Claude Code
 * agents، Cursor rules) هي Markdown بترويسة YAML، نفس صيغة SKILL.md عندنا.
 * المستورد لازم يتسامح مع الحقول الزيادة ويستنتج الناقص.
 *
 *     node test/skills.test.js
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const store = require("../out/skills/store.js");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "skilltest-"));
let pass = 0, fail = 0;
const failures = [];

function t(label, fn) {
    try {
        fn();
        pass++;
    }
    catch (e) {
        fail++;
        failures.push(`  ${label}\n    ${e.message}`);
    }
}

// ───────── صيغة Agent Shelf: حقول زيادة لازم تتحفظ مش تقع ─────────
t("Agent Shelf بحقول زيادة", () => {
    const md = `---
name: Test Generator
description: Writes thorough tests
version: 1.1.0
category: Coding
license: MIT
tags: testing, pytest
---

# Test Generator
You are a test engineering specialist.`;
    const r = store.importSkill(md, TMP);
    assert.strictEqual(r.name, "test-generator", "الاسم يتحوّل لصيغة مجلد");
    assert.strictEqual(r.description, "Writes thorough tests");
    assert.strictEqual(r.extras.version, "1.1.0");
    assert.strictEqual(r.extras.category, "Coding");
    assert.ok(fs.existsSync(r.file), "الملف اتكتب");
    const body = fs.readFileSync(r.file, "utf8");
    assert.ok(body.includes("test engineering specialist"), "النص اتحفظ");
    assert.ok(body.includes("version: 1.1.0"), "الحقول الزيادة اتسجّلت كمصدر");
});

// ───────── من غير ترويسة: يستنتج من العنوان وأول فقرة ─────────
t("من غير ترويسة", () => {
    const md = `# Security Auditor

Reviews code and dependencies for vulnerabilities.

## Steps
- Scan`;
    const r = store.importSkill(md, TMP);
    assert.strictEqual(r.name, "security-auditor");
    assert.ok(r.description.startsWith("Reviews code"), "الوصف من أول فقرة");
});

// ───────── أسماء صعبة ─────────
t("أسماء فيها رموز ومسافات", () => {
    const r = store.importSkill("---\nname: UI/UX  Designer!!\n---\nbody", TMP);
    assert.strictEqual(r.name, "ui-ux-designer", `طلع ${r.name}`);
});

t("اسم طويل جدًا يتقص", () => {
    const r = store.importSkill(`---\nname: ${"x".repeat(200)}\n---\nbody`, TMP);
    assert.ok(r.name.length <= 60, `الطول ${r.name.length}`);
});

t("اسم رموز بس → افتراضي", () => {
    const r = store.importSkill("---\nname: !!!@@@\n---\nbody text here", TMP);
    assert.ok(r.name.length > 0, "مايبقاش فاضي");
});

// ───────── الملف الفاضي يرفض ─────────
t("ملف فاضي يرفض", () => {
    assert.throws(() => store.importSkill("", TMP), /فاضي/);
    assert.throws(() => store.importSkill("   \n  ", TMP), /فاضي/);
});

// ───────── المستورد لازم يتقرا تاني كمهارة شغالة ─────────
t("المستورد بيتقرا كمهارة", () => {
    const md = "---\nname: roundtrip\ndescription: يرجع تاني\n---\n\n# نص\nالتفاصيل.";
    store.importSkill(md, TMP);
    const parsed = store.parseSkill(
        fs.readFileSync(path.join(TMP, "roundtrip", "SKILL.md"), "utf8"), "x");
    assert.strictEqual(parsed.name, "roundtrip");
    assert.strictEqual(parsed.description, "يرجع تاني");
    assert.ok(parsed.guidance.includes("التفاصيل"), "الإرشادات موجودة");
});

// ───────── $الاسم بيتلقط ويتشال من نص المستخدم ─────────
t("التقاط $الاسم", () => {
    const skills = [{ name: "roundtrip" }, { name: "test-generator" }];
    const hit = store.findMentioned("جرب $roundtrip على ده", skills);
    assert.strictEqual(hit.length, 1);
    assert.strictEqual(hit[0].name, "roundtrip");
    assert.strictEqual(store.stripMentions("جرب $roundtrip على ده", hit), "جرب على ده");
});

t("اسم مش موجود مايتلقطش", () => {
    assert.strictEqual(store.findMentioned("$nope", [{ name: "roundtrip" }]).length, 0);
});

fs.rmSync(TMP, { recursive: true, force: true });

console.log(`\nنجح ${pass} | فشل ${fail}`);
if (failures.length) {
    console.log("\nالفاشل:");
    failures.forEach(f => console.log(f));
}
assert.strictEqual(fail, 0, `${fail} اختبار فشل`);
console.log("✓ كل اختبارات المهارات عدّت\n");
