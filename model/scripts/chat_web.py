"""
chat_web.py — محادثة محلية مع الموديل في المتصفح، بتصميم على طراز Kimi/Claude/ChatGPT.
مفيش أي موقع خارجي؛ كله على جهازك.

تشغيل:  .venv/bin/python model/scripts/chat_web.py
افتح:   http://localhost:8000
"""
import argparse
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import torch
from tokenizers import Tokenizer

import data_common as dc
from model import GPT, GPTConfig

ap = argparse.ArgumentParser()
ap.add_argument("--preset", default="nano_cpu")
ap.add_argument("--port", type=int, default=8000)
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
PARAMS = f"{model.num_params()/1e6:.1f}M"
INFO = f"{PARAMS} · iter {ck.get('iter','?')} · val {round(ck.get('best_val',0),3)}"
print(f"[chat] الموديل اتحمّل: {INFO}")

PAGE = r"""<!DOCTYPE html><html lang="ar"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>elashry-ai</title>
<style>
 *{box-sizing:border-box;margin:0;padding:0}
 :root{
   --bg:#fff; --side:#f7f7f8; --ink:#141416; --sub:#8a8a8e; --line:#ececef;
   --accent:#111114; --hover:#f0eff3; --field:#fff; --card:#f6f6f8; --me:#f0eff3;
   --font:-apple-system,"Segoe UI",system-ui,"Noto Sans Arabic",Tahoma,sans-serif;
 }
 [data-theme=dark]{
   --bg:#1b1b1f; --side:#141417; --ink:#ececef; --sub:#9a9aa2; --line:#2b2b31;
   --accent:#ececef; --hover:#26262c; --field:#232329; --card:#232329; --me:#2b2b33;
 }
 html,body{height:100%}
 body{font-family:var(--font);background:var(--bg);color:var(--ink);display:flex;height:100vh;overflow:hidden;font-size:15px}

 /* ===== Sidebar (شمال زي Kimi) ===== */
 .side{width:262px;flex-shrink:0;background:var(--side);border-right:1px solid var(--line);
   display:flex;flex-direction:column;padding:12px 10px;direction:rtl}
 .stop{display:flex;align-items:center;justify-content:space-between;padding:4px 6px 12px}
 .logo{width:32px;height:32px;border-radius:9px;background:var(--ink);color:var(--bg);
   display:grid;place-items:center;font-weight:800;font-size:15px}
 .icobtn{background:none;border:none;color:var(--sub);cursor:pointer;font-size:17px;padding:6px;border-radius:8px}
 .icobtn:hover{background:var(--hover);color:var(--ink)}
 .newbtn{display:flex;align-items:center;gap:10px;width:100%;padding:11px 12px;border:none;border-radius:12px;
   background:var(--hover);color:var(--ink);font-weight:600;font-size:14px;cursor:pointer;font-family:var(--font)}
 .newbtn:hover{filter:brightness(.97)}.newbtn .k{margin-inline-start:auto;color:var(--sub);font-size:11px}
 .menu{margin-top:8px;display:flex;flex-direction:column}
 .mitem{display:flex;align-items:center;gap:11px;padding:9px 12px;border-radius:10px;color:var(--ink);
   cursor:pointer;font-size:14px;background:none;border:none;width:100%;text-align:right;font-family:var(--font)}
 .mitem:hover{background:var(--hover)} .mitem.on{background:var(--hover);font-weight:600}
 .mitem i{width:18px;text-align:center;opacity:.8;font-style:normal}
 .mitem small{margin-inline-start:auto;color:var(--sub);font-size:10px;border:1px solid var(--line);padding:1px 6px;border-radius:6px}
 .hist{flex:1;overflow:auto;margin-top:10px}
 .hlabel{color:var(--sub);font-size:11px;font-weight:700;padding:8px 12px 4px}
 .hitem{padding:9px 12px;border-radius:9px;cursor:pointer;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
 .hitem:hover{background:var(--hover)} .hitem.on{background:var(--hover);font-weight:600}
 .userbar{display:flex;align-items:center;gap:10px;padding:8px;border-top:1px solid var(--line);margin-top:6px}
 .ava{width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,#6c5ce7,#a78bfa);display:grid;place-items:center;color:#fff;font-size:13px;font-weight:700}
 .userbar b{font-size:13px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
 .badge{font-size:10px;color:var(--sub);border:1px solid var(--line);padding:2px 7px;border-radius:8px}

 /* ===== Main ===== */
 .main{flex:1;display:flex;flex-direction:column;min-width:0;position:relative}
 .topbar{height:52px;display:flex;align-items:center;justify-content:flex-end;padding:0 16px;gap:6px}
 .msgs{flex:1;overflow:auto}

 /* Welcome (اسم كبير + إنبوت + كروت) */
 .hero{min-height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 20px;gap:22px}
 .word{font-size:56px;font-weight:800;letter-spacing:-1px}
 .word span{background:linear-gradient(135deg,#6c5ce7,#a78bfa);-webkit-background-clip:text;background-clip:text;color:transparent}
 .cards{display:flex;gap:12px;flex-wrap:wrap;justify-content:center;max-width:720px;direction:rtl}
 .card{width:170px;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px;cursor:pointer;text-align:right;transition:.15s}
 .card:hover{border-color:var(--sub);transform:translateY(-2px)}
 .card b{display:block;font-size:13.5px;margin-bottom:4px}.card p{color:var(--sub);font-size:12px}

 /* Chat bubbles */
 .thread{max-width:760px;margin:0 auto;padding:20px 20px 8px;direction:rtl}
 .row{display:flex;gap:12px;margin:20px 0;align-items:flex-start}
 .av{width:30px;height:30px;border-radius:9px;flex-shrink:0;display:grid;place-items:center;font-size:13px;font-weight:700}
 .av.ai{background:var(--ink);color:var(--bg)} .av.me{background:var(--me);color:var(--sub)}
 .cont{flex:1;min-width:0}
 .bubble{line-height:1.8;white-space:pre-wrap;word-break:break-word}
 .row.me .bubble{background:var(--me);padding:11px 15px;border-radius:14px;display:inline-block}
 .bubble.code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;background:var(--card);
   border:1px solid var(--line);padding:12px 14px;border-radius:12px;overflow-x:auto;white-space:pre}
 .acts{display:flex;gap:4px;margin-top:6px;opacity:0;transition:.15s}
 .row:hover .acts{opacity:1}
 .act{background:none;border:none;color:var(--sub);cursor:pointer;font-size:13px;padding:4px 7px;border-radius:7px}
 .act:hover{background:var(--hover);color:var(--ink)}
 .cursor{display:inline-block;width:7px;height:15px;background:var(--accent);border-radius:2px;animation:bl 1s steps(2) infinite;vertical-align:middle}
 @keyframes bl{50%{opacity:0}}

 /* Composer (إنبوت كبير فيه أدوات جواه) */
 .composer{padding:8px 20px 18px}
 .field{max-width:760px;margin:0 auto;background:var(--field);border:1px solid var(--line);border-radius:24px;
   padding:10px 14px;box-shadow:0 2px 16px rgba(0,0,0,.05);direction:rtl}
 .field:focus-within{border-color:var(--sub)}
 .field.big{padding:14px 18px}
 #q{width:100%;border:none;outline:none;background:transparent;color:var(--ink);font-family:var(--font);
   font-size:15px;resize:none;max-height:150px;line-height:1.6}
 .tools{display:flex;align-items:center;gap:8px;margin-top:8px}
 .tool{background:none;border:1px solid var(--line);color:var(--sub);border-radius:10px;padding:6px 10px;
   font-size:12.5px;cursor:pointer;display:flex;align-items:center;gap:6px;font-family:var(--font)}
 .tool:hover{color:var(--ink);border-color:var(--sub)}
 .modelchip{margin-inline-start:auto}
 .send{width:36px;height:36px;border:none;border-radius:50%;background:var(--accent);color:var(--bg);
   cursor:pointer;display:grid;place-items:center;font-size:16px}
 .send:disabled{opacity:.35;cursor:default}
 .hint{text-align:center;color:var(--sub);font-size:11px;margin-top:8px}
 .toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:var(--ink);color:var(--bg);
   padding:8px 16px;border-radius:10px;font-size:13px;opacity:0;transition:.2s;pointer-events:none}
 .toast.on{opacity:1}
 @media(max-width:760px){.side{display:none}.word{font-size:40px}}
</style></head><body>
<aside class="side">
  <div class="stop"><div class="logo">ع</div>
    <button class="icobtn" onclick="toggleTheme()" title="الوضع الليلي">🌙</button></div>
  <button class="newbtn" onclick="newChat()">＋ محادثة جديدة <span class="k">⌘K</span></button>
  <div class="menu">
    <button class="mitem" onclick="mode('code')"><i>💻</i> كود</button>
    <button class="mitem" onclick="mode('sec')"><i>🛡️</i> أمن سيبراني</button>
    <button class="mitem" onclick="mode('ar')"><i>🇪🇬</i> عربي</button>
    <button class="mitem" onclick="soon()"><i>🌐</i> بحث ويب <small>قريبًا</small></button>
    <button class="mitem" onclick="soon()"><i>📄</i> مستندات <small>قريبًا</small></button>
  </div>
  <div class="hist" id="hist"><div class="hlabel">المحادثات</div></div>
  <div class="userbar"><div class="ava">أ</div><b>Ahmed Elashry</b><span class="badge">محلي</span></div>
</aside>
<main class="main">
  <div class="topbar"><span class="badge" id="modelinfo">__INFO__</span></div>
  <div class="msgs" id="msgs"></div>
  <div class="composer">
    <div class="field" id="field">
      <textarea id="q" rows="1" placeholder="اسأل elashry-ai... (كود، أمن، أو عربي)"></textarea>
      <div class="tools">
        <button class="tool" onclick="soon()" title="إرفاق">＋</button>
        <button class="tool modelchip" onclick="soon()">elashry __PARAMS__ ⌄</button>
        <button class="send" id="send" title="إرسال">↑</button>
      </div>
    </div>
    <div class="hint">موديل محلي صغير (بيتدرّب لسه) — الردود ممكن تطلع غير مترابطة.</div>
  </div>
</main>
<div class="toast" id="toast"></div>
<script>
 const msgs=document.getElementById('msgs'), q=document.getElementById('q'), send=document.getElementById('send'),
       histEl=document.getElementById('hist'), field=document.getElementById('field'), composer=document.querySelector('.composer');
 let convos=JSON.parse(localStorage.getItem('elashry_convos')||'[]'), curId=null, busy=false, ctrl=null;

 const save=()=>localStorage.setItem('elashry_convos',JSON.stringify(convos));
 const cur=()=>convos.find(c=>c.id===curId);
 const isCode=t=>/[{};]|def |function |import |class |\bpublic\b|=>/.test(t);
 function toast(m){const t=document.getElementById('toast');t.textContent=m;t.classList.add('on');setTimeout(()=>t.classList.remove('on'),1400);}
 window.soon=()=>toast('الميزة دي محتاجة موديل أكبر — قريبًا 🙂');
 window.toggleTheme=()=>{const d=document.documentElement.getAttribute('data-theme')==='dark';document.documentElement.setAttribute('data-theme',d?'light':'dark');localStorage.setItem('elashry_theme',d?'light':'dark');};
 if(localStorage.getItem('elashry_theme')==='dark')document.documentElement.setAttribute('data-theme','dark');
 window.mode=m=>{const p={code:'اكتب دالة ',sec:'اشرح ثغرة ',ar:'بالعربي: '}[m];q.value=p;q.focus();auto();};

 function renderHist(){
   histEl.innerHTML='<div class="hlabel">المحادثات</div>';
   convos.slice().reverse().forEach(c=>{const d=document.createElement('div');d.className='hitem'+(c.id===curId?' on':'');
     d.textContent=c.title||'محادثة';d.onclick=()=>{curId=c.id;renderHist();renderMsgs();};histEl.appendChild(d);});
 }
 function hero(){composer.querySelector('.field').classList.remove('big');
   msgs.innerHTML=`<div class="hero"><div class="word">elashry<span>-ai</span></div>
     <div class="cards">
       <div class="card" onclick="pick('اكتب دالة بايثون تعكس نص')"><b>💻 كود</b><p>اكتب دالة بايثون تعكس نص</p></div>
       <div class="card" onclick="pick('ما هو الـ SQL injection وكيف أمنعه؟')"><b>🛡️ أمن</b><p>ما هو الـ SQL injection؟</p></div>
       <div class="card" onclick="pick('أهلاً، عرّفني بنفسك بالعربي')"><b>🇪🇬 عربي</b><p>أهلاً، عرّفني بنفسك</p></div>
     </div></div>`;
 }
 window.pick=t=>{q.value=t;q.focus();auto();};
 function addRow(role,text){
   let w=msgs.querySelector('.thread'); if(!w){w=document.createElement('div');w.className='thread';msgs.innerHTML='';msgs.appendChild(w);}
   const row=document.createElement('div');row.className='row '+role;
   const av=document.createElement('div');av.className='av '+role;av.textContent=role==='ai'?'ع':'أنت';
   const cont=document.createElement('div');cont.className='cont';
   const b=document.createElement('div');b.className='bubble';b.textContent=text;
   cont.appendChild(b);row.append(av,cont);w.appendChild(row);msgs.scrollTop=msgs.scrollHeight;
   return {b,cont};
 }
 function actions(cont,text,userMsg){
   const bar=document.createElement('div');bar.className='acts';
   const copy=document.createElement('button');copy.className='act';copy.textContent='📋 نسخ';
   copy.onclick=()=>{navigator.clipboard.writeText(text);toast('اتنسخ ✓');};
   const re=document.createElement('button');re.className='act';re.textContent='🔄 إعادة';
   re.onclick=()=>{if(!busy)go(userMsg,true);};
   bar.append(copy,re);cont.appendChild(bar);
 }
 function renderMsgs(){
   const c=cur();if(!c||!c.messages.length){hero();return;}
   composer.querySelector('.field').classList.remove('big');msgs.innerHTML='';
   for(let i=0;i<c.messages.length;i++){const m=c.messages[i];const {b,cont}=addRow(m.role,m.text);
     if(m.role==='ai'){if(isCode(m.text))b.classList.add('code');actions(cont,m.text,c.messages[i-1]?.text||'');}}
 }
 window.newChat=()=>{curId=null;hero();renderHist();q.focus();};

 function auto(){q.style.height='auto';q.style.height=Math.min(q.scrollHeight,150)+'px';}
 q.addEventListener('input',auto);
 q.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();go();}});
 send.onclick=()=>{if(busy){ctrl?.abort();}else{go();}};
 document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key==='k'){e.preventDefault();newChat();}});

 async function go(forceText,regen){
   const t=(forceText??q.value).trim(); if(!t||busy) return;
   busy=true;send.textContent='■';
   if(!regen){q.value='';auto();
     if(!curId){curId=Date.now();convos.push({id:curId,title:t.slice(0,40),messages:[]});renderHist();}
     const c=cur();c.messages.push({role:'me',text:t});
     if(msgs.querySelector('.hero'))renderMsgs();else addRow('me',t);
   }
   const {b,cont}=addRow('ai','');b.innerHTML='<span class="cursor"></span>';
   let out='';ctrl=new AbortController();
   try{
     const res=await fetch('/gen',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:t}),signal:ctrl.signal});
     const rd=res.body.getReader(),dec=new TextDecoder();
     while(true){const {done,value}=await rd.read();if(done)break;out+=dec.decode(value,{stream:true});b.textContent=out;msgs.scrollTop=msgs.scrollHeight;}
   }catch(e){if(e.name!=='AbortError')out='⚠️ '+e.message;}
   if(!out)out='(فاضي)';
   b.textContent=out;if(isCode(out))b.classList.add('code');
   actions(cont,out,t);
   const c=cur();if(c){c.messages.push({role:'ai',text:out});save();}
   busy=false;send.textContent='↑';ctrl=null;q.focus();
 }
 renderHist();hero();q.focus();
</script></body></html>""".replace("__INFO__", INFO).replace("__PARAMS__", PARAMS)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        if self.path != "/":
            self.send_error(404); return
        body = PAGE.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path != "/gen":
            self.send_error(404); return
        n = int(self.headers.get("Content-Length", 0))
        try:
            req = json.loads(self.rfile.read(n) or "{}")
        except Exception:
            req = {}
        prompt = (req.get("prompt") or "").strip()
        ids = tok.encode(f"<|task|> {prompt}\n<|response|> ").ids
        x = torch.tensor([ids], dtype=torch.long, device=DEVICE)
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.end_headers()
        gen_ids, prev = [], ""

        def cb(nxt):
            nonlocal prev
            gen_ids.append(int(nxt.item()))
            curtxt = tok.decode(gen_ids)
            if len(curtxt) > len(prev):
                try:
                    self.wfile.write(curtxt[len(prev):].encode("utf-8"))
                    self.wfile.flush()
                except Exception:
                    pass
                prev = curtxt
        try:
            with torch.no_grad():
                model.generate(x, req.get("max_new_tokens", 120), 0.8, 40,
                               eos_id=EOS, repetition_penalty=1.2, top_p=0.95, on_token=cb)
        except Exception:
            pass


if __name__ == "__main__":
    srv = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"[chat] جاهز — افتح:  http://localhost:{args.port}")
    srv.serve_forever()
