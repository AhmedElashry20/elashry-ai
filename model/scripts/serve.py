"""
serve.py — جسر بين النموذج المحلي وإكستنشن VS Code.

بروتوكول بسيط سطر-JSON على stdin/stdout (مفيش أي API خارجي):
  الطلب  (stdin) : {"prompt": "...", "agent": true, "max_new_tokens": 200, "temperature": 0.8, "top_k": 50}
  الرد   (stdout): {"ok": true, "text": "..."}   أو   {"ok": false, "error": "..."}

الإكستنشن بيشغّل ده كـ subprocess ويبعت طلبات ويستقبل ردود.

تشغيل يدوي للتجربة:
  echo '{"prompt":"reverse a string","agent":true}' | .venv/bin/python model/scripts/serve.py --preset nano_cpu
"""
import argparse
import json
import os
import sys

import torch
from tokenizers import Tokenizer

import data_common as dc
from model import GPT, GPTConfig


def log(msg):
    print(msg, file=sys.stderr, flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--preset", default="nano_cpu")
    ap.add_argument("--ckpt", default=None)
    ap.add_argument("--tokenizer", default=os.path.join(dc.ROOT, "tokenizer", "tokenizer.json"))
    ap.add_argument("--device", default="cpu")   # cpu آمن؛ mps بيكراش على ماك x86
    args = ap.parse_args()

    ckpt = args.ckpt or os.path.join(dc.ROOT, "checkpoints", f"{args.preset}.pt")
    if not os.path.exists(ckpt):
        log(f"[serve] مفيش checkpoint في {ckpt}")
        print(json.dumps({"ok": False, "error": f"no checkpoint at {ckpt}"}), flush=True)
        return
    if not os.path.exists(args.tokenizer):
        print(json.dumps({"ok": False, "error": f"no tokenizer at {args.tokenizer}"}), flush=True)
        return

    tok = Tokenizer.from_file(args.tokenizer)
    ck = torch.load(ckpt, map_location=args.device)
    model = GPT(GPTConfig(**ck["config"])).to(args.device).eval()
    model.load_state_dict(ck["model"])
    eos = tok.token_to_id("<|end|>")
    info = {"params": round(model.num_params() / 1e6, 2), "iter": ck.get("iter"), "val": ck.get("best_val")}
    log(f"[serve] جاهز. params={info['params']}M  iter={info['iter']}  val={info['val']}")
    print(json.dumps({"ok": True, "ready": True, **info}), flush=True)  # إشارة جاهزية + معلومات

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
            prompt = req.get("prompt", "")
            if req.get("agent", True):
                text = f"<|task|> {prompt}\n<|response|> "
            else:
                text = prompt
            ids = tok.encode(text).ids
            x = torch.tensor([ids], dtype=torch.long, device=args.device)
            gkw = dict(temperature=req.get("temperature", 0.8), top_k=req.get("top_k", 50),
                       eos_id=eos, repetition_penalty=req.get("repetition_penalty", 1.15),
                       top_p=req.get("top_p", 0.95))
            mnt = req.get("max_new_tokens", 200)

            if req.get("stream"):
                gen_ids, prev = [], ""

                def cb(nxt):
                    nonlocal prev
                    gen_ids.append(int(nxt.item()))
                    cur = tok.decode(gen_ids)
                    if len(cur) > len(prev):
                        sys.stdout.write(json.dumps({"ok": True, "delta": cur[len(prev):]}) + "\n")
                        sys.stdout.flush()
                        prev = cur
                with torch.no_grad():
                    model.generate(x, mnt, **gkw, on_token=cb)
                print(json.dumps({"ok": True, "done": True}), flush=True)
            else:
                with torch.no_grad():
                    out = model.generate(x, mnt, **gkw)
                gen = tok.decode(out[0].tolist()[len(ids):])   # الجديد بس
                print(json.dumps({"ok": True, "text": gen}), flush=True)
        except Exception as e:
            print(json.dumps({"ok": False, "error": str(e)}), flush=True)


if __name__ == "__main__":
    main()
