/**
 * بيتأكد إن نسخة الريبو ونسخة الإكستنشن المثبتة ماتفرقوش في صمت.
 *
 * ليه: الإكستنشن بيشتغل من ~/.vscode/extensions/، والريبو فيه نسخة تانية.
 * حصل فعلًا (2026-10-15) إن تصليح أمني اتعمل في المثبتة بس، فنسخة الريبو
 * فضلت فيها الثغرة — والاختبارات كانت بتقرا الريبو فنجحت كذب.
 *
 * فروق مقصودة: config.js و package.json فيهم الـ host الافتراضي، ونسخة
 * الريبو متعمّد تكون 127.0.0.1 بدل IP السيرفر الشخصي (ريبو عام).
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const REPO = path.join(__dirname, "..");
const INSTALLED = path.join(os.homedir(), ".vscode", "extensions",
                            "ahmedelashry.elashry-ai-0.5.2");

// ملفات مسموح تختلف، والسبب
const ALLOWED = {
    "out/config.js": "الـ host الافتراضي: الريبو محلي، المثبتة ممكن تبقى على سيرفر",
    "package.json": "نفس السبب + إعدادات محلية",
};

if (!fs.existsSync(INSTALLED)) {
    console.log("⊘ الإكستنشن مش مثبت — بتخطّى فحص التطابق");
    process.exit(0);
}

function walk(dir, base = "") {
    const out = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const rel = base ? `${base}/${e.name}` : e.name;
        if (e.name === "node_modules" || e.name === "test")
            continue;
        if (e.isDirectory())
            out.push(...walk(path.join(dir, e.name), rel));
        else if (e.name.endsWith(".js") || e.name === "package.json")
            out.push(rel);
    }
    return out;
}

const drifted = [];
const missing = [];
for (const rel of walk(REPO)) {
    const a = path.join(REPO, rel);
    const b = path.join(INSTALLED, rel);
    if (!fs.existsSync(b)) {
        missing.push(rel);
        continue;
    }
    if (fs.readFileSync(a, "utf8") !== fs.readFileSync(b, "utf8")) {
        if (!(rel in ALLOWED))
            drifted.push(rel);
    }
}

if (missing.length)
    console.log(`⚠ موجود في الريبو ومش في المثبتة (${missing.length}): ${missing.join(", ")}`);

if (drifted.length) {
    console.log("\n✗ ملفات فرقت من غير سبب مسجّل:");
    drifted.forEach(f => console.log(`    ${f}`));
    console.log("\n  لو الفرق مقصود، ضيفه في ALLOWED هنا.");
    console.log("  لو لأ، انقل النسخة الصح:");
    console.log(`    cp "${INSTALLED}/<file>" "${REPO}/<file>"`);
}

assert.strictEqual(drifted.length, 0, `${drifted.length} ملف فرق في صمت`);
console.log("✓ الريبو والمثبتة متطابقين (بره الفروق المقصودة)\n");
