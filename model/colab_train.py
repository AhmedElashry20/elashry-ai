"""
colab_train.py — تدريب نموذج elashry-ai الأكبر (micro ~34M) على GPU مجاني (Colab).
مكتفي بذاته: بيسحب الداتا + يدرّب توكنيزر + يدرّب النموذج + يولّد عيّنة. صفر API خارجي.

الاستخدام على Colab (Runtime → GPU):
    !pip install -q datasets tokenizers
    !python colab_train.py
أو الصق محتواه في خلية. الملف ده نسخة colab من نفس بايبلاين model/scripts.
"""
import json
import math
import os
import random
import time
from dataclasses import dataclass

import numpy as np
import torch
import torch.nn as nn
from torch.nn import functional as F
from tokenizers import Tokenizer, decoders, models, pre_tokenizers, trainers

# ================== إعدادات (عدّلها بحرية) ==================
OUT = os.environ.get("ELASHRY_OUT", "/content/elashry")   # على Colab. للحفظ الدائم استخدم /content/drive/MyDrive/elashry
VOCAB_SIZE = 16384
CAP_PER_DATASET = 20_000_000     # سقف توكنز لكل داتاسِت (المجموع ~100M+)
TOK_SAMPLE = 20000               # عيّنة تدريب التوكنيزر لكل داتاسِت
# معمارية micro (~34M)
N_LAYER, N_HEAD, N_EMBD, BLOCK, DROPOUT = 8, 8, 512, 512, 0.05
# تدريب
MAX_ITERS, WARMUP, LR, MIN_LR = 8000, 300, 6e-4, 6e-5
BATCH, GRAD_ACCUM, WD, GRAD_CLIP = 24, 8, 0.1, 1.0
EVAL_INTERVAL, EVAL_ITERS = 500, 50

SPECIAL = ["<|task|>", "<|context|>", "<|response|>", "<|end|>",
           "<fim_prefix>", "<fim_suffix>", "<fim_middle>", "<|file|>", "<|lang|>"]
END = "<|end|>"
DATASETS = [
    "roneneldan/TinyStories", "jtatman/python-code-dataset-500k",
    "iamtarun/python_code_instructions_18k_alpaca", "sahil2801/CodeAlpaca-20k",
    "m-a-p/CodeFeedback-Filtered-Instruction", "bigcode/self-oss-instruct-sc2-exec-filter-50k",
]
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"


# ---------- تنسيق الداتا (نفس منطق data_common) ----------
def pick(ex, keys):
    for k in keys:
        v = ex.get(k)
        if isinstance(v, str) and v.strip():
            return v.strip()
    return None


def fmt(rid, ex):
    def instr(t, c, r):
        return f"<|task|> {t}" + (f"\n<|context|> {c}" if c else "") + f"\n<|response|> {r}{END}"
    if rid == "roneneldan/TinyStories":
        t = pick(ex, ["text"]); return f"{t}{END}" if t else None
    if rid == "jtatman/python-code-dataset-500k":
        t, o = pick(ex, ["instruction"]), pick(ex, ["output"]); return instr(t, None, o) if t and o else None
    if rid in ("sahil2801/CodeAlpaca-20k", "iamtarun/python_code_instructions_18k_alpaca"):
        t, o = pick(ex, ["instruction"]), pick(ex, ["output"]); return instr(t, pick(ex, ["input"]), o) if t and o else None
    if rid == "m-a-p/CodeFeedback-Filtered-Instruction":
        t, o = pick(ex, ["query"]), pick(ex, ["answer"]); return instr(t, None, o) if t and o else None
    if rid == "bigcode/self-oss-instruct-sc2-exec-filter-50k":
        t, o = pick(ex, ["instruction"]), pick(ex, ["response"]); return instr(t, None, o) if t and o else None
    return None


def stream(rid, limit=None):
    from datasets import load_dataset
    ds = load_dataset(rid, split="train", streaming=True)
    n = 0
    for ex in ds:
        yield ex
        n += 1
        if limit and n >= limit:
            break


