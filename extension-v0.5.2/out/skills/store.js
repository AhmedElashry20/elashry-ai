"use strict";
// نظام المهارات (Skills) — مستوحى من ورشة Codex.
// المهارة = مجلد فيه SKILL.md: ترويسة (name/description) + إرشادات.
// بتتحمّل من مكانين: مهارات المشروع و مهارات شخصية لكل المشاريع.
// كل ده ملفات محلية — مفيش أي اتصال خارجي.
Object.defineProperty(exports, "__esModule", { value: true });
exports.projectSkillsDir = projectSkillsDir;
exports.personalSkillsDir = personalSkillsDir;
exports.listSkills = listSkills;
exports.parseSkill = parseSkill;
exports.findMentioned = findMentioned;
exports.buildGuidance = buildGuidance;
exports.stripMentions = stripMentions;
exports.writeSkill = writeSkill;
exports.importSkill = importSkill;

const fs = require("fs");
const path = require("path");
const os = require("os");

function projectSkillsDir(workspaceRoot) {
    return path.join(workspaceRoot, '.elashry', 'skills');
}

function personalSkillsDir() {
    return path.join(os.homedir(), '.elashry', 'skills');
}

// بيقرا SKILL.md: ترويسة بين --- و --- (name/description) وبعدها نص الإرشادات
function parseSkill(text, fallbackName) {
    let name = fallbackName;
    let description = '';
    let body = text;
    const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
    if (m) {
        body = text.slice(m[0].length);
        for (const line of m[1].split(/\r?\n/)) {
            const kv = /^\s*([A-Za-z_]+)\s*:\s*(.*)$/.exec(line);
            if (!kv)
                continue;
            const key = kv[1].toLowerCase();
            const val = kv[2].trim().replace(/^["']|["']$/g, '');
            if (key === 'name' && val)
                name = val;
            else if (key === 'description')
                description = val;
        }
    }
    return { name, description, guidance: body.trim() };
}

function readDir(dir, scope) {
    const out = [];
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    }
    catch {
        return out; // المجلد مش موجود — عادي
    }
    for (const e of entries) {
        if (!e.isDirectory())
            continue;
        const file = path.join(dir, e.name, 'SKILL.md');
        let raw;
        try {
            raw = fs.readFileSync(file, 'utf8');
        }
        catch {
            continue; // مجلد من غير SKILL.md — بنتخطاه
        }
        const parsed = parseSkill(raw, e.name);
        out.push({ ...parsed, scope, dir: path.join(dir, e.name) });
    }
    return out;
}

// مهارات المشروع بتغلب الشخصية لو نفس الاسم
function listSkills(workspaceRoot) {
    const personal = readDir(personalSkillsDir(), 'personal');
    const project = workspaceRoot ? readDir(projectSkillsDir(workspaceRoot), 'project') : [];
    const byName = new Map();
    for (const s of personal)
        byName.set(s.name, s);
    for (const s of project)
        byName.set(s.name, s);
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// بيدوّر على $اسم_المهارة في نص المستخدم
function findMentioned(text, skills) {
    const hits = [];
    for (const s of skills) {
        const re = new RegExp(`\\$${s.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        if (re.test(text))
            hits.push(s);
    }
    return hits;
}

function stripMentions(text, skills) {
    let out = text;
    for (const s of skills) {
        const re = new RegExp(`\\$${s.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'ig');
        out = out.replace(re, '').trim();
    }
    return out.replace(/\s{2,}/g, ' ');
}

function buildGuidance(skills) {
    if (!skills.length)
        return '';
    const parts = skills.map(s => `## مهارة: ${s.name}\n${s.description ? s.description + '\n' : ''}\n${s.guidance}`);
    return `المستخدم فعّل المهارات دي. اتبع إرشادها بالحرف:\n\n${parts.join('\n\n---\n\n')}`;
}

function writeSkill(baseDir, name, description, guidance) {
    const dir = path.join(baseDir, name);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'SKILL.md');
    fs.writeFileSync(file, `---\nname: ${name}\ndescription: ${description}\n---\n\n${guidance}\n`, 'utf8');
    return file;
}

/**
 * بيستورد مهارة من ملف Markdown خارجي (Agent Shelf، Claude Code agents،
 * Cursor rules… أي حاجة بصيغة frontmatter + نص).
 *
 * بيتسامح مع الحقول الزيادة (version, category, tags, license) — بياخد
 * name و description ويحتفظ بالباقي كتعليق مصدر، والنص زي ما هو.
 *
 * بيرجّع { file, name, description, extras }.
 */
function importSkill(markdown, baseDir, opts = {}) {
    const text = String(markdown || "");
    if (!text.trim())
        throw new Error("الملف فاضي");

    // اقرا كل حقول الترويسة مش name/description بس
    const extras = {};
    let name = opts.name || "";
    let description = "";
    let body = text;
    const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
    if (m) {
        body = text.slice(m[0].length);
        for (const line of m[1].split(/\r?\n/)) {
            const kv = /^\s*([A-Za-z_-]+)\s*:\s*(.*)$/.exec(line);
            if (!kv)
                continue;
            const key = kv[1].toLowerCase();
            const val = kv[2].trim().replace(/^["']|["']$/g, "");
            if (!val)
                continue;
            if (key === "name" && !opts.name)
                name = val;
            else if (key === "description")
                description = val;
            else
                extras[key] = val;
        }
    }

    // مفيش اسم في الترويسة؟ خده من أول عنوان # أو من اسم الملف
    if (!name) {
        const h = /^#\s+(.+)$/m.exec(body);
        name = (h ? h[1] : opts.fallbackName || "imported-skill").trim();
    }
    // الاسم بيتحوّل لصيغة صالحة كاسم مجلد
    name = name.toLowerCase().replace(/[^a-z0-9-]+/g, "-")
               .replace(/^-+|-+$/g, "").slice(0, 60) || "imported-skill";

    if (!description) {
        const firstPara = body.split(/\n\s*\n/).map(x => x.trim())
                              .find(x => x && !x.startsWith("#"));
        description = (firstPara || "").replace(/\s+/g, " ").slice(0, 160);
    }

    // سجّل المصدر عشان تعرف المهارة دي جات منين
    const meta = Object.entries(extras)
        .map(([k, v]) => `${k}: ${v}`).join(" · ");
    const header = meta ? `<!-- مستوردة — ${meta} -->\n\n` : "";

    const file = writeSkill(baseDir, name, description, header + body.trim());
    return { file, name, description, extras };
}
