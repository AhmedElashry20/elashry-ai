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
exports.getServerConfig = getServerConfig;
exports.getResearchConfig = getResearchConfig;
exports.getMaxIterations = getMaxIterations;
exports.getAutoApprove = getAutoApprove;
const vscode = __importStar(require("vscode"));
const SECTION = 'elashryAi';
function getServerConfig() {
    const cfg = vscode.workspace.getConfiguration(SECTION);
    return {
        host: cfg.get('model.host', 'http://127.0.0.1:20130'),
        chatModel: cfg.get('model.chatModel', 'elashry-nano'),
        embedModel: cfg.get('model.embedModel', 'elashry-nano'),
        // الإمبدنجز لها host منفصل: الشات ممكن يروح لـ OmniRoute (واجهة OpenAI)
        // لكن /api/embeddings واجهة Ollama والمحوّل المحلي هو اللي بيخدمها،
        // والـ KB كلها مبنية بمتجهات الموديل المحلي فماينفعش نغيّره.
        embedHost: cfg.get('model.embedHost', '') || cfg.get('model.host', 'http://localhost:11435'),
    };
}
function getResearchConfig() {
    const cfg = vscode.workspace.getConfiguration(SECTION);
    const minutes = Math.max(1, cfg.get('research.intervalMinutes', 3));
    return {
        enabled: cfg.get('research.enabled', true),
        intervalMs: minutes * 60_000,
        resultsPerTopic: Math.max(1, cfg.get('research.resultsPerTopic', 8)),
        maxFetchBytes: Math.max(50_000, cfg.get('research.maxFetchBytes', 1_500_000)),
        concurrency: Math.max(1, Math.min(16, cfg.get('research.concurrency', 4))),
    };
}
function getMaxIterations() {
    return vscode.workspace.getConfiguration(SECTION).get('agent.maxIterations', 30);
}
function getAutoApprove() {
    const cfg = vscode.workspace.getConfiguration(SECTION);
    const raw = cfg.get('agent.autoApprove', {});
    return {
        read_file: raw.read_file ?? true,
        list_dir: raw.list_dir ?? true,
        search: raw.search ?? true,
        search_knowledge: raw.search_knowledge ?? true,
        web_research: raw.web_research ?? true,
        write_file: raw.write_file ?? false,
        edit_file: raw.edit_file ?? false,
        run_command: raw.run_command ?? false,
    };
}
//# sourceMappingURL=config.js.map