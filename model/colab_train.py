"""
colab_train.py — تدريب نسخة أكبر من elashry-ai على GPU مجاني (Colab).

الفرق عن التدريب المحلي: الجهاز المحلي بيطلّع ~18M باراميتر وبياخد شهور.
على T4 تقدر تدرّب **98M** — قريب من الحجم الأمثل لكوربَسك (130M لـ 2.6 مليار توكن).

**متوافق مع إعدادك المحلي:**
  • بيستخدم **نفس التوكنيزر** (بيتسحب من الريبو) — مش بيعمل واحد جديد.
    ده معناه إن الـ checkpoint الناتج بيشتغل مع ollama_adapter.py و generate.py
    وserve.py من غير أي تعديل.
  • نفس التوكنز الخاصة ونفس قوالب الداتا (من data_common.py).
  • بيسحب نفس الداتا، بما فيها الـ 88 لغة برمجة.

**بيكمّل من حيث وقف:** Colab بيقطع الجلسة. الـ checkpoint بيتحفظ على Drive كل
فترة، وتشغيل الدفتر تاني بيكمّل — مش بيبدأ من الصفر.

الاستخدام على Colab:
    Runtime → Change runtime type → T4 GPU، وبعدين Run all.
"""
import json
import math
import os
import subprocess
import sys
import time

REPO = "https://github.com/AhmedElashry20/elashry-ai.git"

# ═══════════════ إعدادات ═══════════════
# الحفظ على Drive عشان الجلسة لما تتقطع ماتضيعش. من غير Drive → /content (مؤقت).
OUT = os.environ.get("ELASHRY_OUT", "/content/drive/MyDrive/elashry")

# معمارية 98M — 12 طبقة × 768. أكبر من المحلي (18M) بـ 5 أضعاف.
N_LAYER, N_HEAD, N_EMBD, BLOCK, DROPOUT = 12, 12, 768, 512, 0.0
VOCAB_SIZE = 16384                 # لازم يطابق التوكنيزر الموجود

CAP_PER_SOURCE = 40_000_000        # سقف توكنز لكل مصدر
STACK_ROWS_PER_LANG = 2000         # ملفات لكل لغة من الـ 88

MAX_ITERS, WARMUP = 30000, 500
LR, MIN_LR = 3e-4, 3e-5
BATCH, GRAD_ACCUM = 12, 4          # 12×4×512 = 24,576 توكن لكل خطوة
WD, GRAD_CLIP = 0.1, 1.0
EVAL_INTERVAL, EVAL_ITERS = 500, 40
SAVE_EVERY_MIN = 10                # يحفظ على Drive كل كام دقيقة

STACK = "bigcode/the-stack-smol-xl"
# مصادر التعليمات — نفس اللي في hf_datasets.json
INSTRUCT = [
    "roneneldan/TinyStories",
    "jtatman/python-code-dataset-500k",
    "ise-uiuc/Magicoder-Evol-Instruct-110K",
    "ise-uiuc/Magicoder-OSS-Instruct-75K",
    "nickrosh/Evol-Instruct-Code-80k-v1",
    "glaiveai/glaive-code-assistant",
    "theblackcat102/evol-codealpaca-v1",
    "m-a-p/CodeFeedback-Filtered-Instruction",
    "bigcode/self-oss-instruct-sc2-exec-filter-50k",
    "christopher/rosetta-code",
]


def sh(*cmd):
    subprocess.run(list(cmd), check=True)


def setup():
    """بيجيب الريبو (التوكنيزر + القوالب) ويثبّت المكتبات."""
    if not os.path.isdir("/content/elashry-ai"):
        sh("git", "clone", "--depth", "1", REPO, "/content/elashry-ai")
    sys.path.insert(0, "/content/elashry-ai/model/scripts")
    try:
        import datasets, tokenizers  # noqa: F401
    except ImportError:
        sh(sys.executable, "-m", "pip", "install", "-q", "datasets", "tokenizers")
    if OUT.startswith("/content/drive"):
        try:
            from google.colab import drive
            if not os.path.ismount("/content/drive"):
                drive.mount("/content/drive")
        except Exception as e:
            print(f"⚠️  Drive مش متاح ({e}) — هحفظ على /content (هيضيع لما الجلسة تقفل)")
            return "/content/elashry_out"
    os.makedirs(OUT, exist_ok=True)
    return OUT


