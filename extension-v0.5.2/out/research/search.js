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
exports.searchDuckDuckGo = searchDuckDuckGo;
const cheerio = __importStar(require("cheerio"));
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const BLOCK_HOSTS = [
    'duckduckgo.com',
    'youtube.com',
    'twitter.com',
    'x.com',
    'pinterest.com',
    'facebook.com',
    'tiktok.com',
    'instagram.com',
];
async function searchDuckDuckGo(query, limit = 8, signal) {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
        headers: {
            'User-Agent': USER_AGENT,
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'en-US,en;q=0.9',
        },
        signal,
    });
    if (!res.ok)
        throw new Error(`DuckDuckGo HTTP ${res.status}`);
    const html = await res.text();
    const $ = cheerio.load(html);
    const results = [];
    $('.result').each((_, el) => {
        if (results.length >= limit * 2)
            return;
        const $el = $(el);
        const titleEl = $el.find('.result__a').first();
        const href = titleEl.attr('href') ?? '';
        const title = titleEl.text().trim();
        const snippet = $el.find('.result__snippet').first().text().trim();
        const cleanUrl = unwrapDdgUrl(href);
        if (!cleanUrl || !title)
            return;
        if (!/^https?:\/\//i.test(cleanUrl))
            return;
        if (BLOCK_HOSTS.some((h) => cleanUrl.includes(h)))
            return;
        results.push({ title, url: cleanUrl, snippet });
    });
    const seen = new Set();
    const deduped = [];
    for (const r of results) {
        if (seen.has(r.url))
            continue;
        seen.add(r.url);
        deduped.push(r);
        if (deduped.length >= limit)
            break;
    }
    return deduped;
}
function unwrapDdgUrl(href) {
    if (!href)
        return '';
    if (href.startsWith('//'))
        href = 'https:' + href;
    try {
        const u = new URL(href);
        const uddg = u.searchParams.get('uddg');
        if (uddg)
            return decodeURIComponent(uddg);
        return u.toString();
    }
    catch {
        return '';
    }
}
//# sourceMappingURL=search.js.map