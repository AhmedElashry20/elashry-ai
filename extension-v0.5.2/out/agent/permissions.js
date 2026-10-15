"use strict";
// أوضاع الأذونات — مستوحى من "approve for me" في ورشة Codex.
// الفرق: هناك بيستخدموا موديل تاني يحكم على الأمر. هنا الحكم *حتمي* بقواعد،
// عشان الموديل المحلي (9M) مش قادر يحكم على الأمان، والغلط هنا تكلفته عالية.
//
//   strict   → يسأل على كل حاجة
//   approve  → ينفّذ الآمن لوحده، ويسأل على الباقي، ويرفض الخطر (الافتراضي)
//   full     → ينفّذ كل حاجة من غير سؤال — غير مستحسن
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyCommand = classifyCommand;
exports.decide = decide;

// أوامر قراءة فقط — مفيش منها ضرر
const SAFE = [
    // (\s|$) مش \s لوحدها — عشان `head` جوه بايب من غير معاملات تتحسب آمنة
    /^ls(\s|$)/, /^pwd$/, /^cat(\s|$)/, /^head(\s|$)/, /^tail(\s|$)/, /^wc(\s|$)/,
    /^grep\s/, /^rg\s/, /^find\s/, /^file\s/, /^stat\s/, /^which\s/,
    /^sort(\s|$)/, /^uniq(\s|$)/, /^cut\s/, /^tr\s/,
    /^echo(\s|$)/, /^date$/, /^whoami$/, /^env$/, /^df(\s|$)/, /^du\s/,
    /^git\s+(status|log|diff|show|branch|remote\s+-v)(\s|$)/,
    /^npm\s+(test|run\s+test|ls|list)(\s|$)/,
    /^(python3?|node)\s+--version$/, /^tsc\s+--noEmit(\s|$)/,
];

// أوامر مدمّرة أو بتطلع بره الجهاز — دي بترفض، مش بتتسأل
const DANGEROUS = [
    /\brm\s+(-[a-zA-Z]*[rf][a-zA-Z]*\s+)+/,              // rm -rf / rm -r -f
    /\brm\s+(--(recursive|force)\b\s*)+/,              // rm --recursive --force
    /\b(rmdir|unlink)\s+-/,
    /\bsudo\b/, /\bchmod\s+777\b/, /\bchown\b/,
    /\b(mkfs|dd\s+if=|diskutil\s+erase)/,
    /\bcurl\b[^|]*\|\s*(ba)?sh/, /\bwget\b[^|]*\|\s*(ba)?sh/, // تحميل وتنفيذ
    /\bgit\s+push\b/, /\bgit\s+reset\s+--hard\b/, /\bgit\s+clean\s+-[a-z]*f/,
    /\bnpm\s+publish\b/, /\b(shutdown|reboot|halt)\b/,
    /\bkillall\b/, /\blaunchctl\s+(bootout|unload)\b/,
    /\s>\s*\/dev\/(sd|disk)/, /\bpmset\b/,
];

// مسارات حساسة — قراءتها بتروح لسياق الموديل الخارجي، فدي تسريب
const SENSITIVE = [
    /(^|\s|\/)\.ssh\//, /(^|\s|\/)\.aws\//, /(^|\s|\/)\.gnupg\//,
    /\bid_(rsa|ed25519|ecdsa)\b/, /\.pem\b/, /\bcredentials\b/,
    /(^|\s|\/)\.env(\.|\s|$)/, /\bshadow\b/, /Keychains?\//,
];

function classifyCommand(cmd) {
    const c = String(cmd || '').trim();
    if (!c)
        return 'ask';
    // إعادة توجيه الخروج بتكتب على ملفات — أمر «قراءة» مع > مابقاش آمن.
    // (2>&1 و 2>/dev/null استثناء: دول للأخطاء مش كتابة بيانات)
    if (/(^|[^0-9&])>>?(?!\s*(&1|&2|\/dev\/null))/.test(c))
        return 'ask';
    // قراءة أسرار → موافقة صريحة، لأن المحتوى بيروح للموديل الخارجي
    if (SENSITIVE.some(re => re.test(c)))
        return 'ask';
    for (const re of DANGEROUS) {
        if (re.test(c))
            return 'deny';
    }
    // أمر مركّب — كل جزء لازم يكون آمن.
    // ⚠ السطر الجديد فاصل أوامر زيه زي ; — من غيره كان
    // "echo ok\nnpm install evil" بيتصنّف آمن وينفّذ من غير سؤال.
    const parts = c.split(/\s*(?:&&|\|\||;|\||\n|\r)\s*/).filter(Boolean);
    if (parts.length > 1)
        return parts.every(p => SAFE.some(re => re.test(p))) ? 'safe' : 'ask';
    return SAFE.some(re => re.test(c)) ? 'safe' : 'ask';
}

// بتحدد يعمل إيه مع استدعاء أداة معيّنة.
// بترجّع 'allow' | 'ask' | 'deny'
// مسار الملف بتاع الأداة (لو فيه)
function toolPath(input) {
    return typeof input?.path === 'string' ? input.path : '';
}

function decide(mode, toolName, input, autoApprove, workspaceRoot) {
    // مسار بره المشروع بيكسر وضع full كمان — ده الفرق بين «ثق فيه في
    // مشروعي» و«ثق فيه في كل جهازي». قراءة ~/.ssh بتروح لموديل خارجي.
    const p = toolPath(input);
    if (p && workspaceRoot) {
        const path_ = require('path');
        const abs = path_.isAbsolute(p) ? path_.normalize(p)
                                        : path_.resolve(workspaceRoot, p);
        const rel = path_.relative(workspaceRoot, abs);
        if (rel.startsWith('..') || path_.isAbsolute(rel))
            return 'ask';
    }
    if (mode === 'full')
        return 'allow';
    if (mode === 'strict')
        return toolName === 'read_file' || toolName === 'list_dir' ? 'allow' : 'ask';
    // وضع approve (الافتراضي)
    if (toolName === 'run_command') {
        const verdict = classifyCommand(input?.command ?? input?.cmd ?? '');
        return verdict === 'safe' ? 'allow' : verdict === 'deny' ? 'deny' : 'ask';
    }
    if (autoApprove && autoApprove[toolName])
        return 'allow';
    return 'ask';
}

exports.SAFE = SAFE;
exports.DANGEROUS = DANGEROUS;
