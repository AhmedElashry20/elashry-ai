(() => {
  const vscode = acquireVsCodeApi();
  const $ = (id) => document.getElementById(id);

  const messagesEl = $('messages');
  const input = $('input');
  const sendBtn = $('send');
  const icSend = $('ic-send');
  const icStop = $('ic-stop');
  const menu = $('menu');

  let running = false;
  let startedAt = null;
  let currentAssistant = null;
  let skills = [];
  let models = [];

  /* ───────── عرض الرسائل ───────── */
  function scrollBottom() { messagesEl.scrollTop = messagesEl.scrollHeight; }

  function addMessage(role, text) {
    const wrap = document.createElement('div');
    wrap.className = `msg ${role}`;
    const r = document.createElement('div');
    r.className = 'role';
    r.textContent = role === 'user' ? 'انت' : 'الإيجنت';
    const b = document.createElement('div');
    b.className = 'body';
    b.textContent = text ?? '';
    wrap.append(r, b);
    messagesEl.appendChild(wrap);
    scrollBottom();
    return wrap;
  }

  function addTool(name, payload, isError) {
    const el = document.createElement('div');
    el.className = `tool ${isError ? 'error' : ''}`;
    const n = document.createElement('div');
    n.className = 'name';
    n.textContent = `▸ ${name}`;
    const pre = document.createElement('pre');
    pre.textContent = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
    el.append(n, pre);
    messagesEl.appendChild(el);
    scrollBottom();
  }

  function addNote(cls, text) {
    const el = document.createElement('div');
    el.className = cls;
    el.textContent = text;
    messagesEl.appendChild(el);
    scrollBottom();
  }

  /* ───────── حالة التشغيل ───────── */
  function setRunning(on) {
    running = on;
    document.body.classList.toggle('running', on);
    icSend.hidden = on;
    icStop.hidden = !on;
    sendBtn.title = on ? 'إيقاف' : 'إرسال (Enter)';
    if (on && !startedAt) startedAt = Date.now();
  }

  setInterval(() => {
    if (!startedAt) return;
    const m = Math.floor((Date.now() - startedAt) / 60000);
    $('elapsed').textContent = m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60}m`;
  }, 10000);

  /* ───────── القائمة المنبثقة ───────── */
  function closeMenu() { menu.hidden = true; menu.innerHTML = ''; }

  function openMenu(sections) {
    menu.innerHTML = '';
    let any = false;
    for (const sec of sections) {
      if (sec.head) {
        const h = document.createElement('div');
        h.className = 'head';
        h.textContent = sec.head;
        menu.appendChild(h);
      }
      for (const it of sec.items || []) {
        any = true;
        const el = document.createElement('div');
        el.className = 'item';
        const t = document.createElement('div');
        t.textContent = it.label;
        el.appendChild(t);
        if (it.sub) {
          const s = document.createElement('div');
          s.className = 'sub';
          s.textContent = it.sub;
          el.appendChild(s);
        }
        el.addEventListener('click', () => { closeMenu(); it.run(); });
        menu.appendChild(el);
      }
    }
    if (!any) {
      const e = document.createElement('div');
      e.className = 'empty';
      e.textContent = 'مفيش حاجة هنا';
      menu.appendChild(e);
    }
    menu.hidden = false;
  }

  document.addEventListener('click', (e) => {
    if (!menu.hidden && !menu.contains(e.target) && !e.target.closest('.bar')) closeMenu();
  });

  /* ───────── الأزرار ───────── */
  function send() {
    if (running) { vscode.postMessage({ type: 'cancel' }); return; }
    const text = input.value.trim();
    if (!text) return;
    vscode.postMessage({ type: 'send', text });
    input.value = '';
    input.style.height = 'auto';
  }

  sendBtn.addEventListener('click', send);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    if (e.key === 'Escape') closeMenu();
  });

  // الصندوق بيكبر مع النص
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 180) + 'px';
    // كتابة / في أول السطر بتفتح قائمة المهارات
    if (input.value === '/') { vscode.postMessage({ type: 'need_skills' }); }
  });

  $('btn-plus').addEventListener('click', () => openMenu([{
    head: 'أضف سياق',
    items: [
      { label: 'الملف المفتوح', sub: 'يبعت مسار ومحتوى الملف النشط', run: () => vscode.postMessage({ type: 'ctx', what: 'file' }) },
      { label: 'المحدّد', sub: 'النص اللي محدّده في المحرر', run: () => vscode.postMessage({ type: 'ctx', what: 'selection' }) },
      { label: 'أخطاء المحرر', sub: 'كل الأخطاء الظاهرة دلوقتي', run: () => vscode.postMessage({ type: 'ctx', what: 'problems' }) },
    ],
  }]));

  $('btn-slash').addEventListener('click', () => vscode.postMessage({ type: 'need_skills' }));

  $('btn-hist').addEventListener('click', () => vscode.postMessage({ type: 'need_sessions' }));

  $('btn-model').addEventListener('click', () => {
    if (!models.length) { vscode.postMessage({ type: 'need_models' }); return; }
    openMenu([{ head: 'الموديل', items: models.map(m => ({ label: m, run: () => vscode.postMessage({ type: 'set_model', model: m }) })) }]);
  });

  $('btn-mode').addEventListener('click', () => openMenu([{
    head: 'وضع الأذونات',
    items: [
      { label: 'Auto', sub: 'ينفّذ الآمن، يسأل على الباقي، يرفض الخطر', run: () => vscode.postMessage({ type: 'set_mode', mode: 'approve' }) },
      { label: 'Strict', sub: 'يسأل على كل حاجة', run: () => vscode.postMessage({ type: 'set_mode', mode: 'strict' }) },
      { label: 'Full', sub: 'ينفّذ كل حاجة — غير مستحسن', run: () => vscode.postMessage({ type: 'set_mode', mode: 'full' }) },
    ],
  }]));

  $('mic').addEventListener('click', () => {
    addNote('note', 'الإملاء الصوتي بتاع ماك: دوس Fn مرتين وانت واقف في صندوق الكتابة.');
    input.focus();
  });

  /* ───────── الرسائل الجاية من الإكستنشن ───────── */
  window.addEventListener('message', (e) => {
    const m = e.data;
    switch (m.type) {
      case 'user_message': addMessage('user', m.text); break;
      case 'assistant_start': currentAssistant = addMessage('assistant', ''); setRunning(true); break;
      case 'text_delta':
        if (!currentAssistant) currentAssistant = addMessage('assistant', '');
        currentAssistant.querySelector('.body').textContent += m.text;
        scrollBottom();
        break;
      case 'assistant_end': currentAssistant = null; setRunning(false); break;
      case 'tool_call': addTool(m.name, m.input, false); break;
      case 'tool_result': addTool(`${m.name} ←`, m.content, m.is_error); break;
      case 'iteration': addNote('iter', `— دورة ${m.index} —`); break;
      case 'done':
        setRunning(false);
        addNote(m.error ? 'err' : 'note', m.error ? `خطأ: ${m.error}` : `خلص: ${m.reason}`);
        break;
      case 'error': setRunning(false); addNote('err', m.text); break;
      case 'reset': messagesEl.innerHTML = ''; currentAssistant = null; startedAt = null; $('elapsed').textContent = '0m'; break;
      case 'skills':
        skills = m.items || [];
        openMenu([
          { head: 'المهارات', items: skills.map(s => ({ label: `$${s.name}`, sub: s.description, run: () => { input.value = (input.value.replace(/^\//, '') + ` $${s.name} `).trimStart(); input.focus(); } })) },
          { head: 'الأهداف', items: (m.goals || []).map(g => ({ label: g, sub: 'شغّل الهدف ده', run: () => vscode.postMessage({ type: 'run_goal', name: g }) })) },
        ]);
        break;
      case 'sessions':
        openMenu([
          { items: [{ label: '+ محادثة جديدة', run: () => vscode.postMessage({ type: 'new_session' }) }] },
          { head: 'المحادثات المحفوظة', items: (m.items || []).map(s => ({ label: s.title, sub: `${s.turns} رسالة · ${new Date(s.updated).toLocaleString('ar-EG')}`, run: () => vscode.postMessage({ type: 'resume', id: s.id }) })) },
        ]);
        break;
      case 'models':
        models = m.items || [];
        openMenu([{ head: 'الموديل', items: models.map(x => ({ label: x, run: () => vscode.postMessage({ type: 'set_model', model: x }) })) }]);
        break;
      case 'status':
        if (m.model) $('model-name').textContent = m.model;
        if (m.mode) $('mode-name').textContent = { approve: 'Auto', strict: 'Strict', full: 'Full' }[m.mode] || m.mode;
        break;
    }
  });

  vscode.postMessage({ type: 'ready' });
})();
