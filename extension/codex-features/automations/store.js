"use strict";
// الأتمتة (Automations) — مستوحى من تبويب "scheduled" في ورشة Codex:
// برومبت بيتنفّذ على مواعيد. كل حاجة محلية، مفيش خدمات خارجية.
//
// الجدولة مبسّطة عن قصد (مفيش cron كامل): يومي / أيام الشغل / أسبوعي + ساعة.
Object.defineProperty(exports, "__esModule", { value: true });
exports.load = load;
exports.save = save;
exports.add = add;
exports.remove = remove;
exports.dueNow = dueNow;
exports.markRan = markRan;
exports.describe = describe;

const fs = require("fs");
const path = require("path");

function file(storageDir) {
    return path.join(storageDir, 'automations.json');
}

function load(storageDir) {
    try {
        const raw = fs.readFileSync(file(storageDir), 'utf8');
        const j = JSON.parse(raw);
        return Array.isArray(j.items) ? j.items : [];
    }
    catch {
        return [];
    }
}

function save(storageDir, items) {
    fs.mkdirSync(storageDir, { recursive: true });
    fs.writeFileSync(file(storageDir), JSON.stringify({ items }, null, 2), 'utf8');
}

function add(storageDir, item) {
    const items = load(storageDir);
    const withId = { id: `a${Date.now().toString(36)}`, enabled: true, lastRun: 0, ...item };
    items.push(withId);
    save(storageDir, items);
    return withId;
}

function remove(storageDir, id) {
    const items = load(storageDir).filter(a => a.id !== id);
    save(storageDir, items);
}

// بيرجّع الأتمتة المستحقة دلوقتي. بيستخدم lastRun عشان ما يكررش في نفس اليوم.
function dueNow(items, now = new Date()) {
    const out = [];
    const day = now.getDay(); // 0 = الأحد
    for (const a of items) {
        if (!a.enabled)
            continue;
        if (typeof a.hour !== 'number')
            continue;
        if (now.getHours() < a.hour)
            continue;
        if (a.schedule === 'weekdays' && (day === 5 || day === 6))
            continue; // الجمعة والسبت إجازة
        if (a.schedule === 'weekly' && day !== (a.weekday ?? 0))
            continue;
        // اتنفّذت النهاردة بالفعل؟
        const last = new Date(a.lastRun || 0);
        const sameDay = last.getFullYear() === now.getFullYear()
            && last.getMonth() === now.getMonth()
            && last.getDate() === now.getDate();
        if (sameDay)
            continue;
        out.push(a);
    }
    return out;
}

function markRan(storageDir, id, when = Date.now()) {
    const items = load(storageDir);
    const a = items.find(x => x.id === id);
    if (a) {
        a.lastRun = when;
        save(storageDir, items);
    }
}

function describe(a) {
    const sched = a.schedule === 'weekdays' ? 'أيام الشغل'
        : a.schedule === 'weekly' ? `أسبوعي (يوم ${a.weekday ?? 0})`
            : 'يومي';
    return `${a.name} — ${sched} الساعة ${String(a.hour).padStart(2, '0')}:00${a.enabled ? '' : ' (متوقفة)'}`;
}
