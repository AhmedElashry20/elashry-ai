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
exports.TopicQueue = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const seeds_1 = require("./seeds");
class TopicQueue {
    filePath;
    state = { version: 1, topics: [] };
    loaded = false;
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
        if (fs.existsSync(this.filePath)) {
            try {
                const raw = fs.readFileSync(this.filePath, 'utf8');
                const parsed = JSON.parse(raw);
                if (parsed && Array.isArray(parsed.topics)) {
                    this.state = { version: 1, topics: parsed.topics };
                }
            }
            catch {
            }
        }
        this.seedIfEmpty();
        this.loaded = true;
    }
    seedIfEmpty() {
        const known = new Set(this.state.topics.map((t) => t.topic));
        let changed = false;
        for (const topic of seeds_1.SEED_TOPICS) {
            if (!known.has(topic)) {
                this.state.topics.push({ topic, addedAt: Date.now(), status: 'pending' });
                changed = true;
            }
        }
        if (changed)
            this.persist();
    }
    persist() {
        this.ensureDir();
        fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2), 'utf8');
    }
    addTopic(topic) {
        this.load();
        const t = topic.trim();
        if (!t)
            return false;
        if (this.state.topics.some((e) => e.topic === t))
            return false;
        this.state.topics.push({ topic: t, addedAt: Date.now(), status: 'pending' });
        this.persist();
        return true;
    }
    nextPending() {
        this.load();
        return this.state.topics.find((t) => t.status === 'pending');
    }
    markDone(topic) {
        this.load();
        const entry = this.state.topics.find((t) => t.topic === topic);
        if (entry) {
            entry.status = 'done';
            entry.processedAt = Date.now();
            entry.error = undefined;
            this.persist();
        }
    }
    markFailed(topic, error) {
        this.load();
        const entry = this.state.topics.find((t) => t.topic === topic);
        if (entry) {
            entry.status = 'failed';
            entry.processedAt = Date.now();
            entry.error = error;
            this.persist();
        }
    }
    counts() {
        this.load();
        let pending = 0;
        let done = 0;
        let failed = 0;
        for (const t of this.state.topics) {
            if (t.status === 'pending')
                pending++;
            else if (t.status === 'done')
                done++;
            else
                failed++;
        }
        return { pending, done, failed, total: this.state.topics.length };
    }
}
exports.TopicQueue = TopicQueue;
//# sourceMappingURL=queue.js.map