"""
data_common.py — منطق مشترك بين train_tokenizer.py و prepare_data.py

المهمة: يقرأ المانيفست (model/data/hf_datasets.json)، يحمّل كل داتاسِت من HuggingFace،
ويلفّ كل مثال في صيغة الإدخال/الإخراج الموحّدة بتاعة الإيجنت. كله offline data — مفيش أوزان
جاهزة ولا API خارجي.
"""
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # .../model
MANIFEST = os.path.join(ROOT, "data", "hf_datasets.json")
ARCH_CONFIG = os.path.join(ROOT, "configs", "arch_presets.json")

# التوكنز الخاصة اللي بيتكلّم بيها الإيجنت (لازم تتحجز في التوكنيزر)
SPECIAL_TOKENS = ["<|task|>", "<|context|>", "<|response|>", "<|end|>",
                  "<fim_prefix>", "<fim_suffix>", "<fim_middle>", "<|file|>", "<|lang|>"]
END = "<|end|>"

# خيارات تحميل خاصة ببعض الداتاسِتس (كلها parquet + ungated + تشتغل على datasets v5).
# streaming=True للكبيرة عشان ما ننزّلش جيجات على الديسك.
DATASET_OPTS = {
    "roneneldan/TinyStories": {"streaming": True},
    "jtatman/python-code-dataset-500k": {"streaming": True},
    "m-a-p/CodeFeedback-Filtered-Instruction": {"streaming": True, "lang_field": "lang"},
    "bigcode/self-oss-instruct-sc2-exec-filter-50k": {"streaming": True},
    "Maxscha/commitbench": {"streaming": True},
    "code-search-net/code_search_net": {"config": "python", "streaming": True},
    # برمجة إضافية (instruction -> code، مفتوحة parquet)
    "ise-uiuc/Magicoder-Evol-Instruct-110K": {"streaming": True},
    "ise-uiuc/Magicoder-OSS-Instruct-75K": {"streaming": True},
    "nickrosh/Evol-Instruct-Code-80k-v1": {"streaming": True},
    "glaiveai/glaive-code-assistant": {"streaming": True},
    "theblackcat102/evol-codealpaca-v1": {"streaming": True},
    # سايبر سكيورتي (مفتوحة، دفاعية)
    "CyberNative/Code_Vulnerability_Security_DPO": {"streaming": True},
    "AlicanKiraz0/Cybersecurity-Dataset-v1": {"streaming": True},
    "AlicanKiraz0/Cybersecurity-Dataset-Fenrir-v2.0": {"streaming": True},
    # عربي
    "wikimedia/wikipedia": {"config": "20231101.ar", "streaming": True},
    "arbml/CIDAR": {"streaming": True},
    "FreedomIntelligence/alpaca-gpt4-arabic": {"streaming": True},
    "Trendyol/Trendyol-Cybersecurity-Instruction-Tuning-Dataset": {"streaming": True},
    "hcnote/Cybersecurity-High-Quality-Dataset": {"streaming": True},
    "openai/openai_humaneval": {"split": "test"},
    # كل لغات البرمجة — the-stack-smol-xl فيه 87 لغة، كل لغة في data/<lang>/.
    # الـ data_dir بيتحدّد وقت التشغيل من pull_all_langs.py، عشان كده مفيش هنا غير الافتراضي.
    "bigcode/the-stack-smol-xl": {"streaming": True, "per_lang": True},
    "christopher/rosetta-code": {"streaming": True},
}

# الـ 87 لغة في bigcode/the-stack-smol-xl (أسماء المجلدات بالظبط)
STACK_LANGS = [
    "ada", "agda", "alloy", "antlr", "applescript", "assembly", "augeas", "awk",
    "batchfile", "bison", "bluespec", "c", "c++", "c-sharp", "clojure", "cmake",
    "coffeescript", "common-lisp", "css", "cuda", "dart", "dockerfile", "elixir",
    "elm", "emacs-lisp", "erlang", "f-sharp", "fortran", "glsl", "go", "groovy",
    "haskell", "html", "idris", "isabelle", "java", "java-server-pages",
    "javascript", "julia", "kotlin", "lean", "literate-agda",
    "literate-coffeescript", "literate-haskell", "lua", "makefile", "maple",
    "markdown", "mathematica", "matlab", "ocaml", "pascal", "perl", "php",
    "powershell", "prolog", "protocol-buffer", "python", "r", "racket",
    "restructuredtext", "rmarkdown", "ruby", "rust", "sas", "scala", "scheme",
    "shell", "smalltalk", "solidity", "sparql", "sql", "stan", "standard-ml",
    "stata", "systemverilog", "tcl", "tcsh", "tex", "thrift", "typescript",
    "verilog", "vhdl", "visual-basic", "xslt", "yacc", "zig",
]
# داتا تقييم بس — ممنوع تدخل train/val
EVAL_ONLY = {"openai/openai_humaneval", "google-research-datasets/mbpp"}


