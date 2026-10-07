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
exports.DriveClient = void 0;
/**
 * Google Drive client for Elashry AI.
 * Uses Drive REST + OAuth2 directly via `fetch` — no npm deps, keeps vsix small.
 *
 * One-time setup (user side):
 *   1) console.cloud.google.com -> create a project (or use existing)
 *   2) APIs & Services -> Enable "Google Drive API"
 *   3) Credentials -> Create OAuth client ID -> Desktop app
 *   4) Copy Client ID + Client Secret
 *   5) VS Code Settings:  elashryAi.drive.clientId / elashryAi.drive.clientSecret
 *   6) Run command: "Elashry AI: Drive: Sign in"
 *
 * Scope used: drive.file — the extension can ONLY see/touch files it itself
 * creates or uploads under MyDrive/elashry_ai/. It cannot read the rest of
 * the user's Drive. This is intentional and minimal.
 */
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const stream_1 = require("stream");
const TOKEN_KEY = 'elashry-drive-refresh-token';
// Full Drive scope: needed to download files Colab created in MyDrive/elashry_ai/
// (drive.file would limit us to ONLY files the extension itself created).
// You're granting your own OAuth client to your own Drive — same level Colab uses.
const SCOPE = 'https://www.googleapis.com/auth/drive';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const REDIRECT = 'urn:ietf:wg:oauth:2.0:oob'; // out-of-band — user pastes code
class DriveClient {
    ctx;
    cfg;
    constructor(ctx, cfg) {
        this.ctx = ctx;
        this.cfg = cfg;
    }
    async refreshToken() {
        return this.ctx.secrets.get(TOKEN_KEY);
    }
    /** Open browser, ask user to paste code, exchange for refresh token. */
    async signIn() {
        if (!this.cfg.clientId || !this.cfg.clientSecret) {
            throw new Error('Set elashryAi.drive.clientId and elashryAi.drive.clientSecret first (see drive/client.ts header).');
        }
        const url = `${AUTH_URL}?client_id=${encodeURIComponent(this.cfg.clientId)}` +
            `&redirect_uri=${encodeURIComponent(REDIRECT)}` +
            `&response_type=code&scope=${encodeURIComponent(SCOPE)}` +
            `&access_type=offline&prompt=consent`;
        await vscode.env.openExternal(vscode.Uri.parse(url));
        const code = await vscode.window.showInputBox({
            prompt: 'Paste the authorization code from the browser',
            password: true,
            ignoreFocusOut: true,
        });
        if (!code)
            throw new Error('Sign-in cancelled');
        const res = await fetch(TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code,
                client_id: this.cfg.clientId,
                client_secret: this.cfg.clientSecret,
                redirect_uri: REDIRECT,
                grant_type: 'authorization_code',
            }).toString(),
        });
        if (!res.ok)
            throw new Error(`Token exchange ${res.status}: ${await res.text()}`);
        const data = (await res.json());
        if (!data.refresh_token)
            throw new Error('No refresh_token (re-run with prompt=consent)');
        await this.ctx.secrets.store(TOKEN_KEY, data.refresh_token);
    }
    async signOut() {
        await this.ctx.secrets.delete(TOKEN_KEY);
    }
    async accessToken() {
        const rt = await this.refreshToken();
        if (!rt)
            throw new Error('Not signed in. Run "Elashry AI: Drive: Sign in" first.');
        const res = await fetch(TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: this.cfg.clientId,
                client_secret: this.cfg.clientSecret,
                refresh_token: rt,
                grant_type: 'refresh_token',
            }).toString(),
        });
        if (!res.ok)
            throw new Error(`Token refresh ${res.status}: ${await res.text()}`);
        const data = (await res.json());
        return data.access_token;
    }
    /** Find or create a folder by name under `parentId` (default: 'root'). */
    async ensureFolder(name, parentId = 'root') {
        const tok = await this.accessToken();
        const q = `name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false and '${parentId}' in parents`;
        const list = await fetch(`${API}/files?q=${encodeURIComponent(q)}&fields=files(id,name)`, {
            headers: { Authorization: `Bearer ${tok}` },
        });
        if (!list.ok)
            throw new Error(`List ${list.status}: ${await list.text()}`);
        const existing = (await list.json()).files[0]?.id;
        if (existing)
            return existing;
        const cr = await fetch(`${API}/files`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
        });
        if (!cr.ok)
            throw new Error(`Create folder ${cr.status}: ${await cr.text()}`);
        return (await cr.json()).id;
    }
    async findFile(name, folderId) {
        const tok = await this.accessToken();
        const q = `name='${name.replace(/'/g, "\\'")}' and trashed=false and '${folderId}' in parents`;
        const res = await fetch(`${API}/files?q=${encodeURIComponent(q)}&fields=files(id,modifiedTime)&orderBy=modifiedTime desc`, {
            headers: { Authorization: `Bearer ${tok}` },
        });
        if (!res.ok)
            throw new Error(`Find ${res.status}: ${await res.text()}`);
        return (await res.json()).files[0]?.id ?? null;
    }
    /** Resumable upload (robust for big files like the ~1GB bundle). Overwrites existing. */
    async uploadFile(localPath, folderId, name, onProgress) {
        const filename = name ?? path.basename(localPath);
        const tok = await this.accessToken();
        const existing = await this.findFile(filename, folderId);
        const metadata = { name: filename };
        if (!existing)
            metadata.parents = [folderId];
        const url = existing
            ? `${UPLOAD}/files/${existing}?uploadType=resumable`
            : `${UPLOAD}/files?uploadType=resumable`;
        const init = await fetch(url, {
            method: existing ? 'PATCH' : 'POST',
            headers: {
                Authorization: `Bearer ${tok}`,
                'Content-Type': 'application/json',
                'X-Upload-Content-Type': 'application/octet-stream',
            },
            body: JSON.stringify(metadata),
        });
        if (!init.ok)
            throw new Error(`Upload init ${init.status}: ${await init.text()}`);
        const session = init.headers.get('Location');
        if (!session)
            throw new Error('No upload session URL');
        const stat = fs.statSync(localPath);
        if (onProgress)
            onProgress(0, stat.size);
        const stream = fs.createReadStream(localPath);
        // crude progress: bump every chunk
        let sent = 0;
        stream.on('data', (c) => {
            sent += c.length;
            onProgress?.(sent, stat.size);
        });
        const put = await fetch(session, {
            method: 'PUT',
            headers: { 'Content-Length': String(stat.size) },
            body: stream,
            duplex: 'half',
        });
        if (!put.ok)
            throw new Error(`Upload PUT ${put.status}: ${await put.text()}`);
        return (await put.json());
    }
    /** Download by file id to a local path (streamed). */
    async downloadById(fileId, localPath, onProgress) {
        const tok = await this.accessToken();
        const res = await fetch(`${API}/files/${fileId}?alt=media`, {
            headers: { Authorization: `Bearer ${tok}` },
        });
        if (!res.ok || !res.body)
            throw new Error(`Download ${res.status}: ${await res.text().catch(() => '')}`);
        fs.mkdirSync(path.dirname(localPath), { recursive: true });
        const out = fs.createWriteStream(localPath);
        const node = stream_1.Readable.fromWeb(res.body);
        if (onProgress)
            node.on('data', (c) => onProgress(c.length));
        await new Promise((resolve, reject) => {
            node.pipe(out);
            out.on('finish', () => resolve());
            out.on('error', reject);
            node.on('error', reject);
        });
    }
}
exports.DriveClient = DriveClient;
//# sourceMappingURL=client.js.map