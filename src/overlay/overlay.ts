/**
 * Config resolved in Node and sent to the browser. Everything is pre-computed
 * (CSS, avatarHtml) because this function is serialized with
 * Function.prototype.toString() and injected as-is (via page.addInitScript /
 * page.evaluate): it can't depend on imports or outer closures.
 */
export interface BrowserAgentConfig {
  id: string;
  name: string;
  css: string;
  avatarHtml: string;
  size: number;
  moveDuration: number;
  showLabels: boolean;
  highlight: boolean;
  debug: boolean;
}

/** One animated action, computed in Node and played entirely inside the page. */
export interface BrowserAction {
  /** Ripples to show (click/tap = 1, dblclick = 2). */
  clicks?: number;
  /** Text to "type" letter by letter; masked in the page if the field is a password. */
  text?: string;
  typeDurationMs?: number;
  /** Bubble text for press/select/check. */
  label?: string;
}

/**
 * Runs INSIDE the browser. Must not reference anything outside its own body:
 * no imports, no module-level variables, no outer functions. Everything it
 * needs travels in `config`.
 */
export function installOverlayInBrowser(config: BrowserAgentConfig): void {
  const w = window as any;
  w.__agentVisualizer = w.__agentVisualizer || {};

  // Idempotent: if this agent already exists on this page, don't duplicate the DOM.
  if (w.__agentVisualizer[config.id]) return;

  const host = document.createElement("div");
  host.setAttribute("data-agent-cursor-host", config.id);
  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = config.css;
  shadow.appendChild(style);

  const root = document.createElement("div");
  root.className = "agent-root";
  shadow.appendChild(root);

  const avatar = document.createElement("div");
  avatar.className = "agent-avatar";
  // The name is never shown on screen; it's only an accessible tooltip on hover.
  if (config.name) avatar.title = config.name;
  root.appendChild(avatar);

  // Inner circle with the face, sitting inside the outer colored ring.
  const face = document.createElement("div");
  face.className = "agent-face";
  face.innerHTML = config.avatarHtml;
  avatar.appendChild(face);

  const bubble = document.createElement("div");
  bubble.className = "agent-bubble";
  avatar.appendChild(bubble);

  const highlightBox = document.createElement("div");
  highlightBox.className = "agent-highlight";
  root.appendChild(highlightBox);

  function mountHost() {
    if (document.body && !document.body.contains(host)) {
      document.body.appendChild(host);
    } else if (!document.body) {
      // document has no <body> yet (addInitScript runs very early)
      document.addEventListener("DOMContentLoaded", mountHost, { once: true });
    }
  }
  mountHost();

  let currentX = -9999;
  let currentY = -9999;
  let bubbleTimer: number | undefined; // browser timer id (window.setTimeout)

  function log(...args: unknown[]) {
    if (config.debug) console.debug("[agent-cursor]", ...args);
  }

  function setPosition(x: number, y: number, durationMs: number, side: "right" | "left") {
    avatar.style.transition = `transform ${durationMs}ms ease-in-out`;
    avatar.style.transform = `translate(${x - avatar.offsetWidth / 2}px, ${
      y - avatar.offsetHeight / 2
    }px)`;
    avatar.classList.add("agent-visible");
    currentX = x;
    currentY = y;

    // `side` is where the avatar sits relative to the element. The bubble goes on
    // the far side (away from the element); if there's no room there, it moves
    // above the avatar. It never lands on top of the element in play.
    const room = 10 + 220; // margin + max-width declared in the CSS
    const half = avatar.offsetWidth / 2;
    const fitsOutward =
      side === "right" ? x + half + room <= window.innerWidth : x - half - room >= 0;
    bubble.classList.toggle("agent-bubble-left", side === "left");
    bubble.classList.toggle("agent-bubble-above", !fitsOutward);
  }

  function startWorking(): void {
    avatar.classList.add("agent-working");
  }

  function stopWorking(): void {
    avatar.classList.remove("agent-working");
  }

  function moveTo(x: number, y: number, durationMs?: number, side: "right" | "left" = "right"): Promise<void> {
    const duration = durationMs ?? config.moveDuration;
    return new Promise((resolve) => {
      try {
        mountHost();
        setPosition(x, y, duration, side);
        window.setTimeout(resolve, duration);
      } catch (err) {
        log("moveTo failed", err);
        resolve();
      }
    });
  }

  function clickEffect(x?: number, y?: number): void {
    try {
      const px = x ?? currentX;
      const py = y ?? currentY;
      const ripple = document.createElement("div");
      ripple.className = "agent-ripple";
      ripple.style.left = `${px}px`;
      ripple.style.top = `${py}px`;
      root.appendChild(ripple);
      requestAnimationFrame(() => ripple.classList.add("agent-animate"));
      window.setTimeout(() => ripple.remove(), 500);
    } catch (err) {
      log("clickEffect failed", err);
    }
  }

  function labelEffect(text: string, durationMs = 900): void {
    if (!config.showLabels) return;
    try {
      bubble.textContent = text;
      bubble.classList.add("agent-visible");
      if (bubbleTimer) window.clearTimeout(bubbleTimer);
      bubbleTimer = window.setTimeout(() => {
        bubble.classList.remove("agent-visible");
      }, durationMs);
    } catch (err) {
      log("labelEffect failed", err);
    }
  }

  function typeEffect(text: string, durationMs: number): Promise<void> {
    if (!config.showLabels) return Promise.resolve();
    return new Promise((resolve) => {
      try {
        bubble.classList.add("agent-visible");
        const steps = Math.max(text.length, 1);
        const stepMs = Math.max(durationMs / steps, 16);
        let i = 0;
        const tick = () => {
          i++;
          bubble.textContent = text.slice(0, i);
          if (i < text.length) {
            window.setTimeout(tick, stepMs);
          } else {
            if (bubbleTimer) window.clearTimeout(bubbleTimer);
            bubbleTimer = window.setTimeout(() => bubble.classList.remove("agent-visible"), 700);
            resolve();
          }
        };
        tick();
      } catch (err) {
        log("typeEffect failed", err);
        resolve();
      }
    });
  }

  function highlightRect(rect: { x: number; y: number; width: number; height: number } | null): void {
    if (!config.highlight) return;
    try {
      if (!rect) {
        highlightBox.classList.remove("agent-visible");
        return;
      }
      highlightBox.style.left = `${rect.x - 4}px`;
      highlightBox.style.top = `${rect.y - 4}px`;
      highlightBox.style.width = `${rect.width + 8}px`;
      highlightBox.style.height = `${rect.height + 8}px`;
      highlightBox.classList.add("agent-visible");
    } catch (err) {
      log("highlightRect failed", err);
    }
  }

  function hideLocal(): void {
    avatar.classList.remove("agent-visible");
    highlightBox.classList.remove("agent-visible");
    bubble.classList.remove("agent-visible");
  }
  function disposeLocal(): void {
    hideLocal();
    host.remove();
    window.removeEventListener("message", onMessage);
    delete w.__agentVisualizer[config.id];
  }

  // Every frame runs its own copy of this overlay, so the avatar is drawn in the frame that
  // holds the element. Frames coordinate through postMessage (works cross-origin, and it's
  // not a Playwright call, so it never shows up in traces): the top window relays each
  // message down the frame tree.
  const MSG_KEY = "__agentCursor";
  const instanceToken = Math.random().toString(36).slice(2);

  function relayToChildren(msg: unknown): void {
    for (let i = 0; i < window.frames.length; i++) {
      try {
        window.frames[i].postMessage(msg, "*");
      } catch {
        // detached frame
      }
    }
  }

  function onMessage(ev: MessageEvent): void {
    const data = ev.data;
    if (!data || data[MSG_KEY] !== config.id) return;
    relayToChildren(data);
    if (data.type === "hide-others" && data.from !== instanceToken) hideLocal();
    else if (data.type === "hide-all") hideLocal();
    else if (data.type === "dispose-all") disposeLocal();
  }
  window.addEventListener("message", onMessage);

  function hideInOtherFrames(): void {
    try {
      window.top!.postMessage({ [MSG_KEY]: config.id, type: "hide-others", from: instanceToken }, "*");
    } catch {
      // no access to top
    }
  }

  /** Plays a whole action (scroll, highlight, move, effect) in one call from Node. */
  async function animate(el: Element, action: BrowserAction): Promise<void> {
    try {
      hideInOtherFrames();
      let r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) {
        el.scrollIntoView({ block: "center", inline: "nearest" });
        r = el.getBoundingClientRect();
      }
      if (!r.width && !r.height) return;

      // The agent sits BESIDE the element (never on top of it): right side preferred,
      // left if it doesn't fit.
      const gap = 14;
      const half = config.size / 2;
      const rightX = r.right + gap + half;
      const fitsRight = rightX + half <= window.innerWidth;
      const x = fitsRight ? rightX : Math.max(r.left - gap - half, half);
      const y = r.top + r.height / 2;

      highlightRect({ x: r.left, y: r.top, width: r.width, height: r.height });
      startWorking();
      await moveTo(x, y, undefined, fitsRight ? "right" : "left");

      if (action.clicks) {
        for (let i = 0; i < action.clicks; i++) clickEffect(r.left + r.width / 2, y);
      } else if (action.text !== undefined) {
        const isPassword = (el as HTMLInputElement).type === "password";
        const text = isPassword ? "•".repeat(action.text.length || 6) : action.text;
        await typeEffect(text, action.typeDurationMs ?? 500);
      } else if (action.label) {
        labelEffect(action.label);
      }
    } catch (err) {
      log("animate failed", err);
    } finally {
      stopWorking();
      highlightRect(null);
    }
  }

  w.__agentVisualizer[config.id] = {
    animate,
    show: () => avatar.classList.add("agent-visible"),
    hide: () => {
      hideLocal();
      relayToChildren({ [MSG_KEY]: config.id, type: "hide-all" });
    },
    dispose: () => {
      relayToChildren({ [MSG_KEY]: config.id, type: "dispose-all" });
      disposeLocal();
    },
  };
}