def load_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def vocab_size_for(preset, config_path=ARCH_CONFIG):
    cfg = load_json(config_path)
    return cfg["presets"][preset]["model"]["vocab_size"]


def training_repo_ids(manifest_path=MANIFEST, only=None):
    """ترتيب الداتاسِتس حسب الـ curriculum، من غير داتا التقييم.
    only: لو اتحدّدت (list/set) نرجّع اللي فيها بس — مفيدة للتجربة أو تشغيل جزئي."""
    man = load_json(manifest_path)
    only = set(only) if only else None
    ids = []
    for stage in man["curriculum"]:
        if stage.get("stage") == "eval":
            continue
        for rid in stage["datasets"]:
            if rid not in EVAL_ONLY and rid not in ids and (only is None or rid in only):
                ids.append(rid)
    return ids


# ---------- تنظيف + انتقاء الحقول ----------
_BLANKS = re.compile(r"\n{3,}")


def clean_text(s):
    if not s:
        return ""
    s = s.replace("\r\n", "\n").replace("\r", "\n")
    s = _BLANKS.sub("\n\n", s)          # اقصى سطرين فاضيين ورا بعض
    return s.strip()


def pick(ex, keys):
    """أول حقل موجود وفيه نص من قائمة أسماء محتملة (مرونة ضد اختلاف الـ schema)."""
    for k in keys:
        v = ex.get(k) if isinstance(ex, dict) else None
        if isinstance(v, str) and v.strip():
            return v.strip()
    return None


# ---------- الصيغة الموحّدة ----------
def _instr(task, context, response):
    ctx = f"\n<|context|> {context}" if context else ""
    return f"<|task|> {task}{ctx}\n<|response|> {response}{END}"


