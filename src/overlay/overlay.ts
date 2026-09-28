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
  moveDuration: number;
  showLabels: boolean;
  highlight: boolean;
  debug: boolean;
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

  function show(): void {
    avatar.classList.add("agent-visible");
  }
  function hide(): void {
    avatar.classList.remove("agent-visible");
    highlightBox.classList.remove("agent-visible");
    bubble.classList.remove("agent-visible");
  }
  function dispose(): void {
    hide();
    host.remove();
    delete w.__agentVisualizer[config.id];
  }

  w.__agentVisualizer[config.id] = {
    moveTo,
    clickEffect,
    labelEffect,
    typeEffect,
    highlightRect,
    startWorking,
    stopWorking,
    show,
    hide,
    dispose,
  };
}
