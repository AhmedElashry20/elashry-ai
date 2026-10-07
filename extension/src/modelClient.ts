import * as cp from 'child_process';
import * as path from 'path';

export interface GenRequest {
  prompt: string;
  agent?: boolean;
  max_new_tokens?: number;
  temperature?: number;
  top_k?: number;
}

interface GenResponse {
  ok: boolean; text?: string; error?: string; ready?: boolean;
  params?: number; iter?: number; val?: number; delta?: string; done?: boolean;
}

export interface ModelInfo { params?: number; iter?: number; val?: number; }

/**
 * ModelClient — بيشغّل serve.py كـ subprocess ويتكلّم معاه ببروتوكول سطر-JSON.
 * كل حاجة محلية، مفيش أي API خارجي.
 */
export class ModelClient {
  private proc: cp.ChildProcessWithoutNullStreams | undefined;
  private buffer = '';
  private pending: ((r: GenResponse) => void)[] = [];
  private ready = false;
  private readyWaiters: Array<{ res: () => void; rej: (e: Error) => void }> = [];
  private startupError: string | undefined;
  private streamHandler: { onDelta: (s: string) => void; resolve: () => void; reject: (e: Error) => void } | undefined;
  info: ModelInfo | undefined;

  constructor(
    private pythonPath: string,
    private modelDir: string,
    private preset: string,
    private onReady?: (info: ModelInfo) => void
  ) {}

  private start(): void {
    if (this.proc) { return; }
    const serve = path.join(this.modelDir, 'scripts', 'serve.py');
    this.proc = cp.spawn(this.pythonPath, [serve, '--preset', this.preset], { cwd: this.modelDir });
    this.proc.stdout.on('data', (d: Buffer) => this.onData(d.toString()));
    this.proc.stderr.on('data', (d: Buffer) => console.log('[serve]', d.toString()));
    this.proc.on('exit', () => {
      const err = new Error(this.startupError || 'serve.py توقف');
      this.readyWaiters.forEach(w => w.rej(err));
      this.readyWaiters = [];
      this.proc = undefined;
      this.ready = false;
    });
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    let idx: number;
    while ((idx = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!line) { continue; }
      let msg: GenResponse;
      try { msg = JSON.parse(line); } catch { continue; }
      if (msg.ready) {
        this.ready = true;
        this.info = { params: msg.params, iter: msg.iter, val: msg.val };
        this.onReady?.(this.info);
        this.readyWaiters.forEach(w => w.res());
        this.readyWaiters = [];
        continue;
      }
      if (!this.ready && msg.ok === false) {
        // خطأ بدء التشغيل (مفيش checkpoint مثلاً)
        this.startupError = msg.error;
        continue;
      }
      // ردود الـ streaming
      if (this.streamHandler) {
        if (msg.ok === false) { this.streamHandler.reject(new Error(msg.error)); this.streamHandler = undefined; continue; }
        if (msg.done) { this.streamHandler.resolve(); this.streamHandler = undefined; continue; }
        if (msg.delta !== undefined) { this.streamHandler.onDelta(msg.delta); continue; }
      }
      const resolve = this.pending.shift();
      if (resolve) { resolve(msg); }
    }
  }

  private waitReady(): Promise<void> {
    if (this.ready) { return Promise.resolve(); }
    return new Promise<void>((res, rej) => this.readyWaiters.push({ res, rej }));
  }

  async generate(req: GenRequest): Promise<string> {
    this.start();
    await this.waitReady();
    return new Promise<string>((resolve, reject) => {
      this.pending.push((r) => (r.ok ? resolve(r.text ?? '') : reject(new Error(r.error))));
      this.proc!.stdin.write(JSON.stringify(req) + '\n');
    });
  }

  /** توليد بالتدفّق: onDelta بتتنادى مع كل جزء نص جديد؛ الـ Promise بتخلص عند النهاية */
  async generateStream(req: GenRequest, onDelta: (s: string) => void): Promise<void> {
    this.start();
    await this.waitReady();
    return new Promise<void>((resolve, reject) => {
      this.streamHandler = { onDelta, resolve, reject };
      this.proc!.stdin.write(JSON.stringify({ ...req, stream: true }) + '\n');
    });
  }

  dispose(): void { this.proc?.kill(); }
}
