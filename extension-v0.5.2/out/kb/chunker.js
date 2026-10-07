"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.chunkText = chunkText;
const DEFAULT_TARGET = 900;
const DEFAULT_OVERLAP = 120;
function chunkText(input, opts = {}) {
    const target = opts.targetChars ?? DEFAULT_TARGET;
    const overlap = Math.min(opts.overlapChars ?? DEFAULT_OVERLAP, Math.floor(target / 3));
    const clean = input.replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').trim();
    if (!clean)
        return [];
    if (clean.length <= target)
        return [clean];
    const paragraphs = clean.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    const chunks = [];
    let current = '';
    const push = () => {
        const trimmed = current.trim();
        if (trimmed)
            chunks.push(trimmed);
        current = '';
    };
    for (const p of paragraphs) {
        if (p.length > target) {
            if (current)
                push();
            for (let i = 0; i < p.length; i += target - overlap) {
                const piece = p.slice(i, i + target);
                chunks.push(piece);
                if (i + target >= p.length)
                    break;
            }
            continue;
        }
        if ((current ? current.length + 2 : 0) + p.length > target) {
            push();
            if (overlap > 0 && chunks.length > 0) {
                const last = chunks[chunks.length - 1];
                current = last.slice(Math.max(0, last.length - overlap)) + '\n\n';
            }
        }
        current += (current ? '\n\n' : '') + p;
    }
    push();
    return chunks;
}
//# sourceMappingURL=chunker.js.map