def build_bins(out_dir, tok):
    """بيسحب الداتا ويحوّلها لـ train.bin/val.bin. بيتخطاها لو موجودة."""
    import numpy as np
    import data_common as dc

    train_p = os.path.join(out_dir, "train.bin")
    val_p = os.path.join(out_dir, "val.bin")
    if os.path.exists(train_p) and os.path.getsize(train_p) > 10_000_000:
        n = os.path.getsize(train_p) // 2
        print(f"✓ الداتا موجودة ({n/1e6:.0f} مليون توكن) — بتخطّى السحب")
        return train_p, val_p

    rng = np.random.default_rng(1337)
    ftr, fva = open(train_p, "wb"), open(val_p, "wb")
    total = 0

    def emit(text):
        nonlocal total
        ids = np.asarray(tok.encode(text).ids, dtype=np.uint16)
        (fva if rng.random() < 0.005 else ftr).write(ids.tobytes())
        total += ids.size
        return ids.size

    for rid in INSTRUCT:
        got, t0 = 0, time.time()
        try:
            for ex in dc.iter_examples(rid):
                t = dc.format_example(rid, ex)
                if not t:
                    continue
                t = dc.clean_text(t)
                if 16 <= len(t) <= 60000:
                    got += emit(t)
                if got >= CAP_PER_SOURCE:
                    break
        except Exception as e:
            print(f"  ⚠️  {rid}: {type(e).__name__}: {str(e)[:70]}")
        print(f"  {rid}: {got/1e6:.1f}M توكن ({time.time()-t0:.0f}ث)", flush=True)

    print(f"\n── الـ 88 لغة من {STACK} ──", flush=True)
    for i, lang in enumerate(dc.STACK_LANGS, 1):
        got = 0
        try:
            for ex in dc.iter_examples(STACK, limit=STACK_ROWS_PER_LANG,
                                       data_dir=f"data/{lang}"):
                t = dc.format_example(STACK, ex)
                if not t:
                    continue
                t = dc.clean_text(t)
                if 16 <= len(t) <= 60000:
                    got += emit(t)
        except Exception as e:
            print(f"  ⚠️  {lang}: {str(e)[:60]}")
        if i % 10 == 0 or got:
            print(f"  [{i}/{len(dc.STACK_LANGS)}] {lang}: {got/1e6:.1f}M "
                  f"| الإجمالي {total/1e6:.0f}M", flush=True)

    ftr.close(); fva.close()
    print(f"\n✓ الكوربَس: {total/1e6:.0f} مليون توكن")
    return train_p, val_p


