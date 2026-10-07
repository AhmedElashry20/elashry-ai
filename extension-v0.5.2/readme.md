# Elashry AI — Personal VS Code coding agent

Personal autonomous coding agent that lives in your VS Code sidebar. Give it one instruction and it carries the task end-to-end across the workspace: reads files, edits them, runs commands, and verifies.

## Architecture

```
extension.ts          ← entry point, registers commands + sidebar view
├─ ui/chatPanel.ts    ← webview chat panel (the sidebar view)
├─ agent/
│  ├─ loop.ts         ← agent loop (LLM → tools → repeat)
│  ├─ tools.ts        ← read_file, write_file, edit_file, list_dir, search, run_command
│  └─ prompt.ts       ← agent system prompt (engineering principles)
├─ llm/
│  ├─ router.ts       ← LLMRouter: routes to Claude or Ollama
│  ├─ anthropic.ts    ← Claude SDK wrapper (streaming + tool use)
│  └─ ollama.ts       ← Ollama HTTP client (optional, falls back to Claude)
├─ codeActions.ts     ← explain / fix / refactor on selection (one-shot, no tools)
├─ config.ts          ← reads settings from VS Code config
└─ secrets.ts         ← API key via VS Code SecretStorage
```

## Models

- **Agent reasoning + tool use:** `claude-opus-4-7` (Anthropic)
- **Code actions / fast tier:** `claude-haiku-4-5-20251001` (Anthropic), falls back to Ollama if enabled and available

Both configurable via `elashryAi.model.agent` / `elashryAi.model.fast`.

## Running it the first time

```bash
cd extension
npm install
npm run compile
```

Then in VS Code:

1. Open the `extension/` folder.
2. Press `F5` (or Run → Start Debugging) — opens an **Extension Development Host** window.
3. In that new window: `Cmd+Shift+P` → `Elashry AI: Set Anthropic API Key` and paste your key.
4. Open the activity bar icon (Elashry AI) → chat panel opens in the sidebar.
5. Open any project folder and chat away.

## Tool approval

Read-only tools (`read_file`, `list_dir`, `search`) auto-approve by default.
Write/exec tools (`write_file`, `edit_file`, `run_command`) prompt every time, with an "Approve all in session" option.

Override per-tool defaults in settings: `elashryAi.agent.autoApprove`.

## Optional: local Ollama

If you want the fast tier to use a local model instead of Haiku:

```bash
brew install ollama
ollama pull qwen2.5-coder:7b
```

Then enable: `"elashryAi.ollama.enabled": true` in settings. The router checks Ollama's availability on each call — if it's down, it transparently falls back to Haiku.

## Packaging (optional)

```bash
npx @vscode/vsce package
```

Produces a `.vsix` you can install via `code --install-extension`.