# ---------- توكنيزر ----------
def train_tokenizer():
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, "tokenizer.json")
    if os.path.exists(path):
        print("توكنيزر موجود، بستخدمه.")
        return Tokenizer.from_file(path)

    def corpus():
        for rid in DATASETS:
            try:
                for ex in stream(rid, TOK_SAMPLE):
                    t = fmt(rid, ex)
                    if t and 8 <= len(t) <= 20000:
                        yield t
            except Exception as e:
                print("skip", rid, e)
    tok = Tokenizer(models.BPE(unk_token=None))
    tok.pre_tokenizer = pre_tokenizers.ByteLevel(add_prefix_space=False)
    tok.decoder = decoders.ByteLevel()
    tr = trainers.BpeTrainer(vocab_size=VOCAB_SIZE, special_tokens=SPECIAL,
                             initial_alphabet=pre_tokenizers.ByteLevel.alphabet(), show_progress=True)
    print("بدرّب التوكنيزر...")
    tok.train_from_iterator(corpus(), trainer=tr)
    tok.save(path)
    print("vocab =", tok.get_vocab_size())
    return tok


# ---------- تجهيز الداتا ----------
def prepare(tok):
    os.makedirs(OUT, exist_ok=True)
    tp, vp = os.path.join(OUT, "train.bin"), os.path.join(OUT, "val.bin")
    if os.path.exists(tp):
        print("bins موجودة، بستخدمها.")
        return
    rng = random.Random(1337)
    ft, fv = open(tp, "wb"), open(vp, "wb")
    total = 0
    for rid in DATASETS:
        got, buf = 0, []
        try:
            for ex in stream(rid):
                t = fmt(rid, ex)
                if not t or not (8 <= len(t) <= 100000):
                    continue
                buf.append(t)
                if len(buf) >= 1000:
                    for e in tok.encode_batch(buf):
                        arr = np.array(e.ids, dtype=np.uint16)
                        (fv if rng.random() < 0.005 else ft).write(arr.tobytes())
                        got += len(e.ids)
                    buf = []
                    if got >= CAP_PER_DATASET:
                        break
        except Exception as e:
            print("skip", rid, e)
        total += got
        print(f"  {rid}: {got:,} tok")
    ft.close(); fv.close()
    print(f"إجمالي ~{total:,} توكن")


# ---------- النموذج (نفس model.py) ----------
@dataclass
class Cfg:
    n_layer: int; n_head: int; n_embd: int; block_size: int; vocab_size: int; dropout: float; bias: bool = False


