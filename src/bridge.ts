import { readFileSync, existsSync, statSync } from "node:fs";
import { extname } from "node:path";
import type { Page } from "playwright-core";
import {
  AVATAR_THEMES,
  DEFAULT_THEME,
  getBuiltinAvatarHtml,
  isBuiltinAvatar,
  type AvatarTheme,
} from "./overlay/avatars.js";
import { buildStyles } from "./overlay/styles.js";
import { installOverlayInBrowser, type BrowserAgentConfig } from "./overlay/overlay.js";
import { DEFAULT_AVATAR, type AvatarOption, type ResolvedAgentOptions } from "./options.js";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5 MB (the browser scales it down to the badge)

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

function log(debug: boolean, ...args: unknown[]) {
  if (debug) console.debug("[agent-cursor]", ...args);
}

/** Always shown: the user asked for a specific avatar and isn't getting it. */
function warnFallback(message: string) {
  console.warn(`[agent-cursor] ${message}, falling back to the default avatar`);
}

/**
 * Resolves the `avatar` option into an HTML fragment to insert inside the avatar.
 * Never throws: if anything fails, it falls back to the default avatar.
 */
export function resolveAvatarHtml(avatar: AvatarOption | undefined, debug: boolean): string {
  try {
    if (!avatar || typeof avatar === "string") {
      if (avatar && !isBuiltinAvatar(avatar)) {
        warnFallback(`unknown avatar "${avatar}"`);
      }
      return getBuiltinAvatarHtml((avatar as string) || DEFAULT_AVATAR);
    }

    if ("emoji" in avatar && avatar.emoji) {
      return `<span class="agent-emoji">${escapeHtml(avatar.emoji)}</span>`;
    }

    if ("src" in avatar && avatar.src) {
      return resolveSrcToHtml(avatar.src);
    }

    log(debug, "empty avatar option, falling back to the default avatar");
    return getBuiltinAvatarHtml(DEFAULT_AVATAR);
  } catch (err) {
    warnFallback(`failed to load avatar (${String(err)})`);
    return getBuiltinAvatarHtml(DEFAULT_AVATAR);
  }
}

/**
 * Ring color and face background: bundled avatars bring their own theme,
 * custom ones use the default. An explicit `color` always wins for the ring.
 */
export function resolveAvatarTheme(avatar: AvatarOption | undefined, color?: string): AvatarTheme {
  const name = !avatar || typeof avatar === "string" ? avatar || DEFAULT_AVATAR : undefined;
  const theme = name && isBuiltinAvatar(name) ? AVATAR_THEMES[name] : DEFAULT_THEME;
  return { ring: color ?? theme.ring, background: theme.background };
}

function resolveSrcToHtml(src: string): string {
  // http(s) URL or data URI: reference it directly with <img>, the browser loads it.
  if (/^https?:\/\//i.test(src) || src.startsWith("data:")) {
    return `<img src="${escapeAttr(src)}" alt="agent avatar" />`;
  }

  // Local path: read and inline as base64 (the page can't read the user's disk).
  if (!existsSync(src)) {
    warnFallback(`avatar file not found: ${src}`);
    return getBuiltinAvatarHtml(DEFAULT_AVATAR);
  }

  const stats = statSync(src);
  if (stats.size > MAX_AVATAR_BYTES) {
    warnFallback(`avatar file is over 5 MB (${(stats.size / 1024 / 1024).toFixed(1)} MB): ${src}`);
    return getBuiltinAvatarHtml(DEFAULT_AVATAR);
  }

  const ext = extname(src).toLowerCase();
  const mime = MIME_BY_EXT[ext];
  if (!mime) {
    warnFallback(`unsupported avatar format "${ext}" (use png, jpg, jpeg, webp, gif or svg)`);
    return getBuiltinAvatarHtml(DEFAULT_AVATAR);
  }

  const buffer = readFileSync(src);
  const base64 = buffer.toString("base64");
  return `<img src="data:${mime};base64,${base64}" alt="agent avatar" />`;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c] as string));
}

function escapeAttr(text: string): string {
  return text.replace(/"/g, "&quot;");
}

export interface AgentBridge {
  moveTo(x: number, y: number, durationMs?: number, side?: "right" | "left"): Promise<void>;
  clickEffect(x?: number, y?: number): Promise<void>;
  labelEffect(text: string, durationMs?: number): Promise<void>;
  typeEffect(text: string, durationMs: number): Promise<void>;
  highlightRect(rect: { x: number; y: number; width: number; height: number } | null): Promise<void>;
  startWorking(): Promise<void>;
  stopWorking(): Promise<void>;
  show(): Promise<void>;
  hide(): Promise<void>;
  dispose(): Promise<void>;
}

let idCounter = 0;

/**
 * Installs the overlay on the page (via addInitScript, to survive future
 * navigations, and via evaluate, for the already-loaded page) and returns
 * functions that control it from Node. Any evaluate error is swallowed
 * silently (debug mode logs it) so the user's script never breaks.
 */
export async function installAgentBridge(
  page: Page,
  opts: ResolvedAgentOptions
): Promise<AgentBridge> {
  const id = `agent-${++idCounter}-${Date.now()}`;
  const avatarHtml = resolveAvatarHtml(opts.avatar, opts.debug);
  const theme = resolveAvatarTheme(opts.avatar, opts.color);
  const css = buildStyles(theme.ring, opts.size, theme.background);

  const config: BrowserAgentConfig = {
    id,
    name: opts.name,
    css,
    avatarHtml,
    moveDuration: Math.max(opts.moveDuration / Math.max(opts.speed, 0.01), 30),
    showLabels: opts.showLabels,
    highlight: opts.highlight,
    debug: opts.debug,
  };

  // page.evaluate only accepts a single (1) argument: fn and, optionally, one arg.
  const safeEvaluate = async <T, A>(fn: (arg: A) => T, arg?: A): Promise<T | undefined> => {
    try {
      // Playwright's PageFunction typing can't relate a generic A to its unboxed form.
      return (await page.evaluate(fn as (arg: unknown) => T, arg)) as T;
    } catch (err) {
      log(opts.debug, "evaluate failed (ignored, does not affect automation):", err);
      return undefined;
    }
  };

  // Survives future navigations.
  await page.addInitScript(installOverlayInBrowser, config).catch((err) => {
    log(opts.debug, "addInitScript failed:", err);
  });
  // Also install on the already-loaded page (addInitScript doesn't re-run on the current document).
  await safeEvaluate(installOverlayInBrowser, config);

  const call = async (method: string, ...args: unknown[]): Promise<void> => {
    // page.evaluate only accepts ONE argument; everything is packed into a single object.
    await safeEvaluate(
      ({ agentId, m, callArgs }: { agentId: string; m: string; callArgs: unknown[] }) => {
        const w = window as any;
        const api = w.__agentVisualizer && w.__agentVisualizer[agentId];
        if (api && typeof api[m] === "function") {
          return api[m](...callArgs);
        }
        return undefined;
      },
      { agentId: id, m: method, callArgs: args }
    );
  };

  return {
    moveTo: (x, y, durationMs, side) => call("moveTo", x, y, durationMs, side),
    clickEffect: (x, y) => call("clickEffect", x, y),
    labelEffect: (text, durationMs) => call("labelEffect", text, durationMs),
    typeEffect: (text, durationMs) => call("typeEffect", text, durationMs),
    highlightRect: (rect) => call("highlightRect", rect),
    startWorking: () => call("startWorking"),
    stopWorking: () => call("stopWorking"),
    show: () => call("show"),
    hide: () => call("hide"),
    dispose: () => call("dispose"),
  };
}
