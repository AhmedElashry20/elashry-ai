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
exports.ChatViewProvider = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const loop_1 = require("../agent/loop");
const config_1 = require("../config");
const skills_1 = require("../skills/store");
const permissions_1 = require("../agent/permissions");
const sessions_1 = require("../sessions/store");
class ChatViewProvider {
    ctx;
    deps;
    static viewType = 'elashryAi.chatView';
    view;
    agent;
    abortCtrl;
    sessionApprovals = new Set();
    constructor(ctx, deps) {
        this.ctx = ctx;
        this.deps = deps;
    }
    resolveWebviewView(view) {
        this.view = view;
        view.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.file(path.join(this.ctx.extensionPath, 'media'))],
        };
        view.webview.html = this.html(view.webview);
        view.webview.onDidReceiveMessage(async (msg) => {
            if (msg.type === 'send' && msg.text) {
                await this.handleSend(msg.text);
            }
            else if (msg.type === 'cancel') {
                this.abortCtrl?.abort();
            }
            else if (msg.type === 'reset') {
                this.agent?.reset();
                this.sessionApprovals.clear();
                this.post({ type: 'reset' });
            }
            else if (msg.type === 'ready') {
                this.pushStatus();
            }
            else if (msg.type === 'need_skills') {
                const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
                let items = [], goals = [];
                try {
                    items = (0, skills_1.listSkills)(root).map(s => ({ name: s.name, description: s.description }));
                }
                catch { }
                try {
                    const fs = require('fs'), path2 = require('path');
                    goals = fs.readdirSync(path2.join(root, '.elashry', 'goals'))
                        .filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, ''));
                }
                catch { }
                this.post({ type: 'skills', items, goals });
            }
            else if (msg.type === 'need_sessions') {
                this.post({ type: 'sessions', items: sessions_1.list(this.ctx.globalStorageUri.fsPath) });
            }
            else if (msg.type === 'resume' && msg.id) {
                await this.resumeSession(msg.id);
            }
            else if (msg.type === 'new_session') {
                this.newSession();
            }
            else if (msg.type === 'run_goal' && msg.name) {
                const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
                try {
                    const fs = require('fs'), path2 = require('path');
                    const g = require('../agent/goal').parseGoalFile(
                        fs.readFileSync(path2.join(root, '.elashry', 'goals', `${msg.name}.json`), 'utf8'));
                    await this.runGoal(g);
                }
                catch (e) {
                    this.post({ type: 'error', text: `الهدف ${msg.name}: ${e?.message ?? e}` });
                }
            }
            else if (msg.type === 'need_models') {
                this.post({ type: 'models', items: await this.listModels() });
            }
            else if (msg.type === 'set_model' && msg.model) {
                await vscode.workspace.getConfiguration('elashryAi').update('model.chatModel', msg.model, true);
                this.agent = undefined;   // يتبني من جديد بالموديل الجديد
                this.pushStatus();
            }
            else if (msg.type === 'set_mode' && msg.mode) {
                await vscode.workspace.getConfiguration('elashryAi').update('agent.permissionMode', msg.mode, true);
                this.pushStatus();
            }
            else if (msg.type === 'ctx' && msg.what) {
                this.insertContext(msg.what);
            }
        });
    }
    // بيبعت الموديل ووضع الأذونات الحاليين للواجهة
    pushStatus() {
        const cfg = vscode.workspace.getConfiguration('elashryAi');
        this.post({
            type: 'status',
            model: cfg.get('model.chatModel', 'auto'),
            mode: cfg.get('agent.permissionMode', 'approve'),
        });
    }
    // قائمة الموديلات من السيرفر (OmniRoute بيرجّع /v1/models)
    async listModels() {
        const host = vscode.workspace.getConfiguration('elashryAi')
            .get('model.host', 'http://localhost:11435').replace(/\/$/, '');
        const fallback = ['auto'];
        try {
            const res = await fetch(`${host}/v1/models`, { signal: AbortSignal.timeout(8000) });
            if (!res.ok)
                return fallback;
            const j = await res.json();
            const ids = (j.data || []).map(x => x.id).filter(Boolean);
            // auto دايمًا الأول — هي الافتراضية والأسرع
            return ['auto', ...ids.filter(x => x !== 'auto')].slice(0, 120);
        }
        catch {
            return fallback;
        }
    }
    // بيحط سياق من المحرر في الشات من غير ما المستخدم ينسخ ويلزق
    insertContext(what) {
        const ed = vscode.window.activeTextEditor;
        if (what === 'problems') {
            const lines = [];
            for (const [uri, diags] of vscode.languages.getDiagnostics()) {
                for (const d of diags) {
                    if (d.severity !== vscode.DiagnosticSeverity.Error)
                        continue;
                    lines.push(`${vscode.workspace.asRelativePath(uri)}:${d.range.start.line + 1} ${d.message}`);
                }
            }
            if (!lines.length)
                return this.post({ type: 'text_delta', text: '\n[مفيش أخطاء ظاهرة]\n' });
            return this.handleSend(`دي أخطاء المحرر، صلّحها:\n${lines.slice(0, 60).join('\n')}`);
        }
        if (!ed)
            return this.post({ type: 'text_delta', text: '\n[مفيش ملف مفتوح]\n' });
        const rel = vscode.workspace.asRelativePath(ed.document.uri);
        if (what === 'selection') {
            const sel = ed.document.getText(ed.selection);
            if (!sel.trim())
                return this.post({ type: 'text_delta', text: '\n[مفيش نص محدّد]\n' });
            return this.handleSend(`في الملف ${rel}:\n\n${sel}`);
        }
        return this.handleSend(`بص على الملف ${rel} (اقراه بـ read_file).`);
    }
    // بتستخدمها الأتمتة المجدولة عشان تبعت أمر من غير ما المستخدم يكتب
    async sendProgrammatic(text) {
        return this.handleSend(text);
    }
    // بيبني الإيجنت (أو يرجّع الموجود). مفصول عن handleSend عشان الأهداف تستخدمه كمان.
    ensureAgent(workspaceRoot, skillGuidance) {
        if (this.agent && this.lastSkillGuidance !== skillGuidance) {
            this.agent = undefined;
        }
        this.lastSkillGuidance = skillGuidance;
        if (!this.agent) {
            this.agent = new loop_1.Agent({
                llm: this.deps.llm,
                toolContext: {
                    workspaceRoot,
                    kb: this.deps.kb,
                    embedder: this.deps.embedder,
                    researcher: this.deps.researcher,
                    log: this.deps.log,
                    confirm: async (t, sum, det, inp) => this.confirmTool(t, sum, det, inp),
                },
                maxIterations: (0, config_1.getMaxIterations)(),
                systemPromptExtra: skillGuidance || undefined,
            });
        }
        return this.agent;
    }
    /**
     * بيشغّل هدف: الإيجنت بيلف، وبعد كل جولة بنفحص معايير القبول،
     * واللي بيقع بيرجعله كبرومبت الجولة الجاية. بيقف لما كله يعدّي.
     */
    async runGoal(goal) {
        const goalMod = require('../agent/goal');
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
            ?? this.ctx.globalStorageUri.fsPath;
        this.reveal();
        this.abortCtrl = new AbortController();
        const signal = this.abortCtrl.signal;
        const agent = this.ensureAgent(workspaceRoot, this.lastSkillGuidance || '');
        const runner = (prompt, sig) => agent.run(prompt, { signal: sig });
        this.post({ type: 'user_message', text: `🎯 هدف: ${goal.prompt}` });
        this.post({ type: 'assistant_start' });
        try {
            for await (const ev of goalMod.runGoal(goal, { workspaceRoot, agentRunner: runner, signal })) {
                if (ev.type === 'goal_round')
                    this.post({ type: 'text_delta', text: `\n\n── جولة ${ev.round}/${ev.maxRounds} ──\n` });
                else if (ev.type === 'goal_checking')
                    this.post({ type: 'text_delta', text: `\n\n[بفحص معايير القبول...]\n` });
                else if (ev.type === 'goal_check')
                    this.post({ type: 'text_delta', text: `${ev.ok ? '  ✓' : '  ✗'} ${ev.detail}\n` });
                else if (ev.type === 'goal_warning')
                    this.post({ type: 'text_delta', text: `\n⚠️ ${ev.text}\n` });
                else if (ev.type === 'goal_done') {
                    const msg = { passed: '✓ الهدف اتحقق', max_rounds: '✗ خلصت الجولات والهدف ما اتحققش',
                        aborted: '⏹ اتوقف', no_criteria: 'خلص (مفيش معايير)' }[ev.reason] ?? ev.reason;
                    this.post({ type: 'text_delta', text: `\n\n${msg} — بعد ${ev.round} جولة\n` });
                    this.deps.log?.(`[goal] ${ev.reason} بعد ${ev.round} جولة`);
                }
                else
                    this.forward(ev);
            }
        }
        catch (err) {
            this.post({ type: 'error', text: err?.message ?? String(err) });
        }
        finally {
            this.post({ type: 'assistant_end' });
        }
    }
    async handleSend(text) {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? this.ctx.globalStorageUri.fsPath;
        // isAvailable check removed — the actual chat call surfaces real errors,
        // and the pre-check was masking connectivity issues silently.
        // --- المهارات: $اسم بيحمّل إرشادات المهارة ويشيلها من نص المستخدم ---
        let skillGuidance = '';
        try {
            const all = (0, skills_1.listSkills)(workspaceRoot);
            const used = (0, skills_1.findMentioned)(text, all);
            if (used.length) {
                skillGuidance = (0, skills_1.buildGuidance)(used);
                text = (0, skills_1.stripMentions)(text, used) || text;
                this.post({ type: 'text_delta', text: `\n[مهارات مفعّلة: ${used.map(u => u.name).join('، ')}]\n` });
            }
        }
        catch (e) {
            this.deps.log?.(`skills: ${e?.message ?? e}`);
        }
        if (this.agent && this.lastSkillGuidance !== skillGuidance) {
            this.agent = undefined; // الإرشادات اتغيّرت — نعيد بناء الإيجنت
        }
        this.lastSkillGuidance = skillGuidance;
        if (!this.agent) {
            const toolCtx = {
                workspaceRoot,
                kb: this.deps.kb,
                embedder: this.deps.embedder,
                researcher: this.deps.researcher,
                log: this.deps.log,
                confirm: async (toolName, summary, detail, input) => this.confirmTool(toolName, summary, detail, input),
            };
            this.agent = new loop_1.Agent({
                llm: this.deps.llm,
                toolContext: toolCtx,
                maxIterations: (0, config_1.getMaxIterations)(),
                systemPromptExtra: skillGuidance || undefined,
            });
        }
        this.abortCtrl = new AbortController();
        this.post({ type: 'user_message', text });
        this.post({ type: 'assistant_start' });
        try {
            for await (const ev of this.agent.run(text, { signal: this.abortCtrl.signal })) {
                this.forward(ev);
            }
        }
        catch (err) {
            this.post({ type: 'error', text: err?.message ?? String(err) });
        }
        finally {
            this.post({ type: 'assistant_end' });
            this.persist();
        }
    }
    // بيحفظ المحادثة الحالية بعد كل دور. الـ id بيتولّد مرة واحدة لكل محادثة.
    persist() {
        try {
            const msgs = this.agent?.messages;
            if (!msgs || !msgs.length)
                return;
            if (!this.sessionId)
                this.sessionId = sessions_1.newId();
            sessions_1.save(this.ctx.globalStorageUri.fsPath, this.sessionId, msgs, this.sessionTitle);
        }
        catch (e) {
            this.deps.log?.(`sessions: ${e?.message ?? e}`);
        }
    }
    // بيرجّع محادثة قديمة: بيحمّل الـ history جوّه الإيجنت ويعرضها في الشات
    async resumeSession(id) {
        const blob = sessions_1.load(this.ctx.globalStorageUri.fsPath, id);
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
            ?? this.ctx.globalStorageUri.fsPath;
        this.agent = undefined;                       // نعيد بناءه عشان ناخد history نضيف
        const agent = this.ensureAgent(workspaceRoot, '');
        agent.reset();
        for (const m of blob.messages || [])
            agent.messages.push(m);
        this.sessionId = blob.id;
        this.sessionTitle = blob.title;
        this.reveal();
        this.post({ type: 'reset' });
        // نعرض المحادثة القديمة في الواجهة
        for (const m of blob.messages || []) {
            const blocks = Array.isArray(m.content) ? m.content : [];
            const text = blocks.filter(b => b.type === 'text').map(b => b.text).join('');
            if (!text.trim())
                continue;
            if (m.role === 'user')
                this.post({ type: 'user_message', text });
            else {
                this.post({ type: 'assistant_start' });
                this.post({ type: 'text_delta', text });
                this.post({ type: 'assistant_end' });
            }
        }
        this.post({ type: 'text_delta', text: `\n[رجعنا لمحادثة: ${blob.title}]\n` });
    }
    // محادثة جديدة — بتسيب القديمة محفوظة
    newSession() {
        this.persist();
        this.agent?.reset();
        this.sessionId = undefined;
        this.sessionTitle = undefined;
        this.post({ type: 'reset' });
    }
    forward(ev) {
        if (ev.type === 'text') {
            this.post({ type: 'text_delta', text: ev.text });
        }
        else if (ev.type === 'tool_call') {
            this.post({ type: 'tool_call', name: ev.name, input: ev.input });
        }
        else if (ev.type === 'tool_result') {
            this.post({
                type: 'tool_result',
                name: ev.name,
                content: ev.content.slice(0, 4000),
                is_error: ev.is_error,
            });
        }
        else if (ev.type === 'iteration') {
            this.post({ type: 'iteration', index: ev.index });
        }
        else if (ev.type === 'done') {
            this.post({ type: 'done', reason: ev.reason, error: ev.error });
        }
    }
    post(msg) {
        this.view?.webview.postMessage(msg);
    }
    async confirmTool(toolName, summary, detail, input) {
        const auto = (0, config_1.getAutoApprove)();
        const mode = vscode.workspace.getConfiguration('elashryAi').get('agent.permissionMode', 'approve');
        const verdict = (0, permissions_1.decide)(mode, toolName, input, auto);
        if (verdict === 'allow')
            return true;
        if (verdict === 'deny') {
            this.deps.log?.(`[أذونات] اترفض تلقائيًا: ${toolName} — ${summary}`);
            this.post({ type: 'text_delta', text: `\n[اترفض: أمر خطر — ${summary}]\n` });
            return false;
        }
        if (this.sessionApprovals.has(toolName))
            return true;
        const items = ['Approve', 'Approve all in session', 'Deny'];
        const pick = await vscode.window.showWarningMessage(`Elashry AI wants to run: ${toolName}\n${summary}`, { modal: false, detail }, ...items);
        if (pick === 'Approve all in session') {
            this.sessionApprovals.add(toolName);
            return true;
        }
        return pick === 'Approve';
    }
    reveal() {
        if (this.view)
            this.view.show?.(true);
        else
            vscode.commands.executeCommand('workbench.view.extension.elashryAi');
    }
    html(webview) {
        const nonce = getNonce();
        const mediaUri = (file) => webview.asWebviewUri(vscode.Uri.file(path.join(this.ctx.extensionPath, 'media', file)));
        const csp = `default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};`;
        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<link rel="stylesheet" href="${mediaUri('chat.css')}">
<title>Elashry AI</title>
</head>
<body>
<div id="messages"></div>
<div id="composer">
  <div class="menu" id="menu" hidden></div>
  <div class="input-row">
    <textarea id="input" rows="1" placeholder="اكتب رسالة…"></textarea>
    <button class="ico" id="mic" title="إملاء صوتي (زرار الإملاء في ماك: Fn مرتين)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v3"/></svg>
    </button>
  </div>
  <div class="bar">
    <button class="ico" id="btn-plus" title="أضف سياق: ملف مفتوح أو التحديد">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
    </button>
    <button class="ico" id="btn-slash" title="المهارات والأهداف">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M14 8l-4 8"/></svg>
    </button>
    <span class="ico" id="idle-dot" title="جاهز">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/></svg>
    </span>
    <span class="ico on" id="busy" title="شغال">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path class="spin" d="M12 3a9 9 0 1 0 9 9"/></svg>
    </span>
    <button class="chip ghost" id="btn-hist" title="المحادثات المحفوظة">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
      <span id="elapsed">0m</span>
    </button>
    <button class="chip" id="btn-model" title="اختار الموديل"><b id="model-name">auto</b></button>
    <span class="spacer"></span>
    <button class="chip ghost" id="btn-mode" title="وضع الأذونات">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/></svg>
      <span id="mode-name">Auto</span>
    </button>
    <button id="send" title="إرسال (Enter)">
      <svg id="ic-send" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
      <svg id="ic-stop" viewBox="0 0 24 24" fill="currentColor" hidden><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
    </button>
  </div>
</div>
<script nonce="${nonce}" src="${mediaUri('chat.js')}"></script>
</body>
</html>`;
    }
}
exports.ChatViewProvider = ChatViewProvider;
function getNonce() {
    let text = '';
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++)
        text += chars.charAt(Math.floor(Math.random() * chars.length));
    return text;
}
//# sourceMappingURL=chatPanel.js.map