def format_example(repo_id, ex):
    """يرجّع نص جاهز للتوكنة (منتهي بـ <|end|>) أو None لو المثال مش صالح."""
    # --- coherence bootstrap (نص خام) ---
    if repo_id == "roneneldan/TinyStories":
        t = pick(ex, ["text"]);  return f"{t}{END}" if t else None

    # --- instruction -> code (أمر ← كود) ---
    if repo_id == "jtatman/python-code-dataset-500k":
        task = pick(ex, ["instruction"]); out = pick(ex, ["output"])
        return _instr(task, None, out) if (task and out) else None
    if repo_id in ("sahil2801/CodeAlpaca-20k", "iamtarun/python_code_instructions_18k_alpaca"):
        task = pick(ex, ["instruction"]); out = pick(ex, ["output"])
        return _instr(task, pick(ex, ["input"]), out) if (task and out) else None
    if repo_id == "m-a-p/CodeFeedback-Filtered-Instruction":
        task = pick(ex, ["query"]); out = pick(ex, ["answer"])
        return _instr(task, None, out) if (task and out) else None
    if repo_id == "bigcode/self-oss-instruct-sc2-exec-filter-50k":
        task = pick(ex, ["instruction"]); out = pick(ex, ["response"])
        return _instr(task, None, out) if (task and out) else None

    # --- fix / refactor (رسالة الكوميت ← الـ diff) ---
    if repo_id == "Maxscha/commitbench":
        task = pick(ex, ["message"]); diff = pick(ex, ["diff"])
        return _instr(task, None, diff) if (task and diff) else None

    # --- كود خام بكل اللغات (the-stack-smol-xl) ---
    # بنحفظ اللغة كـ context عشان الموديل يربط الاسم بالتركيب
    if repo_id == "bigcode/the-stack-smol-xl":
        code = pick(ex, ["content"])
        if not code:
            return None
        lang = pick(ex, ["lang"]) or "code"
        return f"<|lang|> {lang}\n<|file|> {code}{END}"

    # --- نفس المسألة بلغات مختلفة (rosetta-code) ---
    if repo_id == "christopher/rosetta-code":
        task = pick(ex, ["task_name"]); code = pick(ex, ["code"])
        lang = pick(ex, ["language_name"])
        if not (task and code):
            return None
        desc = pick(ex, ["task_description"]) or ""
        return _instr(f"{task} — بـ {lang}" if lang else task, desc[:600], code)

    # --- explain (كود ← شرح) ---
    if repo_id == "code-search-net/code_search_net":
        code = pick(ex, ["func_code_string", "whole_func_string", "code"])
        doc = pick(ex, ["func_documentation_string", "docstring"])
        return _instr("Explain the following code.", code, doc) if (code and doc) else None

    # --- برمجة إضافية (instruction -> code) ---
    if repo_id == "ise-uiuc/Magicoder-Evol-Instruct-110K":
        t, o = pick(ex, ["instruction"]), pick(ex, ["response"]);  return _instr(t, None, o) if (t and o) else None
    if repo_id == "ise-uiuc/Magicoder-OSS-Instruct-75K":
        t, o = pick(ex, ["problem"]), pick(ex, ["solution"]);      return _instr(t, None, o) if (t and o) else None
    if repo_id in ("nickrosh/Evol-Instruct-Code-80k-v1", "theblackcat102/evol-codealpaca-v1"):
        t, o = pick(ex, ["instruction"]), pick(ex, ["output"]);    return _instr(t, None, o) if (t and o) else None
    if repo_id == "glaiveai/glaive-code-assistant":
        t, o = pick(ex, ["question"]), pick(ex, ["answer"]);       return _instr(t, None, o) if (t and o) else None

    # --- عربي ---
    if repo_id == "wikimedia/wikipedia":  # عربي عام لتعلّم اللغة
        t = pick(ex, ["text"]);  return f"{t}{END}" if t else None
    if repo_id == "arbml/CIDAR":
        t, o = pick(ex, ["instruction"]), pick(ex, ["output"]);  return _instr(t, None, o) if (t and o) else None
    if repo_id == "FreedomIntelligence/alpaca-gpt4-arabic":
        convs = ex.get("conversations")
        if isinstance(convs, list) and len(convs) >= 2:
            human = next((c.get("value") for c in convs if isinstance(c, dict) and c.get("from") in ("human", "user")), None)
            gpt = next((c.get("value") for c in convs if isinstance(c, dict) and c.get("from") in ("gpt", "assistant")), None)
            if human and gpt:
                return _instr(human.strip(), None, gpt.strip())
        return None

    # --- cybersecurity (سؤال/جواب أمني دفاعي) ---
    if repo_id in ("AlicanKiraz0/Cybersecurity-Dataset-Fenrir-v2.0",
                   "Trendyol/Trendyol-Cybersecurity-Instruction-Tuning-Dataset",
                   "AlicanKiraz0/Cybersecurity-Dataset-v1"):
        task = pick(ex, ["user"]); out = pick(ex, ["assistant"])
        return _instr(task, None, out) if (task and out) else None
    if repo_id == "CyberNative/Code_Vulnerability_Security_DPO":
        # question -> chosen (الكود الآمن)؛ نضيف نوع الثغرة في التعليمة
        q = pick(ex, ["question"]); good = pick(ex, ["chosen"]); vuln = pick(ex, ["vulnerability"])
        task = f"({vuln}) {q}" if vuln else q
        return _instr(task, None, good) if (task and good) else None
    if repo_id == "hcnote/Cybersecurity-High-Quality-Dataset":  # مُزال من المانيفست (صيني)، الفورماتر باقي احتياطي
        task = pick(ex, ["instruction"]); out = pick(ex, ["output"])
        return _instr(task, pick(ex, ["input"]), out) if (task and out) else None

    return None


def iter_examples(repo_id, limit=None, languages=None, data_dir=None):
    """يمرّ على أمثلة داتاسِت واحدة (streaming حسب الحاجة)."""
    from datasets import load_dataset
    o = DATASET_OPTS.get(repo_id, {})
    kw = {}
    if data_dir or o.get("data_dir"):
        kw["data_dir"] = data_dir or o["data_dir"]
    ds = load_dataset(
        repo_id,
        name=o.get("config"),
        split=o.get("split", "train"),
        streaming=o.get("streaming", False),
        trust_remote_code=o.get("trust_remote_code", False),
        **kw,
    )
    lang_field = o.get("lang_field")
    n = 0
    for ex in ds:
        if languages and lang_field and ex.get(lang_field) not in languages:
            continue
        yield ex
        n += 1
        if limit and n >= limit:
            break
