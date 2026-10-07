"use strict";
// أدوات قراءة حالة المحرر + فتح ملف.
//
// النطاق محدود عن قصد: قراءة الأخطاء، معرفة الملف المفتوح والتحديد، وفتح ملف
// على سطر. مفيش تنفيذ أوامر VS Code عشوائية هنا — التعديل على الملفات بيفضل
// ماشي على edit_file/write_file اللي عليها موافقة المستخدم في tools.js.
Object.defineProperty(exports, "__esModule", { value: true });
exports.EDITOR_TOOL_DEFS = void 0;
exports.executeEditorTool = executeEditorTool;
exports.isEditorTool = isEditorTool;

const vscode = require("vscode");
const path = require("path");

exports.EDITOR_TOOL_DEFS = [
    {
        name: "editor_state",
        description: "يرجّع الملف المفتوح حاليًا في المحرر، النص المحدّد، وقائمة الملفات المفتوحة. استعمله عشان تعرف المستخدم شغال على إيه دلوقتي.",
        input_schema: { type: "object", properties: {} },
    },
    {
        name: "editor_problems",
        description: "يرجّع أخطاء وتحذيرات المحرر (TypeScript, ESLint, إلخ) زي ما هي ظاهرة في تبويب Problems.",
        input_schema: {
            type: "object",
            properties: {
                path: { type: "string", description: "ملف معيّن (اختياري — الافتراضي كل المشروع)" },
                severity: { type: "string", description: "error (افتراضي) أو warning أو all" },
                limit: { type: "number", description: "أقصى عدد سطور (افتراضي 100)" },
            },
        },
    },
    {
        name: "editor_open",
        description: "يفتح ملف في المحرر قدام المستخدم، مع إمكانية الوقوف على سطر. للعرض بس — مش بيعدّل حاجة.",
        input_schema: {
            type: "object",
            properties: {
                path: { type: "string", description: "مسار نسبي للمشروع أو مطلق" },
                line: { type: "number", description: "رقم السطر (يبدأ من 1)" },
            },
            required: ["path"],
        },
    },
];

const NAMES = new Set(exports.EDITOR_TOOL_DEFS.map(t => t.name));
function isEditorTool(name) {
    return NAMES.has(name);
}

const SEV = ["error", "warning", "info", "hint"];

async function executeEditorTool(ctx, name, input) {
    try {
        if (name === "editor_state") {
            const open = vscode.workspace.textDocuments
                .filter(d => d.uri.scheme === "file" && !d.isClosed)
                .map(d => vscode.workspace.asRelativePath(d.uri));
            const out = [`الملفات المفتوحة (${open.length}): ${open.slice(0, 40).join(", ") || "مفيش"}`];
            const ed = vscode.window.activeTextEditor;
            if (!ed) {
                out.push("مفيش محرر نشط");
            }
            else {
                out.push(`النشط: ${vscode.workspace.asRelativePath(ed.document.uri)} (${ed.document.lineCount} سطر)`);
                out.push(`المؤشر عند السطر ${ed.selection.active.line + 1}`);
                const sel = ed.document.getText(ed.selection);
                out.push(sel.trim()
                    ? `المحدّد (${sel.length} حرف):\n${sel.slice(0, 3000)}`
                    : "مفيش نص محدّد");
            }
            return { content: out.join("\n") };
        }

        if (name === "editor_problems") {
            const want = String(input.severity || "error").toLowerCase();
            const limit = Math.max(1, Number(input.limit ?? 100));
            let pairs;
            if (input.path) {
                const full = path.isAbsolute(input.path)
                    ? input.path
                    : path.join(ctx.workspaceRoot, input.path);
                const uri = vscode.Uri.file(full);
                pairs = [[uri, vscode.languages.getDiagnostics(uri)]];
            }
            else {
                pairs = vscode.languages.getDiagnostics();
            }
            const lines = [];
            for (const [uri, diags] of pairs) {
                for (const d of diags) {
                    const sev = SEV[d.severity] || "info";
                    if (want !== "all" && sev !== want)
                        continue;
                    lines.push(`${vscode.workspace.asRelativePath(uri)}:${d.range.start.line + 1} [${sev}] ${d.message}`);
                    if (lines.length >= limit)
                        break;
                }
                if (lines.length >= limit)
                    break;
            }
            return { content: lines.length ? lines.join("\n") : `مفيش ${want === "all" ? "تشخيصات" : want}` };
        }

        if (name === "editor_open") {
            const p = String(input.path || "");
            if (!p)
                return { content: "path مطلوب", is_error: true };
            const full = path.isAbsolute(p) ? p : path.join(ctx.workspaceRoot, p);
            // ما نفتحش حاجة بره مجلد المشروع
            const rel = path.relative(ctx.workspaceRoot, full);
            if (rel.startsWith("..") || path.isAbsolute(rel))
                return { content: "الملف بره مجلد المشروع — مرفوض", is_error: true };
            const doc = await vscode.workspace.openTextDocument(full);
            const ed = await vscode.window.showTextDocument(doc, { preview: true });
            if (typeof input.line === "number") {
                const ln = Math.max(0, Math.min(doc.lineCount - 1, input.line - 1));
                const pos = new vscode.Position(ln, 0);
                ed.selection = new vscode.Selection(pos, pos);
                ed.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
            }
            return { content: `فتحت ${vscode.workspace.asRelativePath(doc.uri)}${input.line ? ` عند السطر ${input.line}` : ""}` };
        }

        return { content: `أداة مش معروفة: ${name}`, is_error: true };
    }
    catch (e) {
        return { content: `${name} فشلت: ${e?.message ?? e}`, is_error: true };
    }
}
