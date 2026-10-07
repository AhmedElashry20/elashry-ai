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
        });
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
        }
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
  <textarea id="input" rows="3" placeholder="Ask Elashry AI..."></textarea>
  <div class="row">
    <button id="send">Send</button>
    <button id="cancel" class="ghost">Stop</button>
    <button id="reset" class="ghost">Reset</button>
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