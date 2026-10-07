"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OllamaClient = void 0;
class OllamaClient {
    opts;
    constructor(opts) {
        this.opts = opts;
    }
    get baseURL() {
        return `${this.opts.host.replace(/\/$/, '')}/v1`;
    }
    async isAvailable() {
        // بنجرب الاتنين: /v1/models (OpenAI — ده اللي OmniRoute بيستخدمه)
        // و /api/tags (Ollama — ده اللي المحوّل المحلي بيستخدمه).
        // الـ chat نفسه OpenAI في الحالتين، فالفرق هنا في فحص التوفر بس.
        for (const path of ['/v1/models', '/api/tags']) {
            try {
                const res = await fetch(`${this.opts.host.replace(/\/$/, '')}${path}`, {
                    signal: AbortSignal.timeout(3000),
                });
                if (res.ok)
                    return true;
            }
            catch {
                // نجرب المسار التالي
            }
        }
        return false;
    }
    async *stream(messages, opts = {}) {
        const body = {
            model: opts.model ?? this.opts.chatModel,
            messages: convertMessages(messages, opts.systemPrompt),
            stream: true,
            max_tokens: opts.maxTokens ?? 4096,
        };
        if (opts.tools && opts.tools.length) {
            body.tools = convertTools(opts.tools);
            body.tool_choice = 'auto';
        }
        let res;
        try {
            res = await fetch(`${this.baseURL}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal: opts.signal,
            });
        }
        catch (err) {
            yield { type: 'error', message: err?.message ?? String(err) };
            return;
        }
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            yield { type: 'error', message: `Ollama ${res.status}: ${text}` };
            return;
        }
        if (!res.body) {
            yield { type: 'error', message: 'No response body from Ollama' };
            return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        const toolAcc = new Map();
        let stopReason = 'end_turn';
        try {
            while (true) {
                const { value, done } = await reader.read();
                if (done)
                    break;
                buf += decoder.decode(value, { stream: true });
                let idx;
                while ((idx = buf.indexOf('\n')) !== -1) {
                    const line = buf.slice(0, idx).trim();
                    buf = buf.slice(idx + 1);
                    if (!line || !line.startsWith('data:'))
                        continue;
                    const payload = line.slice(5).trim();
                    if (payload === '[DONE]')
                        continue;
                    let evt;
                    try {
                        evt = JSON.parse(payload);
                    }
                    catch {
                        continue;
                    }
                    const choice = evt.choices?.[0];
                    if (!choice)
                        continue;
                    const delta = choice.delta ?? {};
                    if (typeof delta.content === 'string' && delta.content) {
                        yield { type: 'text_delta', text: delta.content };
                    }
                    if (Array.isArray(delta.tool_calls)) {
                        for (const tc of delta.tool_calls) {
                            const tIdx = typeof tc.index === 'number' ? tc.index : 0;
                            const existing = toolAcc.get(tIdx);
                            if (!existing) {
                                toolAcc.set(tIdx, {
                                    index: tIdx,
                                    id: tc.id ?? `call_${tIdx}`,
                                    name: tc.function?.name ?? '',
                                    argsJson: tc.function?.arguments ?? '',
                                });
                            }
                            else {
                                if (tc.id)
                                    existing.id = tc.id;
                                if (tc.function?.name)
                                    existing.name += tc.function.name;
                                if (tc.function?.arguments)
                                    existing.argsJson += tc.function.arguments;
                            }
                        }
                    }
                    if (choice.finish_reason) {
                        const fr = choice.finish_reason;
                        if (fr === 'tool_calls')
                            stopReason = 'tool_use';
                        else if (fr === 'length')
                            stopReason = 'max_tokens';
                        else
                            stopReason = 'end_turn';
                    }
                }
            }
        }
        catch (err) {
            if (!opts.signal?.aborted) {
                yield { type: 'error', message: err?.message ?? String(err) };
                return;
            }
        }
        for (const acc of [...toolAcc.values()].sort((a, b) => a.index - b.index)) {
            let parsed = {};
            try {
                parsed = acc.argsJson ? JSON.parse(acc.argsJson) : {};
            }
            catch {
                parsed = {};
            }
            yield { type: 'tool_use', id: acc.id, name: acc.name, input: parsed };
        }
        if (toolAcc.size > 0)
            stopReason = 'tool_use';
        yield { type: 'message_stop', stop_reason: stopReason };
    }
    async oneShot(prompt, opts = {}) {
        const body = {
            model: opts.model ?? this.opts.chatModel,
            messages: [
                ...(opts.systemPrompt ? [{ role: 'system', content: opts.systemPrompt }] : []),
                { role: 'user', content: prompt },
            ],
            max_tokens: opts.maxTokens ?? 2048,
            stream: false,
        };
        const res = await fetch(`${this.baseURL}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: opts.signal,
        });
        if (!res.ok) {
            throw new Error(`Ollama ${res.status}: ${await res.text().catch(() => '')}`);
        }
        const data = (await res.json());
        return data.choices?.[0]?.message?.content ?? '';
    }
}
exports.OllamaClient = OllamaClient;
function convertTools(tools) {
    return tools.map((t) => ({
        type: 'function',
        function: {
            name: t.name,
            description: t.description,
            parameters: t.input_schema,
        },
    }));
}
function convertMessages(messages, systemPrompt) {
    const out = [];
    if (systemPrompt)
        out.push({ role: 'system', content: systemPrompt });
    for (const msg of messages) {
        if (msg.role === 'user') {
            const toolResults = msg.content.filter((b) => b.type === 'tool_result');
            const textParts = msg.content.filter((b) => b.type === 'text');
            for (const tr of toolResults) {
                out.push({
                    role: 'tool',
                    tool_call_id: tr.tool_use_id,
                    content: tr.content,
                });
            }
            if (textParts.length > 0) {
                out.push({ role: 'user', content: textParts.map((p) => p.text).join('\n') });
            }
        }
        else {
            const textParts = msg.content.filter((b) => b.type === 'text');
            const toolCalls = msg.content.filter((b) => b.type === 'tool_use');
            const entry = { role: 'assistant' };
            entry.content = textParts.length > 0 ? textParts.map((p) => p.text).join('\n') : null;
            if (toolCalls.length > 0) {
                entry.tool_calls = toolCalls.map((tc) => ({
                    id: tc.id,
                    type: 'function',
                    function: {
                        name: tc.name,
                        arguments: JSON.stringify(tc.input ?? {}),
                    },
                }));
            }
            out.push(entry);
        }
    }
    return out;
}
//# sourceMappingURL=ollama.js.map