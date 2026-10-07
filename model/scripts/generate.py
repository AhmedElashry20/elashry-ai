"""
generate.py — توليد نص/كود من نموذج elashry-ai المدرَّب.

بيحمّل الـ checkpoint + التوكنيزر، ويلفّ الأمر في بروتوكول الإيجنت لو --agent.

أمثلة:
    python model/scripts/generate.py --preset nano_cpu --agent --prompt "اكتب دالة بايثون تعكس نص"
    python model/scripts/generate.py --preset nano_cpu --prompt "def fib(n):" --max-new-tokens 120
"""
import argparse
import os

import torch
from tokenizers import Tokenizer

import data_common as dc
from model import GPT, GPTConfig


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--preset", default="nano_cpu")
    ap.add_argument("--ckpt", default=None)
    ap.add_argument("--tokenizer", default=os.path.join(dc.ROOT, "tokenizer", "tokenizer.json"))
    ap.add_argument("--prompt", required=True)
    ap.add_argument("--agent", action="store_true", help="لفّ الأمر في قالب <|task|>.. <|response|>")
    ap.add_argument("--max-new-tokens", type=int, default=200)
    ap.add_argument("--temperature", type=float, default=0.8)
    ap.add_argument("--top-k", type=int, default=50)
    ap.add_argument("--device", default=None)
    args = ap.parse_args()

    # الافتراضي cpu آمن في كل مكان (MPS على ماك x86 بيكراش). للـ mps: --device mps
    device = args.device or ("cuda" if torch.cuda.is_available() else "cpu")
    ckpt = args.ckpt or os.path.join(dc.ROOT, "checkpoints", f"{args.preset}.pt")
    if not os.path.exists(ckpt):
        raise SystemExit(f"مفيش checkpoint في {ckpt} — درّب الأول بـ train.py")
    if not os.path.exists(args.tokenizer):
        raise SystemExit(f"مفيش توكنيزر في {args.tokenizer}")

    tok = Tokenizer.from_file(args.tokenizer)
    ck = torch.load(ckpt, map_location=device)
    model = GPT(GPTConfig(**ck["config"])).to(device).eval()
    model.load_state_dict(ck["model"])

    if args.agent:
        text = f"<|task|> {args.prompt}\n<|response|> "
    else:
        text = args.prompt
    ids = tok.encode(text).ids
    x = torch.tensor([ids], dtype=torch.long, device=device)
    eos = tok.token_to_id("<|end|>")

    with torch.no_grad():
        out = model.generate(x, args.max_new_tokens, args.temperature, args.top_k, eos_id=eos)
    full = tok.decode(out[0].tolist())
    print("=" * 60)
    print(full)
    print("=" * 60)


if __name__ == "__main__":
    main()
