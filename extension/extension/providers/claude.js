// LuaPilot provider: Claude (claude.ai).
//
// Site facts (selectors marked [guess] need live verification):
//  * user turn = [data-testid="user-message"]; assistant turn = .font-claude-message
//  * Claude has no virtual list — DOM order is stable but no per-turn data-key
//  * extended thinking renders inside the assistant turn, in a collapsible block
//  * composer is a contenteditable div.ProseMirror (NOT a textarea) — use execCommand,
//    not setNativeValue
//  * send and stop are SEPARATE buttons (aria-label="Send Message" / "Stop Response"),
//    unlike DeepSeek where one button toggles
//  * attachments: input[type="file"] accepts images; uploads appear as blob: previews
(() => {
  "use strict";
  const LP = (window.LP = window.LP || {});
  const kit = LP.kit;

  const SEL = {
    user: '[data-testid="user-message"], .font-user-message',
    assistant: '.font-claude-message',
    composer: 'div.ProseMirror[contenteditable="true"], div[contenteditable="true"].ProseMirror',
    sendBtn: 'button[aria-label="Send Message"]',
    stopBtn: 'button[aria-label="Stop Response"]',
    thinking: '[data-testid="thinking-block"], .thinking-block, [class*="thinking" i]', // [guess]
    artifact: '[data-testid="artifact"], .artifact-block', // [guess]
    fileInput: 'input[type="file"]',
    toast: '[role="alert"], [data-testid="toast"], .toast, [class*="toast" i]',
  };

  const RE = {
    rate: /(rate limit|too many (messages|requests)|slow down|try again (in|after))/i,
    tooLong: /(too long|context (limit|window)|conversation.{0,20}(length|limit))/i,
    busy: /(overloaded|server.{0,10}busy|service unavailable|try again)/i,
  };

  const q = (s, r = document) => kit.q(s, r);
  const qa = (s, r = document) => kit.qa(s, r);
  const own = (el) => !!(el && el.closest && el.closest(kit.OWN));

  const SEND_MAX = 180000;
  function clip(text) {
    if (!text || text.length <= SEND_MAX) return text;
    const gone = text.length - SEND_MAX;
    const mark = `\n\n[... LuaPilot: output shortened - ${gone} of ${text.length} chars omitted. Do NOT repeat; work with the head and tail. ...]\n\n`;
    const room = SEND_MAX - mark.length;
    const head = Math.floor(room * 0.85);
    return text.slice(0, head) + mark + text.slice(text.length - (room - head));
  }

  // ---------------------------------------------------------------- turns
  const allTurns = () => {
    const users = qa(SEL.user).filter((e) => !own(e));
    const assistants = qa(SEL.assistant).filter((e) => !own(e));
    const all = [
      ...users.map((el) => ({ el, role: 'user' })),
      ...assistants.map((el) => ({ el, role: 'assistant' })),
    ];
    all.sort((a, b) => {
      if (a.el === b.el) return 0;
      const pos = a.el.compareDocumentPosition(b.el);
      return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });
    return all;
  };
  const assistants = () => allTurns().filter((t) => t.role === 'assistant');
  const lastAssistant = () => { const a = assistants(); return a.length ? a[a.length - 1].el : null; };

  function skipNode(node) {
    if (node.matches(SEL.thinking) || node.matches(SEL.artifact)) return true;
    return false;
  }

  function codeBlocks(el) {
    const found = qa('pre', el).filter(
      (b) => !b.closest(SEL.thinking) && !b.closest(SEL.artifact) && !own(b),
    );
    return found.filter((b) => !found.some((o) => o !== b && o.contains(b)));
  }

  // ---------------------------------------------------------------- composer (contenteditable)
  const editor = () => q(SEL.composer);
  const editorText = () => {
    const e = editor();
    return e ? (e.innerText || e.textContent || '') : '';
  };

  function setEditable(ed, text) {
    ed.focus();
    try {
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(ed);
      sel.removeAllRanges();
      sel.addRange(range);
      // execCommand fires beforeinput/input, which ProseMirror hooks into
      if (!document.execCommand('insertText', false, text)) {
        const dt = new DataTransfer();
        dt.setData('text/plain', text);
        ed.dispatchEvent(new ClipboardEvent('paste', {
          clipboardData: dt, bubbles: true, cancelable: true,
        }));
      }
    } catch {
      ed.textContent = text;
      ed.dispatchEvent(new InputEvent('input', { bubbles: true }));
    }
  }

  // ---------------------------------------------------------------- generating
  const stopBtn = () => {
    const b = q(SEL.stopBtn);
    return b && kit.visible(b) ? b : null;
  };
  const sendBtn = () => {
    const b = q(SEL.sendBtn);
    return b && kit.visible(b) && b.getAttribute('aria-disabled') !== 'true' && !b.disabled ? b : null;
  };

  const WINDOW_ANSWER = 800;
  let sMax = -1, sAt = 0, sItem = null;
  function sample() {
    const item = lastAssistant();
    const len = item ? (item.textContent || '').length : 0;
    const now = Date.now();
    if (item !== sItem || len < sMax - 400) { sItem = item; sMax = len; sAt = now; return; }
    if (len > sMax) { sMax = len; sAt = now; }
  }
  function generating() {
    try {
      if (stopBtn()) return true;
      sample();
      return sMax > 1 && Date.now() - sAt < WINDOW_ANSWER;
    } catch { return false; }
  }

  // ---------------------------------------------------------------- vision
  // Be conservative: claim vision only when a file input accepts images.
  const vision = () => {
    const input = q(SEL.fileInput);
    if (!input) return false;
    const accept = (input.getAttribute('accept') || '').toLowerCase();
    return accept.includes('image') || accept === '';
  };

  // ---------------------------------------------------------------- notices
  function findNotice(re) {
    for (const el of qa(SEL.toast)) {
      if (own(el)) continue;
      const t = (el.textContent || '').trim();
      if (t && t.length < 300 && re.test(t) && kit.visible(el)) {
        return { text: t, key: 'toast:' + kit.hash(t) };
      }
    }
    return null;
  }
  function notice() {
    try {
      let n = findNotice(RE.rate);
      if (n) return { kind: 'rate', text: n.text, key: n.key };
      n = findNotice(RE.tooLong);
      if (n) return { kind: 'toolong', text: n.text, key: n.key };
      n = findNotice(RE.busy);
      if (n) return { kind: 'busy', text: n.text, key: n.key };
    } catch { /* never throw */ }
    return null;
  }

  // ---------------------------------------------------------------- sending
  async function attach(images) {
    const input = q(SEL.fileInput);
    if (!input) return false;
    const files = [];
    images.forEach((im, i) => { try { files.push(kit.toFile(im, i)); } catch { /* skip */ } });
    if (!files.length) return false;
    try { kit.attachViaInput(input, files); } catch { return false; }
    return kit.waitFor(
      () => qa('img[src^="blob:"]').some((im) => !im.closest(SEL.assistant)),
      20000,
    );
  }

  async function send(text, images) {
    const ed = editor();
    if (!ed) return false;
    if (stopBtn() && !(await kit.waitFor(() => !stopBtn(), 5000))) return false;

    const before = qa(SEL.user).length;
    setEditable(ed, clip(text));

    const withImages = !!(images && images.length);
    if (withImages) { try { await attach(images); } catch { /* send anyway */ } }

    const deadline = Date.now() + (withImages ? 25000 : 6000);
    let clicks = 0;
    while (Date.now() < deadline) {
      await kit.waitFor(sendBtn, 800, 80);
      if (qa(SEL.user).length > before || stopBtn()) return true;

      const b = sendBtn();
      if (b && clicks < 2) { kit.click(b); clicks++; }
      else if (!b && (ed.innerText || '').trim() && clicks < 2) { kit.pressKey(ed, 'Enter'); clicks++; }

      if (await kit.waitFor(() => qa(SEL.user).length > before || stopBtn(), 2500, 80)) return true;
      if (clicks >= 2) break;
    }
    try { setEditable(ed, ''); } catch { /* ignore */ }
    return false;
  }

  // ---------------------------------------------------------------- conversation
  const ID_RE = /\/chat\/([0-9a-f-]{36})/i;
  const conversationKey = () => {
    const m = ID_RE.exec(location.pathname);
    return m ? m[1] : '';
  };

  // ---------------------------------------------------------------- provider object
  LP.provider = {
    id: 'claude',
    name: 'Claude',
    url: 'https://claude.ai/new',
    get vision() { return vision(); },
    notes: '',
    resendEvery: 0,
    // Claude takes longer to start than DeepSeek; widen the warmup window.
    timings: { idleMs: 8000, stableMs: 10000, warmupMs: 60000, timeoutMs: 480000 },
    thinkingSel: SEL.thinking,
    // More permissive than DeepSeek: Claude's rate limits are per-window, not per-burst.
    rate: { minGapMs: 4000, perMinute: 10 },
    recoverRate: true,

    turns() {
      return allTurns().map((t) => ({ el: t.el, role: t.role }));
    },
    turnId() {
      // No stable per-turn key in Claude's DOM — agent falls back to index+hash.
      return null;
    },
    text(el) {
      return kit.readText(el, { skip: skipNode });
    },
    codeBlocks,
    body(el) {
      return el; // user and assistant elements are already the right read boundaries
    },
    conversationKey,
    conversationUrl(key) {
      return key ? 'https://claude.ai/chat/' + encodeURIComponent(key) : null;
    },

    generating,
    stop() { const b = stopBtn(); if (b) { try { b.click(); } catch { /* ignore */ } } },

    editor,
    editorText,
    isFresh() {
      return qa(SEL.user).length === 0 && !!editor() && !ID_RE.test(location.pathname);
    },
    send,
    lockInput(on) {
      const ed = editor();
      if (!ed) return;
      if (on) {
        if (ed.getAttribute('data-lp-ce') == null) {
          ed.setAttribute('data-lp-ce', ed.getAttribute('contenteditable') || '');
        }
        ed.setAttribute('contenteditable', 'false');
        ed.style.opacity = '0.6';
      } else {
        const prev = ed.getAttribute('data-lp-ce');
        ed.setAttribute('contenteditable', prev === 'false' ? 'true' : (prev || 'true'));
        ed.style.opacity = '';
      }
    },
    // Claude's composer sits inside a rounded wrapper — insert our bar just above it.
    barSlot() {
      const ed = editor();
      if (!ed || !ed.parentElement) return null;
      return { parent: ed.parentElement, before: ed };
    },

    notice,
    continueButton() {
      // Claude has no "Continue" button; long answers resume by sending an empty prompt,
      // but the agent loop does not require it.
      return null;
    },
  };
})();
