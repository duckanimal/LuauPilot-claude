[README-CLAUDE-PROVIDER.md](https://github.com/user-attachments/files/34243217/README-CLAUDE-PROVIDER.md)
<p align="center"><img src="assets/logo-wide-dark.png" alt="LuauPilot" width="320"></p>

# LuauPilot

![Platform](https://img.shields.io/badge/platform-Windows-blue)
![License](https://img.shields.io/badge/license-MIT-blue)

> [!NOTE]# إضافة مزود Claude إلى LuauPilot

هذا الدليل يشرح كيفية إضافة مزود `claude.ai` إلى مشروع LuauPilot بجانب DeepSeek.

## الملفات

| الملف | الوصف |
|---|---|
| `extension/providers/claude.js` | المزود الجديد |
| `extension/manifest.json` | نسخة محدّثة تحتوي إدخال claude.ai |
| `CHECKLIST.md` | قائمة فحص يدوي قبل التشغيل |

## التركيب

### 1. انسخ الملفات

انسخ `claude.js` إلى:

```

extension/providers/claude.js

```

واستبدل `manifest.json` بالنسخة المرفقة (أو ادمج الإدخالات يدويًا).

### 2. تحقق من المحددات

**قبل التشغيل**، افتح `claude.ai`، سجّل الدخول، واضغط F12. تحقق من المحددات الموسومة `[verify]` داخل `claude.js`:

```javascript
// في Console المتصفح:
document.querySelector('.font-claude-response')        // رد المساعد
document.querySelector('[data-testid="user-message"]')  // رسالة المستخدم
document.querySelector('div.ProseMirror')               // حقل الإدخال
document.querySelector('button[aria-label="Send Message"]')
document.querySelector('button[aria-label="Stop Response"]')
```

إذا رجع أي منها `null`، عدّل `SEL` في `claude.js`.

### 3. حمّل الإضافة

```
chrome://extensions → Developer mode → Load unpacked → اختر مجلد extension
```

### 4. شغّل

1. افتح `claude.ai/new`.
2. اضغط زر LuauPilot في شريط الأدوات.
3. اضغط "Start LuauPilot here".
4. اكتب أمرًا بسيطًا مثل `list_commands`.

## ما تم التحقق منه

- ☑  
نمط URL: `/chat/<id>` (convId = آخر مقطع مسار)
- ☑  
`[data-testid="user-message"]` — محدد مؤكد
- ☑  
`div.ProseMirror` — حقل الإدخال المؤكد
- ☑  
`execCommand('insertText')` — الطريقة الوحيدة لإدخال النص
- ☑  
بنية `content_scripts` المتعددة صحيحة
- ☑  
نصوص رسائل تجاوز الحد

## ما لم يتم التحقق منه

- □  
محدد زر Stop (تخمين: `button[aria-label="Stop Response"]`)
- □  
محدد بلوك التفكير (تخمين: `[data-testid*="thinking"]` / `[class*="thinking" i]`)
- □  
محدد حقل رفع الصور (`input[type="file"]`)
- □  
محدد معاينة الصور المصغرة (`img[src^="blob:"]`)

هذه موسومة `[verify]` في الكود. راجع `CHECKLIST.md`.

## تحذيرات

> ⚠️ أتمتة `claude.ai` قد تخالف شروط الخدمة. المسؤولية على المستخدم.

> ⚠️ المحددات هشة. أي تحديث من Anthropic قد يكسر المزود.

> ⚠️ `ds-safety.js` خاص بـ DeepSeek. النسخة الحالية من `manifest.json` لا تضيف نظيرًا لـ Claude — أضفه لاحقًا إن لزم.

## الترخيص

المشروع الأصلي MIT. هذا الملف وهذه الإضافة تخضعان لنفس الترخيص.

</BDS:create_file>

<BDS:create_file fileName="CHECKLIST.md">

```markdown
# قائمة فحص يدوي قبل التشغيل

نفّذ هذه الخطوات على `claude.ai` مع DevTools مفتوح (F12).

## 1. فحص المحددات المؤكدة

افتح Console والصق:

```javascript
const check = (sel, name) => {
  const el = document.querySelector(sel);
  console.log(el ? `✓ ${name}: ${sel}` : `✗ ${name}: ${sel} (NOT FOUND)`);
  return el;
};

check('[data-testid="user-message"]', 'User message');
check('.font-claude-response', 'Assistant response');
check('div.ProseMirror', 'Composer');
check('button[aria-label="Send Message"]', 'Send button');

يجب أن تظهر جميعها ✓. إذا ظهر ✗، سجّل المحدد البديل من عناصر الصفحة (Inspect → Copy selector).

## 2. فحص المحددات غير المؤكدة

### زر Stop

1. أرسل رسالة طويلة ("اكتب مقالًا من 2000 كلمة").
2. أثناء الكتابة، نفّذ:

```
document.querySelector('button[aria-label="Stop Response"]')
```

إذا رجع `null`، افحص الأزرار الظاهرة:

```
[...document.querySelectorAll('button')]
  .filter(b => b.offsetParent)
  .map(b => ({ label: b.getAttribute('aria-label'), text: b.textContent.trim().slice(0, 30), testid: b.dataset.testid }))
  .filter(x => x.label || x.text)
```

ابحث عن زر يحتوي "Stop" أو "إيقاف". سجّل محدداه.

### بلوك التفكير

1. أرسل سؤالًا يحتاج تفكيرًا ("ما 47 × 89؟ اشرح خطواتك").
2. أثناء التفكير، نفّذ:

```
[...document.querySelectorAll('[class*="thinking" i], [data-testid*="thinking"], details')]
  .map(e => ({ tag: e.tagName, cls: e.className, testid: e.dataset.testid }))
```

سجّل المحدد الفعلي.

### حقل رفع الصور

```
document.querySelector('input[type="file"]')
```

إذا رجع `null`، اضغط زر "+" في الواجهة ثم أعد الفحص.

## 3. فحص رسالة تجاوز الحد

**صعب التحقق يدويًا** — يتطلب الوصول للحد الفعلي. بدلًا من ذلك، تحقق من regex:

```
const RE = {
  rate: /(usage limit|exceeded your usage|rate limit|too many|slow down|try again (in|after))/i,
};
RE.rate.test("You've exceeded your usage limits. Try again after 2:30 PM.");  // true
RE.rate.test("You've reached your usage limit. Your limit will reset at 5:00 PM."); // true
```

## 4. اختبار الإدخال

```
const ed = document.querySelector('div.ProseMirror');
ed.focus();
document.execCommand('selectAll');
document.execCommand('delete');
document.execCommand('insertText', false, 'test from console');
```

يجب أن يظهر النص في الحقل **وأن يفعّل زر الإرسال**.

## 5. اختبار الإرسال

بعد تحميل الإضافة، اضغط "Start LuauPilot here" وأرسل `list_commands`. راقب:

- هل ظهر النص في الحقل؟
- هل ضُغط الإرسال؟
- هل بدأت الحلقة (ظهور شريط الحالة)؟

## 6. اختبار الإيقاف

أثناء رد طويل، اضغط زر الإيقاف في LuauPilot. يجب أن يتوقف Claude.

## 7. توثيق النتائج

سجّل كل محدل عدّلته في `claude.js` وأزل علامة `[verify]` عنه.

</BDS:create_file>

<BDS:create_file fileName="extension/providers/claude.js">

```javascript
// LuauPilot provider: Claude (claude.ai).
//
// Contract: implements LP.provider exactly as providers/deepseek.js does.
//
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
  // Each entry is an ordered list; the first match wins. This mirrors the
  // multi-strategy resolver used by ArcRift (last verified May 2026).
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

  // Claude's input cap is higher than DeepSeek's; 180k leaves a safe margin.
  const SEND_MAX = 180000;
  function clip(text) {
    if (!text || text.length <= SEND_MAX) return text;
    const gone = text.length - SEND_MAX;
    const mark =
      `\n\n[... LuaPilot: output shortened to fit Claude's input limit - ${gone} of ` +
      `${text.length} characters omitted. Do NOT repeat the command; work with the head and tail shown. ...]\n\n`;
    const room = SEND_MAX - mark.length;
    const head = Math.floor(room * 0.85);
    return text.slice(0, head) + mark + text.slice(text.length - (room - head));
  }

  // ---------------------------------------------------------------- turns
  function allTurns() {
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

    // Sort by document order. compareDocumentPosition is the only reliable way
    // when elements come from different selector matches.
    turns.sort((a, b) => {
      if (a.el === b.el) return 0;
      const pos = a.el.compareDocumentPosition(b.el);
      return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });
    return turns;
  }

  const assistants = () => allTurns().filter((t) => t.role === "assistant");
  const lastAssistant = () => {
    const a = assistants();
    return a.length ? a[a.length - 1].el : null;
  };

  function skipNode(node) {
    // Exclude reasoning and artifact chrome from text extraction. If a thinking
    // block is not excluded, agent.js would read Claude's reasoning as Lua
    // commands — this is the single most dangerous failure mode.
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
    // keep outermost only
    return found.filter((b) => !found.some((o) => o !== b && o.contains(b)));
  }

  // ---------------------------------------------------------------- composer
  const editor = () => pick(SEL.composer);
  const editorText = () => {
    const e = editor();
    return e ? (e.innerText || e.textContent || "") : "";
  };

  /**
   * Insert text into a ProseMirror contenteditable.
   * innerHTML is discarded by ProseMirror; synthetic events are rejected as
   * untrusted. execCommand('insertText') is the only path that drives the
   * editor's transaction pipeline.
   */
  function setEditable(ed, text) {
    if (!ed) return false;
    ed.focus();
    try {
      document.execCommand("selectAll");
      document.execCommand("delete");
      if (document.execCommand("insertText", false, text)) return true;
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
      return true;
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
      // A visible stop button is the strongest signal.
      if (stopButton()) return true;
      // Otherwise, fall back to text growth.
      sample();
      return sMax > 1 && Date.now() - sAt < WINDOW_ANSWER;
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------- vision
  /**
   * Be conservative: Claude supports images, but the file input may only exist
   * after the "+" menu is opened. Claim vision only when the input is present.
   */
  function vision() {
    const input = q(SEL.fileInput);
    if (!input) return false;
    const accept = (input.getAttribute("accept") || "").toLowerCase();
    return accept === "" || accept.includes("image");
  }

  // ---------------------------------------------------------------- notices
  function findNotice(re) {
    // 1) leaf nodes near the newest turn (where Claude renders inline errors)
    const turns = allTurns();
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
    // 2) toasts
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
    // Wait until a preview appears. The preview may be an <img src="blob:">
    // or a background-image; check both.
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

    // Refuse to send while a reply is streaming.
    if (stopButton() && !(await kit.waitFor(() => !stopButton(), 5000))) return false;

    const before = pickAll(SEL.user).length;
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

      if (pickAll(SEL.user).length > before || stopButton()) return true;

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
          () => pickAll(SEL.user).length > before || stopButton(),
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
    // /share/<id> is a frozen snapshot, not a live conversation.
    if (parts[0] === "share") return "";
    if (parts[0] === "chat" && parts[1]) return parts[1];
    // Fallback: any UUID-looking segment.
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
      return allTurns().map((t) => ({ el: t.el, role: t.role }));
    },

    turnId() {
      // Claude exposes no stable per-turn key; agent falls back to index+hash.
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
        pickAll(SEL.user).length === 0 &&
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

    // Insert the LuaPilot bar just above the contenteditable.
    barSlot() {
      const ed = editor();
      if (!ed || !ed.parentElement) return null;
      return { parent: ed.parentElement, before: ed };
    },

    notice,

    continueButton() {
      // Claude has no "Continue" button.
      return null;
    },
  };
})();


> **The project has been renamed to LuauPilot.**
>
> The name was changed because **LuaPilot.com already exists and provides a very similar product**.
>
> The rebranding is now in progress. Until a new release is published, some versions available in the **Releases** section may still use the old **LuaPilot** name. Older releases may also continue to use the old name, application branding, and paths.
>
> **The project itself is not discontinued.**

LuauPilot lets a DeepSeek chat work inside your **Roblox Studio**. A browser extension reads the AI's commands, a small local bridge passes them to Roblox Studio's MCP server, and the results go back into the chat — so the AI can keep working on its own.

> Use at your own risk. Provided "as is", no support obligation. Read [TERMS.md](TERMS.md). Not affiliated with any AI creator, any AI, or Roblox.

## What's new in 0.03

- **Background tab support** — the extension tab no longer goes to sleep when running in the background, keeping LuauPilot responsive even when you're working in another tab.
- **General improvements** — improved stability, performance and overall reliability.
- **Various fixes** — cleaned up several smaller issues across the extension.

LuauPilot is still in alpha, so more improvements and fixes are coming.

## Generated with LuauPilot

<p align="center">
  <img src="assets/img1.jpg" alt="Generated with LuauPilot" width="800">
</p>

## Install (Windows)

1. Run `windows.exe` (the installer; build it with `installer\build.bat`, see below). Attach it to your GitHub release under exactly that name: the in-app updater looks for it.
2. Open **LuauPilot**. Press **Extension** — the extension folder path is copied to your clipboard.
3. In Chrome/Edge open `chrome://extensions`, enable *Developer mode*, click *Load unpacked*, paste the path (Ctrl+V) and confirm.
4. Open Roblox Studio with a place and enable its MCP server (Assistant settings).
5. Open <https://chat.deepseek.com/>, press **Start LuauPilot here** (optionally type your task first).

In the app's **Settings** you can make it open DeepSeek and Roblox Studio automatically when it starts.

## Mini chat

> **Experimental feature:** Mini chat is currently in testing and is not recommended for regular use. It may be unstable or behave unexpectedly.

Press **Mini chat** in the app: a small always-on-top box (Send, Stop, expandable answer) that talks to the DeepSeek tab through the extension, so you can keep Roblox Studio in front. It needs the DeepSeek page open in the browser (it can sit in the background or a minimised window): the AI lives on that page. If it is not open, the box offers **Open DeepSeek** and sends your message as soon as the page is connected.

## Roblox catalog

The AI can call `catalog_search` / `catalog_images` (answered by the bridge) to browse free Creator Store assets, look at their thumbnails and then insert the one it picks with `insert_from_creator_store`.

When you press **Start LuauPilot here** in a fresh chat you are asked two things: allow the catalog in this session, and use Blender.

## Blender (optional, per session)

> **Experimental feature:** Blender integration is currently in testing and is not recommended for regular use. It may be unstable or behave unexpectedly.

Pick **Use Blender** at the start. The bridge then starts the community `mcp-for-blender` server (via `uvx`, telemetry off) next to the Studio one; its tools appear as `blender_...`. It needs [uv](https://docs.astral.sh/uv/), Blender, and the add-on (`uvx mcp-for-blender install-addon`, then enable "MCP for Blender" and start its server in the N panel, port 9876). If something is missing the page shows the exact steps. Models are exported from Blender and imported into Studio by you once (MCP cannot upload meshes); then the AI continues in Studio.

## Guide for the AI

Press **Guide** in the app to open your guide folder (`~/LuauPilot/Guide`): `AGENT_INSTRUCTIONS.md` (how to work), `STYLE_GUIDE.md` (how the project looks), `GAME_DESIGN.md` (long handbook, read in chapters), `ASSETS.md` (approved/rejected asset ids), `KNOWN_ISSUES.md` and `REFERENCES/` (your example pictures named `oldcity.png`, `mainmenu.png`, ...). Edit them freely; the AI reads the essentials at the start of every session and can ask for more with `style_guide` and `reference_images`. Defaults are only copied once and never overwritten. Per-project decisions go into `ServerStorage.LuauPilot.Memory` inside your place.

---

**Made with Claude AI.**

License: MIT.
