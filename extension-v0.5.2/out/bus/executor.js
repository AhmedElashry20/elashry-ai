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
exports.CommandBusExecutor = void 0;
/**
 * Command-bus executor: long-polls model/serve.py for commands queued from
 * external clients (mobile PWA at /mobile, Chrome popup, other web UI) and
 * runs them on this VS Code instance. The result is posted back so the
 * caller's polling loop can show it.
 *
 * Supported command types (must match serve.py COMMAND_TYPES):
 *   open_file   args.path
 *   explain     args.text                — explain selection or pasted text
 *   fix         args.text
 *   refactor    args.text
 *   run         args.command             — run an integrated-terminal command
 *   chat        args.text                — send through the chat view
 *   search_kb   args.q
 *   research    args.topic
 *   agent_act   args.task                — run agent loop on a task
 *   edit_file   args.path, args.content  — overwrite a file (with confirm)
 */
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
class CommandBusExecutor {
    host;
    log;
    chat;
    stopped = false;
    active = false;
    constructor(host, log, chat = null) {
        this.host = host;
        this.log = log;
        this.chat = chat;
    }
    // Public Hetzner deployment requires this key. Local servers ignore it.
    apiKey = (() => {
        try {
            return require('vscode').workspace.getConfiguration('elashryAi').get('model.apiKey', '') || '';
        }
        catch {
            return '';
        }
    })();
    get authHeader() { return { Authorization: `Bearer ${this.apiKey}` }; }
    start() {
        if (this.active)
            return;
        this.active = true;
        this.stopped = false;
        this.loop().catch((e) => this.log(`[bus] loop crash: ${e?.message}`));
        this.log(`[bus] executor started -> ${this.host}/commands/next`);
    }
    stop() {
        this.stopped = true;
        this.active = false;
    }
    async loop() {
        while (!this.stopped) {
            try {
                const res = await fetch(`${this.host}/commands/next?target=vscode`, {
                    headers: this.authHeader,
                });
                if (!res.ok) {
                    await this.sleep(5000);
                    continue;
                }
                const cmd = (await res.json());
                if (!cmd || !cmd.id) {
                    // server returned {} (no work yet) — just loop again
                    continue;
                }
                const c = cmd;
                this.log(`[bus] received ${c.type} from ${c.source || 'anon'} (id=${c.id})`);
                let status = 'ok';
                let result;
                try {
                    result = await this.execute(c);
                }
                catch (e) {
                    status = 'error';
                    result = e?.message ?? String(e);
                }
                await this.postResult(c.id, status, result);
            }
            catch (e) {
                this.log(`[bus] err: ${e?.message}`);
                await this.sleep(3000);
            }
        }
    }
    async postResult(id, status, result) {
        try {
            await fetch(`${this.host}/commands/${id}/result`, {
                method: 'POST',
                headers: { ...this.authHeader, 'Content-Type': 'application/json' },
                body: JSON.stringify({ status, result }),
            });
        }
        catch (e) {
            this.log(`[bus] post result failed: ${e?.message}`);
        }
    }
    sleep(ms) {
        return new Promise((r) => setTimeout(r, ms));
    }
    async execute(c) {
        const a = c.args || {};
        switch (c.type) {
            case 'open_file': {
                const p = a.path;
                if (!p)
                    throw new Error('args.path required');
                const uri = await this.resolvePath(p);
                if (!uri)
                    throw new Error(`file not found: ${p}`);
                await vscode.window.showTextDocument(uri);
                return `Opened ${uri.fsPath}`;
            }
            case 'explain':
            case 'fix':
            case 'refactor': {
                const text = a.text || this.activeSelection();
                if (!text)
                    throw new Error('no text provided and no active selection');
                // Pipe through the chat view if available, else just acknowledge.
                if (this.chat) {
                    const prompt = c.type === 'explain'
                        ? `اشرح الكود ده بإيجاز:\n\n${text}`
                        : c.type === 'fix'
                            ? `صلّح المشاكل في الكود ده وارجعلي النسخه المعدّله:\n\n${text}`
                            : `أعد كتابة الكود ده بشكل أنضف:\n\n${text}`;
                    const reply = await this.chat.send(prompt);
                    return reply || '(no reply)';
                }
                return `Routed ${c.type} to chat (length ${text.length})`;
            }
            case 'chat': {
                const t = a.text;
                if (!t)
                    throw new Error('args.text required');
                if (this.chat) {
                    const reply = await this.chat.send(t);
                    return reply || '(no reply)';
                }
                return 'chat view not attached';
            }
            case 'run': {
                const cmd = a.command;
                if (!cmd)
                    throw new Error('args.command required');
                const term = vscode.window.activeTerminal ?? vscode.window.createTerminal('Elashry AI bus');
                term.show(true);
                term.sendText(String(cmd));
                return `Sent to terminal: ${cmd}`;
            }
            case 'search_kb': {
                await vscode.commands.executeCommand('elashryAi.kb.status');
                return `Triggered KB status (query ignored — see chat for search)`;
            }
            case 'research': {
                if (!a.topic)
                    throw new Error('args.topic required');
                await vscode.commands.executeCommand('elashryAi.research.addTopic', a.topic);
                return `Added research topic: ${a.topic}`;
            }
            case 'agent_act': {
                await vscode.commands.executeCommand('elashryAi.agent.act', a.task);
                return `Triggered agent on task: ${a.task ?? '(none)'}`;
            }
            case 'edit_file': {
                if (!a.path || a.content === undefined) {
                    throw new Error('args.path and args.content required');
                }
                const uri = await this.resolvePath(a.path);
                if (!uri)
                    throw new Error(`file not found: ${a.path}`);
                const ok = await vscode.window.showWarningMessage(`Remote command from ${c.source} wants to overwrite ${uri.fsPath}. Allow?`, { modal: true }, 'Allow', 'Deny');
                if (ok !== 'Allow')
                    return 'denied by user';
                fs.writeFileSync(uri.fsPath, String(a.content), 'utf8');
                return `Wrote ${a.content.length} chars to ${uri.fsPath}`;
            }
            case 'create_file': {
                const ws = this.workspaceRoot();
                if (!ws)
                    throw new Error('no workspace open');
                const rel = a.path;
                if (!rel)
                    throw new Error('args.path required');
                const full = path.isAbsolute(rel) ? rel : path.join(ws, rel);
                if (fs.existsSync(full))
                    throw new Error(`already exists: ${full}`);
                fs.mkdirSync(path.dirname(full), { recursive: true });
                fs.writeFileSync(full, String(a.content ?? ''), 'utf8');
                const doc = await vscode.workspace.openTextDocument(full);
                await vscode.window.showTextDocument(doc);
                return `Created ${full}`;
            }
            case 'delete_file': {
                const uri = await this.resolvePath(a.path);
                if (!uri)
                    throw new Error(`file not found: ${a.path}`);
                const ok = await vscode.window.showWarningMessage(`Delete ${uri.fsPath}?`, { modal: true }, 'Delete', 'Cancel');
                if (ok !== 'Delete')
                    return 'cancelled';
                await vscode.workspace.fs.delete(uri, { useTrash: true });
                return `Deleted (moved to trash): ${uri.fsPath}`;
            }
            case 'list_workspace': {
                const ws = this.workspaceRoot();
                if (!ws)
                    throw new Error('no workspace open');
                const pattern = a.pattern || '**/*';
                const max = Number(a.max || 200);
                const found = await vscode.workspace.findFiles(pattern, '**/node_modules/**', max);
                return found.map((u) => path.relative(ws, u.fsPath)).join('\n') || '(empty)';
            }
            case 'search_code': {
                const q = a.q;
                if (!q)
                    throw new Error('args.q required');
                // Use ripgrep-like search via VS Code's findFiles + readFile, or trigger UI search
                await vscode.commands.executeCommand('workbench.action.findInFiles', { query: String(q) });
                return `Opened search for: ${q}`;
            }
            case 'open_terminal': {
                const term = vscode.window.createTerminal(String(a.name || 'Elashry AI'));
                term.show(true);
                if (a.command)
                    term.sendText(String(a.command));
                return `Opened terminal${a.command ? ` and ran: ${a.command}` : ''}`;
            }
            case 'git_status': {
                return await this.runGit(['status', '--short', '--branch']);
            }
            case 'git_diff': {
                return await this.runGit(['diff', '--stat']);
            }
            case 'git_commit': {
                const msg = a.message;
                if (!msg)
                    throw new Error('args.message required');
                await this.runGit(['add', '-A']);
                return await this.runGit(['commit', '-m', String(msg)]);
            }
            case 'show_problems': {
                const all = vscode.languages.getDiagnostics();
                const lines = [];
                for (const [uri, diags] of all) {
                    for (const d of diags) {
                        lines.push(`${path.basename(uri.fsPath)}:${d.range.start.line + 1}  [${vscode.DiagnosticSeverity[d.severity]}]  ${d.message}`);
                    }
                }
                return lines.slice(0, 50).join('\n') || '(no problems)';
            }
            case 'format_doc': {
                const ed = vscode.window.activeTextEditor;
                if (!ed)
                    throw new Error('no active editor');
                await vscode.commands.executeCommand('editor.action.formatDocument');
                return `Formatted ${path.basename(ed.document.fileName)}`;
            }
            case 'ingest_file': {
                // Hook for RAG: ingest file content into the KB so future questions
                // can retrieve relevant chunks instead of stuffing the whole file.
                // The actual KB.add() call is owned by the extension's main module;
                // here we accept content and the extension's chat hook can decide
                // whether to embed it.
                if (!a.content)
                    throw new Error('args.content required');
                return `Received ${a.content.length} chars for KB ingest (path=${a.path ?? 'unknown'})`;
            }
            default:
                throw new Error(`unknown command type: ${c.type}`);
        }
    }
    activeSelection() {
        const ed = vscode.window.activeTextEditor;
        if (!ed)
            return '';
        const sel = ed.selection;
        return ed.document.getText(sel.isEmpty ? undefined : sel);
    }
    async resolvePath(p) {
        if (path.isAbsolute(p) && fs.existsSync(p))
            return vscode.Uri.file(p);
        const folders = vscode.workspace.workspaceFolders ?? [];
        for (const f of folders) {
            const abs = path.join(f.uri.fsPath, p);
            if (fs.existsSync(abs))
                return vscode.Uri.file(abs);
        }
        // Last resort: search workspace by filename
        const matches = await vscode.workspace.findFiles(`**/${p}`, '**/node_modules/**', 1);
        return matches[0] ?? null;
    }
    workspaceRoot() {
        return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null;
    }
    async runGit(args) {
        const ws = this.workspaceRoot();
        if (!ws)
            throw new Error('no workspace open');
        const cp = await Promise.resolve().then(() => __importStar(require('child_process')));
        return await new Promise((resolve, reject) => {
            cp.execFile('git', args, { cwd: ws, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
                if (err && !stdout)
                    return reject(new Error(stderr || err.message));
                resolve((stdout || stderr || '').trim() || '(no output)');
            });
        });
    }
}
exports.CommandBusExecutor = CommandBusExecutor;
//# sourceMappingURL=executor.js.map