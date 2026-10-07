"""
grow_model.py — بيكبّر عمق الموديل من غير ما يضيّع التدريب.

الفكرة: الموديل pre-LN مع residual (`x = x + attn(ln(x))`). فلو صفّرنا إسقاط
الخروج (`c_proj`) لطبقة جديدة، البلوك بيبقى **ممر لا يغيّر حاجة** — الموديل
الأكبر بيطلّع نفس المخرجات بالظبط، وبعدين الطبقات الجديدة تتعلم بالتدريج.

بنركّب الطبقات الجديدة **متداخلة** بين القديمة (قديم، جديد، قديم، جديد...) مش
في الآخر، عشان ما يبقاش فيه ذيل طويل من طبقات فاضية.

    python model/scripts/grow_model.py --to-layers 12            # تجربة + فحص
    python model/scripts/grow_model.py --to-layers 12 --apply    # يكتب فعلاً
"""
import argparse
import os
import shutil
import sys

import numpy as np
import torch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import data_common as dc
from model import GPT, GPTConfig


def plan_layout(old_n, new_n):
    """يرجّع ليستة بطول new_n: رقم الطبقة القديمة اللي تتنسخ، أو None = طبقة جديدة.

    بيوزّع الجديد بالتساوي بين القديم. مثال 6 → 12:
        [0, None, 1, None, 2, None, 3, None, 4, None, 5, None]
    """
    if new_n < old_n:
        raise SystemExit("التصغير مش مدعوم — ده بيضيّع تدريب.")
    extra = new_n - old_n
    layout = []
    for i in range(old_n):
        layout.append(i)
        # عدد الطبقات الجديدة اللي تتحط بعد الطبقة i
        take = extra // old_n + (1 if i < extra % old_n else 0)
        layout.extend([None] * take)
    return layout


def build_grown(old_sd, old_cfg, new_n):
    layout = plan_layout(old_cfg["n_layer"], new_n)
    new_cfg = dict(old_cfg)
    new_cfg["n_layer"] = new_n
    model = GPT(GPTConfig(**new_cfg))
    sd = model.state_dict()

    # 1) كل حاجة بره الطبقات (embeddings, ln_f, lm_head) تتنسخ زي ما هي
    copied = 0
    for k in sd:
        if k.startswith("transformer.h."):
            continue
        if k in old_sd and old_sd[k].shape == sd[k].shape:
            sd[k] = old_sd[k].clone()
            copied += 1

    # 2) الطبقات: القديمة تتنسخ، والجديدة تتصفّر إسقاطاتها = ممر
    fresh = []
    for new_i, src in enumerate(layout):
        if src is None:
            fresh.append(new_i)
            for nm in (f"transformer.h.{new_i}.attn.c_proj.weight",
                       f"transformer.h.{new_i}.mlp.c_proj.weight"):
                sd[nm] = torch.zeros_like(sd[nm])
            continue
        for k in list(sd):
            pre = f"transformer.h.{new_i}."
            if not k.startswith(pre):
                continue
            ok = k.replace(pre, f"transformer.h.{src}.", 1)
            if ok in old_sd and old_sd[ok].shape == sd[k].shape:
                sd[k] = old_sd[ok].clone()
                copied += 1

    model.load_state_dict(sd)
    return model, new_cfg, layout, fresh, copied


@torch.no_grad()
def val_loss(model, n_batches=6, bs=12, bl=256, seed=99):
    path = os.path.join(dc.ROOT, "data", "bin", "val.bin")
    data = np.memmap(path, dtype=np.uint16, mode="r")
    g = torch.Generator().manual_seed(seed)
    model.eval()
    tot = 0.0
    for _ in range(n_batches):
        ix = torch.randint(len(data) - bl, (bs,), generator=g)
        x = torch.stack([torch.from_numpy(data[i:i + bl].astype(np.int64)) for i in ix])
        y = torch.stack([torch.from_numpy(data[i + 1:i + 1 + bl].astype(np.int64)) for i in ix])
        tot += model(x, y)[1].item()
    return tot / n_batches


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--to-layers", type=int, required=True)
    ap.add_argument("--ckpt-dir", default=os.path.join(dc.ROOT, "checkpoints"))
    ap.add_argument("--preset", default="nano_cpu")
    ap.add_argument("--apply", action="store_true", help="من غيرها بيجرب ويطلع بس")
    ap.add_argument("--tol", type=float, default=1e-4, help="أقصى فرق مسموح في الـ loss")
    args = ap.parse_args()

    torch.set_num_threads(int(os.environ.get("TRAIN_THREADS", 4)))
    last = os.path.join(args.ckpt_dir, f"{args.preset}_last.pt")
    best = os.path.join(args.ckpt_dir, f"{args.preset}.pt")
    if not os.path.exists(last):
        raise SystemExit(f"مفيش {last}")

    for src_path, label in ((last, "last"), (best, "best")):
        if not os.path.exists(src_path):
            print(f"⚠️  {label}: مش موجود — بتخطّاه")
            continue
        ck = torch.load(src_path, map_location="cpu")
        old_cfg = dict(ck["config"])
        if old_cfg["n_layer"] >= args.to_layers:
            print(f"ℹ️  {label}: عنده {old_cfg['n_layer']} طبقة بالفعل — بتخطّاه")
            continue

        old = GPT(GPTConfig(**old_cfg))
        old.load_state_dict(ck["model"])
        l_before = val_loss(old)
        n_before = sum(v.numel() for v in ck["model"].values())

        new, new_cfg, layout, fresh, copied = build_grown(ck["model"], old_cfg, args.to_layers)
        l_after = val_loss(new)
        n_after = sum(v.numel() for v in new.state_dict().values())
        diff = abs(l_after - l_before)

        print(f"\n── {label} (iter {ck.get('iter')}) ──")
        print(f"  الترتيب: {['قديم' if x is not None else 'جديد' for x in layout]}")
        print(f"  الطبقات: {old_cfg['n_layer']} → {args.to_layers} | "
              f"الباراميترات: {n_before/1e6:.2f}M → {n_after/1e6:.2f}M | اتنسخ {copied} تنسور")
        print(f"  loss قبل: {l_before:.6f}   بعد: {l_after:.6f}   الفرق: {diff:.2e}")

        if diff > args.tol:
            raise SystemExit(f"✗ الـ loss اتغير أكتر من المسموح ({diff:.2e}) — مش هكتب حاجة.")
        print(f"  ✓ الـ loss محفوظ")

        if not args.apply:
            print("  (تجربة بس — ضيف --apply عشان يكتب)")
            continue

        shutil.copy2(src_path, src_path + ".pre-grow")
        # أوبتيمايزر جديد — حالة القديم مش بتنفع مع الأشكال الجديدة
        opt = new.configure_optimizers(0.1, 2e-4, (0.9, 0.95), "cpu")
        torch.save({
            "model": new.state_dict(),
            "optimizer": opt.state_dict(),
            "iter": ck["iter"],
            "best_val": ck.get("best_val", float("inf")),
            "val": ck.get("val"),
            "config": new_cfg,
            "preset": ck.get("preset", args.preset),
            "grown_from": old_cfg["n_layer"],
        }, src_path + ".tmp")
        os.replace(src_path + ".tmp", src_path)
        print(f"  ✓ اتكتب (نسخة احتياطية: {os.path.basename(src_path)}.pre-grow)")

    if args.apply:
        print(f"\n⚠️  لازم تغيّر n_layer لـ {args.to_layers} في configs/arch_presets.json كمان.")


if __name__ == "__main__":
    main()
