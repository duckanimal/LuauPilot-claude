// LuauPilot provider: Claude (claude.ai).
// Contract: implements LP.provider exactly as providers/deepseek.js does.
// Selectors marked [verify] could not be confirmed from public sources and MUST be
// checked against the live DOM before first use (see CHECKLIST.md).
//
// Site facts:
//  * user turn      = [data-testid="user-message"] (body only; no "You said:" heading)
//  * assistant turn = .font-claude-response (NOT .font-claude-message)
//  * turn pairs are wrapped in div[data-test-render-count] — used only as a fallback
//  * composer is a contenteditable div.ProseMirror (NOT a textarea)
//  * send and stop are SEPARATE buttons, unlike DeepSeek where one button toggles
//  * [data-is-streaming] is present BOTH during and after streaming — never use it
//    as a "generating" signal
//  * conversation URL = /chat/<id>; /share/<id> is a frozen snapshot, not a chat
//  * thinking block selector is unconfirmed — three fallbacks are tried
(() => {
  "use strict";
  const LP = (window.LP = window.LP || {});
  const kit = LP.kit;

  // ---------------------------------------------------------------- selectors
  const SEL = {
    user: [
      ".font-user-message",
      '[data-testid="user-message"]',
      ".human-turn",
      ".HumanTurn",
    ],
    assistant: [
      ".font-claude-response",
      "[data-is-streaming]",
    ],
    composer: [
      "div.ProseMirror",
      "[data-placeholder][contenteditable]",
      '[data-testid="composer-input"]',
      '[aria-label="Message Claude"][contenteditable]',
      'div[role="textbox"][contenteditable]',
      '[contenteditable="true"]',
    ],
    send: [
      'button[aria-label="Send Message"]',
      'button[aria-label="Send message"]',
      'button[data-testid="send-button"]',
      'button[type="submit"]',
    ],
    // [verify] — not documented in any public source
    stop: [
      'button[aria-label="Stop Response"]',
      'button[aria-label="Stop response"]',
      'button[data-testid="stop-button"]',
      '[aria-label*="Stop" i]',
    ],
    // [verify] — three fallbacks; the third is the most permissive
    thinking: [
      '[data-testid*="thinking" i]',
      '[data-testid="thinking-block"]',
      '[class*="thinking" i]',
    ],
    artifact: [
      '[data-testid="artifact"]',
      '[class*="artifact" i]',
    ],
    renderCount: "[data-test-render-count]",
    fileInput: 'input[type="file"]',
    toast: [
      '[role="alert"]',
      '[data-testid="toast"]',
      '[class*="toast" i]',
    ],
  };

  // ---------------------------------------------------------------- regexes
  const RE = {
    // Confirmed strings (Agentbrisk, Oct 2026):
    //   "You've exceeded your usage limits. Try again after [timestamp]."
    //   "You've reached your usage limit. Your limit will reset at [time]."
    rate: /(usage limit|exceeded your usage|reached your usage|rate limit|too many (messages|requests)|slow down|try again (in|after))/i,
    tooLong: /(too long|context (limit|window)|conversation.{0,20}(length|limit))/i,
    busy: /(overloaded|server.{0,10}busy|service unavailable|try again)/i,
    upload: /failed to upload file|upload failed|file too large/i,
  };

  // ---------------------------------------------------------------- helpers
  const q = (s, r = document) => kit.q(s, r);
  const qa = (s, r = document) => kit.qa(s, r);
  const own = (el) => !!(el && el.closest && el.closest(kit.OWN));

  /** First element matching any selector in an ordered list. */
  function pick(list, root = document) {
    for (const sel of list) {
      const el = q(sel, root);
      if (el && !own(el)) return el;
    }
    return null;
  }

  /** All elements for an ordered list, flattened and de-duplicated. */
  function pickAll(list, root = document) {
    const out = [];
    const seen = new Set();
    for (const sel of list) {
      for (const el of qa(sel, root)) {
        if (own(el) || seen.has(el)) continue;
        seen.add(el);
        out.push(el);
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- dom cache
  // MutationObserver-driven cache to avoid re-querying the DOM on every
  // generating() call. Invalidated on any childList or characterData change
  // inside the conversation container.
  let cacheVersion = 0;
  let lastCacheVersion = -1;
  let cachedTurns = [];
  let observer = null;

  function invalidateCache() {
    cacheVersion++;
  }

  function ensureObserver() {
    if (observer) return;
    const target = document.querySelector('main, [role="main"], body');
    if (!target) return;
    observer = new MutationObserver(() => invalidateCache());
    observer.observe(target, { childList: true, subtree: true, characterData: true });
  }

  function getTurns() {
    if (lastCacheVersion === cacheVersion) return cachedTurns;
    ensureObserver();
    const turns = [];
    const seen = new Set();

    const users = pickAll(SEL.user);
    for (const el of users) {
      if (seen.has(el)) continue;
      seen.add(el);
      turns.push({ el, role: "user" });
    }

    const assistants = pickAll(SEL.assistant);
    for (const el of assistants) {
      if (seen.has(el)) continue;
      seen.add(el);
      turns.push({ el, role: "assistant" });
    }

    turns.sort((a, b) => {
      if (a.el === b.el) return 0;
      const pos = a.el.compareDocumentPosition(b.el);
      return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });

    cachedTurns = turns;
    lastCacheVersion = cacheVersion;
    return turns;
  }

  const assistants = () => getTurns().filter((t) => t.role === "assistant");
  const lastAssistant = () => {
    const a = assistants();
    return a.length ? a[a.length - 1].el : null;
  };

  function skipNode(node) {
    for (const sel of SEL.thinking) if (node.matches && node.matches(sel)) return true;
    for (const sel of SEL.artifact) if (node.matches && node.matches(sel)) return true;
    return false;
  }

  function codeBlocks(el) {
    const found = qa("pre", el).filter((b) => {
      if (own(b)) return false;
      for (const sel of SEL.thinking) if (b.closest(sel)) return false;
      for (const sel of SEL.artifact) if (b.closest(sel)) return false;
      return true;
    });
    return found.filter((b) => !found.some((o) => o !== b && o.contains(b)));
  }

  // ---------------------------------------------------------------- composer
  const editor = () => pick(SEL.composer);
  const editorText = () => {
    const e = editor();
    return e ? (e.innerText || e.textContent || "") : "";
  };

  function setEditable(ed, text) {
    if (!ed) return false;
    ed.focus();
    try {
      document.execCommand("selectAll");
      document.execCommand("delete");
      document.execCommand("insertText", false, text);
      const current = ed.innerText || ed.textContent || "";
      if (current.trim() === text.trim()) return true;
    } catch {
      /* fall through */
    }
    try {
      const dt = new DataTransfer();
      dt.setData("text/plain", text);
      ed.dispatchEvent(
        new ClipboardEvent("paste", {
          clipboardData: dt,
          bubbles: true,
          cancelable: true,
        }),
      );
      const current = ed.innerText || ed.textContent || "";
      return current.trim() === text.trim();
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------- buttons
  const sendButton = () => {
    const b = pick(SEL.send);
    if (!b) return null;
    if (b.getAttribute("aria-disabled") === "true" || b.disabled) return null;
    if (!kit.visible(b)) return null;
    return b;
  };

  const stopButton = () => {
    const b = pick(SEL.stop);
    return b && kit.visible(b) ? b : null;
  };

  const sendReady = () => !!sendButton();

  // ---------------------------------------------------------------- generating
  const WINDOW_ANSWER = 900;
  let sMax = -1;
  let sAt = 0;
  let sItem = null;

  function sample() {
    const item = lastAssistant();
    const len = item ? (item.textContent || "").length : 0;
    const now = Date.now();
    if (item !== sItem || len < sMax - 400) {
      sItem = item;
      sMax = len;
      sAt = now;
      return;
    }
    if (len > sMax) {
      sMax = len;
      sAt = now;
    }
  }

  function generating() {
    try {
      if (stopButton()) return true;
      sample();
      return sMax > 1 && Date.now() - sAt < WINDOW_ANSWER;
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------- vision
  function vision() {
    const input = q(SEL.fileInput);
    if (!input) return false;
    const accept = (input.getAttribute("accept") || "").toLowerCase();
    return accept === "" || accept.includes("image");
  }

  // ---------------------------------------------------------------- notices
  function findNotice(re) {
    const turns = getTurns();
    const last = turns[turns.length - 1];
    if (last) {
      for (const el of qa("span, p, div", last.el.parentElement || last.el)) {
        if (el.children.length || own(el)) continue;
        const t = (el.textContent || "").trim();
        if (t && t.length < 240 && re.test(t)) {
          return { text: t, key: "turn:" + kit.hash(t) };
        }
      }
    }
    for (const sel of SEL.toast) {
      for (const el of qa(sel)) {
        if (own(el) || el.closest(".font-claude-response")) continue;
        const t = (el.textContent || "").trim();
        if (t && t.length < 300 && re.test(t) && kit.visible(el)) {
          return { text: t, key: "toast:" + kit.hash(t) };
        }
      }
    }
    return null;
  }

  function notice() {
    try {
      let n = findNotice(RE.rate);
      if (n) return { kind: "rate", text: n.text, key: n.key };
      n = findNotice(RE.upload);
      if (n) return { kind: "busy", text: n.text, key: n.key };
      n = findNotice(RE.tooLong);
      if (n) return { kind: "toolong", text: n.text, key: n.key };
      n = findNotice(RE.busy);
      if (n) return { kind: "busy", text: n.text, key: n.key };
    } catch {
      /* never throw */
    }
    return null;
  }

  // ---------------------------------------------------------------- sending
  async function attach(images) {
    const input = q(SEL.fileInput);
    if (!input) return false;
    const files = [];
    images.forEach((im, i) => {
      try {
        files.push(kit.toFile(im, i));
      } catch {
        /* skip */
      }
    });
    if (!files.length) return false;
    try {
      kit.attachViaInput(input, files);
    } catch {
      return false;
    }
    return kit.waitFor(() => {
      const imgs = qa('img[src^="blob:"]').filter(
        (im) => !im.closest(".font-claude-response"),
      );
      if (imgs.length) return true;
      const cards = qa('[class*="attachment" i], [class*="file-preview" i]').filter(
        (c) => !own(c),
      );
      return cards.length > 0;
    }, 20000);
  }

  async function send(text, images) {
    const ed = editor();
    if (!ed) return false;

    if (stopButton() && !(await kit.waitFor(() => !stopButton(), 5000))) return false;

    const before = getTurns().filter((t) => t.role === "user").length;
    if (!setEditable(ed, clip(text))) return false;

    const withImages = !!(images && images.length);
    if (withImages) {
      try {
        await attach(images);
      } catch {
        /* send anyway */
      }
    }

    const deadline = Date.now() + (withImages ? 25000 : 7000);
    let clicks = 0;

    while (Date.now() < deadline) {
      await kit.waitFor(sendReady, 800, 80);

      if (getTurns().filter((t) => t.role === "user").length > before || stopButton()) return true;

      const b = sendButton();
      if (b && clicks < 2) {
        kit.click(b);
        clicks++;
      } else if (!b && clicks < 2) {
        kit.pressKey(ed, "Enter");
        clicks++;
      }

      if (
        await kit.waitFor(
          () => getTurns().filter((t) => t.role === "user").length > before || stopButton(),
          2500,
          80,
        )
      ) {
        return true;
      }
      if (clicks >= 2) break;
    }

    try {
      setEditable(ed, "");
    } catch {
      /* ignore */
    }
    return false;
  }

  // ---------------------------------------------------------------- conversation
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function conversationKey() {
    const parts = location.pathname.split("/").filter(Boolean);
    if (parts[0] === "share") return "";
    if (parts[0] === "chat" && parts[1]) return parts[1];
    for (const p of parts) if (UUID_RE.test(p)) return p;
    return "";
  }

  // ---------------------------------------------------------------- provider
  LP.provider = {
    id: "claude",
    name: "Claude",
    url: "https://claude.ai/new",
    get vision() {
      return vision();
    },
    notes: "",
    resendEvery: 0,

    // Claude needs longer warmup than DeepSeek (it delays the first token).
    timings: { idleMs: 8000, stableMs: 10000, warmupMs: 60000, timeoutMs: 480000 },
    thinkingSel: SEL.thinking[0],

    // Claude's limits are window-based, not per-burst. Keep a gentle gap.
    rate: { minGapMs: 4000, perMinute: 10 },
    recoverRate: true,

    turns() {
      return getTurns().map((t) => ({ el: t.el, role: t.role }));
    },

    turnId() {
      return null;
    },

    text(el) {
      return kit.readText(el, { skip: skipNode });
    },

    codeBlocks,

    body(el) {
      return el;
    },

    conversationKey,

    conversationUrl(key) {
      return key ? "https://claude.ai/chat/" + encodeURIComponent(key) : null;
    },

    generating,

    stop() {
      const b = stopButton();
      if (b) {
        try {
          b.click();
        } catch {
          /* ignore */
        }
      }
    },

    editor,
    editorText,

    isFresh() {
      return (
        getTurns().filter((t) => t.role === "user").length === 0 &&
        !!editor() &&
        !conversationKey()
      );
    },

    send,

    lockInput(on) {
      const ed = editor();
      if (!ed) return;
      if (on) {
        if (ed.getAttribute("data-lp-ce") == null) {
          ed.setAttribute("data-lp-ce", ed.getAttribute("contenteditable") || "true");
        }
        ed.setAttribute("contenteditable", "false");
        ed.style.opacity = "0.6";
      } else {
        const prev = ed.getAttribute("data-lp-ce");
        ed.setAttribute("contenteditable", prev === "false" ? "true" : prev || "true");
        ed.style.opacity = "";
      }
    },

    barSlot() {
      const ed = editor();
      if (!ed) return null;
      const send = sendButton();
      let box = ed.parentElement;
      while (box && box !== document.body) {
        if (send && box.contains(send)) break;
        box = box.parentElement;
      }
      if (!box || box === document.body) {
        return { parent: ed.parentElement, before: ed };
      }
      const outer = box.parentElement || box;
      return { parent: outer, before: box };
    },

    notice,

    continueButton() {
      return null;
    },
  };
})();
