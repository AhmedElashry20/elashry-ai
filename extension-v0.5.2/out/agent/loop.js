"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Agent = void 0;
const prompt_1 = require("./prompt");
const tools_1 = require("./tools");
class Agent {
    cfg;
    history = [];
    constructor(cfg) {
        this.cfg = cfg;
    }
    reset() {
        this.history = [];
    }
    get messages() {
        return this.history;
    }
    async *run(userInput, runOpts = {}) {
        this.history.push({ role: 'user', content: [{ type: 'text', text: userInput }] });
        const system = this.cfg.systemPromptExtra
            ? `${prompt_1.AGENT_SYSTEM_PROMPT}\n\n${this.cfg.systemPromptExtra}`
            : prompt_1.AGENT_SYSTEM_PROMPT;
        for (let i = 0; i < this.cfg.maxIterations; i++) {
            yield { type: 'iteration', index: i + 1 };
            if (runOpts.signal?.aborted) {
                yield { type: 'done', reason: 'aborted' };
                return;
            }
            const assistantBlocks = [];
            const toolCalls = [];
            let stopReason;
            let errored;
            let currentTextBuf = '';
            const stream = this.cfg.llm.stream(this.history, {
                systemPrompt: system,
                tools: [...tools_1.TOOL_DEFS, ...require('./editorTools').EDITOR_TOOL_DEFS],
                signal: runOpts.signal,
            });
            for await (const ev of stream) {
                if (ev.type === 'text_delta') {
                    currentTextBuf += ev.text;
                    yield { type: 'text', text: ev.text };
                }
                else if (ev.type === 'tool_use') {
                    if (currentTextBuf) {
                        assistantBlocks.push({ type: 'text', text: currentTextBuf });
                        currentTextBuf = '';
                    }
                    const block = { type: 'tool_use', id: ev.id, name: ev.name, input: ev.input };
                    assistantBlocks.push(block);
                    toolCalls.push(block);
                    yield { type: 'tool_call', id: ev.id, name: ev.name, input: ev.input };
                }
                else if (ev.type === 'message_stop') {
                    stopReason = ev.stop_reason;
                }
                else if (ev.type === 'error') {
                    errored = ev.message;
                }
            }
            if (currentTextBuf) {
                assistantBlocks.push({ type: 'text', text: currentTextBuf });
            }
            if (errored) {
                yield { type: 'done', reason: 'error', error: errored };
                return;
            }
            this.history.push({ role: 'assistant', content: assistantBlocks });
            if (stopReason !== 'tool_use' || toolCalls.length === 0) {
                yield { type: 'done', reason: 'completed' };
                return;
            }
            const toolResults = [];
            for (const call of toolCalls) {
                if (runOpts.signal?.aborted) {
                    yield { type: 'done', reason: 'aborted' };
                    return;
                }
                const result = await (0, tools_1.executeTool)(this.cfg.toolContext, call.name, call.input);
                toolResults.push({
                    type: 'tool_result',
                    tool_use_id: call.id,
                    content: result.content,
                    is_error: result.is_error,
                });
                yield {
                    type: 'tool_result',
                    id: call.id,
                    name: call.name,
                    content: result.content,
                    is_error: result.is_error,
                };
            }
            this.history.push({ role: 'user', content: toolResults });
        }
        yield { type: 'done', reason: 'max_iterations' };
    }
}
exports.Agent = Agent;
//# sourceMappingURL=loop.js.map