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
exports.fetchPage = fetchPage;
const cheerio = __importStar(require("cheerio"));
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
async function fetchPage(url, opts = {}) {
    const maxBytes = opts.maxBytes ?? 500_000;
    const timeoutMs = opts.timeoutMs ?? 30_000;
    const composed = opts.signal
        ? anySignal(opts.signal, AbortSignal.timeout(timeoutMs))
        : AbortSignal.timeout(timeoutMs);
    const isPdfHint = /\.pdf(\?|#|$)/i.test(url);
    const res = await fetch(url, {
        headers: {
            'User-Agent': USER_AGENT,
            'Accept': isPdfHint
                ? 'application/pdf,*/*;q=0.8'
                : 'text/html,application/xhtml+xml,application/pdf;q=0.9,text/plain;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
        },
        redirect: 'follow',
        signal: composed,
    });
    if (!res.ok)
        throw new Error(`HTTP ${res.status} for ${url}`);
    const contentType = res.headers.get('content-type') ?? '';
    const isPdf = /application\/pdf/i.test(contentType) || isPdfHint;
    const isText = /text\/(html|plain)|application\/(xhtml|json)/i.test(contentType);
    if (!isPdf && !isText) {
        throw new Error(`Skipped non-text content-type: ${contentType}`);
    }
    if (isPdf) {
        const buf = await readBoundedBytes(res, maxBytes * 4);
        const { text, title } = await extractPdfText(buf);
        return { url, title: title || url, text, bytes: buf.byteLength };
    }
    const reader = res.body?.getReader();
    if (!reader)
        throw new Error('No response body');
    const decoder = new TextDecoder();
    let html = '';
    let received = 0;
    while (true) {
        const { value, done } = await reader.read();
        if (done)
            break;
        received += value.byteLength;
        if (received > maxBytes) {
            html += decoder.decode(value.slice(0, Math.max(0, maxBytes - (received - value.byteLength))), { stream: true });
            try {
                await reader.cancel();
            }
            catch {
            }
            break;
        }
        html += decoder.decode(value, { stream: true });
    }
    html += decoder.decode();
    if (/^text\/plain/i.test(contentType)) {
        return { url, title: url, text: html.trim().slice(0, maxBytes), bytes: received };
    }
    const { title, text } = extractMainText(html);
    return { url, title: title || url, text, bytes: received };
}
async function readBoundedBytes(res, maxBytes) {
    const reader = res.body?.getReader();
    if (!reader)
        throw new Error('No response body');
    const parts = [];
    let total = 0;
    while (true) {
        const { value, done } = await reader.read();
        if (done)
            break;
        total += value.byteLength;
        if (total > maxBytes) {
            const remaining = Math.max(0, maxBytes - (total - value.byteLength));
            parts.push(value.slice(0, remaining));
            try {
                await reader.cancel();
            }
            catch {
            }
            break;
        }
        parts.push(value);
    }
    return Buffer.concat(parts.map((p) => Buffer.from(p)));
}
async function extractPdfText(buf) {
    const mod = await Promise.resolve().then(() => __importStar(require('pdf-parse')));
    const pdfParse = mod.default ?? mod;
    const data = await pdfParse(buf);
    const title = (data.info?.Title ?? '').toString().trim();
    const cleaned = String(data.text ?? '')
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0)
        .join('\n')
        .replace(/\n{3,}/g, '\n\n');
    return { text: cleaned, title };
}
function extractMainText(html) {
    const $ = cheerio.load(html);
    $('script, style, noscript, svg, iframe, header, footer, nav, aside, form, .ads, .ad, .sidebar, .navigation, .menu, [role="navigation"], [role="banner"], [role="contentinfo"]').remove();
    const title = $('title').first().text().trim() || $('h1').first().text().trim();
    const candidates = [];
    const selectors = ['article', 'main', '[role="main"]', '.post', '.entry-content', '.markdown-body', '.article-content', '.content'];
    for (const sel of selectors) {
        $(sel).each((_, el) => {
            const t = $(el).text();
            if (t && t.length > 200)
                candidates.push(t);
        });
    }
    let bodyText = candidates.sort((a, b) => b.length - a.length)[0];
    if (!bodyText)
        bodyText = $('body').text();
    const cleaned = bodyText
        .replace(/ /g, ' ')
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0)
        .join('\n')
        .replace(/\n{3,}/g, '\n\n');
    return { title, text: cleaned };
}
function anySignal(...signals) {
    const ctrl = new AbortController();
    const onAbort = (s) => () => ctrl.abort(s.reason);
    for (const s of signals) {
        if (s.aborted) {
            ctrl.abort(s.reason);
            break;
        }
        s.addEventListener('abort', onAbort(s), { once: true });
    }
    return ctrl.signal;
}
//# sourceMappingURL=fetch.js.map