"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BackgroundResearcher = void 0;
class BackgroundResearcher {
    queue;
    researcher;
    opts;
    timer;
    running = false;
    inFlight = false;
    abortCtrl;
    constructor(queue, researcher, opts) {
        this.queue = queue;
        this.researcher = researcher;
        this.opts = opts;
    }
    isRunning() {
        return this.running;
    }
    start() {
        if (this.running)
            return;
        this.running = true;
        this.opts.log?.(`[background] started (every ${Math.round(this.opts.intervalMs / 60000)}m)`);
        this.scheduleNext(2000);
    }
    stop() {
        if (!this.running)
            return;
        this.running = false;
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = undefined;
        }
        this.abortCtrl?.abort();
        this.opts.log?.('[background] stopped');
    }
    async runOnce() {
        if (this.inFlight)
            return 'A research iteration is already in progress';
        return this.tick(true);
    }
    scheduleNext(delayMs) {
        if (!this.running)
            return;
        this.timer = setTimeout(() => {
            if (!this.running)
                return;
            this.tick(false).finally(() => {
                if (this.running)
                    this.scheduleNext(this.opts.intervalMs);
            });
        }, delayMs);
    }
    async tick(force) {
        if (this.inFlight)
            return 'busy';
        const entry = this.queue.nextPending();
        if (!entry) {
            this.opts.log?.('[background] queue empty — nothing to research');
            return 'Queue empty';
        }
        this.inFlight = true;
        this.abortCtrl = new AbortController();
        try {
            const report = await this.researcher.researchTopic(entry.topic, this.abortCtrl.signal);
            if (report.chunks > 0) {
                this.queue.markDone(entry.topic);
                return `Researched "${entry.topic}" — ${report.chunks} chunks from ${report.fetched} pages`;
            }
            else {
                const errMsg = report.errors[0] ?? 'no usable content';
                this.queue.markFailed(entry.topic, errMsg);
                return `Failed "${entry.topic}": ${errMsg}`;
            }
        }
        catch (err) {
            const msg = err?.message ?? String(err);
            this.queue.markFailed(entry.topic, msg);
            this.opts.log?.(`[background] error on "${entry.topic}": ${msg}`);
            return `Error: ${msg}`;
        }
        finally {
            this.inFlight = false;
            this.abortCtrl = undefined;
        }
    }
}
exports.BackgroundResearcher = BackgroundResearcher;
//# sourceMappingURL=background.js.map