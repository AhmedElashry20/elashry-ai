"use strict";
// الأهداف (Goals) — مستوحى من ورشة Codex: مش بس برومبت، ده برومبت + معايير قبول،
// والإيجنت بيفضل يلف لحد ما المعايير تتحقق بدل ما يقف عند أول محاولة.
//
// فرق مهم عن Codex: هناك الموديل هو اللي بيحكم "هل خلصت؟". هنا الحكم *حتمي* —
// أوامر لازم ترجع 0، ملفات لازم تكون موجودة، نصوص لازم تتواجد. السبب إن الموديل
// المحلي مش قادر يحكم على شغله، فلو سبناه يحكم هيقول "خلصت" وهو ما خلّصش.
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkCriterion = checkCriterion;
exports.checkAll = checkAll;
exports.runGoal = runGoal;
exports.parseGoalFile = parseGoalFile;

const fs = require("fs");
const path = require("path");
const cp = require("child_process");

function runCmd(cmd, cwd, timeoutMs = 120000) {
    return new Promise(resolve => {
        cp.exec(cmd, { cwd, timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
            resolve({ code: err ? (err.code ?? 1) : 0, out: `${stdout}${stderr}`.slice(-4000) });
        });
    });
}

// معيار واحد → { ok, detail }
async function checkCriterion(c, workspaceRoot) {
    try {
        if (c.type === 'command') {
            const expect = c.expectExit ?? 0;
            const r = await runCmd(c.run, workspaceRoot, c.timeoutMs);
            return {
                ok: r.code === expect,
                detail: r.code === expect
                    ? `\`${c.run}\` رجع ${r.code}`
                    : `\`${c.run}\` رجع ${r.code} (المتوقع ${expect})\n${r.out}`,
            };
        }
        if (c.type === 'file_exists') {
            const p = path.resolve(workspaceRoot, c.path);
            const ok = fs.existsSync(p);
            return { ok, detail: ok ? `${c.path} موجود` : `${c.path} مش موجود` };
        }
        if (c.type === 'file_contains') {
            const p = path.resolve(workspaceRoot, c.path);
            if (!fs.existsSync(p))
                return { ok: false, detail: `${c.path} مش موجود` };
            const ok = fs.readFileSync(p, 'utf8').includes(c.text);
            return { ok, detail: ok ? `${c.path} فيه النص` : `${c.path} مفهوش "${c.text}"` };
        }
        return { ok: false, detail: `نوع معيار مش معروف: ${c.type}` };
    }
    catch (e) {
        return { ok: false, detail: `فشل فحص المعيار: ${e?.message ?? e}` };
    }
}

async function checkAll(criteria, workspaceRoot) {
    const results = [];
    for (const c of criteria)
        results.push({ c, ...(await checkCriterion(c, workspaceRoot)) });
    return { passed: results.every(r => r.ok), results };
}

function failureReport(results) {
    const failed = results.filter(r => !r.ok);
    return failed.map((r, i) => `${i + 1}. ${r.detail}`).join('\n');
}

/**
 * بيشغّل الإيجنت في حلقة لحد ما كل المعايير تعدّي أو نوصل maxRounds.
 * agentRunner(prompt, signal) لازم يكون async generator بيرجّع أحداث الإيجنت.
 * بيعمل yield لأحداث الإيجنت + أحداث الهدف (round/check/goal_done).
 */
async function* runGoal(goal, ctx) {
    const { workspaceRoot, agentRunner, signal } = ctx;
    const maxRounds = goal.maxRounds ?? 5;
    const criteria = goal.criteria ?? [];

    // لو مفيش معايير، الهدف بيبقى مجرد برومبت عادي — مفيش حلقة
    if (!criteria.length) {
        yield { type: 'goal_warning', text: 'الهدف من غير معايير قبول — هيتنفّذ مرة واحدة بس.' };
    }

    let prompt = goal.prompt;
    for (let round = 1; round <= maxRounds; round++) {
        if (signal?.aborted) {
            yield { type: 'goal_done', reason: 'aborted', round };
            return;
        }
        yield { type: 'goal_round', round, maxRounds };

        for await (const ev of agentRunner(prompt, signal))
            yield ev;

        if (!criteria.length) {
            yield { type: 'goal_done', reason: 'no_criteria', round };
            return;
        }

        yield { type: 'goal_checking', round };
        const { passed, results } = await checkAll(criteria, workspaceRoot);
        for (const r of results)
            yield { type: 'goal_check', ok: r.ok, detail: r.detail };

        if (passed) {
            yield { type: 'goal_done', reason: 'passed', round };
            return;
        }

        // المعايير اللي وقعت بترجع للإيجنت كبرومبت الجولة الجاية
        prompt = [
            `المعايير دي لسه ما اتحققتش بعد محاولتك. صلّحها:`,
            failureReport(results),
            ``,
            `الهدف الأصلي: ${goal.prompt}`,
            `ماتقولش خلصت غير لما كل المعايير تعدّي.`,
        ].join('\n');
    }
    yield { type: 'goal_done', reason: 'max_rounds', round: maxRounds };
}

// ملف هدف = JSON فيه { prompt, criteria[], maxRounds }
function parseGoalFile(text) {
    const g = JSON.parse(text);
    if (!g.prompt || typeof g.prompt !== 'string')
        throw new Error('الهدف لازم يكون فيه prompt');
    if (g.criteria && !Array.isArray(g.criteria))
        throw new Error('criteria لازم تكون مصفوفة');
    return g;
}
