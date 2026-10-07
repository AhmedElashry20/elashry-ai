import * as path from 'path';
import * as vscode from 'vscode';
import { ModelClient, ModelInfo } from './modelClient';

let client: ModelClient;

function makeClient(onReady?: (info: ModelInfo) => void): ModelClient {
  const cfg = vscode.workspace.getConfiguration('elashryAi');
  const pythonPath = cfg.get<string>('pythonPath', 'python3');
  const preset = cfg.get<string>('preset', 'nano_cpu');
  // model/ جنب الإكستنشن: <workspace>/model
  const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || path.resolve(__dirname, '..', '..');
  const modelDir = path.join(ws, 'model');
  return new ModelClient(pythonPath, modelDir, preset, onReady);
}

async function ask(prompt: string): Promise<string> {
  const cfg = vscode.workspace.getConfiguration('elashryAi');
  const maxNewTokens = cfg.get<number>('maxNewTokens', 200);
  return client.generate({ prompt, agent: true, max_new_tokens: maxNewTokens });
}

/**
 * أوامر الكود على التحديد الحالي.
 * apply=false (شرح): يفتح الناتج في تاب جنبي.
 * apply=true (إصلاح/إعادة هيكلة): يعرض الناتج ويستبدل التحديد بموافقتك بس.
 */
function codeAction(verb: string, taskEn: string, apply: boolean) {
  return async () => {
    const ed = vscode.window.activeTextEditor;
    if (!ed || ed.selection.isEmpty) {
      vscode.window.showWarningMessage('حدّد كود الأول');
      return;
    }
    const sel = ed.selection;
    const code = ed.document.getText(sel);
    const prompt = `${taskEn}\n\n${code}`;
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `elashry-ai: ${verb}...` },
      async () => {
        try {
          const out = (await ask(prompt)).trim();
          if (!out) {
            vscode.window.showInformationMessage('النموذج رجّع ناتج فاضي');
            return;
          }
          if (apply) {
            const choice = await vscode.window.showInformationMessage(
              `elashry-ai: ${verb} — تطبّق التعديل على الكود؟`,
              { modal: true, detail: out.slice(0, 1000) },
              'طبّق'
            );
            if (choice === 'طبّق') {
              await ed.edit((b) => b.replace(sel, out));
            }
          } else {
            const doc = await vscode.workspace.openTextDocument({ content: out, language: 'markdown' });
            await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
          }
        } catch (e: any) {
          vscode.window.showErrorMessage(`elashry-ai: ${e.message} — درّبت النموذج؟`);
        }
      }
    );
  };
}

export function activate(context: vscode.ExtensionContext) {
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  status.text = '$(hubot) elashry-ai';
  status.tooltip = 'elashry-ai — النموذج المحلي (اضغط لفتح الشات)';
  status.command = 'elashryAi.openChat';
  status.show();

  client = makeClient((info: ModelInfo) => {
    status.text = `$(hubot) elashry-ai ${info.params ?? '?'}M`;
    const val = typeof info.val === 'number' ? info.val.toFixed(2) : info.val;
    status.tooltip = `النموذج المحلي · ${info.params}M باراميتر · iter ${info.iter ?? '?'} · val ${val ?? '?'}`;
  });

  const chat = new ChatViewProvider(context);
  context.subscriptions.push(
    status,
    vscode.window.registerWebviewViewProvider(ChatViewProvider.viewId, chat),
    vscode.commands.registerCommand('elashryAi.openChat', () =>
      vscode.commands.executeCommand('elashryAi.chat.focus')),
    vscode.commands.registerCommand('elashryAi.explain', codeAction('اشرح', 'Explain the following code.', false)),
    vscode.commands.registerCommand('elashryAi.fix', codeAction('صلّح', 'Fix the bug in the following code.', true)),
    vscode.commands.registerCommand('elashryAi.refactor', codeAction('أعد هيكلة', 'Refactor the following code.', true)),
    { dispose: () => client.dispose() }
  );
}

export function deactivate() { client?.dispose(); }

/** لوحة الشات (webview في السايد بار) */
class ChatViewProvider implements vscode.WebviewViewProvider {
  static readonly viewId = 'elashryAi.chat';
  constructor(private ctx: vscode.ExtensionContext) {}

  resolveWebviewView(view: vscode.WebviewView) {
    view.webview.options = { enableScripts: true };
    view.webview.html = this.html();
    view.webview.onDidReceiveMessage(async (m) => {
      if (m.type !== 'send') { return; }
      const maxNewTokens = vscode.workspace.getConfiguration('elashryAi').get<number>('maxNewTokens', 200);
      view.webview.postMessage({ type: 'start' });
      try {
        await client.generateStream(
          { prompt: m.text, agent: true, max_new_tokens: maxNewTokens },
          (delta) => view.webview.postMessage({ type: 'delta', text: delta })
        );
      } catch (e: any) {
        view.webview.postMessage({ type: 'delta', text: `⚠️ ${e.message} — درّبت النموذج؟` });
      }
      view.webview.postMessage({ type: 'done' });
    });
  }

  private html(): string {
    return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<style>
  body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);margin:0;padding:8px;display:flex;flex-direction:column;height:100vh;box-sizing:border-box}
  #log{flex:1;overflow:auto;font-size:13px}
  .msg{padding:6px 8px;margin:6px 0;border-radius:6px;white-space:pre-wrap;word-break:break-word}
  .me{background:var(--vscode-input-background)}
  .ai{background:var(--vscode-editor-inactiveSelectionBackground)}
  #row{display:flex;gap:6px;margin-top:6px}
  #q{flex:1;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border);border-radius:6px;padding:6px}
  button{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;border-radius:6px;padding:6px 12px;cursor:pointer}
</style></head><body>
  <div id="log"></div>
  <div id="row"><input id="q" placeholder="اكتب أمرك للنموذج..."><button id="s">إرسال</button></div>
<script>
  const vscode = acquireVsCodeApi();
  const log = document.getElementById('log');
  let cur = null;
  function add(cls, t){ const d=document.createElement('div'); d.className='msg '+cls; d.textContent=t; log.appendChild(d); log.scrollTop=log.scrollHeight; return d; }
  function send(){ const q=document.getElementById('q'); const t=q.value.trim(); if(!t)return; add('me',t); q.value=''; vscode.postMessage({type:'send',text:t}); }
  document.getElementById('s').onclick=send;
  document.getElementById('q').addEventListener('keydown',e=>{ if(e.key==='Enter')send(); });
  window.addEventListener('message',e=>{ const d=e.data;
    if(d.type==='start'){ cur=add('ai',''); }
    else if(d.type==='delta'){ if(!cur)cur=add('ai',''); cur.textContent+=d.text; log.scrollTop=log.scrollHeight; }
    else if(d.type==='done'){ cur=null; }
  });
</script></body></html>`;
  }
}
