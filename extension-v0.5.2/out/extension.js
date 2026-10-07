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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const chatPanel_1 = require("./ui/chatPanel");
const client_1 = require("./drive/client");
const codeActions_1 = require("./codeActions");
const model_1 = require("./llm/model");
const embeddings_1 = require("./llm/embeddings");
const store_1 = require("./kb/store");
const queue_1 = require("./kb/queue");
const crawler_1 = require("./research/crawler");
const sources_1 = require("./research/sources");
const background_1 = require("./agent/background");
const config_1 = require("./config");
const tools_1 = require("./agent/tools");
const executor_1 = require("./bus/executor");
function activate(ctx) {
    const output = vscode.window.createOutputChannel('Elashry AI');
    ctx.subscriptions.push(output);
    const log = (line) => output.appendLine(line);
    const srvCfg = (0, config_1.getServerConfig)();
    const researchCfg = (0, config_1.getResearchConfig)();
    const storageDir = ctx.globalStorageUri.fsPath;
    const kb = new store_1.KnowledgeBase(path.join(storageDir, 'kb.jsonl'));
    const queue = new queue_1.TopicQueue(path.join(storageDir, 'topics.json'));
    log(`[activate] model.host = ${srvCfg.host}`);
    const llm = new model_1.ModelClient({ host: srvCfg.host, chatModel: srvCfg.chatModel, log });
    const embedder = new embeddings_1.Embedder({ host: srvCfg.embedHost || srvCfg.host, model: srvCfg.embedModel });
    const researcher = new crawler_1.Researcher(kb, embedder, {
        resultsPerTopic: researchCfg.resultsPerTopic,
        maxFetchBytes: researchCfg.maxFetchBytes,
        concurrency: researchCfg.concurrency,
        log,
    });
    const background = new background_1.BackgroundResearcher(queue, researcher, {
        intervalMs: researchCfg.intervalMs,
        log,
    });
    const chat = new chatPanel_1.ChatViewProvider(ctx, { llm, kb, embedder, researcher, log });
    // Command bus — relays voice/text commands from mobile PWA + Chrome popup
    // into this VS Code instance. Long-poll loop, starts on activation.
    // الـ bus بيـpoll على {host}/commands/next — ده سيرفر أوامر خارجي مش موجود
    // (لا المحوّل المحلي ولا OmniRoute بيخدموه)، فكان بيملا اللوج بـ "fetch failed"
    // كل ثانية. بقى مقفول افتراضيًا، ويتفعّل بـ elashryAi.bus.host لو فيه سيرفر فعلًا.
    const busHost = vscode.workspace.getConfiguration('elashryAi').get('bus.host', '');
    const bus = new executor_1.CommandBusExecutor(busHost || srvCfg.host, log, null);
    if (busHost) {
        bus.start();
    }
    else {
        log('[bus] مقفول (مفيش elashryAi.bus.host) — مفيش سيرفر أوامر');
    }
    ctx.subscriptions.push({ dispose: () => bus.stop() });
    // --- جدولة الأتمتة: بتتفقّد كل 5 دقايق وبتفتح الشات لأي أتمتة مستحقة ---
    {
        const au = require('./automations/store');
        const tick = () => {
            try {
                for (const a of au.dueNow(au.load(storageDir))) {
                    au.markRan(storageDir, a.id);
                    log(`[automation] ${a.name}: ${a.prompt}`);
                    chat.reveal();
                    chat.sendProgrammatic?.(a.prompt);
                }
            }
            catch (e) {
                log(`[automation] ${e?.message ?? e}`);
            }
        };
        const timer = setInterval(tick, 5 * 60_000);
        ctx.subscriptions.push({ dispose: () => clearInterval(timer) });
        setTimeout(tick, 30_000); // فحصة أولى بعد ما الإكستنشن يستقر
    }
    ctx.subscriptions.push(vscode.window.registerWebviewViewProvider(chatPanel_1.ChatViewProvider.viewType, chat, {
        webviewOptions: { retainContextWhenHidden: true },
    }), vscode.commands.registerCommand('elashryAi.openChat', () => chat.reveal()), vscode.commands.registerCommand('elashryAi.research.start', () => {
        background.start();
        vscode.window.showInformationMessage('Elashry AI: background research started');
    }), vscode.commands.registerCommand('elashryAi.research.stop', () => {
        background.stop();
        vscode.window.showInformationMessage('Elashry AI: background research stopped');
    }), vscode.commands.registerCommand('elashryAi.research.runOnce', async () => {
        const msg = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Elashry AI: researching one topic...' }, () => background.runOnce());
        vscode.window.showInformationMessage(`Elashry AI: ${msg}`);
    }), vscode.commands.registerCommand('elashryAi.research.addTopic', async () => {
        const topic = await vscode.window.showInputBox({
            prompt: 'Topic to research',
            placeHolder: 'e.g. Rust async error handling',
        });
        if (!topic)
            return;
        const added = queue.addTopic(topic);
        vscode.window.showInformationMessage(added ? `Added "${topic}" to research queue` : `"${topic}" is already in the queue`);
    }), vscode.commands.registerCommand('elashryAi.kb.status', () => {
        const s = kb.stats();
        const q = queue.counts();
        const newest = s.newest ? new Date(s.newest).toLocaleString() : 'n/a';
        vscode.window.showInformationMessage(`KB: ${s.chunks} chunks · ${s.urls} URLs · ${s.topics} topics · ${(s.fileSize / 1024).toFixed(1)} KiB · last: ${newest}. Queue: ${q.pending} pending / ${q.done} done / ${q.failed} failed.`);
    }), vscode.commands.registerCommand('elashryAi.kb.clear', async () => {
        const choice = await vscode.window.showWarningMessage('Clear the entire knowledge base?', { modal: true }, 'Clear');
        if (choice === 'Clear') {
            kb.clear();
            vscode.window.showInformationMessage('Elashry AI: knowledge base cleared');
        }
    }), vscode.commands.registerCommand('elashryAi.bulk.importCurated', async () => {
        const items = (0, sources_1.flattenSources)();
        const choice = await vscode.window.showInformationMessage(`Bulk-fetch ${items.length} curated official sources (docs + free security resources)?`, { modal: false }, 'Start', 'Cancel');
        if (choice !== 'Start')
            return;
        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Elashry AI: bulk import', cancellable: true }, async (progress, token) => {
            const ctrl = new AbortController();
            token.onCancellationRequested(() => ctrl.abort());
            const report = await researcher.bulkIngest(items, ctrl.signal, (done, total) => {
                progress.report({ message: `${done}/${total}`, increment: 100 / total });
            });
            vscode.window.showInformationMessage(`Elashry AI: imported ${report.fetched}/${report.attempted} pages · ${report.chunks} chunks · ${report.skipped} skipped · ${report.errors.length} errors`);
        });
    }), vscode.commands.registerCommand('elashryAi.bulk.importUrls', async () => {
        const raw = await vscode.window.showInputBox({
            prompt: 'Paste URLs (separated by spaces, commas, or new lines). HTML and PDF supported.',
            placeHolder: 'https://... https://... .pdf',
            ignoreFocusOut: true,
        });
        if (!raw)
            return;
        const urls = Array.from(new Set(raw.split(/[\s,]+/).map((u) => u.trim()).filter((u) => /^https?:\/\//i.test(u))));
        if (urls.length === 0) {
            vscode.window.showWarningMessage('No valid URLs found');
            return;
        }
        const topic = await vscode.window.showInputBox({
            prompt: `Label these ${urls.length} URL(s) with a topic`,
            placeHolder: 'e.g. cybersecurity books',
            value: 'user-imported',
        });
        if (!topic)
            return;
        const items = urls.map((url) => ({ url, topic }));
        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Elashry AI: fetching ${urls.length} URLs`, cancellable: true }, async (progress, token) => {
            const ctrl = new AbortController();
            token.onCancellationRequested(() => ctrl.abort());
            const report = await researcher.bulkIngest(items, ctrl.signal, (done, total) => {
                progress.report({ message: `${done}/${total}`, increment: 100 / total });
            });
            vscode.window.showInformationMessage(`Elashry AI: fetched ${report.fetched}/${report.attempted} · ${report.chunks} chunks · ${report.errors.length} errors`);
        });
    }), 
    // Brain-agnostic driver: execute an agent tool directly (no model).
    // Prove the SYSTEM enters VS Code and edits code in front of you.
    vscode.commands.registerCommand('elashryAi.skills.list', async () => {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
        const all = require('./skills/store').listSkills(root);
        if (!all.length) {
            const make = await vscode.window.showInformationMessage('مفيش مهارات لسه. أعملك مهارة تجريبية؟', 'أيوه', 'لأ');
            if (make === 'أيوه')
                await vscode.commands.executeCommand('elashryAi.skills.create');
            return;
        }
        const pick = await vscode.window.showQuickPick(all.map(x => ({ label: `$${x.name}`, description: x.scope, detail: x.description })), { placeHolder: 'المهارات المتاحة — استعملها بكتابة $الاسم في الشات' });
        if (pick)
            vscode.env.clipboard.writeText(pick.label);
    }),
    vscode.commands.registerCommand('elashryAi.skills.create', async () => {
        const store = require('./skills/store');
        const name = await vscode.window.showInputBox({ prompt: 'اسم المهارة (إنجليزي، من غير مسافات)', validateInput: v => /^[a-z0-9-]+$/i.test(v || '') ? undefined : 'حروف وأرقام و- بس' });
        if (!name)
            return;
        const description = await vscode.window.showInputBox({ prompt: 'وصف سطر واحد: المهارة دي بتعمل إيه؟' }) ?? '';
        const scope = await vscode.window.showQuickPick(['المشروع ده', 'كل المشاريع (شخصية)'], { placeHolder: 'المهارة تتحط فين؟' });
        if (!scope)
            return;
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
        const base = scope.startsWith('المشروع') ? store.projectSkillsDir(root) : store.personalSkillsDir();
        const file = store.writeSkill(base, name, description, '# إرشادات\n\nاكتب هنا الخطوات اللي الإيجنت لازم يمشي عليها لما تستعمل المهارة دي.\n');
        const doc = await vscode.workspace.openTextDocument(file);
        vscode.window.showTextDocument(doc);
    }),
    vscode.commands.registerCommand('elashryAi.goal.run', async () => {
        const goalMod = require('./agent/goal');
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
        const files = await vscode.workspace.findFiles('.elashry/goals/*.json', null, 50);
        if (!files.length) {
            vscode.window.showWarningMessage('مفيش أهداف. اعمل ملف في .elashry/goals/*.json — شوف .elashry/goals/example.json');
            return;
        }
        const pick = await vscode.window.showQuickPick(files.map(f => ({ label: f.path.split('/').pop(), uri: f })), { placeHolder: 'اختار هدف' });
        if (!pick)
            return;
        let goal;
        try {
            goal = goalMod.parseGoalFile(require('fs').readFileSync(pick.uri.fsPath, 'utf8'));
        }
        catch (e) {
            vscode.window.showErrorMessage(`ملف الهدف غلط: ${e?.message ?? e}`);
            return;
        }
        output.show(true);
        log(`[goal] ${goal.prompt}`);
        // فحص المعايير الأول — يمكن الهدف متحقق أصلًا فمانضيّعش شغل
        const pre = await goalMod.checkAll(goal.criteria ?? [], root);
        for (const r of pre.results)
            log(`[goal] ${r.ok ? '✓' : '✗'} ${r.detail}`);
        if (pre.passed && (goal.criteria ?? []).length) {
            vscode.window.showInformationMessage('الهدف متحقق بالفعل — مفيش شغل مطلوب.');
            return;
        }
        // شغّل الحلقة الفعلية في الشات
        await chat.runGoal(goal);
    }),
    vscode.commands.registerCommand('elashryAi.goal.check', async () => {
        const goalMod = require('./agent/goal');
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
        const files = await vscode.workspace.findFiles('.elashry/goals/*.json', null, 50);
        if (!files.length)
            return vscode.window.showWarningMessage('مفيش أهداف في .elashry/goals/');
        const pick = await vscode.window.showQuickPick(files.map(f => ({ label: f.path.split('/').pop(), uri: f })), { placeHolder: 'افحص معايير أنهي هدف؟' });
        if (!pick)
            return;
        const goal = goalMod.parseGoalFile(require('fs').readFileSync(pick.uri.fsPath, 'utf8'));
        output.show(true);
        const res = await goalMod.checkAll(goal.criteria ?? [], root);
        for (const r of res.results)
            log(`[goal:check] ${r.ok ? '✓' : '✗'} ${r.detail}`);
        vscode.window.showInformationMessage(res.passed ? '✓ كل المعايير عدّت' : `✗ ${res.results.filter(r => !r.ok).length} معيار لسه واقع — شوف Output`);
    }),
    vscode.commands.registerCommand('elashryAi.automations.list', async () => {
        const au = require('./automations/store');
        const items = au.load(storageDir);
        if (!items.length)
            return vscode.window.showInformationMessage('مفيش أتمتة. استعمل "Elashry AI: Add Automation".');
        const pick = await vscode.window.showQuickPick(items.map(a => ({ label: au.describe(a), detail: a.prompt, id: a.id })), { placeHolder: 'الأتمتة المسجّلة — اختار واحدة عشان تمسحها' });
        if (pick && await vscode.window.showWarningMessage(`أمسح "${pick.label}"؟`, 'أمسح', 'لأ') === 'أمسح') {
            au.remove(storageDir, pick.id);
            vscode.window.showInformationMessage('اتمسحت.');
        }
    }),
    vscode.commands.registerCommand('elashryAi.automations.add', async () => {
        const au = require('./automations/store');
        const name = await vscode.window.showInputBox({ prompt: 'اسم الأتمتة' });
        if (!name)
            return;
        const prompt = await vscode.window.showInputBox({ prompt: 'الأمر اللي يتنفّذ كل مرة' });
        if (!prompt)
            return;
        const schedule = await vscode.window.showQuickPick(['daily', 'weekdays', 'weekly'], { placeHolder: 'كل إمتى؟' });
        if (!schedule)
            return;
        const hourRaw = await vscode.window.showInputBox({ prompt: 'الساعة (0-23)', value: '9', validateInput: v => /^([0-9]|1[0-9]|2[0-3])$/.test(v || '') ? undefined : '0 لـ 23' });
        if (hourRaw === undefined)
            return;
        const a = au.add(storageDir, { name, prompt, schedule, hour: Number(hourRaw) });
        vscode.window.showInformationMessage(`اتسجّلت: ${au.describe(a)}`);
    }),
    vscode.commands.registerCommand('elashryAi.agent.act', async () => {
        const tool = await vscode.window.showQuickPick(['edit_file', 'write_file', 'read_file', 'list_dir', 'search', 'run_command'], { placeHolder: 'Action the SYSTEM will execute (no model needed)' });
        if (!tool)
            return;
        const sample = {
            edit_file: '{"path":"README.md","old_string":"foo","new_string":"bar"}',
            write_file: '{"path":"demo.txt","content":"edited by elashry-ai system\\n"}',
            read_file: '{"path":"README.md"}',
            list_dir: '{"path":"."}',
            search: '{"pattern":"TODO","glob":"**/*.ts"}',
            run_command: '{"command":"echo hi"}',
        };
        const raw = await vscode.window.showInputBox({
            prompt: `JSON input for ${tool}`,
            value: sample[tool] ?? '{}',
            ignoreFocusOut: true,
        });
        if (!raw)
            return;
        let toolInput;
        try {
            toolInput = JSON.parse(raw);
        }
        catch (e) {
            vscode.window.showErrorMessage(`Bad JSON: ${e?.message ?? e}`);
            return;
        }
        const toolCtx = {
            workspaceRoot: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd(),
            kb,
            embedder,
            researcher,
            confirm: async () => true,
            log,
        };
        output.show(true);
        log(`[agent.act] ${tool} ${raw}`);
        const res = await (0, tools_1.executeTool)(toolCtx, tool, toolInput);
        log(`[agent.act] -> ${res.is_error ? 'ERROR ' : ''}${res.content.slice(0, 800)}`);
        vscode.window.showInformationMessage(`Elashry AI: ${tool} ${res.is_error ? 'failed (see output)' : 'done'}`);
    }), 
    // One-click start the user's own local model server (model/serve.py).
    vscode.commands.registerCommand('elashryAi.model.startServer', () => {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!root) {
            vscode.window.showErrorMessage('Open the elashry-ai workspace folder first.');
            return;
        }
        const term = vscode.window.createTerminal({ name: 'Elashry model server', cwd: root });
        term.show();
        term.sendText('model/venv/bin/python -m model.serve --port 11435');
    }), 
    // === Google Drive integration (own model files only via scope=drive.file) ===
    vscode.commands.registerCommand('elashryAi.drive.signIn', async () => {
        const c = readDriveCfg();
        if (!c)
            return;
        try {
            await new client_1.DriveClient(ctx, c).signIn();
            vscode.window.showInformationMessage('Drive: signed in ✓');
        }
        catch (e) {
            vscode.window.showErrorMessage(`Drive sign-in: ${e?.message ?? e}`);
        }
    }), vscode.commands.registerCommand('elashryAi.drive.signOut', async () => {
        const c = readDriveCfg(true);
        if (!c)
            return;
        await new client_1.DriveClient(ctx, c).signOut();
        vscode.window.showInformationMessage('Drive: signed out');
    }), vscode.commands.registerCommand('elashryAi.drive.uploadBundle', async () => {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!root)
            return vscode.window.showErrorMessage('Open the workspace first');
        const bundle = path.join(root, 'model', 'colab', 'elashry_bundle.tar.gz');
        if (!fs.existsSync(bundle))
            return vscode.window.showErrorMessage(`Bundle not found at ${bundle}. Run: bash model/colab/make_bundle.sh`);
        const c = readDriveCfg();
        if (!c)
            return;
        const d = new client_1.DriveClient(ctx, c);
        try {
            await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Drive: uploading bundle' }, async (p) => {
                const folder = await d.ensureFolder('elashry_ai');
                await d.uploadFile(bundle, folder, 'elashry_bundle.tar.gz', (sent, total) => p.report({ message: `${(sent / 1e6).toFixed(0)}/${(total / 1e6).toFixed(0)} MB` }));
            });
            vscode.window.showInformationMessage('Drive: bundle uploaded ✓');
        }
        catch (e) {
            vscode.window.showErrorMessage(`Upload: ${e?.message ?? e}`);
        }
    }), vscode.commands.registerCommand('elashryAi.drive.downloadCkpt', async () => {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!root)
            return vscode.window.showErrorMessage('Open the workspace first');
        const c = readDriveCfg();
        if (!c)
            return;
        const d = new client_1.DriveClient(ctx, c);
        try {
            const elashry = await d.ensureFolder('elashry_ai');
            const ckpts = await d.ensureFolder('checkpoints', elashry);
            const fid = await d.findFile('ckpt-latest.pt', ckpts);
            if (!fid)
                return vscode.window.showWarningMessage('ckpt-latest.pt not found on Drive');
            const out = path.join(root, 'model', 'checkpoints', 'colab-ckpt-latest.pt');
            await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Drive: downloading ckpt-latest.pt' }, async (p) => {
                let got = 0;
                await d.downloadById(fid, out, (n) => { got += n; p.report({ message: `${(got / 1e6).toFixed(0)} MB` }); });
            });
            vscode.window.showInformationMessage(`Drive: ckpt -> ${out}. Restart serve.py to use it.`);
        }
        catch (e) {
            vscode.window.showErrorMessage(`Download: ${e?.message ?? e}`);
        }
    }));
    function readDriveCfg(skipCheck = false) {
        const cfg = vscode.workspace.getConfiguration('elashryAi.drive');
        const clientId = cfg.get('clientId', '');
        const clientSecret = cfg.get('clientSecret', '');
        if (!skipCheck && (!clientId || !clientSecret)) {
            vscode.window.showErrorMessage('Set elashryAi.drive.clientId + .clientSecret first (Google Cloud Console -> Desktop OAuth client). See src/drive/client.ts header for steps.');
            return undefined;
        }
        return { clientId, clientSecret };
    }
    (0, codeActions_1.registerCodeActions)(ctx, { llm, log });
    if (researchCfg.enabled) {
        background.start();
    }
    ctx.subscriptions.push({ dispose: () => background.stop() });
}
function deactivate() { }
//# sourceMappingURL=extension.js.map