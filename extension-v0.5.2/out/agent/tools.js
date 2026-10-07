"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.TOOL_DEFS = void 0;
exports.executeTool = executeTool;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
exports.TOOL_DEFS = [
    {
        name: 'read_file',
        description: 'Read the contents of a file in the workspace. Returns up to 2000 lines unless a range is provided.',
        input_schema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Workspace-relative or absolute file path' },
                start_line: { type: 'number', description: '1-indexed line to start reading from' },
                line_count: { type: 'number', description: 'Number of lines to read (default 2000)' },
            },
            required: ['path'],
        },
    },
    {
        name: 'write_file',
        description: 'Create a new file or completely overwrite an existing file. Prefer edit_file for modifying existing files.',
        input_schema: {
            type: 'object',
            properties: {
                path: { type: 'string' },
                content: { type: 'string' },
            },
            required: ['path', 'content'],
        },
    },
    {
        name: 'edit_file',
        description: 'Perform an exact string replacement in an existing file. old_string must match exactly once unless replace_all is true.',
        input_schema: {
            type: 'object',
            properties: {
                path: { type: 'string' },
                old_string: { type: 'string' },
                new_string: { type: 'string' },
                replace_all: { type: 'boolean' },
            },
            required: ['path', 'old_string', 'new_string'],
        },
    },
    {
        name: 'list_dir',
        description: 'List the entries of a directory (non-recursive).',
        input_schema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Directory path (default: workspace root)' },
            },
        },
    },
    {
        name: 'search',
        description: 'Search for a regex pattern in workspace files. Returns up to 100 matches with file paths and line numbers.',
        input_schema: {
            type: 'object',
            properties: {
                pattern: { type: 'string', description: 'Regex pattern' },
                glob: { type: 'string', description: 'Optional file glob filter, e.g. **/*.ts' },
            },
            required: ['pattern'],
        },
    },
    {
        name: 'run_command',
        description: 'Execute a shell command in the workspace root. Use for builds, tests, package installs, git operations. The user must approve unless auto-approved.',
        input_schema: {
            type: 'object',
            properties: {
                command: { type: 'string' },
                timeout_ms: { type: 'number', description: 'Default 120000' },
            },
            required: ['command'],
        },
    },
    {
        name: 'search_knowledge',
        description: 'Semantic search over the local knowledge base built from previously fetched web pages. Returns top matching chunks with their source URLs. Always try this BEFORE web_research.',
        input_schema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Natural-language query' },
                limit: { type: 'number', description: 'Max results (default 5)' },
            },
            required: ['query'],
        },
    },
    {
        name: 'web_research',
        description: 'Search DuckDuckGo for a topic, fetch the top pages, and add them to the knowledge base. Returns a brief report. Use only when search_knowledge does not return enough info.',
        input_schema: {
            type: 'object',
            properties: {
                topic: { type: 'string', description: 'Topic or query to research' },
            },
            required: ['topic'],
        },
    },
];
function resolvePath(ctx, p) {
    return path.isAbsolute(p) ? p : path.join(ctx.workspaceRoot, p);
}
function toUri(p) {
    return vscode.Uri.file(p);
}
async function readFile(ctx, input) {
    const file = resolvePath(ctx, String(input.path));
    const bytes = await vscode.workspace.fs.readFile(toUri(file));
    const text = new TextDecoder().decode(bytes);
    const lines = text.split('\n');
    const start = Math.max(1, Number(input.start_line ?? 1));
    const count = Math.max(1, Number(input.line_count ?? 2000));
    const slice = lines.slice(start - 1, start - 1 + count);
    const numbered = slice.map((l, i) => `${(start + i).toString().padStart(5)}\t${l}`).join('\n');
    const header = `[${path.relative(ctx.workspaceRoot, file) || file}] lines ${start}-${start + slice.length - 1} of ${lines.length}`;
    return { content: `${header}\n${numbered}` };
}
// Apply a change VISIBLY: open the file in an editor tab and replace its
// content in front of the user, then save. (Not a silent fs write.)
async function applyVisibleWrite(file, newContent) {
    const uri = toUri(file);
    let exists = true;
    try {
        await vscode.workspace.fs.stat(uri);
    }
    catch {
        exists = false;
    }
    if (!exists) {
        await vscode.workspace.fs.createDirectory(toUri(path.dirname(file)));
        await vscode.workspace.fs.writeFile(uri, new Uint8Array());
    }
    const doc = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(doc, { preview: false });
    const fullRange = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
    await editor.edit((eb) => eb.replace(fullRange, newContent));
    await doc.save();
}
async function writeFile(ctx, input) {
    const file = resolvePath(ctx, String(input.path));
    const content = String(input.content ?? '');
    const ok = await ctx.confirm('write_file', `Write ${path.relative(ctx.workspaceRoot, file) || file}`, content.slice(0, 400), input);
    if (!ok)
        return { content: 'User declined write_file', is_error: true };
    await applyVisibleWrite(file, content);
    return { content: `Wrote ${content.length} bytes to ${path.relative(ctx.workspaceRoot, file) || file} (opened in editor)` };
}
async function editFile(ctx, input) {
    const file = resolvePath(ctx, String(input.path));
    const oldStr = String(input.old_string ?? '');
    const newStr = String(input.new_string ?? '');
    const replaceAll = Boolean(input.replace_all);
    if (!oldStr)
        return { content: 'old_string is required', is_error: true };
    const bytes = await vscode.workspace.fs.readFile(toUri(file));
    const text = new TextDecoder().decode(bytes);
    if (!replaceAll) {
        const idx = text.indexOf(oldStr);
        if (idx === -1)
            return { content: 'old_string not found', is_error: true };
        if (text.indexOf(oldStr, idx + oldStr.length) !== -1) {
            return { content: 'old_string matches multiple locations; provide more context or use replace_all', is_error: true };
        }
    }
    const ok = await ctx.confirm('edit_file', `Edit ${path.relative(ctx.workspaceRoot, file) || file}`, `- ${oldStr.slice(0, 200)}\n+ ${newStr.slice(0, 200)}`, input);
    if (!ok)
        return { content: 'User declined edit_file', is_error: true };
    const updated = replaceAll ? text.split(oldStr).join(newStr) : text.replace(oldStr, newStr);
    await applyVisibleWrite(file, updated);
    return { content: `Edited ${path.relative(ctx.workspaceRoot, file) || file} (opened in editor)` };
}
async function listDir(ctx, input) {
    const dir = resolvePath(ctx, String(input.path ?? '.'));
    const entries = await vscode.workspace.fs.readDirectory(toUri(dir));
    const lines = entries
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([name, type]) => `${type === vscode.FileType.Directory ? 'd' : 'f'} ${name}`);
    return { content: `[${path.relative(ctx.workspaceRoot, dir) || '.'}]\n${lines.join('\n')}` };
}
async function search(ctx, input) {
    const pattern = String(input.pattern ?? '');
    if (!pattern)
        return { content: 'pattern is required', is_error: true };
    const glob = input.glob ? String(input.glob) : '**/*';
    const re = new RegExp(pattern);
    const uris = await vscode.workspace.findFiles(glob, '**/node_modules/**', 500);
    const hits = [];
    for (const uri of uris) {
        if (hits.length >= 100)
            break;
        try {
            const bytes = await vscode.workspace.fs.readFile(uri);
            const text = new TextDecoder().decode(bytes);
            const lines = text.split('\n');
            for (let i = 0; i < lines.length; i++) {
                if (re.test(lines[i])) {
                    hits.push(`${path.relative(ctx.workspaceRoot, uri.fsPath)}:${i + 1}: ${lines[i].slice(0, 200)}`);
                    if (hits.length >= 100)
                        break;
                }
            }
        }
        catch {
        }
    }
    return { content: hits.length ? hits.join('\n') : 'No matches' };
}
function runCommand(ctx, input) {
    return new Promise(async (resolve) => {
        const cmd = String(input.command ?? '');
        if (!cmd)
            return resolve({ content: 'command is required', is_error: true });
        const timeoutMs = Math.max(1000, Number(input.timeout_ms ?? 120_000));
        const ok = await ctx.confirm('run_command', `Run: ${cmd}`, undefined, { command: cmd });
        if (!ok)
            return resolve({ content: 'User declined run_command', is_error: true });
        ctx.log(`$ ${cmd}`);
        const child = (0, child_process_1.spawn)(cmd, {
            cwd: ctx.workspaceRoot,
            shell: true,
            env: process.env,
        });
        let stdout = '';
        let stderr = '';
        const timer = setTimeout(() => {
            child.kill('SIGTERM');
        }, timeoutMs);
        child.stdout.on('data', (d) => {
            const s = d.toString();
            stdout += s;
            ctx.log(s.trimEnd());
        });
        child.stderr.on('data', (d) => {
            const s = d.toString();
            stderr += s;
            ctx.log(s.trimEnd());
        });
        child.on('close', (code) => {
            clearTimeout(timer);
            const max = 8000;
            const out = (stdout + (stderr ? `\n[stderr]\n${stderr}` : '')).slice(-max);
            resolve({
                content: `exit ${code}\n${out}`,
                is_error: code !== 0,
            });
        });
        child.on('error', (err) => {
            clearTimeout(timer);
            resolve({ content: `spawn error: ${err.message}`, is_error: true });
        });
    });
}
async function searchKnowledge(ctx, input) {
    const query = String(input.query ?? '').trim();
    if (!query)
        return { content: 'query is required', is_error: true };
    const limit = Math.max(1, Math.min(20, Number(input.limit ?? 5)));
    let hits = [];
    try {
        const embedding = await ctx.embedder.embed(query);
        hits = ctx.kb.search(embedding, limit);
    }
    catch {
        hits = ctx.kb.textSearch(query, limit);
    }
    if (hits.length === 0) {
        hits = ctx.kb.textSearch(query, limit);
    }
    if (hits.length === 0) {
        return { content: 'No relevant entries in knowledge base. Consider web_research for this topic.' };
    }
    const parts = hits.map((h, i) => {
        const score = h.score.toFixed(3);
        return `[#${i + 1} score=${score}] ${h.record.title}\n${h.record.url}\n${h.record.content.slice(0, 1200)}`;
    });
    return { content: parts.join('\n\n---\n\n') };
}
async function webResearch(ctx, input) {
    const topic = String(input.topic ?? '').trim();
    if (!topic)
        return { content: 'topic is required', is_error: true };
    const ok = await ctx.confirm('web_research', `Research on the web: ${topic}`, undefined, input);
    if (!ok)
        return { content: 'User declined web_research', is_error: true };
    try {
        const report = await ctx.researcher.researchTopic(topic);
        const lines = [
            `Topic: ${topic}`,
            `Search results: ${report.searched}`,
            `Pages fetched: ${report.fetched}`,
            `Chunks stored: ${report.chunks}`,
        ];
        if (report.errors.length)
            lines.push(`Errors:\n- ${report.errors.slice(0, 3).join('\n- ')}`);
        lines.push('', 'Now call search_knowledge to retrieve the new content.');
        return { content: lines.join('\n') };
    }
    catch (err) {
        return { content: `Research failed: ${err?.message ?? String(err)}`, is_error: true };
    }
}
const HANDLERS = {
    read_file: readFile,
    write_file: writeFile,
    edit_file: editFile,
    list_dir: listDir,
    search,
    run_command: runCommand,
    search_knowledge: searchKnowledge,
    web_research: webResearch,
};
async function executeTool(ctx, name, input) {
    // أدوات المحرر (قراءة حالة/أخطاء + فتح ملف) — مسجّلة في موديول منفصل
    const et = require('./editorTools');
    if (et.isEditorTool(name))
        return et.executeEditorTool(ctx, name, input);
    const handler = HANDLERS[name];
    if (!handler)
        return { content: `Unknown tool: ${name}`, is_error: true };
    try {
        return await handler(ctx, input);
    }
    catch (err) {
        return { content: `Tool error: ${err?.message ?? String(err)}`, is_error: true };
    }
}
//# sourceMappingURL=tools.js.map