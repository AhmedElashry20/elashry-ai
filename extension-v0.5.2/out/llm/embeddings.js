"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Embedder = void 0;
exports.cosine = cosine;
class Embedder {
    opts;
    apiKey = (() => {
        try {
            return require('vscode').workspace.getConfiguration('elashryAi').get('model.apiKey', '') || '';
        }
        catch {
            return '';
        }
    })();
    constructor(opts) {
        this.opts = opts;
    }
    async embed(text) {
        const res = await fetch(`${this.opts.host.replace(/\/$/, '')}/api/embeddings`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({ model: this.opts.model, prompt: text }),
        });
        if (!res.ok) {
            throw new Error(`Model server embeddings ${res.status}: ${await res.text().catch(() => '')}`);
        }
        const data = (await res.json());
        if (!Array.isArray(data.embedding)) {
            throw new Error('Model server: missing embedding in response');
        }
        return data.embedding;
    }
    async embedMany(texts) {
        const out = [];
        for (const t of texts) {
            out.push(await this.embed(t));
        }
        return out;
    }
}
exports.Embedder = Embedder;
function cosine(a, b) {
    const n = Math.min(a.length, b.length);
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let i = 0; i < n; i++) {
        const x = a[i];
        const y = b[i];
        dot += x * y;
        na += x * x;
        nb += y * y;
    }
    const denom = Math.sqrt(na) * Math.sqrt(nb);
    return denom === 0 ? 0 : dot / denom;
}
//# sourceMappingURL=embeddings.js.map