def main():
    import numpy as np
    import torch
    import torch.nn as nn
    from torch.nn import functional as F
    from tokenizers import Tokenizer

    out = setup()
    dev = "cuda" if torch.cuda.is_available() else "cpu"
    if dev == "cpu":
        print("⚠️  مفيش GPU — Runtime → Change runtime type → T4 GPU")
    else:
        print(f"GPU: {torch.cuda.get_device_name(0)}")

    # التوكنيزر الموجود — مش بنعمل واحد جديد عشان التوافق
    tok_path = "/content/elashry-ai/model/tokenizer/tokenizer.json"
    tok = Tokenizer.from_file(tok_path)
    assert tok.get_vocab_size() == VOCAB_SIZE, \
        f"التوكنيزر {tok.get_vocab_size()} مش {VOCAB_SIZE}"
    print(f"✓ التوكنيزر من الريبو — مفردات {tok.get_vocab_size()}")

    train_p, val_p = build_bins(out, tok)
    train = np.memmap(train_p, dtype=np.uint16, mode="r")
    val = np.memmap(val_p, dtype=np.uint16, mode="r")
    if len(val) < BLOCK * 2:
        val = train
    print(f"train {len(train)/1e6:.0f}M | val {len(val)/1e6:.1f}M توكن")

    # ───────── الموديل (نفس شكل model.py عشان الـ checkpoint يتوافق) ─────────
    class Block(nn.Module):
        def __init__(s):
            super().__init__()
            s.ln_1 = nn.LayerNorm(N_EMBD, bias=False)
            s.ln_2 = nn.LayerNorm(N_EMBD, bias=False)
            s.attn_c_attn = nn.Linear(N_EMBD, 3 * N_EMBD, bias=False)
            s.attn_c_proj = nn.Linear(N_EMBD, N_EMBD, bias=False)
            s.mlp_c_fc = nn.Linear(N_EMBD, 4 * N_EMBD, bias=False)
            s.mlp_c_proj = nn.Linear(4 * N_EMBD, N_EMBD, bias=False)

        def forward(s, x):
            B, T, C = x.shape
            q, k, v = s.attn_c_attn(s.ln_1(x)).split(C, dim=2)
            q = q.view(B, T, N_HEAD, C // N_HEAD).transpose(1, 2)
            k = k.view(B, T, N_HEAD, C // N_HEAD).transpose(1, 2)
            v = v.view(B, T, N_HEAD, C // N_HEAD).transpose(1, 2)
            y = F.scaled_dot_product_attention(q, k, v, is_causal=True)
            x = x + s.attn_c_proj(y.transpose(1, 2).contiguous().view(B, T, C))
            h = s.ln_2(x)
            return x + s.mlp_c_proj(F.gelu(s.mlp_c_fc(h)))

    class GPT(nn.Module):
        def __init__(s):
            super().__init__()
            s.wte = nn.Embedding(VOCAB_SIZE, N_EMBD)
            s.wpe = nn.Embedding(BLOCK, N_EMBD)
            s.h = nn.ModuleList([Block() for _ in range(N_LAYER)])
            s.ln_f = nn.LayerNorm(N_EMBD, bias=False)
            s.head = nn.Linear(N_EMBD, VOCAB_SIZE, bias=False)
            s.wte.weight = s.head.weight
            s.apply(lambda m: nn.init.normal_(m.weight, std=0.02)
                    if isinstance(m, (nn.Linear, nn.Embedding)) else None)

        def forward(s, idx, targets=None):
            B, T = idx.shape
            x = s.wte(idx) + s.wpe(torch.arange(T, device=idx.device))
            for b in s.h:
                x = b(x)
            logits = s.head(s.ln_f(x))
            loss = None if targets is None else F.cross_entropy(
                logits.view(-1, VOCAB_SIZE), targets.view(-1))
            return logits, loss

    model = GPT().to(dev)
    nparam = sum(p.numel() for p in model.parameters())
    print(f"الباراميترات: {nparam/1e6:.1f}M")

    opt = torch.optim.AdamW(model.parameters(), lr=LR, betas=(0.9, 0.95), weight_decay=WD)
    scaler = torch.amp.GradScaler("cuda", enabled=(dev == "cuda"))

    # ───────── استكمال من Drive ─────────
    ck_path = os.path.join(out, "colab_98m.pt")
    start_it, best_val = 0, float("inf")
    if os.path.exists(ck_path):
        ck = torch.load(ck_path, map_location=dev)
        model.load_state_dict(ck["model"])
        opt.load_state_dict(ck["optimizer"])
        start_it, best_val = ck["iter"] + 1, ck.get("best_val", best_val)
        print(f"↻ كمّلت من خطوة {start_it} (best_val={best_val:.4f})")

    def batch(data):
        ix = torch.randint(len(data) - BLOCK - 1, (BATCH,))
        x = torch.stack([torch.from_numpy(data[i:i+BLOCK].astype(np.int64)) for i in ix])
        y = torch.stack([torch.from_numpy(data[i+1:i+1+BLOCK].astype(np.int64)) for i in ix])
        return x.to(dev, non_blocking=True), y.to(dev, non_blocking=True)

    def lr_at(it):
        if it < WARMUP:
            return LR * (it + 1) / WARMUP
        r = (it - WARMUP) / max(1, MAX_ITERS - WARMUP)
        return MIN_LR + 0.5 * (1 + math.cos(math.pi * min(1.0, r))) * (LR - MIN_LR)

    @torch.no_grad()
    def evaluate():
        model.eval()
        out_ = {}
        for nm, d in (("train", train), ("val", val)):
            ls = torch.zeros(EVAL_ITERS)
            for k in range(EVAL_ITERS):
                with torch.autocast("cuda", dtype=torch.float16, enabled=(dev == "cuda")):
                    ls[k] = model(*batch(d))[1].item()
            out_[nm] = ls.mean().item()
        model.train()
        return out_

    def save(it, bv):
        tmp = ck_path + ".tmp"
        torch.save({"model": model.state_dict(), "optimizer": opt.state_dict(),
                    "iter": it, "best_val": bv,
                    "config": {"n_layer": N_LAYER, "n_head": N_HEAD, "n_embd": N_EMBD,
                               "block_size": BLOCK, "vocab_size": VOCAB_SIZE,
                               "dropout": DROPOUT, "bias": False},
                    "preset": "colab_98m"}, tmp)
        os.replace(tmp, ck_path)

    print(f"\nبدأ التدريب: {MAX_ITERS} خطوة × {BATCH*GRAD_ACCUM*BLOCK:,} توكن\n")
    model.train()
    t0 = last_save = time.time()
    for it in range(start_it, MAX_ITERS):
        for g in opt.param_groups:
            g["lr"] = lr_at(it)
        for _ in range(GRAD_ACCUM):
            with torch.autocast("cuda", dtype=torch.float16, enabled=(dev == "cuda")):
                loss = model(*batch(train))[1] / GRAD_ACCUM
            scaler.scale(loss).backward()
        scaler.unscale_(opt)
        torch.nn.utils.clip_grad_norm_(model.parameters(), GRAD_CLIP)
        scaler.step(opt); scaler.update()
        opt.zero_grad(set_to_none=True)

        if it % EVAL_INTERVAL == 0 or it == MAX_ITERS - 1:
            L = evaluate()
            dt = time.time() - t0; t0 = time.time()
            star = ""
            if L["val"] < best_val:
                best_val = L["val"]; star = " ✓"
            print(f"خطوة {it:>6} | train {L['train']:.4f} | val {L['val']:.4f} "
                  f"| lr {lr_at(it):.2e} | {dt:.0f}ث{star}", flush=True)
            save(it, best_val); last_save = time.time()
        elif time.time() - last_save > SAVE_EVERY_MIN * 60:
            # حفظ دوري — Colab بيقطع الجلسة فجأة
            save(it, best_val); last_save = time.time()

    print(f"\n✓ خلص. أحسن val = {best_val:.4f}")
    print(f"  الـ checkpoint: {ck_path}")
    print("\nللاستخدام محليًا: نزّله وحطه في model/checkpoints/، وبعدين:")
    print("  .venv/bin/python model/scripts/generate.py --ckpt model/checkpoints/colab_98m.pt \\")
    print("      --agent --prompt \"def factorial(n):\"")


if __name__ == "__main__":
    main()
