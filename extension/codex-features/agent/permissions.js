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
    /\brm\s+(-[a-zA-Z]*[rf][a-zA-Z]*\s+)+/, // rm -rf
    /\bsudo\b/, /\bchmod\s+777\b/, /\bchown\b/,
    /\b(mkfs|dd\s+if=|diskutil\s+erase)/,
    /\bcurl\b[^|]*\|\s*(ba)?sh/, /\bwget\b[^|]*\|\s*(ba)?sh/, // تحميل وتنفيذ
    /\bgit\s+push\b/, /\bgit\s+reset\s+--hard\b/, /\bgit\s+clean\s+-[a-z]*f/,
    /\bnpm\s+publish\b/, /\b(shutdown|reboot|halt)\b/,
    /\bkillall\b/, /\blaunchctl\s+(bootout|unload)\b/,
    /\s>\s*\/dev\/(sd|disk)/, /\bpmset\b/,
];

function classifyCommand(cmd) {
    const c = String(cmd || '').trim();
    if (!c)
        return 'ask';
    for (const re of DANGEROUS) {
        if (re.test(c))
            return 'deny';
    }
    // أمر مركّب (&&، ||، ;، |) — كل جزء لازم يكون آمن
    const parts = c.split(/\s*(?:&&|\|\||;|\|)\s*/).filter(Boolean);
    if (parts.length > 1)
        return parts.every(p => SAFE.some(re => re.test(p))) ? 'safe' : 'ask';
    return SAFE.some(re => re.test(c)) ? 'safe' : 'ask';
}

// بتحدد يعمل إيه مع استدعاء أداة معيّنة.
// بترجّع 'allow' | 'ask' | 'deny'
function decide(mode, toolName, input, autoApprove) {
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
