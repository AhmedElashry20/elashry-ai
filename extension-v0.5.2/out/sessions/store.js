"use strict";
// حفظ المحادثات — كل محادثة ملف JSON في globalStorage، فبتفضل بعد ما تقفل VS Code.
// بنحفظ نفس شكل الـ history اللي الإيجنت بيستخدمه (role + content blocks)
// عشان نقدر نرجّعه للإيجنت زي ما هو ويكمّل من حيث ما وقف.
Object.defineProperty(exports, "__esModule", { value: true });
exports.dir = dir;
exports.list = list;
exports.load = load;
exports.save = save;
exports.remove = remove;
exports.titleFrom = titleFrom;
exports.newId = newId;

const fs = require("fs");
const path = require("path");

function dir(storageDir) {
    const d = path.join(storageDir, "sessions");
    fs.mkdirSync(d, { recursive: true });
    return d;
}

function newId() {
    return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// عنوان من أول رسالة للمستخدم — أول 60 حرف
function titleFrom(messages) {
    for (const m of messages || []) {
        if (m.role !== "user")
            continue;
        const blocks = Array.isArray(m.content) ? m.content : [];
        for (const b of blocks) {
            if (b.type === "text" && b.text && b.text.trim()) {
                const t = b.text.trim().replace(/\s+/g, " ");
                return t.length > 60 ? t.slice(0, 60) + "…" : t;
            }
        }
        if (typeof m.content === "string" && m.content.trim()) {
            const t = m.content.trim().replace(/\s+/g, " ");
            return t.length > 60 ? t.slice(0, 60) + "…" : t;
        }
    }
    return "محادثة بدون عنوان";
}

// ترتيب من الأحدث للأقدم
function list(storageDir) {
    const d = dir(storageDir);
    const out = [];
    let names;
    try {
        names = fs.readdirSync(d);
    }
    catch {
        return out;
    }
    for (const n of names) {
        if (!n.endsWith(".json"))
            continue;
        try {
            const j = JSON.parse(fs.readFileSync(path.join(d, n), "utf8"));
            out.push({
                id: j.id || n.replace(/\.json$/, ""),
                title: j.title || "محادثة",
                updated: j.updated || 0,
                turns: Array.isArray(j.messages) ? j.messages.length : 0,
            });
        }
        catch {
            // ملف بايظ — نتجاهله بدل ما نوقع القائمة كلها
        }
    }
    return out.sort((a, b) => b.updated - a.updated);
}

function load(storageDir, id) {
    const f = path.join(dir(storageDir), `${id}.json`);
    return JSON.parse(fs.readFileSync(f, "utf8"));
}

// كتابة ذرّية — لو VS Code اتقفل في النص الملف مايبوظش
function save(storageDir, id, messages, title) {
    const f = path.join(dir(storageDir), `${id}.json`);
    const blob = {
        id,
        title: title || titleFrom(messages),
        updated: Date.now(),
        messages: messages || [],
    };
    const tmp = f + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(blob, null, 2), "utf8");
    fs.renameSync(tmp, f);
    return blob;
}

function remove(storageDir, id) {
    try {
        fs.unlinkSync(path.join(dir(storageDir), `${id}.json`));
        return true;
    }
    catch {
        return false;
    }
}
