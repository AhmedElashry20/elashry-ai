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
exports.registerCodeActions = registerCodeActions;
const vscode = __importStar(require("vscode"));
const PROMPTS = {
    explain: (lang, code) => `Explain what this ${lang} snippet does. Be concise — no preamble, no restating the code. Focus on intent, control flow, and any subtle behavior a reader might miss.\n\n\`\`\`${lang}\n${code}\n\`\`\``,
    fix: (lang, code) => `The following ${lang} snippet has a bug or smell. Identify the issue and return ONLY the corrected code inside a single fenced \`\`\`${lang}\`\`\` block. No prose before or after.\n\n\`\`\`${lang}\n${code}\n\`\`\``,
    refactor: (lang, code) => `Refactor this ${lang} snippet to be cleaner and more idiomatic while preserving exact behavior. Return ONLY the refactored code inside a single fenced \`\`\`${lang}\`\`\` block. No prose.\n\n\`\`\`${lang}\n${code}\n\`\`\``,
};
function extractCodeBlock(text, lang) {
    const fence = new RegExp('```' + lang + '\\n([\\s\\S]*?)```', 'i');
    const m = text.match(fence) ?? text.match(/```[a-zA-Z0-9_+-]*\n([\s\S]*?)```/);
    return m ? m[1].trimEnd() : null;
}
async function runAction(deps, action) {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) {
        vscode.window.showWarningMessage('Select some code first.');
        return;
    }
    const code = editor.document.getText(editor.selection);
    const lang = editor.document.languageId;
    let result;
    try {
        result = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Elashry AI: ${action}...`, cancellable: false }, () => deps.llm.oneShot(PROMPTS[action](lang, code)));
    }
    catch (err) {
        const msg = err?.message ?? String(err);
        deps.log(`[codeAction:${action}] ${msg}`);
        vscode.window.showErrorMessage(`Elashry AI: ${msg}`);
        return;
    }
    if (action === 'explain') {
        const doc = await vscode.workspace.openTextDocument({ content: result, language: 'markdown' });
        await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside, preview: true });
        return;
    }
    const replacement = extractCodeBlock(result, lang);
    if (!replacement) {
        vscode.window.showErrorMessage('Could not parse a code block from the response.');
        return;
    }
    const choice = await vscode.window.showInformationMessage(`Apply ${action} to selection?`, { modal: false }, 'Apply', 'Show diff', 'Cancel');
    if (choice === 'Apply') {
        await editor.edit((b) => b.replace(editor.selection, replacement));
    }
    else if (choice === 'Show diff') {
        const original = await vscode.workspace.openTextDocument({ content: code, language: lang });
        const proposed = await vscode.workspace.openTextDocument({ content: replacement, language: lang });
        await vscode.commands.executeCommand('vscode.diff', original.uri, proposed.uri, `${action}: original ↔ proposed`);
    }
}
function registerCodeActions(ctx, deps) {
    ctx.subscriptions.push(vscode.commands.registerCommand('elashryAi.explainSelection', () => runAction(deps, 'explain')), vscode.commands.registerCommand('elashryAi.fixSelection', () => runAction(deps, 'fix')), vscode.commands.registerCommand('elashryAi.refactorSelection', () => runAction(deps, 'refactor')));
}
//# sourceMappingURL=codeActions.js.map