class Block(nn.Module):
    def __init__(s, c):
        super().__init__()
        s.ln1 = nn.LayerNorm(c.n_embd); s.ln2 = nn.LayerNorm(c.n_embd)
        s.attn = nn.Linear(c.n_embd, 3 * c.n_embd, bias=False)
        s.proj = nn.Linear(c.n_embd, c.n_embd, bias=False)
        s.fc = nn.Linear(c.n_embd, 4 * c.n_embd, bias=False)
        s.fc2 = nn.Linear(4 * c.n_embd, c.n_embd, bias=False)
        s.nh, s.ne, s.drop = c.n_head, c.n_embd, c.dropout

    def forward(s, x):
        B, T, C = x.shape
        q, k, v = s.attn(s.ln1(x)).split(s.ne, 2)
        q = q.view(B, T, s.nh, C // s.nh).transpose(1, 2)
        k = k.view(B, T, s.nh, C // s.nh).transpose(1, 2)
        v = v.view(B, T, s.nh, C // s.nh).transpose(1, 2)
        y = F.scaled_dot_product_attention(q, k, v, dropout_p=s.drop if s.training else 0, is_causal=True)
        x = x + s.proj(y.transpose(1, 2).contiguous().view(B, T, C))
        x = x + s.fc2(F.gelu(s.fc(s.ln2(x))))
        return x


class GPT(nn.Module):
    def __init__(s, c):
        super().__init__()
        s.c = c
        s.wte = nn.Embedding(c.vocab_size, c.n_embd)
        s.wpe = nn.Embedding(c.block_size, c.n_embd)
        s.drop = nn.Dropout(c.dropout)
        s.h = nn.ModuleList([Block(c) for _ in range(c.n_layer)])
        s.lnf = nn.LayerNorm(c.n_embd)
        s.head = nn.Linear(c.n_embd, c.vocab_size, bias=False)
        s.wte.weight = s.head.weight
        s.apply(s._init)

    def _init(s, m):
        if isinstance(m, (nn.Linear, nn.Embedding)):
            nn.init.normal_(m.weight, 0, 0.02)

    def forward(s, idx, targets=None):
        B, T = idx.shape
        pos = torch.arange(T, device=idx.device)
        x = s.drop(s.wte(idx) + s.wpe(pos))
        for b in s.h:
            x = b(x)
        x = s.lnf(x)
        logits = s.head(x)
        loss = None if targets is None else F.cross_entropy(logits.view(-1, logits.size(-1)), targets.view(-1))
        return logits, loss

    @torch.no_grad()
    def generate(s, idx, n, temp=0.8, topk=50):
        for _ in range(n):
            logits, _ = s(idx[:, -s.c.block_size:])
            logits = logits[:, -1, :] / temp
            if topk:
                v, _ = torch.topk(logits, topk); logits[logits < v[:, [-1]]] = -float("inf")
            idx = torch.cat([idx, torch.multinomial(F.softmax(logits, -1), 1)], 1)
        return idx


# ---------- تدريب ----------
def get_batch(data, bs, bl):
    ix = torch.randint(len(data) - bl, (bs,))
    x = torch.stack([torch.from_numpy(data[i:i + bl].astype(np.int64)) for i in ix])
    y = torch.stack([torch.from_numpy(data[i + 1:i + 1 + bl].astype(np.int64)) for i in ix])
    return x.to(DEVICE), y.to(DEVICE)


def lr_at(it):
    if it < WARMUP:
        return LR * (it + 1) / WARMUP
    r = (it - WARMUP) / max(1, MAX_ITERS - WARMUP)
    return MIN_LR + 0.5 * (1 + math.cos(math.pi * r)) * (LR - MIN_LR)


def train():
    tr = np.memmap(os.path.join(OUT, "train.bin"), dtype=np.uint16, mode="r")
    va = np.memmap(os.path.join(OUT, "val.bin"), dtype=np.uint16, mode="r")
    print(f"train {len(tr):,} | val {len(va):,} | device {DEVICE}")
    model = GPT(Cfg(N_LAYER, N_HEAD, N_EMBD, BLOCK, VOCAB_SIZE, DROPOUT)).to(DEVICE)
    print(f"params ~{sum(p.numel() for p in model.parameters())/1e6:.1f}M")
    opt = torch.optim.AdamW(model.parameters(), lr=LR, betas=(0.9, 0.95), weight_decay=WD)
    best = 1e9
    t0 = time.time()
    for it in range(MAX_ITERS):
        for g in opt.param_groups:
            g["lr"] = lr_at(it)
        for _ in range(GRAD_ACCUM):
            x, y = get_batch(tr, BATCH, BLOCK)
            with torch.autocast(DEVICE, dtype=torch.bfloat16, enabled=DEVICE == "cuda"):
                _, loss = model(x, y); loss = loss / GRAD_ACCUM
            loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), GRAD_CLIP)
        opt.step(); opt.zero_grad(set_to_none=True)
        if it % EVAL_INTERVAL == 0 or it == MAX_ITERS - 1:
            model.eval()
            with torch.no_grad():
                vl = torch.stack([model(*get_batch(va, BATCH, BLOCK))[1] for _ in range(EVAL_ITERS)]).mean().item()
            model.train()
            print(f"iter {it:>5} | val {vl:.4f} | lr {lr_at(it):.2e} | {time.time()-t0:.0f}s")
            if vl < best:
                best = vl
                torch.save({"model": model.state_dict(),
                            "config": {"n_layer": N_LAYER, "n_head": N_HEAD, "n_embd": N_EMBD,
                                       "block_size": BLOCK, "vocab_size": VOCAB_SIZE, "dropout": DROPOUT, "bias": False}},
                           os.path.join(OUT, "micro.pt"))
    print("أحسن val:", best)
    return model


def sample(model, tok, prompt="Write a python function that reverses a string"):
    ids = tok.encode(f"<|task|> {prompt}\n<|response|> ").ids
    out = model.generate(torch.tensor([ids], device=DEVICE), 80)
    print("=" * 50); print(tok.decode(out[0].tolist())); print("=" * 50)


if __name__ == "__main__":
    tok = train_tokenizer()
    prepare(tok)
    model = train()
    sample(model, tok)
