"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Researcher = void 0;
const chunker_1 = require("../kb/chunker");
const fetch_1 = require("./fetch");
const search_1 = require("./search");
class Researcher {
    kb;
    embedder;
    opts;
    embedderAvailable;
    constructor(kb, embedder, opts) {
        this.kb = kb;
        this.embedder = embedder;
        this.opts = opts;
    }
    log(line) {
        this.opts.log?.(line);
    }
    get concurrency() {
        return Math.max(1, this.opts.concurrency ?? 4);
    }
    async tryEmbed(text) {
        if (!this.embedder)
            return [];
        if (this.embedderAvailable === false)
            return [];
        try {
            const v = await this.embedder.embed(text);
            this.embedderAvailable = true;
            return v;
        }
        catch (err) {
            if (this.embedderAvailable === undefined) {
                this.log(`[research] embeddings unavailable (${err?.message ?? err}) — storing text only`);
            }
            this.embedderAvailable = false;
            return [];
        }
    }
    async ingestUrl(url, topic, signal) {
        if (this.kb.hasUrl(url))
            return { chunks: 0, skipped: 'already in KB' };
        const page = await (0, fetch_1.fetchPage)(url, { maxBytes: this.opts.maxFetchBytes, signal });
        if (!page.text || page.text.length < 200)
            return { chunks: 0, skipped: 'too short' };
        const chunks = (0, chunker_1.chunkText)(page.text);
        if (chunks.length === 0)
            return { chunks: 0, skipped: 'no chunks' };
        const records = [];
        for (let i = 0; i < chunks.length; i++) {
            if (signal?.aborted)
                break;
            const chunk = chunks[i];
            const embedding = await this.tryEmbed(chunk);
            records.push({
                id: `${page.url}#${i}`,
                topic,
                url: page.url,
                title: page.title,
                content: chunk,
                embedding,
                fetchedAt: Date.now(),
            });
        }
        if (records.length > 0) {
            this.kb.add(records);
            this.log(`[ingest] ${records.length} chunks from ${page.url}`);
        }
        return { chunks: records.length };
    }
    async runInParallel(tasks, signal, onResult) {
        const queue = [...tasks];
        const workers = [];
        const worker = async () => {
            while (queue.length) {
                if (signal?.aborted)
                    return;
                const t = queue.shift();
                if (!t)
                    return;
                try {
                    const res = await this.ingestUrl(t.url, t.topic, signal);
                    onResult(t, true, res.chunks);
                }
                catch (err) {
                    onResult(t, false, 0, err?.message ?? String(err));
                }
            }
        };
        for (let i = 0; i < Math.min(this.concurrency, tasks.length); i++)
            workers.push(worker());
        await Promise.all(workers);
    }
    async researchTopic(topic, signal) {
        const report = { topic, searched: 0, fetched: 0, chunks: 0, errors: [] };
        let results = [];
        try {
            results = await (0, search_1.searchDuckDuckGo)(topic, Math.max(this.opts.resultsPerTopic * 2, 8), signal);
            report.searched = results.length;
            this.log(`[research] "${topic}": ${results.length} search results`);
        }
        catch (err) {
            const msg = err?.message ?? String(err);
            report.errors.push(`search: ${msg}`);
            this.log(`[research] search failed for "${topic}": ${msg}`);
            return report;
        }
        const targets = results.slice(0, this.opts.resultsPerTopic).map((r) => ({ url: r.url, topic }));
        await this.runInParallel(targets, signal, (t, ok, chunks, error) => {
            if (ok && chunks > 0) {
                report.fetched++;
                report.chunks += chunks;
            }
            else if (error) {
                report.errors.push(`${t.url}: ${error}`);
            }
        });
        return report;
    }
    async bulkIngest(items, signal, onProgress) {
        const report = { attempted: items.length, fetched: 0, skipped: 0, chunks: 0, errors: [] };
        let done = 0;
        await this.runInParallel(items, signal, (t, ok, chunks, error) => {
            done++;
            if (ok && chunks > 0) {
                report.fetched++;
                report.chunks += chunks;
            }
            else if (ok && chunks === 0) {
                report.skipped++;
            }
            else if (error) {
                report.errors.push(`${t.url}: ${error}`);
            }
            onProgress?.(done, items.length);
        });
        return report;
    }
}
exports.Researcher = Researcher;
//# sourceMappingURL=crawler.js.map