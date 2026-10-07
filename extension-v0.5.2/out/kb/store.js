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
exports.KnowledgeBase = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const embeddings_1 = require("../llm/embeddings");
class KnowledgeBase {
    filePath;
    records = [];
    loaded = false;
    fileBytes = 0;
    constructor(filePath) {
        this.filePath = filePath;
    }
    ensureDir() {
        const dir = path.dirname(this.filePath);
        if (!fs.existsSync(dir))
            fs.mkdirSync(dir, { recursive: true });
    }
    load() {
        if (this.loaded)
            return;
        this.ensureDir();
        if (!fs.existsSync(this.filePath)) {
            this.loaded = true;
            this.fileBytes = 0;
            return;
        }
        const raw = fs.readFileSync(this.filePath, 'utf8');
        this.fileBytes = Buffer.byteLength(raw, 'utf8');
        for (const line of raw.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed)
                continue;
            try {
                const rec = JSON.parse(trimmed);
                if (rec && Array.isArray(rec.embedding) && typeof rec.content === 'string') {
                    this.records.push(rec);
                }
            }
            catch {
            }
        }
        this.loaded = true;
    }
    hasUrl(url) {
        this.load();
        return this.records.some((r) => r.url === url);
    }
    add(records) {
        if (records.length === 0)
            return;
        this.load();
        this.ensureDir();
        const lines = records.map((r) => JSON.stringify(r)).join('\n') + '\n';
        fs.appendFileSync(this.filePath, lines, 'utf8');
        this.records.push(...records);
        this.fileBytes += Buffer.byteLength(lines, 'utf8');
    }
    search(queryEmbedding, limit = 5, minScore = 0.2) {
        this.load();
        if (this.records.length === 0)
            return [];
        const scored = [];
        for (const rec of this.records) {
            if (!rec.embedding || rec.embedding.length === 0)
                continue;
            const score = (0, embeddings_1.cosine)(queryEmbedding, rec.embedding);
            if (score >= minScore)
                scored.push({ record: rec, score });
        }
        scored.sort((a, b) => b.score - a.score);
        return scored.slice(0, limit);
    }
    textSearch(query, limit = 5) {
        this.load();
        if (this.records.length === 0 || !query.trim())
            return [];
        const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length >= 3);
        if (terms.length === 0)
            return [];
        const scored = [];
        for (const rec of this.records) {
            const hay = (rec.title + '\n' + rec.content).toLowerCase();
            let hits = 0;
            for (const t of terms) {
                if (hay.includes(t))
                    hits++;
            }
            if (hits > 0)
                scored.push({ record: rec, score: hits / terms.length });
        }
        scored.sort((a, b) => b.score - a.score);
        return scored.slice(0, limit);
    }
    stats() {
        this.load();
        const topics = new Set();
        const urls = new Set();
        let bytes = 0;
        let oldest;
        let newest;
        for (const r of this.records) {
            topics.add(r.topic);
            urls.add(r.url);
            bytes += Buffer.byteLength(r.content, 'utf8');
            if (oldest === undefined || r.fetchedAt < oldest)
                oldest = r.fetchedAt;
            if (newest === undefined || r.fetchedAt > newest)
                newest = r.fetchedAt;
        }
        return {
            chunks: this.records.length,
            topics: topics.size,
            urls: urls.size,
            bytes,
            fileSize: this.fileBytes,
            oldest,
            newest,
        };
    }
    recentTopics(limit = 20) {
        this.load();
        const seen = new Set();
        const out = [];
        for (let i = this.records.length - 1; i >= 0 && out.length < limit; i--) {
            const t = this.records[i].topic;
            if (!seen.has(t)) {
                seen.add(t);
                out.push(t);
            }
        }
        return out;
    }
    clear() {
        if (fs.existsSync(this.filePath))
            fs.unlinkSync(this.filePath);
        this.records = [];
        this.fileBytes = 0;
        this.loaded = true;
    }
}
exports.KnowledgeBase = KnowledgeBase;
//# sourceMappingURL=store.js.map