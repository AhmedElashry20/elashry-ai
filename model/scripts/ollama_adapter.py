"""
ollama_adapter.py — سيرفر محلي بواجهة متوافقة مع Ollama + OpenAI، مربوط بموديلنا المدرَّب.
بيخلّي إكستنشن elashry-ai (v0.5.2) يتكلّم مع الموديل المحلي بدل السيرفر البعيد. صفر خدمات خارجية.

بيدعم:
  GET  /api/tags               -> بيعلن الموديل "elashry-nano" متاح
  POST /v1/chat/completions    -> شات OpenAI-style (stream عبر SSE أو عادي)
  POST /chat/completions       -> نفس الشات
  POST /api/chat               -> شات بصيغة Ollama
  POST /api/embeddings         -> embedding (متوسط متجهات توكنز الإدخال)
  POST /api/generate           -> توليد بسيط بصيغة Ollama

تشغيل:  .venv/bin/python model/scripts/ollama_adapter.py   (بيسمع على 127.0.0.1:11435)
"""
import argparse
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import torch
from tokenizers import Tokenizer

import data_common as dc
from model import GPT, GPTConfig

ap = argparse.ArgumentParser()
ap.add_argument("--preset", default="nano_cpu")
ap.add_argument("--port", type=int, default=11435)
ap.add_argument("--model-name", default="elashry-nano")
ap.add_argument("--ckpt", default=None)
ap.add_argument("--tokenizer", default=os.path.join(dc.ROOT, "tokenizer", "tokenizer.json"))
args = ap.parse_args()

CKPT = args.ckpt or os.path.join(dc.ROOT, "checkpoints", f"{args.preset}.pt")
DEVICE = "cpu"
tok = Tokenizer.from_file(args.tokenizer)
ck = torch.load(CKPT, map_location=DEVICE)
model = GPT(GPTConfig(**ck["config"])).to(DEVICE).eval()
model.load_state_dict(ck["model"])
EOS = tok.token_to_id("<|end|>")
NAME = args.model_name
_lock = threading.Lock()
_mtime = os.path.getmtime(CKPT)
print(f"[adapter] {NAME} جاهز ({model.num_params()/1e6:.1f}M · iter {ck.get('iter','?')}) على 127.0.0.1:{args.port}")


def maybe_reload():
    """يحمّل أحدث checkpoint تلقائيًا لو التدريب حفظ نسخة أجدد."""
    global _mtime
    try:
        m = os.path.getmtime(CKPT)
        if m > _mtime:
            c = torch.load(CKPT, map_location=DEVICE)
            model.load_state_dict(c["model"]); model.eval()
            _mtime = m
            print(f"[adapter] ↻ حمّلت checkpoint أحدث (iter {c.get('iter','?')} · val {round(c.get('best_val',0),3)})")
    except Exception:
        pass


def last_user(messages):
    for m in reversed(messages or []):
        if m.get("role") == "user" and m.get("content"):
            return m["content"]
    return (messages[-1].get("content") if messages else "") or ""


def build_ids(prompt):
    return tok.encode(f"<|task|> {prompt}\n<|response|> ").ids


def gen_full(prompt, max_new=200, temp=0.8, top_p=0.95):
    ids = build_ids(prompt)
    x = torch.tensor([ids], dtype=torch.long, device=DEVICE)
    with _lock:
        maybe_reload()
        with torch.no_grad():
            out = model.generate(x, max_new, temp, 40, eos_id=EOS, repetition_penalty=1.2, top_p=top_p)
    return tok.decode(out[0].tolist()[len(ids):])


def gen_stream(prompt, on_delta, max_new=200, temp=0.8, top_p=0.95):
    ids = build_ids(prompt)
    x = torch.tensor([ids], dtype=torch.long, device=DEVICE)
    state = {"prev": "", "gen": []}

    def cb(nxt):
        state["gen"].append(int(nxt.item()))
        cur = tok.decode(state["gen"])
        if len(cur) > len(state["prev"]):
            on_delta(cur[len(state["prev"]):])
            state["prev"] = cur
    with _lock:
        maybe_reload()
        with torch.no_grad():
            model.generate(x, max_new, temp, 40, eos_id=EOS, repetition_penalty=1.2, top_p=top_p, on_token=cb)


