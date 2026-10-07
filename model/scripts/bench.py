"""
bench.py — بيقيس إنتاجية التدريب الحقيقية (توكن/ثانية) لتوليفة threads/batch معيّنة.

بيستخدم نفس الموديل ونفس الداتا بتاعة train.py، وبيعمل fwd+bwd حقيقي.
مش بيحفظ أي checkpoint ومش بيلمس حالة التدريب.

    python model/scripts/bench.py --threads 5 --batch 24
"""
import argparse
import os
import time

import numpy as np
import torch

import data_common as dc
from model import GPT, GPTConfig


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--preset", default="nano_cpu")
    ap.add_argument("--threads", type=int, required=True)
    ap.add_argument("--batch", type=int, required=True)
    ap.add_argument("--warmup", type=int, default=3)
    ap.add_argument("--iters", type=int, default=12)
    args = ap.parse_args()

    torch.set_num_threads(args.threads)
    cfg = dc.load_json(dc.ARCH_CONFIG)["presets"][args.preset]
    m, tr = cfg["model"], cfg["train"]
    block = m["block_size"]

    data = np.memmap(os.path.join(dc.ROOT, "data", "bin", "train.bin"), dtype=np.uint16, mode="r")
    meta = dc.load_json(os.path.join(dc.ROOT, "data", "bin", "meta.json"))
    vocab = max(m["vocab_size"], meta.get("tokenizer_vocab", 0))

    model = GPT(GPTConfig(n_layer=m["n_layer"], n_head=m["n_head"], n_embd=m["n_embd"],
                          block_size=block, vocab_size=vocab,
                          dropout=m["dropout"], bias=m["bias"]))
    model.train()
    opt = model.configure_optimizers(tr["weight_decay"], tr["learning_rate"],
                                     (tr["beta1"], tr["beta2"]), "cpu")

    def batch():
        ix = torch.randint(len(data) - block, (args.batch,))
        x = torch.stack([torch.from_numpy(data[i:i + block].astype(np.int64)) for i in ix])
        y = torch.stack([torch.from_numpy(data[i + 1:i + 1 + block].astype(np.int64)) for i in ix])
        return x, y

    def step():
        X, Y = batch()
        _, loss = model(X, Y)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), tr["grad_clip"])
        opt.step()
        opt.zero_grad(set_to_none=True)

    for _ in range(args.warmup):
        step()

    t0 = time.time()
    for _ in range(args.iters):
        step()
    dt = time.time() - t0

    tok = args.iters * args.batch * block
    print(f"threads={args.threads} batch={args.batch} | "
          f"{dt / args.iters:.2f} ث/خطوة | {tok / dt:,.0f} توكن/ثانية")


if __name__ == "__main__":
    main()
