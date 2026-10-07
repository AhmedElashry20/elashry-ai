"""
train.py — تدريب نموذج elashry-ai من الصفر على الـ bins اللي طلّعها prepare_data.py.

بيقرا الـ preset من configs/arch_presets.json (معمارية + هايبرباراميترز التدريب)،
ويحمّل model/data/bin/{train,val}.bin عن طريق memmap.

أمثلة:
    python model/scripts/train.py --preset nano_cpu
    python model/scripts/train.py --preset micro_colab --data-dir model/data/bin
    python model/scripts/train.py --preset nano_cpu --max-iters 50 --device cpu   # تجربة سريعة
    python model/scripts/train.py --preset nano_cpu --resume                      # يكمّل من آخر checkpoint
"""
import argparse
import json
import math
import os
import signal
import time

import numpy as np
import torch

import data_common as dc
from model import GPT, GPTConfig


def get_batch(data, block_size, batch_size, device, window=0, win_idx=0):
    """بيسحب دفعة. لو window > 0 بيسحب من نافذة متحركة بدل الكوربَس كله.

    السبب (2026-10-06): الكوربَس بقى 4.9 جيجا والجهاز 16 جيجا رام مع سواب ممتلئ
    94%. السحب العشوائي من كل الملف بيخلّي كل دفعة page fault على الديسك، فالتدريب
    بيقعد مستني الـ I/O (32% معالج بس). النافذة بتخلّي القراءة محليّة فتقعد في
    الكاش، والنافذة بتلف على الكوربَس كله مع الوقت فالتغطية مابتضيعش.
    """
    n = len(data) - block_size
    if window and window < n:
        n_win = max(1, n // window)
        start = (win_idx % n_win) * window
        ix = torch.randint(start, min(start + window, n), (batch_size,))
    else:
        ix = torch.randint(n, (batch_size,))
    x = torch.stack([torch.from_numpy(data[i:i + block_size].astype(np.int64)) for i in ix])
    y = torch.stack([torch.from_numpy(data[i + 1:i + 1 + block_size].astype(np.int64)) for i in ix])
    if device.startswith("cuda"):
        return x.pin_memory().to(device, non_blocking=True), y.pin_memory().to(device, non_blocking=True)
    return x.to(device), y.to(device)


def pick_device(want):
    if want == "cuda" and not torch.cuda.is_available():
        if torch.backends.mps.is_available():
            print("⚠️  مفيش CUDA — بحوّل لـ mps"); return "mps"
        print("⚠️  مفيش CUDA — بحوّل لـ cpu"); return "cpu"
    if want == "mps" and not torch.backends.mps.is_available():
        print("⚠️  مفيش mps — بحوّل لـ cpu"); return "cpu"
    return want


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--preset", default="nano_cpu")
    ap.add_argument("--config", default=dc.ARCH_CONFIG)
    ap.add_argument("--data-dir", default=os.path.join(dc.ROOT, "data", "bin"))
    ap.add_argument("--out-dir", default=os.path.join(dc.ROOT, "checkpoints"))
    ap.add_argument("--resume", action="store_true")
    ap.add_argument("--eval-only", action="store_true")
    # أوفررايدز اختيارية للتجربة
    ap.add_argument("--max-iters", type=int, default=None)
    ap.add_argument("--device", default=None)
    ap.add_argument("--eval-interval", type=int, default=None)
    ap.add_argument("--eval-iters", type=int, default=None)
    ap.add_argument("--batch-size", type=int, default=None)
    ap.add_argument("--grad-accum", type=int, default=None)
    ap.add_argument("--window-tokens", type=int, default=0,
                    help="يسحب الدفعات من نافذة بالحجم ده (توكن) بدل الكوربَس كله — "
                         "بيمنع طحن الديسك لما الكوربَس أكبر من الرام. 0 = مقفول")
    ap.add_argument("--window-rotate", type=int, default=1000,
                    help="كل كام خطوة تتحرك النافذة")
    ap.add_argument("--lr-restart-at", type=int, default=0,
                    help="يبدأ دورة cosine جديدة من الخطوة دي (warm restart) — "
                         "بيستخدم لما تضيف داتا جديدة والـ LR يكون نزل خلاص")
    ap.add_argument("--save-interval", type=int, default=200,
                    help="يحفظ _last.pt كل كام خطوة من غير eval (عشان النوم/القفل ما يضيّعش شغل)")
    args = ap.parse_args()

    # عدد الأنوية (أقل = أبرد = مفيش throttling على لابتوبات Intel). override بـ TRAIN_THREADS
    torch.set_num_threads(int(os.environ.get("TRAIN_THREADS") or (os.cpu_count() or 4)))

    # نبضة حياة للـ watchdog. بنكتبها فورًا هنا قبل تحميل الداتا والـ checkpoint،
    # عشان الحارس ما يفتكرش إن العملية متعلّقة وهي لسه بتحمّل (التحميل بياخد دقايق).
    os.makedirs(args.out_dir, exist_ok=True)
    hb_path = os.path.join(args.out_dir, ".heartbeat")

    def beat(it=-1):
        try:
            with open(hb_path, "w") as f:
                f.write(f"{it} {time.time():.0f}\n")
        except OSError:
            pass

    beat()

    cfg_all = dc.load_json(args.config)["presets"][args.preset]
    m, tr = cfg_all["model"], cfg_all["train"]
    device = pick_device(args.device or tr["device"])
    device_type = "cuda" if device.startswith("cuda") else ("mps" if device == "mps" else "cpu")
    max_iters = args.max_iters or tr["max_iters"]
    eval_interval = args.eval_interval or tr["eval_interval"]
    batch_size = args.batch_size or tr["batch_size"]
    grad_accum = args.grad_accum or tr["gradient_accumulation_steps"]
    eval_iters = args.eval_iters or tr["eval_iters"]
    block_size = m["block_size"]
    torch.manual_seed(1337)

    # داتا + توافق الـ vocab
    meta_path = os.path.join(args.data_dir, "meta.json")
    if not os.path.exists(os.path.join(args.data_dir, "train.bin")):
        raise SystemExit(f"مفيش train.bin في {args.data_dir} — شغّل prepare_data.py الأول.")
    train_data = np.memmap(os.path.join(args.data_dir, "train.bin"), dtype=np.uint16, mode="r")
    val_path = os.path.join(args.data_dir, "val.bin")
    val_data = np.memmap(val_path, dtype=np.uint16, mode="r") if os.path.getsize(val_path) else train_data
    vocab_size = m["vocab_size"]
    if os.path.exists(meta_path):
        tv = dc.load_json(meta_path).get("tokenizer_vocab", vocab_size)
        if tv > vocab_size:
            print(f"⚠️  vocab التوكنيزر ({tv}) أكبر من الـ preset ({vocab_size}) — بستخدم {tv}")
            vocab_size = tv

    print(f"preset={args.preset} device={device} | tokens: train={len(train_data):,} val={len(val_data):,}")

    # النموذج
    gptconf = GPTConfig(n_layer=m["n_layer"], n_head=m["n_head"], n_embd=m["n_embd"],
                        block_size=block_size, vocab_size=vocab_size,
                        dropout=m["dropout"], bias=m["bias"])
    model = GPT(gptconf).to(device)
    print(f"عدد الباراميترات: {model.num_params()/1e6:.2f}M")

    optimizer = model.configure_optimizers(tr["weight_decay"], tr["learning_rate"],
                                            (tr["beta1"], tr["beta2"]), device_type)
    # AMP على cuda بس
    use_amp = device_type == "cuda"
    amp_dtype = torch.bfloat16 if tr["dtype"] == "bfloat16" else torch.float16
    scaler = torch.cuda.amp.GradScaler(enabled=(use_amp and amp_dtype == torch.float16))

    start_iter, best_val = 0, float("inf")
    os.makedirs(args.out_dir, exist_ok=True)
    ckpt_path = os.path.join(args.out_dir, f"{args.preset}.pt")        # أحسن val — ده اللي الإنفرنس بيستخدمه
    last_path = os.path.join(args.out_dir, f"{args.preset}_last.pt")   # آخر خطوة — ده اللي بنكمّل منه
    if args.resume:
        # بنكمّل من الأحدث: الـ last عادةً أبعد من الـ best
        picked, ck = None, None
        for p_ in (last_path, ckpt_path):
            if not os.path.exists(p_):
                continue
            try:
                c = torch.load(p_, map_location=device)
            except Exception as e:
                print(f"⚠️  {os.path.basename(p_)} بايظ ({e}) — بتجاهله")
                continue
            if ck is None or c["iter"] > ck["iter"]:
                picked, ck = p_, c
        if ck is not None:
            model.load_state_dict(ck["model"]); optimizer.load_state_dict(ck["optimizer"])
            start_iter = ck["iter"] + 1; best_val = ck.get("best_val", best_val)
            print(f"↻ كمّلت من iter {start_iter} (best_val={best_val:.4f}) [{os.path.basename(picked)}]")

    if tr.get("compile") and hasattr(torch, "compile") and device_type != "mps":
        print("torch.compile..."); model = torch.compile(model)

    def get_lr(it):
        # r0 = نقطة بداية الدورة. صفر = الجدول الأصلي من البداية.
        # أي رقم تاني = warm restart: الـ LR يرجع لقمته وينزل cosine من هناك.
        r0 = max(0, args.lr_restart_at)
        wu, mi = tr["warmup_iters"], max_iters
        if it < r0 + wu:
            return tr["learning_rate"] * (it - r0 + 1) / wu
        if it > mi:
            return tr["min_lr"]
        ratio = (it - r0 - wu) / max(1, mi - r0 - wu)
        coeff = 0.5 * (1.0 + math.cos(math.pi * ratio))
        return tr["min_lr"] + coeff * (tr["learning_rate"] - tr["min_lr"])

    @torch.no_grad()
    def estimate_loss():
        model.eval(); out = {}
        for split, data in [("train", train_data), ("val", val_data)]:
            losses = torch.zeros(eval_iters)
            for k in range(eval_iters):
                X, Y = get_batch(data, block_size, batch_size, device)
                with torch.autocast(device_type=device_type, dtype=amp_dtype, enabled=use_amp):
                    _, loss = model(X, Y)
                losses[k] = loss.item()
            out[split] = losses.mean().item()
        model.train(); return out

    if args.eval_only:
        print(estimate_loss()); return

    def save_ckpt(path, it, val):
        raw = getattr(model, "_orig_mod", model)
        blob = {"model": raw.state_dict(), "optimizer": optimizer.state_dict(),
                "iter": it, "best_val": best_val, "val": val,
                "config": vars(gptconf), "preset": args.preset}
        tmp = path + ".tmp"
        torch.save(blob, tmp)
        os.replace(tmp, path)   # ذرّي — لو الجهاز نام/اتقفل في نص الحفظ الملف مايبوظش

    # لو launchd/الشات‑داون بعت SIGTERM، نحفظ ونخرج بالظبط بدل ما نتقتل في النص
    stopping = {"now": False}
    signal.signal(signal.SIGTERM, lambda *_: stopping.__setitem__("now", True))
    signal.signal(signal.SIGINT, lambda *_: stopping.__setitem__("now", True))

    print(f"بدأ التدريب: {max_iters} خطوة، grad_accum={grad_accum}, batch={batch_size}"
          f"، حفظ كل {args.save_interval} خطوة")
    last_val = best_val
    beat(start_iter)
    model.train(); t0 = time.time()
    for it in range(start_iter, max_iters):
        for g in optimizer.param_groups:
            g["lr"] = get_lr(it)

        for micro in range(grad_accum):
            X, Y = get_batch(train_data, block_size, batch_size, device,
                             args.window_tokens, it // max(1, args.window_rotate))
            with torch.autocast(device_type=device_type, dtype=amp_dtype, enabled=use_amp):
                _, loss = model(X, Y)
                loss = loss / grad_accum
            scaler.scale(loss).backward()
        scaler.unscale_(optimizer)
        torch.nn.utils.clip_grad_norm_(model.parameters(), tr["grad_clip"])
        scaler.step(optimizer); scaler.update()
        optimizer.zero_grad(set_to_none=True)

        if it % 5 == 0:
            # كل 5 خطوات مش 20: بعد التكبير لـ 12 طبقة الخطوة بقت أبطأ، و20 خطوة
            # كانت بتعدّي حد الحارس (10 دقايق) فكان بيقتل تدريب سليم. الكتابة رخيصة.
            beat(it)

        if it % eval_interval == 0 or it == max_iters - 1:
            beat(it)
            L = estimate_loss()
            dt = time.time() - t0; t0 = time.time()
            print(f"iter {it:>6} | train {L['train']:.4f} | val {L['val']:.4f} | lr {get_lr(it):.2e} | {dt:.1f}s")
            last_val = L["val"]
            if last_val < best_val:
                best_val = last_val
                save_ckpt(ckpt_path, it, last_val)   # ده اللي الإنفرنس بيقراه
                print(f"  ✓ أحسن val جديد: {best_val:.4f}")
            # الـ last بيتحفظ كل مرة — عشان أي إعادة تشغيل تكمّل من هنا مش ترجع لورا
            save_ckpt(last_path, it, last_val)
        elif args.save_interval > 0 and it % args.save_interval == 0 and it > start_iter:
            save_ckpt(last_path, it, last_val)   # حفظ سريع من غير eval

        if stopping["now"]:
            save_ckpt(last_path, it, last_val)
            print(f"\n⏹  جالي أمر إيقاف — حفظت عند iter {it}. شغّله تاني بـ --resume.")
            return

    print(f"\n✓ خلص التدريب. أحسن val loss = {best_val:.4f}")
    print(f"  الـ checkpoint: {ckpt_path}")
    print(f"  للتوليد:  python model/scripts/generate.py --preset {args.preset} --agent --prompt \"اكتب دالة تجمع رقمين\"")


if __name__ == "__main__":
    main()