def embed(text):
    ids = tok.encode(text or " ").ids[:512] or [0]
    with torch.no_grad():
        v = model.transformer.wte.weight[torch.tensor(ids)].mean(0)
        v = v / (v.norm() + 1e-8)
    return [round(float(z), 6) for z in v.tolist()]


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _json(self, obj, code=200):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read(self):
        n = int(self.headers.get("Content-Length", 0))
        try:
            return json.loads(self.rfile.read(n) or "{}")
        except Exception:
            return {}

    def do_GET(self):
        if self.path.startswith("/api/tags"):
            self._json({"models": [{"name": NAME, "model": NAME, "modified_at": "2026-01-01T00:00:00Z",
                                    "size": 0, "digest": "local"}]})
        elif self.path.startswith("/v1/models"):
            self._json({"object": "list", "data": [{"id": NAME, "object": "model", "owned_by": "elashry"}]})
        elif self.path.startswith("/api/version"):
            self._json({"version": "elashry-local"})
        else:
            self._json({"ok": True})

    def _sse_open(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()

    def _sse(self, obj):
        try:
            self.wfile.write(f"data: {json.dumps(obj)}\n\n".encode("utf-8")); self.wfile.flush()
        except Exception:
            pass

    def do_POST(self):
        p = self.path
        req = self._read()
        try:
            # ---------- OpenAI chat ----------
            if p.rstrip("/").endswith("chat/completions"):
                prompt = last_user(req.get("messages"))
                mx = req.get("max_tokens", 200) or 200
                temp = req.get("temperature", 0.8)
                if req.get("stream"):
                    self._sse_open()
                    base = {"id": "chatcmpl-local", "object": "chat.completion.chunk", "model": NAME,
                            "choices": [{"index": 0, "delta": {"role": "assistant"}, "finish_reason": None}]}
                    self._sse(base)
                    gen_stream(prompt, lambda d: self._sse({"id": "chatcmpl-local", "object": "chat.completion.chunk",
                               "model": NAME, "choices": [{"index": 0, "delta": {"content": d}, "finish_reason": None}]}),
                               max_new=mx, temp=temp)
                    self._sse({"id": "chatcmpl-local", "object": "chat.completion.chunk", "model": NAME,
                               "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}]})
                    try:
                        self.wfile.write(b"data: [DONE]\n\n"); self.wfile.flush()
                    except Exception:
                        pass
                else:
                    text = gen_full(prompt, max_new=mx, temp=temp)
                    self._json({"id": "chatcmpl-local", "object": "chat.completion", "model": NAME,
                                "choices": [{"index": 0, "message": {"role": "assistant", "content": text},
                                             "finish_reason": "stop"}],
                                "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}})

            # ---------- Ollama chat ----------
            elif p.startswith("/api/chat"):
                prompt = last_user(req.get("messages"))
                text = gen_full(prompt, max_new=(req.get("options", {}) or {}).get("num_predict", 200))
                self._json({"model": NAME, "message": {"role": "assistant", "content": text}, "done": True})

            # ---------- Ollama generate ----------
            elif p.startswith("/api/generate"):
                text = gen_full(req.get("prompt", ""))
                self._json({"model": NAME, "response": text, "done": True})

            # ---------- Embeddings ----------
            elif "embeddings" in p or "embed" in p:
                inp = req.get("input") or req.get("prompt") or ""
                if isinstance(inp, list):
                    vecs = [embed(t) for t in inp]
                    if p.startswith("/v1"):
                        self._json({"object": "list", "model": NAME,
                                    "data": [{"object": "embedding", "index": i, "embedding": v} for i, v in enumerate(vecs)]})
                    else:
                        self._json({"embedding": vecs[0], "embeddings": vecs})
                else:
                    v = embed(inp)
                    if p.startswith("/v1"):
                        self._json({"object": "list", "model": NAME,
                                    "data": [{"object": "embedding", "index": 0, "embedding": v}]})
                    else:
                        self._json({"embedding": v, "embeddings": [v]})
            else:
                self._json({"error": "unknown endpoint: " + p}, 404)
        except Exception as e:
            self._json({"error": str(e)}, 500)


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", args.port), H).serve_forever()
